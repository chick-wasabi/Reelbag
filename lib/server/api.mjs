import { hashRecoveryAnswer, verifyRecoveryAnswer } from "./recovery.mjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { parseReelUrl } from "../../utils/reels.mjs";
import { MAX_BACKUP_BYTES, validateBackup } from "../../utils/backup.mjs";

const SESSION_SECONDS = 60 * 60 * 24 * 30;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = (value) => createHash("sha256").update(value).digest("hex");
// A public dummy value equalizes the expensive comparison for unknown usernames.
const dummyHash = bcrypt.hash("Reelbag-public-timing-value", 12);
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
function string(value, max, label) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(400, `${label} is required (up to ${max} characters).`);
  return value.trim();
}
function identifier(value) {
  if (!UUID.test(value || "")) fail(400, "Invalid record ID.");
  return value;
}
function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    Buffer.byteLength(value, "utf8") > 72
  )
    fail(
      400,
      "Use a password or PIN with at least 8 characters and at most 72 UTF-8 bytes.",
    );
  return value;
}
async function body(request, max = 16384) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    fail(415, "Send a JSON request.");
  if (Number(request.headers.get("content-length")) > max)
    fail(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "A JSON body is required.");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        fail(413, "Request is too large.");
      }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      fail(400, "A JSON object is required.");
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, "Invalid JSON request.");
  } finally {
    reader.releaseLock();
  }
}

export function createApi({ db, secureCookies = true }) {
  const cookieName = secureCookies
    ? "__Host-reelbag_session"
    : "reelbag_session";
  const json = (data, status = 200, extra = {}) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
        ...extra,
      },
    });
  const cookie = (token, maxAge = SESSION_SECONDS) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  function token(request) {
    const match = (request.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`));
    const value = match?.slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(value || "") ? digest(value) : null;
  }
  async function rate(key, max, seconds = 900) {
    const [row] = await db.query(
      `INSERT INTO rate_limits(key_hash, attempts, window_expires)
      VALUES ($1, 1, now() + $2 * interval '1 second')
      ON CONFLICT(key_hash) DO UPDATE SET
        attempts = CASE WHEN rate_limits.window_expires <= now() THEN 1 ELSE rate_limits.attempts + 1 END,
        window_expires = CASE WHEN rate_limits.window_expires <= now() THEN now() + $2 * interval '1 second' ELSE rate_limits.window_expires END
      RETURNING attempts`,
      [digest(key), seconds],
    );
    if (row.attempts > max)
      fail(429, "Too many attempts. Please try again in 15 minutes.");
  }
  async function session(request, required = true) {
    const sessionHash = token(request);
    const [user] = sessionHash
      ? await db.query(
          `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`,
          [sessionHash],
        )
      : [];
    if (!user && required)
      fail(401, "Your session has expired. Please log in.");
    return { user: user || null, sessionHash };
  }
  async function beginSession(user) {
    const raw = randomBytes(32).toString("hex");
    await db.query(
      `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + $3 * interval '1 second')`,
      [digest(raw), user.id, SESSION_SECONDS],
    );
    return json({ user }, 200, { "Set-Cookie": cookie(raw) });
  }
  // Every protected operation rechecks the grant against the current folder version.
  const allowed = (
    folderAlias = "f",
  ) => `(${folderAlias}.pin_code IS NULL OR EXISTS (
    SELECT 1 FROM folder_unlocks g WHERE g.folder_id=${folderAlias}.id AND g.session_hash=$3 AND g.version=${folderAlias}.pin_version))`;
  async function folderRecord(id, auth, requireUnlocked = true) {
    const [folder] = await db.query(
      `SELECT f.*, ${allowed()} AS accessible FROM folders f WHERE f.id=$1 AND f.user_id=$2`,
      [id, auth.user.id, auth.sessionHash],
    );
    if (!folder) fail(404, "Folder not found.");
    if (requireUnlocked && !folder.accessible)
      fail(423, "Unlock this folder first.");
    return folder;
  }
  async function library(auth) {
    const [folders, reels] = await Promise.all([
      db.query(
        `SELECT f.id,f.name,(f.pin_code IS NOT NULL) AS pin,
        (f.pin_code IS NULL OR COALESCE(g.version=f.pin_version,false)) AS unlocked
        FROM folders f LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$2
        WHERE f.user_id=$1 ORDER BY f.created_at,f.id`,
        [auth.user.id, auth.sessionHash],
      ),
      db.query(
        `SELECT r.id,r.title,r.url,r.folder_id AS "folderId",r.created_at AS "createdAt",r.is_pinned AS "isPinned",r.is_favorite AS "isFavorite"
        FROM reels r LEFT JOIN folders f ON f.id=r.folder_id AND f.user_id=r.user_id
        LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$2
        WHERE r.user_id=$1 AND (f.pin_code IS NULL OR g.version=f.pin_version)
        ORDER BY r.is_pinned DESC,r.created_at DESC,r.id`,
        [auth.user.id, auth.sessionHash],
      ),
    ]);
    return {
      user: auth.user,
      folders,
      reels: reels.map((r) => ({
        ...r,
        shortcode: parseReelUrl(r.url)?.shortcode,
      })),
    };
  }
  function grant(sessionHash, folderId, version) {
    return [
      `INSERT INTO folder_unlocks(session_hash,folder_id,version) VALUES($1,$2,$3)
      ON CONFLICT(session_hash,folder_id) DO UPDATE SET version=EXCLUDED.version`,
      [sessionHash, folderId, version],
    ];
  }
  async function findReel(id, auth) {
    const [row] = await db.query(
      `SELECT r.id,r.folder_id FROM reels r WHERE r.id=$1 AND r.user_id=$2`,
      [id, auth.user.id],
    );
    if (!row) fail(404, "Reel not found.");
    if (row.folder_id) await folderRecord(row.folder_id, auth);
    return row;
  }
  const accessibleReel = `r.user_id=$2 AND (r.folder_id IS NULL OR EXISTS (
    SELECT 1 FROM folders f WHERE f.id=r.folder_id AND f.user_id=$2 AND ${allowed()}))`;

  return async function handle(request, segments) {
    try {
      const path = segments.join("/");
      const method = request.method;
      if (method !== "GET") {
        if (
          request.headers.get("origin") !== new URL(request.url).origin ||
          request.headers.get("sec-fetch-site") === "cross-site"
        )
          fail(403, "Cross-origin request rejected.");
      }
      if (path === "auth/session" && method === "GET")
        return json({ user: (await session(request, false)).user });
      if (["auth/signup", "auth/login"].includes(path) && method === "POST") {
        const input = await body(request);
        const username = string(input.username, 32, "Username").toLowerCase();
        if (!/^[a-z0-9_]{3,32}$/.test(username))
          fail(
            400,
            "Use 3–32 letters, numbers, or underscores for your username.",
          );
        const secret = password(input.password);
        const ip = (
          request.headers.get("x-real-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0] ||
          "unknown"
        ).slice(0, 100);
        await rate(`auth-ip:${ip}`, 50);
        await rate(`auth-user:${username}`, 10);
        await db.query(`DELETE FROM sessions WHERE expires_at <= now()`);
        await db.query(
          `DELETE FROM rate_limits WHERE window_expires < now() - interval '1 day'`,
        );
        if (path === "auth/signup") {
          let question = null;
          let answer = null;
          if (
            input.securityQuestion !== undefined ||
            input.securityAnswer !== undefined
          ) {
            question = string(input.securityQuestion, 200, "Security question");
            try {
              answer = await hashRecoveryAnswer(input.securityAnswer);
            } catch (error) {
              fail(400, error.message);
            }
          }
          const passwordHash = await bcrypt.hash(secret, 12);
          const [user] = await db.query(
            `INSERT INTO users(id,username,password_hash,security_question,security_answer) VALUES($1,$2,$3,$4,$5) RETURNING id,username`,
            [randomUUID(), username, passwordHash, question, answer],
          );
          return await beginSession(user);
        }
        const [found] = await db.query(
          `SELECT id,username,password_hash FROM users WHERE username=$1`,
          [username],
        );
        const matches = await bcrypt.compare(
          secret,
          found?.password_hash || (await dummyHash),
        );
        if (!found || !matches) fail(401, "Username or password is incorrect.");
        await db.query(`DELETE FROM rate_limits WHERE key_hash=$1`, [
          digest(`auth-user:${username}`),
        ]);
        return await beginSession({ id: found.id, username: found.username });
      }
      if (
        ["auth/recovery/question", "auth/recovery/reset"].includes(path) &&
        method === "POST"
      ) {
        const input = await body(request);
        const username = string(input.username, 32, "Username").toLowerCase();
        if (!/^[a-z0-9_]{3,32}$/.test(username))
          fail(400, "Enter a valid username.");
        const ip = (
          request.headers.get("x-real-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0] ||
          "unknown"
        ).slice(0, 100);
        await rate(`recovery-ip:${ip}`, 30);
        await rate(`recovery-question:${username}`, 15);
        const [found] = await db.query(
          `SELECT id,password_hash,security_question,security_answer FROM users WHERE username=$1`,
          [username],
        );
        if (path === "auth/recovery/question")
          return json({ question: found?.security_question || null });
        const secret = password(input.newPassword);
        await rate(`recovery-reset:${username}`, 5);
        if (
          !found?.security_answer ||
          !(await verifyRecoveryAnswer(input.answer, found.security_answer))
        )
          fail(
            401,
            "Unable to reset this account. Check your answer or use an account with recovery enabled.",
          );
        const nextHash = await bcrypt.hash(secret, 12);
        const rows = await db.query(
          `WITH changed AS (
          UPDATE users SET password_hash=$2 WHERE id=$1 AND password_hash=$3 AND security_answer=$4 RETURNING id
        ), revoked AS (DELETE FROM sessions WHERE user_id IN (SELECT id FROM changed) RETURNING token_hash)
        SELECT id FROM changed WHERE (SELECT count(*) FROM revoked)>=0`,
          [found.id, nextHash, found.password_hash, found.security_answer],
        );
        if (!rows.length)
          fail(409, "Account changed during recovery. Please start again.");
        return json(
          { message: "Password reset. Log in with your new password." },
          200,
          { "Set-Cookie": cookie("", 0) },
        );
      }
      if (path === "auth/logout" && method === "POST") {
        const hash = token(request);
        if (hash)
          await db.query(`DELETE FROM sessions WHERE token_hash=$1`, [hash]);
        return json({ user: null }, 200, { "Set-Cookie": cookie("", 0) });
      }
      const auth = await session(request);
      if (path === "account/recovery" && method === "POST") {
        const input = await body(request);
        await rate(`recovery-settings:${auth.user.id}`, 5);
        const [user] = await db.query(
          `SELECT password_hash FROM users WHERE id=$1`,
          [auth.user.id],
        );
        if (
          !(await bcrypt.compare(
            password(input.currentPassword),
            user.password_hash,
          ))
        )
          fail(403, "Current password is incorrect.");
        let question = null;
        let answer = null;
        if (input.enabled !== false) {
          question = string(input.securityQuestion, 200, "Security question");
          try {
            answer = await hashRecoveryAnswer(input.securityAnswer);
          } catch (error) {
            fail(400, error.message);
          }
        }
        const rows = await db.query(
          `UPDATE users SET security_question=$2,security_answer=$3 WHERE id=$1 AND password_hash=$4 RETURNING id`,
          [auth.user.id, question, answer, user.password_hash],
        );
        if (!rows.length) fail(409, "Account changed. Please log in again.");
        return json({
          message: question ? "Recovery question saved." : "Recovery disabled.",
        });
      }
      if (path === "library" && method === "GET")
        return json(await library(auth));
      if (path === "library/export" && method === "GET") {
        const result = await library(auth);
        if (result.folders.some((f) => f.pin && !f.unlocked))
          fail(
            423,
            "Unlock every folder before exporting your complete library.",
          );
        return json({
          version: 3,
          folders: result.folders.map((f) => ({ id: f.id, name: f.name })),
          reels: result.reels.map((r) => ({
            title: r.title,
            url: r.url,
            folderId: r.folderId,
            isPinned: r.isPinned,
            isFavorite: r.isFavorite,
          })),
        });
      }
      if (path === "library/import" && method === "POST") {
        let backup;
        try {
          backup = validateBackup(await body(request, MAX_BACKUP_BYTES));
        } catch (error) {
          if (error instanceof HttpError) throw error;
          fail(400, error.message);
        }
        // Imports append safely. New folder IDs and unique names avoid changing existing content.
        const existing = await db.query(
          `SELECT name FROM folders WHERE user_id=$1`,
          [auth.user.id],
        );
        const names = new Set(existing.map((f) => f.name.toLowerCase()));
        const mapping = new Map();
        const statements = [];
        const folderRecords = [];
        for (const folder of backup.folders) {
          let name = folder.name;
          let count = 2;
          while (names.has(name.toLowerCase()))
            name = `${folder.name.slice(0, 50)} (${count++})`;
          names.add(name.toLowerCase());
          const id = randomUUID();
          mapping.set(folder.id, id);
          folderRecords.push({ id, user_id: auth.user.id, name });
        }
        if (folderRecords.length)
          statements.push([
            `INSERT INTO folders(id,user_id,name) SELECT x.id,x.user_id,x.name FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,user_id uuid,name text)`,
            [JSON.stringify(folderRecords)],
          ]);
        // Bulk inserts keep large imports within Neon's transaction query limit.
        const records = backup.reels.map((r) => ({
          id: randomUUID(),
          user_id: auth.user.id,
          folder_id: r.folderId ? mapping.get(r.folderId) : null,
          title: r.title,
          url: r.url,
          is_pinned: r.isPinned,
          is_favorite: r.isFavorite,
        }));
        if (records.length)
          statements.push([
            `INSERT INTO reels(id,user_id,folder_id,title,url,is_pinned,is_favorite)
          SELECT x.id,x.user_id,x.folder_id,x.title,x.url,x.is_pinned,x.is_favorite FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,user_id uuid,folder_id uuid,title text,url text,is_pinned boolean,is_favorite boolean)`,
            [JSON.stringify(records)],
          ]);
        if (statements.length) await db.transaction(statements);
        return json(await library(auth));
      }
      if (path === "folders" && method === "POST") {
        const input = await body(request);
        const name = string(input.name, 60, "Folder name");
        if (typeof input.protected !== "boolean")
          fail(400, "Specify folder protection.");
        if (input.pin !== undefined && typeof input.pin !== "string")
          fail(400, "Folder PIN must be a string of four digits.");
        if (input.protected && !/^\d{4}$/.test(input.pin || ""))
          fail(400, "Folder PINs must be exactly 4 digits.");
        const pin = input.protected ? await bcrypt.hash(input.pin, 12) : null;
        const id = randomUUID();
        const statements = [
          [
            `INSERT INTO folders(id,user_id,name,pin_code) VALUES($1,$2,$3,$4)`,
            [id, auth.user.id, name, pin],
          ],
        ];
        if (pin) statements.push(grant(auth.sessionHash, id, 0));
        await db.transaction(statements);
        return json({ ...(await library(auth)), folderId: id }, 201);
      }
      if (segments[0] === "folders" && segments.length >= 2) {
        const id = identifier(segments[1]);
        const folder = await folderRecord(
          id,
          auth,
          !(method === "POST" && ["unlock", "lock"].includes(segments[2])),
        );
        if (
          segments.length === 3 &&
          segments[2] === "unlock" &&
          method === "POST"
        ) {
          const input = await body(request);
          if (typeof input.pin !== "string" || !/^\d{4}$/.test(input.pin))
            fail(400, "Enter the 4-digit folder PIN.");
          const key = `folder:${auth.user.id}:${id}`;
          await rate(key, 10);
          if (
            folder.pin_code &&
            !(await bcrypt.compare(input.pin, folder.pin_code))
          )
            fail(403, "That folder PIN doesn’t match.");
          const rows = await db.query(
            `INSERT INTO folder_unlocks(session_hash,folder_id,version)
            SELECT $1,id,pin_version FROM folders WHERE id=$2 AND user_id=$3 AND pin_version=$4
            ON CONFLICT(session_hash,folder_id) DO UPDATE SET version=EXCLUDED.version RETURNING folder_id`,
            [auth.sessionHash, id, auth.user.id, folder.pin_version],
          );
          if (!rows.length) fail(409, "Folder protection changed. Try again.");
          await db.query(`DELETE FROM rate_limits WHERE key_hash=$1`, [
            digest(key),
          ]);
          return json(await library(auth));
        }
        if (
          segments.length === 3 &&
          segments[2] === "lock" &&
          method === "POST"
        ) {
          await db.query(
            `DELETE FROM folder_unlocks WHERE session_hash=$1 AND folder_id=$2`,
            [auth.sessionHash, id],
          );
          return json(await library(auth));
        }
        if (segments.length === 2 && method === "PATCH") {
          const input = await body(request);
          const name = string(input.name, 60, "Folder name");
          if (typeof input.protected !== "boolean")
            fail(400, "Specify folder protection.");
          if (input.pin !== undefined && typeof input.pin !== "string")
            fail(400, "Folder PIN must be a string of four digits.");
          if (
            input.protected &&
            (input.pin || !folder.pin_code) &&
            !/^\d{4}$/.test(input.pin || "")
          )
            fail(400, "Folder PINs must be exactly 4 digits.");
          const pin = input.protected
            ? input.pin
              ? await bcrypt.hash(input.pin, 12)
              : folder.pin_code
            : null;
          const version =
            folder.pin_version + (pin !== folder.pin_code ? 1 : 0);
          const rows = await db.query(
            `WITH updated AS (
            UPDATE folders f SET name=$4,pin_code=$5,pin_version=$6
            WHERE f.id=$1 AND f.user_id=$2 AND f.pin_version=$7 AND ${allowed()} RETURNING id,pin_version
          ) INSERT INTO folder_unlocks(session_hash,folder_id,version)
            SELECT $3,id,pin_version FROM updated
            ON CONFLICT(session_hash,folder_id) DO UPDATE SET version=EXCLUDED.version RETURNING folder_id`,
            [
              id,
              auth.user.id,
              auth.sessionHash,
              name,
              pin,
              version,
              folder.pin_version,
            ],
          );
          if (!rows.length)
            fail(409, "Folder changed or locked. Refresh and try again.");
          return json(await library(auth));
        }
        if (segments.length === 2 && method === "DELETE") {
          const rows = await db.query(
            `WITH permitted AS (SELECT f.id FROM folders f WHERE f.id=$1 AND f.user_id=$2 AND ${allowed()} FOR UPDATE),
            moved AS (UPDATE reels SET folder_id=NULL WHERE user_id=$2 AND folder_id IN (SELECT id FROM permitted) RETURNING id)
            DELETE FROM folders WHERE id IN (SELECT id FROM permitted) AND (SELECT count(*) FROM moved)>=0 RETURNING id`,
            [id, auth.user.id, auth.sessionHash],
          );
          if (!rows.length) fail(423, "Unlock this folder first.");
          return json(await library(auth));
        }
      }
      if (path === "reels" && method === "POST") {
        const input = await body(request);
        const title = string(input.title, 200, "Reel title");
        const parsed = parseReelUrl(input.url);
        if (!parsed) fail(400, "Enter a valid Instagram Reel link.");
        const folderId =
          input.folderId === null ? null : identifier(input.folderId);
        if (folderId) await folderRecord(folderId, auth, false);
        const id = randomUUID();
        await db.query(
          `INSERT INTO reels(id,user_id,folder_id,title,url) VALUES($1,$2,$3,$4,$5)`,
          [id, auth.user.id, folderId, title, parsed.url],
        );
        return json(await library(auth), 201);
      }
      if (
        segments[0] === "reels" &&
        segments.length === 3 &&
        segments[2] === "flags" &&
        method === "PATCH"
      ) {
        const id = identifier(segments[1]);
        await findReel(id, auth);
        const input = await body(request);
        const keys = Object.keys(input);
        if (
          !keys.length ||
          keys.some(
            (key) =>
              !["isPinned", "isFavorite"].includes(key) ||
              typeof input[key] !== "boolean",
          )
        )
          fail(400, "Send a boolean pin or favorite value.");
        const rows = await db.query(
          `UPDATE reels r SET is_pinned=COALESCE($4::boolean,is_pinned),is_favorite=COALESCE($5::boolean,is_favorite)
          WHERE r.id=$1 AND ${accessibleReel} RETURNING r.id`,
          [
            id,
            auth.user.id,
            auth.sessionHash,
            input.isPinned ?? null,
            input.isFavorite ?? null,
          ],
        );
        if (!rows.length) fail(423, "Unlock this folder first.");
        return json(await library(auth));
      }
      if (
        segments[0] === "reels" &&
        segments.length === 2 &&
        ["PATCH", "DELETE"].includes(method)
      ) {
        const id = identifier(segments[1]);
        await findReel(id, auth);
        let rows;
        if (method === "DELETE")
          rows = await db.query(
            `DELETE FROM reels r WHERE r.id=$1 AND ${accessibleReel} RETURNING r.id`,
            [id, auth.user.id, auth.sessionHash],
          );
        else {
          const input = await body(request);
          const title = string(input.title, 200, "Reel title");
          const parsed = parseReelUrl(input.url);
          if (!parsed) fail(400, "Enter a valid Instagram Reel link.");
          const folderId =
            input.folderId === null ? null : identifier(input.folderId);
          if (folderId) await folderRecord(folderId, auth, false);
          rows = await db.query(
            `UPDATE reels r SET title=$4,url=$5,folder_id=$6 WHERE r.id=$1 AND ${accessibleReel} RETURNING r.id`,
            [id, auth.user.id, auth.sessionHash, title, parsed.url, folderId],
          );
        }
        if (!rows.length)
          fail(423, "Folder locked or reel changed. Refresh and try again.");
        return json(await library(auth));
      }
      fail(404, "API endpoint not found.");
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: error.message },
          error.status,
          error.status === 429 ? { "Retry-After": "900" } : {},
        );
      if (error.code === "23505")
        return json(
          { error: "That username or folder name is already in use." },
          409,
        );
      if (["23503", "23514", "22001", "22P02"].includes(error.code))
        return json(
          { error: "Record changed or invalid input. Refresh and try again." },
          400,
        );
      console.error("Reelbag database request failed", {
        code: /^[A-Z0-9_]{2,20}$/.test(error.code || "")
          ? error.code
          : "UNAVAILABLE",
      });
      return json(
        {
          error:
            "Cloud database unavailable. Check the server DATABASE_URL and connection.",
        },
        503,
      );
    }
  };
}
