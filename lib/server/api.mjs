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
import { normalizeFolderIcon } from "../../utils/folder-icons.mjs";
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
const REACTIONS = new Set(["❤️", "😂", "🔥", "😮", "👏"]);
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
function reelTitle(value) {
  if (value === undefined || value === null || value === "") return "Reelbag";
  if (typeof value !== "string" || value.length > 200)
    fail(400, "Reel title must be at most 200 characters.");
  return value.trim() || "Reelbag";
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
  const deviceCookieName = secureCookies
    ? "__Host-reelbag_device"
    : "reelbag_device";
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
  const deviceCookie = (value, maxAge = SESSION_SECONDS) =>
    `${deviceCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  function rawCookie(request, name) {
    const match = (request.headers.get("cookie") || "")
      .split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
    return match?.slice(name.length + 1) || "";
  }
  function token(request) {
    const value = rawCookie(request, cookieName);
    return /^[a-f0-9]{64}$/.test(value || "") ? digest(value) : null;
  }
  function deviceHash(request) {
    const value = rawCookie(request, deviceCookieName);
    return /^[a-f0-9]{64}$/.test(value) ? digest(value) : null;
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
          `SELECT u.id, u.username, u.avatar_url AS "avatarUrl", u.password_hint AS "passwordHint",COALESCE(u.display_name,u.username) AS "displayName",u.appearance,(u.trash_pin IS NOT NULL) AS "trashProtected" FROM sessions s JOIN users u ON u.id=s.user_id
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
  async function beginSession(user, request) {
    const raw = randomBytes(32).toString("hex");
    const existingDevice = rawCookie(request, deviceCookieName);
    const rawDevice = /^[a-f0-9]{64}$/.test(existingDevice) ? existingDevice : randomBytes(32).toString("hex");
    await db.query(
      `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + $3 * interval '1 second')`,
      [digest(raw), user.id, SESSION_SECONDS],
    );
    await db.query(
      `INSERT INTO device_accounts(device_hash,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [digest(rawDevice), user.id],
    );
    const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" });
    headers.append("Set-Cookie", cookie(raw));
    headers.append("Set-Cookie", deviceCookie(rawDevice));
    return Response.json({
        user: {
          ...user,
          avatarUrl: normalizeAvatarUrl(user.avatarUrl),
          appearance: validateAppearance(user.appearance),
        },
      }, { status: 200, headers });
  }
  // Every protected operation rechecks the grant against the current folder version.
  const allowed = (
    folderAlias = "f",
  ) => `(${folderAlias}.pin_code IS NULL OR EXISTS (
    SELECT 1 FROM folder_unlocks g WHERE g.folder_id=${folderAlias}.id AND g.session_hash=$3 AND g.version=${folderAlias}.pin_version))`;
  async function folderRecord(id, auth, requireUnlocked = true) {
    const [folder] = await db.query(
      `SELECT f.*, ${allowed()} AS accessible FROM folders f WHERE f.id=$1 AND f.user_id=$2 AND f.deleted_at IS NULL`,
      [id, auth.user.id, auth.sessionHash],
    );
    if (!folder) fail(404, "Folder not found.");
    if (requireUnlocked && !folder.accessible)
      fail(423, "Unlock this folder first.");
    return folder;
  }
  async function library(auth) {
    const [folders, reels, friends, trashSummary, incomingFriendRequests, outgoingFriendRequests] = await Promise.all([
      db.query(
        `SELECT f.id,f.name,f.icon,f.user_id AS "ownerId",u.username AS owner,
        COALESCE(u.display_name,u.username) AS "ownerDisplayName",u.avatar_url AS "ownerAvatarUrl",
        COALESCE(u.appearance->>'avatarFrame','accent') AS "ownerAvatarFrame",
        CASE WHEN f.user_id=$1 THEN 'owner' ELSE s.role END AS role,
        CASE WHEN f.user_id=$1 THEN f.pin_code IS NOT NULL ELSE rp.pin_code IS NOT NULL END AS pin,
        CASE WHEN f.user_id=$1 THEN (f.pin_code IS NULL OR COALESCE(g.version=f.pin_version,false))
          ELSE (rp.pin_code IS NULL OR COALESCE(g.version=rp.pin_version,false)) END AS unlocked,
        (f.share_enabled OR EXISTS(SELECT 1 FROM folder_shares m WHERE m.folder_id=f.id AND m.status<>'declined')) AS "isShared",
        (1+(SELECT count(*)::int FROM folder_shares m WHERE m.folder_id=f.id AND m.status='accepted')) AS "memberCount",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'recipientId',m.recipient_id,'username',mu.username,
          'displayName',COALESCE(mu.display_name,mu.username),'avatarUrl',mu.avatar_url,
          'avatarFrame',COALESCE(mu.appearance->>'avatarFrame','accent'),'role',m.role
        ) ORDER BY lower(COALESCE(mu.display_name,mu.username)),mu.username)
        FROM folder_shares m JOIN users mu ON mu.id=m.recipient_id
        WHERE m.folder_id=f.id AND m.status='accepted'),'[]'::jsonb) AS members
        FROM folders f JOIN users u ON u.id=f.user_id
        LEFT JOIN folder_shares s ON s.folder_id=f.id AND s.recipient_id=$1 AND s.status='accepted'
        LEFT JOIN shared_folder_pins rp ON rp.folder_id=f.id AND rp.user_id=$1
        LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$2
        WHERE f.deleted_at IS NULL AND (f.user_id=$1 OR s.id IS NOT NULL) ORDER BY f.created_at,f.id`,
        [auth.user.id, auth.sessionHash],
      ),
      db.query(
        `WITH contexts AS (
          SELECT r.id,NULL::uuid AS "folderId",'all'::text AS scope,r.created_at AS "addedAt",
            true AS "canManage",false AS "isDirectShared"
          FROM reels r WHERE r.user_id=$1 AND NOT EXISTS (
            SELECT 1 FROM reel_folder_memberships locked_rf JOIN folders locked_f ON locked_f.id=locked_rf.folder_id
            LEFT JOIN folder_unlocks locked_g ON locked_g.folder_id=locked_f.id AND locked_g.session_hash=$2
            WHERE locked_rf.reel_id=r.id AND locked_f.deleted_at IS NULL
              AND locked_f.pin_code IS NOT NULL AND locked_g.version IS DISTINCT FROM locked_f.pin_version
          )
          UNION ALL
          SELECT r.id,rf.folder_id,'folder:'||rf.folder_id::text,rf.added_at,
            (r.user_id=$1),false
          FROM reel_folder_memberships rf JOIN reels r ON r.id=rf.reel_id
          JOIN folders f ON f.id=rf.folder_id
          LEFT JOIN folder_shares fs ON fs.folder_id=f.id AND fs.recipient_id=$1 AND fs.status='accepted'
          LEFT JOIN shared_folder_pins rp ON rp.folder_id=f.id AND rp.user_id=$1
          LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$2
          WHERE f.deleted_at IS NULL AND (f.user_id=$1 OR fs.id IS NOT NULL)
            AND (f.user_id=$1 AND (f.pin_code IS NULL OR g.version=f.pin_version)
              OR fs.id IS NOT NULL AND (rp.pin_code IS NULL OR g.version=rp.pin_version))
          UNION ALL
          SELECT r.id,NULL::uuid,'shared',rs.created_at,false,true
          FROM reel_shares rs JOIN reels r ON r.id=rs.reel_id
          WHERE rs.recipient_id=$1 AND rs.status='accepted'
        )
        SELECT r.id,r.title,r.url,c."folderId",c.scope AS "viewScope",c."addedAt" AS "createdAt",
         COALESCE(flags.is_pinned,false) AS "isPinned",COALESCE(flags.is_favorite,false) AS "isFavorite",c."canManage",
         c."isDirectShared",
         CASE WHEN c."isDirectShared" THEN owner.username END AS "sharedBy",
         CASE WHEN c."isDirectShared" THEN COALESCE(owner.display_name,owner.username) END AS "sharedByDisplayName",
         CASE WHEN c.scope='all' THEN COALESCE((SELECT jsonb_agg(f.name ORDER BY lower(f.name))
           FROM reel_folder_memberships own_rf JOIN folders f ON f.id=own_rf.folder_id
           WHERE own_rf.reel_id=r.id AND f.user_id=$1 AND f.deleted_at IS NULL),'[]'::jsonb) ELSE '[]'::jsonb END AS "folderNames",
         (SELECT reaction.emoji FROM reel_reactions reaction WHERE reaction.reel_id=r.id AND reaction.user_id=$1) AS reaction,
         COALESCE((SELECT jsonb_object_agg(grouped.emoji,grouped.count) FROM (
           SELECT emoji,count(*)::int AS count FROM reel_reactions WHERE reel_id=r.id GROUP BY emoji
         ) grouped),'{}'::jsonb) AS "reactionCounts",
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'emoji',reaction.emoji,'userId',reactor.id,'username',reactor.username,
           'displayName',COALESCE(reactor.display_name,reactor.username),'avatarUrl',reactor.avatar_url,
           'avatarFrame',COALESCE(reactor.appearance->>'avatarFrame','accent')
         ) ORDER BY reaction.created_at,reactor.username)
         FROM reel_reactions reaction JOIN users reactor ON reactor.id=reaction.user_id
         WHERE reaction.reel_id=r.id),'[]'::jsonb) AS "reactionPeople",
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
           'recipientId',share.recipient_id,'username',recipient.username,
           'displayName',COALESCE(recipient.display_name,recipient.username),
           'avatarUrl',recipient.avatar_url,'avatarFrame',COALESCE(recipient.appearance->>'avatarFrame','accent')
         ) ORDER BY lower(COALESCE(recipient.display_name,recipient.username)),recipient.username)
         FROM reel_shares share JOIN users recipient ON recipient.id=share.recipient_id
         WHERE share.reel_id=r.id AND share.status='accepted' AND r.user_id=$1),'[]'::jsonb) AS "sharedWith"
        FROM contexts c JOIN reels r ON r.id=c.id
        JOIN users owner ON owner.id=r.user_id
        LEFT JOIN reel_view_flags flags ON flags.user_id=$1 AND flags.reel_id=r.id AND flags.scope=c.scope
        WHERE NOT EXISTS(SELECT 1 FROM reel_user_states state WHERE state.user_id=$1 AND state.reel_id=r.id)
        ORDER BY COALESCE(flags.is_pinned,false) DESC,c."addedAt" DESC,r.id,c.scope`,
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
        `SELECT count(*)::int AS count FROM reel_user_states WHERE user_id=$1 AND state='trash'`,
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
    const hiddenReels = await db.query(
      `SELECT r.id,r.title,r.url,r.folder_id AS "folderId",r.created_at AS "createdAt",
       r.is_pinned AS "isPinned",false AS "isFavorite",false AS "canManage",false AS "isDirectShared"
       FROM reel_user_states state JOIN reels r ON r.id=state.reel_id
       WHERE state.user_id=$1 AND state.state='hidden' AND (
         EXISTS(SELECT 1 FROM folder_shares s WHERE s.folder_id=r.folder_id AND s.recipient_id=$1 AND s.status='accepted'
           AND NOT EXISTS (
             SELECT 1 FROM shared_folder_pins p WHERE p.user_id=$1 AND p.folder_id=r.folder_id
             AND NOT EXISTS (
               SELECT 1 FROM folder_unlocks g WHERE g.session_hash=$2 AND g.folder_id=r.folder_id
               AND g.version=p.pin_version
             )
           ))
         OR EXISTS(SELECT 1 FROM reel_shares s WHERE s.reel_id=r.id AND s.recipient_id=$1 AND s.status='accepted'))
       ORDER BY state.deleted_at DESC,r.id`,
      [auth.user.id, auth.sessionHash],
    );
    return {
      user: auth.user,
      folders: folders.map((folder) => ({
        ...folder,
        ownerMember: {
          recipientId: folder.ownerId,
          username: folder.owner,
          displayName: folder.ownerDisplayName,
          avatarUrl: normalizeAvatarUrl(folder.ownerAvatarUrl),
          avatarFrame: folder.ownerAvatarFrame || "accent",
          role: "owner",
        },
        members: (folder.members || []).map((member) => ({
          ...member,
          avatarUrl: normalizeAvatarUrl(member.avatarUrl),
          avatarFrame: member.avatarFrame || "accent",
        })),
      })),
      reels: reels.map((r) => ({
        ...r,
        shortcode: parseReelUrl(r.url)?.shortcode,
        reactionPeople: (r.reactionPeople || []).map((person) => ({
          ...person,
          avatarUrl: normalizeAvatarUrl(person.avatarUrl),
          avatarFrame: person.avatarFrame || "accent",
        })),
        sharedWith: (r.sharedWith || []).map((person) => ({
          ...person,
          avatarUrl: normalizeAvatarUrl(person.avatarUrl),
          avatarFrame: person.avatarFrame || "accent",
        })),
      })),
      hiddenReels: hiddenReels.map((r) => ({
        ...r,
        shortcode: parseReelUrl(r.url)?.shortcode,
        reactionCounts: {},
        reactionPeople: [],
        sharedWith: [],
        isHidden: true,
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
      trashCount: trashSummary[0]?.count || 0,
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
      `SELECT r.id,NOT EXISTS (
        SELECT 1 FROM reel_folder_memberships rf JOIN folders f ON f.id=rf.folder_id
        LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$3
        WHERE rf.reel_id=r.id AND f.deleted_at IS NULL AND f.pin_code IS NOT NULL
          AND g.version IS DISTINCT FROM f.pin_version
      ) AS accessible FROM reels r WHERE r.id=$1 AND r.user_id=$2`,
      [id, auth.user.id, auth.sessionHash],
    );
    if (!row) fail(404, "Reel not found.");
    if (!row.accessible) fail(423, "Unlock the Reel's protected folder first.");
    return row;
  }
  const accessibleReel = `r.user_id=$2 AND NOT EXISTS (
    SELECT 1 FROM reel_folder_memberships rf JOIN folders f ON f.id=rf.folder_id
    LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$3
    WHERE rf.reel_id=r.id AND f.deleted_at IS NULL AND f.pin_code IS NOT NULL
      AND g.version IS DISTINCT FROM f.pin_version)`;

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
            `INSERT INTO users(id,username,password_hash,security_question,security_answer,avatar_url,password_hint,display_name,appearance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id,username,avatar_url AS "avatarUrl",password_hint AS "passwordHint",COALESCE(display_name,username) AS "displayName",appearance,false AS "trashProtected"`,
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
          return await beginSession(user, request);
        }
        const [found] = await db.query(
          `SELECT id,username,password_hash,avatar_url AS "avatarUrl",password_hint AS "passwordHint",COALESCE(display_name,username) AS "displayName",appearance,(trash_pin IS NOT NULL) AS "trashProtected" FROM users WHERE username=$1`,
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
        }, request);
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
        await db.query(`DELETE FROM device_accounts WHERE user_id=$1`, [found.id]);
        return json(
          { message: "Password reset. Log in with your new password." },
          200,
          { "Set-Cookie": cookie("", 0) },
        );
      }
      if (path === "auth/logout" && method === "POST") {
        const hash = token(request);
        const device = deviceHash(request);
        const current = await session(request, false);
        if (hash)
          await db.query(`DELETE FROM sessions WHERE token_hash=$1`, [hash]);
        if (device && current.user)
          await db.query(`DELETE FROM device_accounts WHERE device_hash=$1 AND user_id=$2`, [device, current.user.id]);
        return json({ user: null }, 200, { "Set-Cookie": cookie("", 0) });
      }
      if (path === "auth/accounts" && method === "GET") {
        const auth = await session(request);
        const existing = rawCookie(request, deviceCookieName);
        const rawDevice = /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString("hex");
        const device = digest(rawDevice);
        await db.query(`INSERT INTO device_accounts(device_hash,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [device, auth.user.id]);
        const accounts = await db.query(
          `SELECT u.id,u.username,COALESCE(u.display_name,u.username) AS "displayName",u.avatar_url AS "avatarUrl",
           COALESCE(u.appearance->>'avatarFrame','accent') AS "avatarFrame"
           FROM device_accounts d JOIN users u ON u.id=d.user_id WHERE d.device_hash=$1 ORDER BY d.created_at,u.username`,
          [device],
        );
        return json({ accounts: accounts.map((account) => ({ ...account, avatarUrl: normalizeAvatarUrl(account.avatarUrl) })) }, 200,
          existing ? {} : { "Set-Cookie": deviceCookie(rawDevice) });
      }
      if (path === "auth/switch" && method === "POST") {
        const auth = await session(request);
        const device = deviceHash(request);
        if (!device) fail(401, "Add this account again before switching.");
        const input = await body(request);
        const userId = identifier(input.userId);
        const [user] = await db.query(
          `SELECT u.id,u.username,u.avatar_url AS "avatarUrl",u.password_hint AS "passwordHint",
           COALESCE(u.display_name,u.username) AS "displayName",u.appearance,(u.trash_pin IS NOT NULL) AS "trashProtected"
           FROM device_accounts d JOIN users u ON u.id=d.user_id WHERE d.device_hash=$1 AND u.id=$2`,
          [device, userId],
        );
        if (!user) fail(404, "That account is no longer saved on this device.");
        if (user.id === auth.user.id) return json({ user: auth.user });
        return await beginSession(user, request);
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
          RETURNING id,username,avatar_url AS "avatarUrl",password_hint AS "passwordHint",COALESCE(display_name,username) AS "displayName",appearance,(trash_pin IS NOT NULL) AS "trashProtected"`,
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
        const currentDevice = deviceHash(request);
        await db.query(`DELETE FROM device_accounts WHERE user_id=$1`, [auth.user.id]);
        if (currentDevice)
          await db.query(`INSERT INTO device_accounts(device_hash,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [currentDevice, auth.user.id]);
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
        const [friendship] = await db.query(
          `SELECT CASE WHEN user_a=$2 THEN user_b ELSE user_a END AS "friendId"
           FROM friendships WHERE id=$1 AND (user_a=$2 OR user_b=$2)`,
          [friendshipId, auth.user.id],
        );
        if (!friendship) fail(404, "Friend not found.");
        await db.transaction([
          [
            `DELETE FROM reel_shares WHERE (owner_id=$1 AND recipient_id=$2) OR (owner_id=$2 AND recipient_id=$1)`,
            [auth.user.id, friendship.friendId],
          ],
          [
            `DELETE FROM folder_shares WHERE (owner_id=$1 AND recipient_id=$2) OR (owner_id=$2 AND recipient_id=$1)`,
            [auth.user.id, friendship.friendId],
          ],
          [
            `DELETE FROM friendships WHERE id=$1 AND (user_a=$2 OR user_b=$2) RETURNING id`,
            [friendshipId, auth.user.id],
          ],
        ]);
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
      if (path === "trash/open" && method === "POST") {
        await rate(`trash-open:${auth.user.id}`, 20);
        const input = await body(request);
        const [settings] = await db.query(`SELECT trash_pin FROM users WHERE id=$1`, [
          auth.user.id,
        ]);
        if (settings.trash_pin) {
          if (typeof input.pin !== "string" || !/^\d{4}$/.test(input.pin))
            fail(401, "Enter your 4-digit Recently Deleted PIN.");
          if (!(await bcrypt.compare(input.pin, settings.trash_pin)))
            fail(403, "That Recently Deleted PIN doesn’t match.");
        }
        const [items, folders] = await Promise.all([db.query(
          `SELECT r.id,r.title,r.url,r.folder_id AS "folderId",s.deleted_at AS "deletedAt",
           (r.user_id=$1) AS "canManage",u.username AS owner,
           COALESCE(u.display_name,u.username) AS "ownerDisplayName",f.name AS "folderName",
           (r.user_id<>$1) AS "isDirectShared",
           CASE WHEN r.user_id<>$1 THEN u.username END AS "sharedBy",
           CASE WHEN r.user_id<>$1 THEN COALESCE(u.display_name,u.username) END AS "sharedByDisplayName"
           FROM reel_user_states s JOIN reels r ON r.id=s.reel_id
           JOIN users u ON u.id=r.user_id LEFT JOIN folders f ON f.id=r.folder_id
           WHERE s.user_id=$1 AND s.state='trash' ORDER BY s.deleted_at DESC`,
          [auth.user.id],
        ), db.query(
          `SELECT f.id,f.name,f.icon,f.deleted_at AS "deletedAt",count(rf.reel_id)::int AS "reelCount"
           FROM folders f LEFT JOIN reel_folder_memberships rf ON rf.folder_id=f.id
           WHERE f.user_id=$1 AND f.deleted_at IS NOT NULL
           GROUP BY f.id ORDER BY f.deleted_at DESC`,
          [auth.user.id],
        )]);
        await db.query(`DELETE FROM rate_limits WHERE key_hash=$1`, [
          digest(`trash-open:${auth.user.id}`),
        ]);
        return json({ items, folders, protected: Boolean(settings.trash_pin) });
      }
      if (path === "trash/pin" && method === "POST") {
        await rate(`trash-pin:${auth.user.id}`, 10);
        const input = await body(request);
        const [settings] = await db.query(`SELECT trash_pin FROM users WHERE id=$1`, [
          auth.user.id,
        ]);
        if (settings.trash_pin) {
          if (
            typeof input.currentPin !== "string" ||
            !(await bcrypt.compare(input.currentPin, settings.trash_pin))
          )
            fail(403, "Current Recently Deleted PIN is incorrect.");
        }
        let hash = null;
        if (input.enabled !== false) {
          if (typeof input.newPin !== "string" || !/^\d{4}$/.test(input.newPin))
            fail(400, "Recently Deleted PINs must be exactly 4 digits.");
          hash = await bcrypt.hash(input.newPin, 12);
        }
        await db.query(`UPDATE users SET trash_pin=$2 WHERE id=$1`, [auth.user.id, hash]);
        await db.query(`DELETE FROM rate_limits WHERE key_hash=$1`, [
          digest(`trash-pin:${auth.user.id}`),
        ]);
        return json({ protected: Boolean(hash) });
      }
      if (
        segments[0] === "trash" &&
        segments.length === 3 &&
        ["restore", "permanent"].includes(segments[2]) &&
        method === "POST"
      ) {
        const reelId = identifier(segments[1]);
        const [trashed] = await db.query(
          `SELECT r.user_id AS "ownerId" FROM reel_user_states s JOIN reels r ON r.id=s.reel_id
           WHERE s.user_id=$1 AND s.reel_id=$2 AND s.state='trash'`,
          [auth.user.id, reelId],
        );
        if (!trashed) fail(404, "Deleted Reel not found.");
        if (segments[2] === "restore")
          await db.query(`DELETE FROM reel_user_states WHERE user_id=$1 AND reel_id=$2`, [
            auth.user.id,
            reelId,
          ]);
        else if (trashed.ownerId === auth.user.id)
          await db.query(`DELETE FROM reels WHERE id=$1 AND user_id=$2`, [
            reelId,
            auth.user.id,
          ]);
        else
          await db.query(
            `UPDATE reel_user_states SET state='hidden',deleted_at=now() WHERE user_id=$1 AND reel_id=$2`,
            [auth.user.id, reelId],
          );
        return json({ changed: true });
      }
      if (
        segments[0] === "trash" && segments[1] === "folder" && segments.length === 4 &&
        ["restore", "permanent"].includes(segments[3]) && method === "POST"
      ) {
        const folderId = identifier(segments[2]);
        if (segments[3] === "restore") {
          const rows = await db.query(
            `UPDATE folders SET deleted_at=NULL WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL RETURNING id`,
            [folderId, auth.user.id],
          );
          if (!rows.length) fail(404, "Deleted folder not found.");
        } else {
          const rows = await db.transaction([
            [`DELETE FROM reel_view_flags WHERE scope=$1`, [`folder:${folderId}`]],
            [`UPDATE reels SET folder_id=NULL WHERE folder_id=$1 AND user_id=$2`, [folderId, auth.user.id]],
            [`DELETE FROM folders WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL RETURNING id`, [folderId, auth.user.id]],
          ]);
          if (!rows[2].length) fail(404, "Deleted folder not found.");
        }
        return json({ changed: true });
      }
      if (
        segments[0] === "reels" &&
        segments.length === 3 &&
        segments[2] === "trash" &&
        method === "POST"
      ) {
        const reelId = identifier(segments[1]);
        const [record] = await db.query(
          `SELECT r.user_id AS "ownerId" FROM reels r WHERE r.id=$1 AND (
             r.user_id=$2 OR EXISTS(SELECT 1 FROM reel_shares s WHERE s.reel_id=r.id AND s.recipient_id=$2 AND s.status='accepted')
             OR EXISTS(SELECT 1 FROM reel_folder_memberships rf JOIN folder_shares s ON s.folder_id=rf.folder_id
               WHERE rf.reel_id=r.id AND s.recipient_id=$2 AND s.status='accepted'))`,
          [reelId, auth.user.id],
        );
        if (!record) fail(404, "Reel not found.");
        if (record.ownerId === auth.user.id) await findReel(reelId, auth);
        const statements = [[
          `INSERT INTO reel_user_states(user_id,reel_id,state,deleted_at) VALUES($1,$2,'trash',now())
           ON CONFLICT(user_id,reel_id) DO UPDATE SET state='trash',deleted_at=now()`,
          [auth.user.id, reelId],
        ]];
        if (record.ownerId === auth.user.id) {
          statements.push([`DELETE FROM reel_folder_memberships WHERE reel_id=$1`, [reelId]]);
          statements.push([`DELETE FROM reel_view_flags WHERE reel_id=$1`, [reelId]]);
          statements.push([`UPDATE reels SET folder_id=NULL,is_pinned=false,is_favorite=false WHERE id=$1`, [reelId]]);
        } else statements.push([`DELETE FROM reel_view_flags WHERE user_id=$1 AND reel_id=$2`, [auth.user.id, reelId]]);
        await db.transaction(statements);
        return json(await library(auth));
      }
      if (
        segments[0] === "reels" &&
        segments.length === 3 &&
        segments[2] === "reaction" &&
        method === "POST"
      ) {
        const reelId = identifier(segments[1]);
        const input = await body(request);
        if (input.emoji !== null && !REACTIONS.has(input.emoji))
          fail(400, "Choose an available reaction.");
        const accessible = await db.query(
          `SELECT r.id FROM reels r LEFT JOIN folders f ON f.id=r.folder_id
           LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$3
           WHERE r.id=$2 AND (
             (r.user_id=$1 AND (r.folder_id IS NULL OR f.pin_code IS NULL OR g.version=f.pin_version))
             OR EXISTS(SELECT 1 FROM folder_shares s WHERE s.folder_id=r.folder_id AND s.recipient_id=$1 AND s.status='accepted')
             OR EXISTS(SELECT 1 FROM reel_shares s WHERE s.reel_id=r.id AND s.recipient_id=$1 AND s.status='accepted'))`,
          [auth.user.id, reelId, auth.sessionHash],
        );
        if (!accessible.length) fail(404, "Reel not found or folder is locked.");
        if (input.emoji === null)
          await db.query(`DELETE FROM reel_reactions WHERE user_id=$1 AND reel_id=$2`, [auth.user.id, reelId]);
        else
          await db.query(
            `INSERT INTO reel_reactions(user_id,reel_id,emoji) VALUES($1,$2,$3)
             ON CONFLICT(user_id,reel_id) DO UPDATE SET emoji=EXCLUDED.emoji,created_at=now()`,
            [auth.user.id, reelId, input.emoji],
          );
        return json(await library(auth));
      }
      if (path === "library" && method === "GET")
        return json(await library(auth));
      if (path === "library/export" && method === "GET") {
        const result = await library(auth);
        result.folders = result.folders.filter((f) => f.role === "owner");
        const ownedReels = result.reels.filter((r) => r.viewScope === "all");
        if (result.folders.some((f) => f.pin && !f.unlocked))
          fail(
            423,
            "Unlock every folder before exporting your complete library.",
          );
        return json({
          version: 4,
          folders: result.folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon })),
          reels: ownedReels.map((r) => ({
            title: r.title,
            url: r.url,
            folderIds: result.reels.filter((entry) => entry.id === r.id && entry.folderId &&
              result.folders.some((folder) => folder.id === entry.folderId)).map((entry) => entry.folderId),
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
          folderRecords.push({ id, user_id: auth.user.id, name, icon: folder.icon });
        }
        if (folderRecords.length)
          statements.push([
            `INSERT INTO folders(id,user_id,name,icon) SELECT x.id,x.user_id,x.name,x.icon FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,user_id uuid,name text,icon text)`,
            [JSON.stringify(folderRecords)],
          ]);
        // Bulk inserts keep large imports within Neon's transaction query limit.
        const records = backup.reels.map((r) => ({
          id: randomUUID(),
          user_id: auth.user.id,
          folder_id: null,
          title: r.title,
          url: r.url,
          is_pinned: r.isPinned,
          is_favorite: r.isFavorite,
          folder_ids: r.folderIds.map((folderId) => mapping.get(folderId)),
        }));
        if (records.length)
          statements.push([
            `INSERT INTO reels(id,user_id,folder_id,title,url,is_pinned,is_favorite)
          SELECT x.id,x.user_id,x.folder_id,x.title,x.url,x.is_pinned,x.is_favorite FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,user_id uuid,folder_id uuid,title text,url text,is_pinned boolean,is_favorite boolean)`,
            [JSON.stringify(records)],
          ]);
        const membershipRecords = records.flatMap((record) => record.folder_ids.map((folderId) => ({
          reel_id: record.id, folder_id: folderId,
        })));
        if (membershipRecords.length) statements.push([
          `INSERT INTO reel_folder_memberships(reel_id,folder_id)
           SELECT x.reel_id,x.folder_id FROM jsonb_to_recordset($1::jsonb) AS x(reel_id uuid,folder_id uuid)`,
          [JSON.stringify(membershipRecords)],
        ]);
        const flagRecords = records.filter((record) => record.is_pinned || record.is_favorite).map((record) => ({
          user_id: auth.user.id, reel_id: record.id, scope: "all",
          is_pinned: record.is_pinned, is_favorite: record.is_favorite,
        }));
        if (flagRecords.length) statements.push([
          `INSERT INTO reel_view_flags(user_id,reel_id,scope,is_pinned,is_favorite)
           SELECT x.user_id,x.reel_id,x.scope,x.is_pinned,x.is_favorite
           FROM jsonb_to_recordset($1::jsonb) AS x(user_id uuid,reel_id uuid,scope text,is_pinned boolean,is_favorite boolean)`,
          [JSON.stringify(flagRecords)],
        ]);
        if (statements.length) await db.transaction(statements);
        return json(await library(auth));
      }
      if (path === "folders" && method === "POST") {
        const input = await body(request);
        const name = string(input.name, 60, "Folder name");
        const icon = normalizeFolderIcon(input.icon);
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
            `INSERT INTO folders(id,user_id,name,pin_code,icon) VALUES($1,$2,$3,$4,$5)`,
            [id, auth.user.id, name, pin, icon],
          ],
        ];
        if (pin) statements.push(grant(auth.sessionHash, id, 0));
        await db.transaction(statements);
        return json({ ...(await library(auth)), folderId: id }, 201);
      }
      if (segments[0] === "folders" && segments.length >= 2) {
        const id = identifier(segments[1]);
        if (segments.length === 3 && segments[2] === "recipient-pin" && method === "POST") {
          const input = await body(request);
          if (typeof input.enabled !== "boolean" || (input.enabled && !/^\d{4}$/.test(input.pin || "")))
            fail(400, "Shared folder PINs must be exactly 4 digits.");
          const [access] = await db.query(
            `SELECT 1 FROM folder_shares WHERE folder_id=$1 AND recipient_id=$2 AND status='accepted'`,
            [id, auth.user.id],
          );
          if (!access) fail(404, "Shared folder not found.");
          if (!input.enabled) {
            await db.query(`DELETE FROM shared_folder_pins WHERE user_id=$1 AND folder_id=$2`, [auth.user.id, id]);
            await db.query(`DELETE FROM folder_unlocks WHERE session_hash=$1 AND folder_id=$2`, [auth.sessionHash, id]);
          } else {
            const hash = await bcrypt.hash(input.pin, 12);
            const [saved] = await db.query(
              `INSERT INTO shared_folder_pins(user_id,folder_id,pin_code) VALUES($1,$2,$3)
               ON CONFLICT(user_id,folder_id) DO UPDATE SET pin_code=EXCLUDED.pin_code,pin_version=shared_folder_pins.pin_version+1
               RETURNING pin_version`,
              [auth.user.id, id, hash],
            );
            await db.query(
              `INSERT INTO folder_unlocks(session_hash,folder_id,version) VALUES($1,$2,$3)
               ON CONFLICT(session_hash,folder_id) DO UPDATE SET version=EXCLUDED.version`,
              [auth.sessionHash, id, saved.pin_version],
            );
          }
          return json(await library(auth));
        }
        if (segments.length === 3 && segments[2] === "shared-unlock" && method === "POST") {
          const input = await body(request);
          if (typeof input.pin !== "string" || !/^\d{4}$/.test(input.pin)) fail(400, "Enter the 4-digit folder PIN.");
          const [settings] = await db.query(
            `SELECT p.pin_code,p.pin_version FROM shared_folder_pins p JOIN folder_shares s ON s.folder_id=p.folder_id
             WHERE p.folder_id=$1 AND p.user_id=$2 AND s.recipient_id=$2 AND s.status='accepted'`,
            [id, auth.user.id],
          );
          if (!settings || !(await bcrypt.compare(input.pin, settings.pin_code))) fail(403, "That folder PIN doesn’t match.");
          await db.query(
            `INSERT INTO folder_unlocks(session_hash,folder_id,version) VALUES($1,$2,$3)
             ON CONFLICT(session_hash,folder_id) DO UPDATE SET version=EXCLUDED.version`,
            [auth.sessionHash, id, settings.pin_version],
          );
          return json(await library(auth));
        }
        if (segments.length === 3 && segments[2] === "shared-lock" && method === "POST") {
          const [access] = await db.query(
            `SELECT 1 FROM folder_shares WHERE folder_id=$1 AND recipient_id=$2 AND status='accepted'`,
            [id, auth.user.id],
          );
          if (!access) fail(404, "Shared folder not found.");
          await db.query(`DELETE FROM folder_unlocks WHERE session_hash=$1 AND folder_id=$2`, [auth.sessionHash, id]);
          return json(await library(auth));
        }
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
          const icon = normalizeFolderIcon(input.icon ?? folder.icon);
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
            UPDATE folders f SET name=$4,pin_code=$5,pin_version=$6,icon=$8
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
              icon,
            ],
          );
          if (!rows.length)
            fail(409, "Folder changed or locked. Refresh and try again.");
          return json(await library(auth));
        }
        if (segments.length === 2 && method === "DELETE") {
          const rows = await db.query(
            `UPDATE folders f SET deleted_at=now()
             WHERE f.id=$1 AND f.user_id=$2 AND f.deleted_at IS NULL AND ${allowed()} RETURNING id`,
            [id, auth.user.id, auth.sessionHash],
          );
          if (!rows.length) fail(423, "Unlock this folder first.");
          return json(await library(auth));
        }
      }
      if (path === "reels" && method === "POST") {
        const input = await body(request);
        const title = reelTitle(input.title);
        const parsed = parseReelUrl(input.url);
        if (!parsed) fail(400, "Enter a valid Instagram Reel link.");
        if (input.isPinned !== undefined && typeof input.isPinned !== "boolean")
          fail(400, "Pin must be true or false.");
        await requirePublicEmbed(parsed);
        const folderId =
          input.folderId === null ? null : identifier(input.folderId);
        let ownerId = auth.user.id;
        if (folderId) {
          const [folder] = await db.query(
            `SELECT f.user_id,s.role FROM folders f LEFT JOIN folder_shares s
             ON s.folder_id=f.id AND s.recipient_id=$2 AND s.status='accepted'
             WHERE f.id=$1 AND f.deleted_at IS NULL AND (f.user_id=$2 OR s.id IS NOT NULL)`,
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
             SELECT 1 FROM folders f WHERE f.id=$3 AND f.user_id=$2 AND f.deleted_at IS NULL AND (f.user_id=$6 OR EXISTS (
              SELECT 1 FROM folder_shares s WHERE s.folder_id=f.id AND s.recipient_id=$6 AND s.role='collaborator' AND s.status='accepted')))
           RETURNING id`,
          [id, ownerId, folderId, title, parsed.url, auth.user.id],
        );
        if (!rows.length)
          fail(403, "Folder access changed. Refresh and try again.");
        if (folderId) await db.query(
          `INSERT INTO reel_folder_memberships(reel_id,folder_id) VALUES($1,$2)
           ON CONFLICT(reel_id,folder_id) DO UPDATE SET added_at=now()`,
          [id, folderId],
        );
        if (input.isPinned) await db.query(
          `INSERT INTO reel_view_flags(user_id,reel_id,scope,is_pinned) VALUES($1,$2,$3,true)
           ON CONFLICT(user_id,reel_id,scope) DO UPDATE SET is_pinned=true,updated_at=now()`,
          [auth.user.id, id, folderId ? `folder:${folderId}` : "all"],
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
        const input = await body(request);
        const keys = Object.keys(input).filter((key) => key !== "scope");
        if (
          !keys.length ||
          keys.some(
            (key) =>
              !["isPinned", "isFavorite"].includes(key) ||
              typeof input[key] !== "boolean",
          )
        )
          fail(400, "Send a boolean pin or favorite value.");
        const scope = typeof input.scope === "string" ? input.scope : "all";
        let permitted = false;
        if (scope === "all") {
          const [owned] = await db.query(
            `SELECT NOT EXISTS (
              SELECT 1 FROM reel_folder_memberships rf JOIN folders f ON f.id=rf.folder_id
              LEFT JOIN folder_unlocks g ON g.folder_id=f.id AND g.session_hash=$3
              WHERE rf.reel_id=r.id AND f.deleted_at IS NULL AND f.pin_code IS NOT NULL
                AND g.version IS DISTINCT FROM f.pin_version
            ) AS accessible FROM reels r WHERE r.id=$1 AND r.user_id=$2`,
            [id, auth.user.id, auth.sessionHash],
          );
          if (owned && !owned.accessible) fail(423, "Unlock the Reel's protected folder first.");
          permitted = Boolean(owned);
        } else if (scope === "shared") {
          permitted = Boolean((await db.query(
            `SELECT 1 FROM reel_shares WHERE reel_id=$1 AND recipient_id=$2 AND status='accepted'`, [id, auth.user.id],
          ))[0]);
        } else if (/^folder:[a-f0-9-]{36}$/i.test(scope)) {
          const folderId = identifier(scope.slice(7));
          permitted = Boolean((await db.query(
            `SELECT 1 FROM reel_folder_memberships rf JOIN folders f ON f.id=rf.folder_id
             LEFT JOIN folder_shares s ON s.folder_id=f.id AND s.recipient_id=$3 AND s.status='accepted'
             WHERE rf.reel_id=$1 AND rf.folder_id=$2 AND f.deleted_at IS NULL AND (f.user_id=$3 OR s.id IS NOT NULL)`,
            [id, folderId, auth.user.id],
          ))[0]);
        }
        if (!permitted) fail(404, "Reel is not available in this view.");
        await db.query(
          `INSERT INTO reel_view_flags(user_id,reel_id,scope,is_pinned,is_favorite)
           VALUES($1,$2,$3,COALESCE($4,false),COALESCE($5,false))
           ON CONFLICT(user_id,reel_id,scope) DO UPDATE SET
             is_pinned=COALESCE($4,reel_view_flags.is_pinned),
             is_favorite=COALESCE($5,reel_view_flags.is_favorite),updated_at=now()`,
          [auth.user.id, id, scope, input.isPinned ?? null, input.isFavorite ?? null],
        );
        return json(await library(auth));
      }
      if (
        segments[0] === "reels" && segments.length === 3 &&
        segments[2] === "copy" && method === "POST"
      ) {
        const reelId = identifier(segments[1]);
        const input = await body(request);
        if (input.favorite !== undefined && typeof input.favorite !== "boolean")
          fail(400, "Favorite must be true or false.");
        const [source] = await db.query(
          `SELECT r.title,r.url,r.user_id AS "ownerId" FROM reels r
           WHERE r.id=$1 AND (r.user_id=$2
             OR EXISTS(SELECT 1 FROM reel_folder_memberships rf JOIN folder_shares s ON s.folder_id=rf.folder_id
               WHERE rf.reel_id=r.id AND s.recipient_id=$2 AND s.status='accepted')
             OR EXISTS(SELECT 1 FROM reel_shares s WHERE s.reel_id=r.id AND s.recipient_id=$2 AND s.status='accepted'))`,
          [reelId, auth.user.id],
        );
        if (!source) fail(404, "Reel not found.");
        let folderId = null;
        let ownerId = auth.user.id;
        if (input.folderId) {
          folderId = identifier(input.folderId);
          const [target] = await db.query(
            `SELECT f.user_id,s.role FROM folders f LEFT JOIN folder_shares s
             ON s.folder_id=f.id AND s.recipient_id=$2 AND s.status='accepted'
             WHERE f.id=$1 AND f.deleted_at IS NULL AND (f.user_id=$2 OR s.role='collaborator')`,
            [folderId, auth.user.id],
          );
          if (!target) fail(403, "Choose a folder you can add to.");
          ownerId = target.user_id;
        }
        if (folderId && source.ownerId === auth.user.id && ownerId === auth.user.id) {
          await db.query(
            `INSERT INTO reel_folder_memberships(reel_id,folder_id) VALUES($1,$2)
             ON CONFLICT(reel_id,folder_id) DO UPDATE SET added_at=now()`,
            [reelId, folderId],
          );
        } else {
          const copyId = randomUUID();
          const rows = await db.query(
            `INSERT INTO reels(id,user_id,folder_id,title,url) VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [copyId, ownerId, folderId, source.title, source.url],
          );
          if (!rows.length) fail(404, "Shared Reel not found.");
          if (folderId) await db.query(
            `INSERT INTO reel_folder_memberships(reel_id,folder_id) VALUES($1,$2)`, [copyId, folderId],
          );
          if (input.favorite) await db.query(
            `INSERT INTO reel_view_flags(user_id,reel_id,scope,is_favorite) VALUES($1,$2,'all',true)`,
            [auth.user.id, copyId],
          );
        }
        return json(await library(auth), 201);
      }
      if (
        segments[0] === "reels" && segments.length === 3 &&
        ["hide", "unhide"].includes(segments[2]) && method === "POST"
      ) {
        const reelId = identifier(segments[1]);
        if (segments[2] === "hide") {
          const rows = await db.query(
            `INSERT INTO reel_user_states(user_id,reel_id,state,deleted_at)
             SELECT $1,r.id,'hidden',now() FROM reels r WHERE r.id=$2 AND r.user_id<>$1 AND (
               EXISTS(SELECT 1 FROM folder_shares s WHERE s.folder_id=r.folder_id AND s.recipient_id=$1 AND s.status='accepted')
               OR EXISTS(SELECT 1 FROM reel_shares s WHERE s.reel_id=r.id AND s.recipient_id=$1 AND s.status='accepted'))
             ON CONFLICT(user_id,reel_id) DO UPDATE SET state='hidden',deleted_at=now() RETURNING reel_id`,
            [auth.user.id, reelId],
          );
          if (!rows.length) fail(404, "Shared Reel not found.");
        } else {
          const rows = await db.query(
            `DELETE FROM reel_user_states WHERE user_id=$1 AND reel_id=$2 AND state='hidden' RETURNING reel_id`,
            [auth.user.id, reelId],
          );
          if (!rows.length) fail(404, "Hidden Reel not found.");
        }
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
          const title = reelTitle(input.title);
          const parsed = parseReelUrl(input.url);
          if (!parsed) fail(400, "Enter a valid Instagram Reel link.");
          await requirePublicEmbed(parsed);
          rows = await db.query(
            `UPDATE reels r SET title=$4,url=$5 WHERE r.id=$1 AND ${accessibleReel} RETURNING r.id`,
            [id, auth.user.id, auth.sessionHash, title, parsed.url],
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
