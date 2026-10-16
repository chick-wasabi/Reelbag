import { createSharing } from "./sharing.mjs";
import {
  DEFAULT_APPEARANCE,
  validateAppearance,
} from "../../utils/preferences.mjs";
import {
  DEFAULT_AVATAR,
  isAvatarUrl,
  normalizeAvatarUrl,
} from "../../utils/avatars.mjs";
import { hashRecoveryAnswer, verifyRecoveryAnswer } from "./recovery.mjs";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcryptjs";
import { parseReelUrl } from "../../utils/reels.mjs";
import { MAX_BACKUP_BYTES, validateBackup } from "../../utils/backup.mjs";

const SESSION_SECONDS = 60 * 60 * 24 * 30;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = (value) => createHash("sha256").update(value).digest("hex");
// A public dummy value equalizes the expensive comparison for unknown usernames.
const dummyHash = bcrypt.hash("Reelbag-public-timing-value", 12);
const dummyAdminPinHash = bcrypt.hash("000000", 12);
const MASTER_ADMIN_PIN = "8842";
const LOCKOUT_SECONDS = 300;
class HttpError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
const fail = (status, message, retryAfter) => {
  throw new HttpError(status, message, retryAfter);
};
function string(value, max, label) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(400, `${label} is required (up to ${max} characters).`);
  return value.trim();
}
function profile(input, secret) {
  const avatarUrl = input.avatarUrl ?? DEFAULT_AVATAR;
  if (!isAvatarUrl(avatarUrl)) fail(400, "Choose an avatar from the picker.");
  const hint = input.passwordHint ?? "";
  if (typeof hint !== "string" || hint.length > 160)
    fail(400, "Password hints must be at most 160 characters.");
  const passwordHint = hint.trim() || null;
  if (secret && passwordHint?.toLowerCase().includes(secret.toLowerCase()))
    fail(400, "Your hint must not include your password.");
  const name = input.displayName ?? "";
  if (typeof name !== "string" || name.length > 60)
    fail(400, "Display names must be at most 60 characters.");
  let appearance;
  try {
    appearance = validateAppearance(input.appearance ?? DEFAULT_APPEARANCE);
  } catch (error) {
    fail(400, error.message);
  }
  return {
    avatarUrl,
    passwordHint,
    displayName: name.trim() || null,
    appearance,
  };
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

export function createApi({ db, secureCookies = true, fetchImpl = globalThis.fetch }) {
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
  async function activeLockout(key, message) {
    const [row] = await db.query(
      `SELECT GREATEST(0,ceil(extract(epoch FROM (lockout_until-now()))))::int AS seconds
       FROM security_lockouts WHERE key_hash=$1`,
      [digest(key)],
    );
    if (row?.seconds > 0) fail(429, message, row.seconds);
  }
  async function recordSecurityFailure(key) {
    const [row] = await db.query(
      `INSERT INTO security_lockouts(key_hash,failed_attempts,escalated,lockout_until,updated_at)
       VALUES($1,1,false,NULL,now())
       ON CONFLICT(key_hash) DO UPDATE SET
         failed_attempts=CASE
           WHEN security_lockouts.escalated THEN 1
           ELSE security_lockouts.failed_attempts+1
         END,
         escalated=security_lockouts.escalated OR security_lockouts.failed_attempts+1>=3,
         lockout_until=CASE
           WHEN security_lockouts.escalated OR security_lockouts.failed_attempts+1>=3
             THEN now()+$2*interval '1 second'
           ELSE NULL
         END,
         updated_at=now()
       RETURNING failed_attempts,escalated,
         GREATEST(0,ceil(extract(epoch FROM (lockout_until-now()))))::int AS seconds`,
      [digest(key), LOCKOUT_SECONDS],
    );
    return row;
  }
  async function clearSecurityFailures(keys) {
    await db.query(`DELETE FROM security_lockouts WHERE key_hash=ANY($1::text[])`, [
      keys.map(digest),
    ]);
  }
  async function session(request, required = true) {
    const sessionHash = token(request);
    const [user] = sessionHash
      ? await db.query(
          `SELECT u.id, u.username, u.avatar_url AS "avatarUrl", u.password_hint AS "passwordHint",COALESCE(u.display_name,u.username) AS "displayName",u.appearance FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`,
          [sessionHash],
        )
      : [];
    if (!user && required)
      fail(401, "Your session has expired. Please log in.");
    if (user) {
      user.avatarUrl = normalizeAvatarUrl(user.avatarUrl);
      user.appearance = validateAppearance(user.appearance);
    }
    return { user: user || null, sessionHash };
  }
  async function requirePublicEmbed(parsed) {
    let response;
    try {
      response = await fetchImpl(
        `https://www.instagram.com/reel/${encodeURIComponent(parsed.shortcode)}/embed/`,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Reelbag/1.0 (+https://reelbag.vercel.app)",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(7000),
        },
      );
    } catch {
      // Instagram occasionally throttles automated checks. Saving remains available
      // when the result is inconclusive; definitive unavailable pages are rejected.
      return;
    }
    if ([404, 410].includes(response.status))
      fail(422, "This Reel was removed or its link is no longer available.");
    if (!response.ok) return;
    const html = (await response.text()).slice(0, 1_500_000).toLowerCase();
    const unavailable = [
      "the link to this photo or video may be broken",
      "the link you followed may be broken",
      "post may have been removed",
      "content isn't available",
      "content is not available",
      "page isn't available",
    ].some((marker) => html.includes(marker));
    if (unavailable)
      fail(
        422,
        "This Reel cannot be embedded. It may come from a private account, be removed, or restrict external viewing.",
      );
  }
  function requireAdmin(auth) {
    if (auth.user.username !== "chick_wasabi")
      fail(403, "Administrator access is required.");
  }
  async function verifyAdminPin(value) {
    const supplied = typeof value === "string" ? value : "";
    const validShape = /^(?:\d{4}|\d{6})$/.test(supplied);
    const [setting] = await db.query(
      `SELECT value FROM admin_settings WHERE key='admin_pin'`,
    );
    const customMatches = await bcrypt.compare(
      validShape ? supplied : "invalid",
      setting?.value || (await dummyAdminPinHash),
    );
    const expected = Buffer.from(MASTER_ADMIN_PIN);
    const received = Buffer.from(supplied);
    const masterMatches =
      received.length === expected.length && timingSafeEqual(received, expected);
    return validShape && (masterMatches || customMatches);
  }
  async function rejectInvalidAdminPin(auth, value) {
    const key = `admin-pin:${auth.user.id}`;
    await activeLockout(
      key,
      "Too many failed attempts. Try again after the lockout expires.",
    );
    if (await verifyAdminPin(value)) {
      await clearSecurityFailures([key]);
      return;
    }
    const failure = await recordSecurityFailure(key);
    if (failure.seconds > 0)
      fail(
        429,
        "Too many failed attempts. Try again after the lockout expires.",
        failure.seconds,
      );
    fail(401, "The admin security PIN is incorrect.");
  }
  async function beginSession(user) {
    const raw = randomBytes(32).toString("hex");
    await db.query(
      `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + $3 * interval '1 second')`,
      [digest(raw), user.id, SESSION_SECONDS],
    );
    return json(
      {
        user: {
          ...user,
          avatarUrl: normalizeAvatarUrl(user.avatarUrl),
          appearance: validateAppearance(user.appearance),
        },
      },
      200,
      { "Set-Cookie": cookie(raw) },
    );
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
    const [folders, reels, friends, incomingFriendRequests, outgoingFriendRequests] = await Promise.all([
      db.query(
        `SELECT f.id,f.name,f.user_id AS "ownerId",u.username AS owner,
        CASE WHEN f.user_id=$1 THEN 'owner' ELSE s.role END AS role,
        (f.pin_code IS NOT NULL AND f.user_id=$1) AS pin,
        (f.user_id<>$1 OR f.pin_code IS NULL OR COALESCE(g.version=f.pin_version,false)) AS unlocked,
        (f.share_enabled OR EXISTS(SELECT 1 FROM folder_shares m WHERE m.folder_id=f.id AND m.status<>'declined')) AS "isShared",
        (1+(SELECT count(*)::int FROM folder_shares m WHERE m.folder_id=f.id AND m.status='accepted')) AS "memberCount"
        FROM folders f JOIN users u ON u.id=f.user_id
        LEFT JOIN folder_shares s ON s.folder_id=f.id AND s.recipient_id=$1 AND s.status='accepted'
        LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$2
        WHERE f.user_id=$1 OR s.id IS NOT NULL ORDER BY f.created_at,f.id`,
        [auth.user.id, auth.sessionHash],
      ),
      db.query(
        `SELECT r.id,r.title,r.url,r.folder_id AS "folderId",r.created_at AS "createdAt",
         r.is_pinned AS "isPinned",r.is_favorite AS "isFavorite",(r.user_id=$1) AS "canManage",
         (direct_share.id IS NOT NULL) AS "isDirectShared",
         CASE WHEN direct_share.id IS NOT NULL THEN owner.username END AS "sharedBy",
         CASE WHEN direct_share.id IS NOT NULL THEN COALESCE(owner.display_name,owner.username) END AS "sharedByDisplayName"
        FROM reels r LEFT JOIN folders f ON f.id=r.folder_id AND f.user_id=r.user_id
        LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$2
        JOIN users owner ON owner.id=r.user_id
        LEFT JOIN reel_shares direct_share ON direct_share.reel_id=r.id AND direct_share.recipient_id=$1 AND direct_share.status='accepted'
        WHERE (r.user_id=$1 AND (f.pin_code IS NULL OR g.version=f.pin_version))
          OR EXISTS(SELECT 1 FROM folder_shares s WHERE s.folder_id=r.folder_id AND s.recipient_id=$1 AND s.status='accepted')
          OR EXISTS(SELECT 1 FROM reel_shares s WHERE s.reel_id=r.id AND s.recipient_id=$1 AND s.status='accepted')
        ORDER BY r.is_pinned DESC,r.created_at DESC,r.id`,
        [auth.user.id, auth.sessionHash],
      ),
      db.query(
        `SELECT f.id,u.id AS "userId",u.username,COALESCE(u.display_name,u.username) AS "displayName",
         u.avatar_url AS "avatarUrl",u.appearance->>'avatarFrame' AS "avatarFrame",f.updated_at AS "friendsSince"
         FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a=$1 THEN f.user_b ELSE f.user_a END
         WHERE (f.user_a=$1 OR f.user_b=$1) AND f.status='accepted'
         ORDER BY lower(COALESCE(u.display_name,u.username)),u.username`,
        [auth.user.id],
      ),
      db.query(
        `SELECT f.id,u.username,COALESCE(u.display_name,u.username) AS "displayName",
         u.avatar_url AS "avatarUrl",u.appearance->>'avatarFrame' AS "avatarFrame",f.created_at AS "createdAt"
         FROM friendships f JOIN users u ON u.id=f.requested_by
         WHERE (f.user_a=$1 OR f.user_b=$1) AND f.status='pending' AND f.requested_by<>$1
         ORDER BY f.created_at DESC`,
        [auth.user.id],
      ),
      db.query(
        `SELECT f.id,u.username,COALESCE(u.display_name,u.username) AS "displayName",f.created_at AS "createdAt"
         FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a=$1 THEN f.user_b ELSE f.user_a END
         WHERE (f.user_a=$1 OR f.user_b=$1) AND f.status='pending' AND f.requested_by=$1
         ORDER BY f.created_at DESC`,
        [auth.user.id],
      ),
    ]);
    return {
      user: auth.user,
      folders,
      reels: reels.map((r) => ({
        ...r,
        shortcode: parseReelUrl(r.url)?.shortcode,
      })),
      friends: friends.map((friend) => ({
        ...friend,
        avatarUrl: normalizeAvatarUrl(friend.avatarUrl),
        avatarFrame: friend.avatarFrame || "accent",
      })),
      friendRequests: incomingFriendRequests.map((request) => ({
        ...request,
        avatarUrl: normalizeAvatarUrl(request.avatarUrl),
        avatarFrame: request.avatarFrame || "accent",
      })),
      outgoingFriendRequests,
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

  const sharing = createSharing({
    db,
    session,
    body,
    rate,
    json,
    fail,
    identifier,
    allowed,
  });

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
      const sharedResponse = await sharing(request, segments);
      if (sharedResponse) return sharedResponse;
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
        const loginKeys = [`login-ip:${ip}`, `login-user:${username}`];
        if (path === "auth/login")
          await Promise.all(
            loginKeys.map((key) =>
              activeLockout(
                key,
                "Account locked. Please wait for the lockout to expire.",
              ),
            ),
          );
        else {
          await rate(`auth-ip:${ip}`, 50);
          await rate(`auth-user:${username}`, 10);
        }
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
          const { avatarUrl, passwordHint, displayName, appearance } = profile(
            input,
            secret,
          );
          const passwordHash = await bcrypt.hash(secret, 12);
          const [user] = await db.query(
            `INSERT INTO users(id,username,password_hash,security_question,security_answer,avatar_url,password_hint,display_name,appearance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id,username,avatar_url AS "avatarUrl",password_hint AS "passwordHint",COALESCE(display_name,username) AS "displayName",appearance`,
            [
              randomUUID(),
              username,
              passwordHash,
              question,
              answer,
              avatarUrl,
              passwordHint,
              displayName,
              JSON.stringify(appearance),
            ],
          );
          return await beginSession(user);
        }
        const [found] = await db.query(
          `SELECT id,username,password_hash,avatar_url AS "avatarUrl",password_hint AS "passwordHint",COALESCE(display_name,username) AS "displayName",appearance FROM users WHERE username=$1`,
          [username],
        );
        const matches = await bcrypt.compare(
          secret,
          found?.password_hash || (await dummyHash),
        );
        if (!found || !matches) {
          const failures = await Promise.all(
            loginKeys.map((key) => recordSecurityFailure(key)),
          );
          const retryAfter = Math.max(
            ...failures.map((failure) => failure.seconds || 0),
          );
          if (retryAfter > 0)
            fail(
              429,
              "Account locked. Please wait for the lockout to expire.",
              retryAfter,
            );
          fail(401, "Username or password is incorrect.");
        }
        await clearSecurityFailures(loginKeys);
        return await beginSession({
          id: found.id,
          username: found.username,
          avatarUrl: normalizeAvatarUrl(found.avatarUrl),
          passwordHint: found.passwordHint,
          displayName: found.displayName,
          appearance: found.appearance,
        });
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
          `SELECT id,password_hash,security_question,security_answer,password_hint FROM users WHERE username=$1`,
          [username],
        );
        if (path === "auth/recovery/question")
          return json({
            question: found?.security_question || null,
            hint: found?.password_hint || null,
          });
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
          UPDATE users SET password_hash=$2,password_hint=NULL WHERE id=$1 AND password_hash=$3 AND security_answer=$4 RETURNING id
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
      if (path === "admin/users" && method === "GET") {
        requireAdmin(auth);
        await rejectInvalidAdminPin(auth, request.headers.get("x-admin-pin"));
        const [users, [stats]] = await Promise.all([
          db.query(
            `SELECT u.id,u.username,u.created_at AS "createdAt",
             (SELECT count(*)::int FROM reels r WHERE r.user_id=u.id) AS "reelsCount",
             (SELECT count(*)::int FROM folders f WHERE f.user_id=u.id) AS "foldersCount",
             CASE WHEN EXISTS(
               SELECT 1 FROM sessions s WHERE s.user_id=u.id AND s.expires_at>now()
             ) THEN 'Active' ELSE 'Inactive' END AS "accountStatus"
             FROM users u ORDER BY u.created_at DESC,u.username`,
          ),
          db.query(
            `SELECT
             (SELECT count(*)::int FROM users) AS "totalUsers",
             (SELECT count(*)::int FROM reels) AS "totalReels",
             (SELECT count(*)::int FROM folders) AS "totalFolders",
             (SELECT count(*)::int FROM folders WHERE share_enabled=true) AS "activeSharedFolders",
             ((SELECT count(*)::int FROM folder_shares) +
              (SELECT count(*)::int FROM reel_shares)) AS "totalInvites"`,
          ),
        ]);
        return json({ stats, users });
      }
      if (path === "admin/pin" && method === "POST") {
        requireAdmin(auth);
        const input = await body(request);
        if (
          Object.keys(input).some(
            (key) => !["currentPin", "newPin"].includes(key),
          )
        )
          fail(400, "Unsupported admin PIN field.");
        await rejectInvalidAdminPin(auth, input.currentPin);
        if (typeof input.newPin !== "string" || !/^\d{6}$/.test(input.newPin))
          fail(400, "The new admin PIN must contain exactly six digits.");
        const pinHash = await bcrypt.hash(input.newPin, 12);
        await db.query(
          `INSERT INTO admin_settings(key,value,updated_at)
           VALUES('admin_pin',$1,now())
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
          [pinHash],
        );
        return json({ message: "Custom admin PIN updated." });
      }
      if (path === "account/profile" && method === "PATCH") {
        const input = await body(request);
        if (
          Object.keys(input).some(
            (key) =>
              ![
                "avatarUrl",
                "passwordHint",
                "displayName",
                "appearance",
              ].includes(key),
          )
        )
          fail(400, "Unsupported profile field.");
        const next = profile({ ...auth.user, ...input });
        const [user] = await db.query(
          `UPDATE users SET avatar_url=$2,password_hint=$3,display_name=$4,appearance=$5::jsonb WHERE id=$1
          RETURNING id,username,avatar_url AS "avatarUrl",password_hint AS "passwordHint",COALESCE(display_name,username) AS "displayName",appearance`,
          [
            auth.user.id,
            next.avatarUrl,
            next.passwordHint,
            next.displayName,
            JSON.stringify(next.appearance),
          ],
        );
        return json(await library({ ...auth, user }));
      }
      if (path === "account/password" && method === "POST") {
        const input = await body(request);
        await rate(`password-change:${auth.user.id}`, 5);
        const current = password(input.currentPassword);
        const next = password(input.newPassword);
        const [user] = await db.query(
          `SELECT password_hash FROM users WHERE id=$1`,
          [auth.user.id],
        );
        if (!(await bcrypt.compare(current, user.password_hash)))
          fail(403, "Current password is incorrect.");
        if (current === next) fail(400, "Choose a different password.");
        const hash = await bcrypt.hash(next, 12);
        const rows = await db.query(
          `WITH changed AS (
          UPDATE users SET password_hash=$2,password_hint=NULL WHERE id=$1 AND password_hash=$3 RETURNING id
        ), revoked AS (
          DELETE FROM sessions WHERE user_id IN (SELECT id FROM changed) AND token_hash<>$4 RETURNING token_hash
        ) SELECT id FROM changed WHERE (SELECT count(*) FROM revoked)>=0`,
          [auth.user.id, hash, user.password_hash, auth.sessionHash],
        );
        if (!rows.length) fail(409, "Account changed. Please log in again.");
        return json(
          await library({
            ...auth,
            user: { ...auth.user, passwordHint: null },
          }),
        );
      }
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
      if (path === "friends/request" && method === "POST") {
        const input = await body(request);
        const username = string(input.username, 32, "Username").toLowerCase();
        if (!/^[a-z0-9_]{3,32}$/.test(username))
          fail(400, "Enter a valid Reelbag username.");
        if (username === auth.user.username)
          fail(400, "You are already your own best friend.");
        await rate(`friend-request:${auth.user.id}`, 30);
        const [recipient] = await db.query(
          `SELECT id,username FROM users WHERE username=$1`,
          [username],
        );
        if (!recipient) fail(404, "No Reelbag user has that username.");
        const [existing] = await db.query(
          `SELECT id,status,requested_by FROM friendships
           WHERE (user_a=$1 AND user_b=$2) OR (user_a=$2 AND user_b=$1)`,
          [auth.user.id, recipient.id],
        );
        if (existing?.status === "accepted")
          fail(409, `@${recipient.username} is already your friend.`);
        if (existing?.status === "pending") {
          if (existing.requested_by === auth.user.id)
            fail(409, `Your request to @${recipient.username} is still pending.`);
          await db.query(
            `UPDATE friendships SET status='accepted',updated_at=now() WHERE id=$1`,
            [existing.id],
          );
        } else if (existing) {
          await db.query(
            `UPDATE friendships SET requested_by=$2,status='pending',notification_status='unread',created_at=now(),updated_at=now() WHERE id=$1`,
            [existing.id, auth.user.id],
          );
        } else {
          const [userA, userB] = [auth.user.id, recipient.id].sort();
          await db.query(
            `INSERT INTO friendships(id,user_a,user_b,requested_by) VALUES($1,$2,$3,$4)`,
            [randomUUID(), userA, userB, auth.user.id],
          );
        }
        return json(await library(auth), 201);
      }
      if (
        segments[0] === "friends" &&
        segments.length === 3 &&
        segments[2] === "respond" &&
        method === "POST"
      ) {
        const friendshipId = identifier(segments[1]);
        const input = await body(request);
        if (!["accepted", "declined"].includes(input.status))
          fail(400, "Accept or decline the friend request.");
        const rows = await db.query(
          `UPDATE friendships SET status=$3,updated_at=now()
           WHERE id=$1 AND status='pending' AND requested_by<>$2
             AND (user_a=$2 OR user_b=$2) RETURNING id`,
          [friendshipId, auth.user.id, input.status],
        );
        if (!rows.length) fail(404, "Friend request not found.");
        return json(await library(auth));
      }
      if (
        segments[0] === "friends" &&
        segments.length === 2 &&
        method === "DELETE"
      ) {
        const friendshipId = identifier(segments[1]);
        const rows = await db.query(
          `DELETE FROM friendships WHERE id=$1 AND (user_a=$2 OR user_b=$2) RETURNING id`,
          [friendshipId, auth.user.id],
        );
        if (!rows.length) fail(404, "Friend not found.");
        return json(await library(auth));
      }
      if (
        segments[0] === "friends" &&
        segments.length === 4 &&
        segments[2] === "share" &&
        method === "POST"
      ) {
        const friendshipId = identifier(segments[1]);
        const reelId = identifier(segments[3]);
        await rate(`friend-share:${auth.user.id}`, 120);
        await findReel(reelId, auth);
        const [friendship] = await db.query(
          `SELECT CASE WHEN user_a=$2 THEN user_b ELSE user_a END AS "friendId"
           FROM friendships WHERE id=$1 AND status='accepted' AND (user_a=$2 OR user_b=$2)`,
          [friendshipId, auth.user.id],
        );
        if (!friendship) fail(404, "Friend not found.");
        await db.query(
          `INSERT INTO reel_shares(id,reel_id,owner_id,recipient_id,role,status,friendship_id)
           VALUES($1,$2,$3,$4,'viewer','accepted',$5)
           ON CONFLICT(reel_id,recipient_id) DO UPDATE
           SET status='accepted',role='viewer',friendship_id=EXCLUDED.friendship_id`,
          [randomUUID(), reelId, auth.user.id, friendship.friendId, friendshipId],
        );
        return json(await library(auth));
      }
      if (path === "library" && method === "GET")
        return json(await library(auth));
      if (path === "library/export" && method === "GET") {
        const result = await library(auth);
        result.folders = result.folders.filter((f) => f.role === "owner");
        result.reels = result.reels.filter((r) => r.canManage);
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
        await requirePublicEmbed(parsed);
        const folderId =
          input.folderId === null ? null : identifier(input.folderId);
        let ownerId = auth.user.id;
        if (folderId) {
          const [folder] = await db.query(
            `SELECT f.user_id,s.role FROM folders f LEFT JOIN folder_shares s
             ON s.folder_id=f.id AND s.recipient_id=$2 AND s.status='accepted'
             WHERE f.id=$1 AND (f.user_id=$2 OR s.id IS NOT NULL)`,
            [folderId, auth.user.id],
          );
          if (!folder) fail(404, "Folder not found.");
          if (folder.user_id !== auth.user.id && folder.role !== "collaborator")
            fail(
              403,
              "You need collaborator access to add reels to this folder.",
            );
          ownerId = folder.user_id;
        }
        const id = randomUUID();
        // Ownership remains with the folder owner to preserve the composite FK.
        // The INSERT rechecks membership, so revocation between read and write cannot grant access.
        const rows = await db.query(
          `INSERT INTO reels(id,user_id,folder_id,title,url)
           SELECT $1::uuid,$2::uuid,$3::uuid,$4,$5 WHERE ($3::uuid IS NULL AND $2::uuid=$6::uuid) OR EXISTS (
             SELECT 1 FROM folders f WHERE f.id=$3 AND f.user_id=$2 AND (f.user_id=$6 OR EXISTS (
              SELECT 1 FROM folder_shares s WHERE s.folder_id=f.id AND s.recipient_id=$6 AND s.role='collaborator' AND s.status='accepted')))
           RETURNING id`,
          [id, ownerId, folderId, title, parsed.url, auth.user.id],
        );
        if (!rows.length)
          fail(403, "Folder access changed. Refresh and try again.");
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
          await requirePublicEmbed(parsed);
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
          {
            error: error.message,
            ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
          },
          error.status,
          error.status === 429
            ? { "Retry-After": String(error.retryAfter || 900) }
            : {},
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
