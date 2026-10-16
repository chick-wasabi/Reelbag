import { randomUUID } from "node:crypto";
import { parseReelUrl } from "../../utils/reels.mjs";

// SQL identifiers come only from this closed map, never from request input.
const KINDS = {
  folder: {
    table: "folders",
    shares: "folder_shares",
    key: "folder_id",
    title: "name",
  },
  reel: {
    table: "reels",
    shares: "reel_shares",
    key: "reel_id",
    title: "title",
  },
};
export function createSharing({
  db,
  session,
  body,
  rate,
  json,
  fail,
  identifier,
  allowed,
}) {
  function kind(value) {
    const config = KINDS[value];
    if (!Object.hasOwn(KINDS, value)) fail(404, "Share not found.");
    return config;
  }
  async function owned(type, id, auth) {
    const c = kind(type);
    const [record] = await db.query(
      `SELECT e.id,e.${c.title} AS title,CASE WHEN e.share_enabled THEN e.share_token END AS "shareToken"
       FROM ${c.table} e ${type === "reel" ? "LEFT JOIN folders f ON f.id=e.folder_id" : "JOIN folders f ON f.id=e.id"}
       WHERE e.id=$1 AND e.user_id=$2 AND ${allowed()}`,
      [id, auth.user.id, auth.sessionHash],
    );
    if (!record) fail(404, "Item not found or folder is locked.");
    return record;
  }
  async function notifications(auth) {
    const items = await db.query(
      `SELECT * FROM (
        SELECT n.id,n.type,n.status,n.entity_id AS "entityId",n.created_at AS "createdAt",u.username AS sender,
          COALESCE(f.name,r.title) AS title,COALESCE(fs.role,rs.role) AS role
         FROM notifications n JOIN users u ON u.id=n.sender_id
         LEFT JOIN folder_shares fs ON fs.id=n.folder_share_id
         LEFT JOIN folders f ON f.id=fs.folder_id
         LEFT JOIN reel_shares rs ON rs.id=n.reel_share_id
         LEFT JOIN reels r ON r.id=rs.reel_id
         WHERE n.user_id=$1 AND COALESCE(fs.status,rs.status)='pending'
        UNION ALL
        SELECT fr.id,'friend_request' AS type,fr.notification_status AS status,fr.id AS "entityId",
          fr.created_at AS "createdAt",u.username AS sender,
          COALESCE(u.display_name,u.username) AS title,NULL::text AS role
         FROM friendships fr JOIN users u ON u.id=fr.requested_by
         WHERE (fr.user_a=$1 OR fr.user_b=$1) AND fr.status='pending' AND fr.requested_by<>$1
       ) pending_notifications
       ORDER BY "createdAt" DESC,id DESC`,
      [auth.user.id],
    );
    return { items, unread: items.filter((n) => n.status === "unread").length };
  }
  return async function sharing(request, segments) {
    const method = request.method;
    if (!["share", "sharing", "notifications"].includes(segments[0]))
      return null;
    if (segments[0] === "share") {
      const c = kind(segments[1]);
      const token = identifier(segments[2]);
      const auth = await session(request, method !== "GET");
      // No private titles, usernames, link validity or reel URLs before login.
      if (!auth.user && method === "GET" && segments.length === 3)
        return json({ requiresAuth: true });
      if (!auth.user) fail(401, "Please log in to open this invitation.");
      const [record] = await db.query(
        `SELECT e.id,e.user_id AS "ownerId",e.${c.title} AS title,u.username AS owner,
          CASE WHEN e.user_id=$2 THEN 'owner' WHEN s.status='accepted' THEN s.role END AS role
         FROM ${c.table} e JOIN users u ON u.id=e.user_id
         LEFT JOIN ${c.shares} s ON s.${c.key}=e.id AND s.recipient_id=$2
         WHERE e.share_token=$1 AND e.share_enabled=true`,
        [token, auth.user.id],
      );
      if (!record) fail(404, "This link is unavailable or has been revoked.");
      if (
        segments.length === 4 &&
        segments[3] === "join" &&
        method === "POST"
      ) {
        await rate(`share-join:${auth.user.id}`, 60);
        if (record.ownerId !== auth.user.id) {
          // Link holders always receive viewer access. Preserve a stronger owner-issued grant.
          const rows = await db.query(
            `INSERT INTO ${c.shares}(id,${c.key},owner_id,recipient_id,role,status)
             SELECT $1::uuid,e.id,e.user_id,$3::uuid,'viewer','accepted' FROM ${c.table} e
             WHERE e.share_token=$2 AND e.share_enabled=true AND e.user_id<>$3
             ON CONFLICT(${c.key},recipient_id) DO UPDATE SET role=CASE WHEN ${c.shares}.status IN ('pending','accepted') THEN ${c.shares}.role ELSE 'viewer' END,status='accepted'
             RETURNING id`,
            [randomUUID(), token, auth.user.id],
          );
          if (!rows.length) fail(409, "This link changed. Please try again.");
          await db.query(
            `UPDATE notifications SET status='read' WHERE user_id=$1 AND entity_id=$2`,
            [auth.user.id, record.id],
          );
        }
        return json({ joined: true, id: record.id, type: segments[1] });
      }
      if (segments.length === 3 && method === "GET") {
        if (record.role === "owner") await owned(segments[1], record.id, auth);
        let reels = [];
        if (record.role) {
          reels = await db.query(
            `SELECT r.id,r.title,r.url,r.folder_id AS "folderId",r.is_pinned AS "isPinned",r.is_favorite AS "isFavorite"
             FROM reels r WHERE ${segments[1] === "folder" ? "r.folder_id" : "r.id"}=$1
             AND EXISTS(SELECT 1 FROM ${c.table} e ${segments[1] === "reel" ? "LEFT JOIN folders f ON f.id=e.folder_id" : "JOIN folders f ON f.id=e.id"}
               WHERE e.id=$1 AND e.share_token=$4 AND e.share_enabled=true AND (
                 (e.user_id=$2 AND ${allowed()}) OR EXISTS(SELECT 1 FROM ${c.shares} s
                   WHERE s.${c.key}=e.id AND s.recipient_id=$2 AND s.status='accepted')))
             ORDER BY r.created_at DESC,r.id`,
            [record.id, auth.user.id, auth.sessionHash, token],
          );
        }
        return json({
          ...record,
          reels: reels.map((r) => ({
            ...r,
            canManage: false,
            shortcode: parseReelUrl(r.url)?.shortcode,
          })),
        });
      }
      fail(404, "Share endpoint not found.");
    }
    const auth = await session(request);
    if (segments[0] === "notifications") {
      if (segments.length === 1 && method === "GET")
        return json(await notifications(auth));
      if (
        segments[1] === "read" &&
        segments.length === 2 &&
        method === "POST"
      ) {
        await db.query(
          `UPDATE notifications SET status='read' WHERE user_id=$1`,
          [auth.user.id],
        );
        await db.query(
          `UPDATE friendships SET notification_status='read'
           WHERE (user_a=$1 OR user_b=$1) AND status='pending' AND requested_by<>$1`,
          [auth.user.id],
        );
        return json(await notifications(auth));
      }
      if (
        segments.length === 3 &&
        segments[2] === "respond" &&
        method === "POST"
      ) {
        const id = identifier(segments[1]);
        const input = await body(request);
        if (!["accepted", "declined"].includes(input.status))
          fail(400, "Accept or decline the invitation.");
        const [notification] = await db.query(
          `SELECT type FROM notifications WHERE id=$1 AND user_id=$2`,
          [id, auth.user.id],
        );
        if (!notification) {
          const rows = await db.query(
            `UPDATE friendships SET status=$3,notification_status='read',updated_at=now()
             WHERE id=$1 AND status='pending' AND requested_by<>$2
               AND (user_a=$2 OR user_b=$2) RETURNING id`,
            [id, auth.user.id, input.status],
          );
          if (!rows.length) fail(404, "Invitation not found.");
          return json(await notifications(auth));
        }
        const c =
          KINDS[notification.type === "folder_invite" ? "folder" : "reel"];
        const results = await db.transaction([
          [
            `UPDATE ${c.shares} s SET status=$3 FROM notifications n
            WHERE n.id=$1 AND n.user_id=$2 AND s.id=n.${notification.type === "folder_invite" ? "folder_share_id" : "reel_share_id"}
            AND s.recipient_id=$2 AND s.status='pending' RETURNING s.id`,
            [id, auth.user.id, input.status],
          ],
          [
            `UPDATE notifications SET status='read' WHERE id=$1 AND user_id=$2`,
            [id, auth.user.id],
          ],
        ]);
        if (!results[0].length)
          fail(409, "This invitation has already been handled or revoked.");
        return json(await notifications(auth));
      }
      fail(404, "Notification endpoint not found.");
    }
    const type = segments[1];
    const c = kind(type);
    const id = identifier(segments[2]);
    const record = await owned(type, id, auth);
    if (segments.length === 3 && method === "GET") {
      const [members, friends] = await Promise.all([
        db.query(
          `SELECT s.recipient_id AS "recipientId",u.username,s.role,s.status FROM ${c.shares} s
           JOIN users u ON u.id=s.recipient_id WHERE s.${c.key}=$1 ORDER BY s.created_at`,
          [id],
        ),
        db.query(
          `SELECT fr.id,u.username,COALESCE(u.display_name,u.username) AS "displayName",
           u.avatar_url AS "avatarUrl",COALESCE(u.appearance->>'avatarFrame','accent') AS "avatarFrame"
           FROM friendships fr
           JOIN users u ON u.id=CASE WHEN fr.user_a=$1 THEN fr.user_b ELSE fr.user_a END
           WHERE (fr.user_a=$1 OR fr.user_b=$1) AND fr.status='accepted'
           ORDER BY lower(COALESCE(u.display_name,u.username)),u.username`,
          [auth.user.id],
        ),
      ]);
      return json({ ...record, members, friends });
    }
    if (
      segments.length === 4 &&
      segments[3] === "link" &&
      ["POST", "DELETE"].includes(method)
    ) {
      const [row] = await db.query(
        `UPDATE ${c.table} SET share_token=CASE WHEN $4 THEN COALESCE(share_token,$3::uuid) ELSE NULL END,share_enabled=$4
         WHERE id=$1 AND user_id=$2 RETURNING share_token AS "shareToken"`,
        // Both branches bind the same parameters; the unused UUID is typed for Postgres.
        [id, auth.user.id, randomUUID(), method === "POST"],
      );
      return json(row);
    }
    if (
      segments.length === 4 &&
      segments[3] === "invite" &&
      method === "POST"
    ) {
      await rate(`share-invite:${auth.user.id}`, 30);
      const input = await body(request);
      if (
        typeof input.username !== "string" ||
        !/^[a-z0-9_]{3,32}$/i.test(input.username.trim())
      )
        fail(400, "Enter an exact Reelbag username.");
      if (
        !["viewer", "collaborator"].includes(input.role) ||
        (type === "reel" && input.role !== "viewer")
      )
        fail(400, "Choose a supported sharing role.");
      const [recipient] = await db.query(
        `SELECT id FROM users WHERE username=$1`,
        [input.username.trim().toLowerCase()],
      );
      if (!recipient) fail(404, "No account with that username.");
      if (recipient.id === auth.user.id)
        fail(400, "You already own this item.");
      await db.transaction([
        [
          `INSERT INTO ${c.shares}(id,${c.key},owner_id,recipient_id,role,status) VALUES($1,$2,$3,$4,$5,'pending')
          ON CONFLICT(${c.key},recipient_id) DO UPDATE SET role=EXCLUDED.role,
          status=CASE WHEN ${c.shares}.status='accepted' THEN 'accepted' ELSE 'pending' END`,
          [randomUUID(), id, auth.user.id, recipient.id, input.role],
        ],
        [
          `INSERT INTO notifications(id,user_id,sender_id,type,entity_id,${type}_share_id)
          SELECT $1::uuid,recipient_id,owner_id,$2,${c.key},id FROM ${c.shares} WHERE ${c.key}=$3 AND recipient_id=$4 AND status='pending'
          ON CONFLICT(${type}_share_id) DO UPDATE SET status='unread',created_at=now()`,
          [randomUUID(), `${type}_invite`, id, recipient.id],
        ],
      ]);
      return json({ sent: true });
    }
    if (
      segments.length === 5 &&
      segments[3] === "members" &&
      method === "DELETE"
    ) {
      const recipient = identifier(segments[4]);
      await db.query(
        `DELETE FROM ${c.shares} WHERE ${c.key}=$1 AND owner_id=$2 AND recipient_id=$3`,
        [id, auth.user.id, recipient],
      );
      return json({ revoked: true });
    }
    fail(404, "Sharing endpoint not found.");
  };
}
