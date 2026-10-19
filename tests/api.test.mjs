import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { testApplication } from "./helpers/application.mjs";
import { createApi } from "../lib/server/api.mjs";
import { createDatabase } from "../lib/server/database.mjs";

let app;
before(async () => {
  app = await testApplication();
});
after(async () => {
  await app.pg.close();
});
const name = () => `test_${randomBytes(6).toString("hex")}`;
async function call(
  path,
  method = "GET",
  body,
  cookie,
  headers = {},
  handler = app.handle,
) {
  const response = await handler(
    new Request(`http://localhost/api/${path}`, {
      method,
      headers: {
        ...(method === "GET"
          ? {}
          : { origin: "http://localhost", "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
    }),
    path.split("/"),
  );
  return {
    response,
    data: await response.json(),
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function account() {
  const username = name();
  const password = "Strong-test-9876";
  const result = await call("auth/signup", "POST", { username, password });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { ...result, username, password };
}
function mergeCookies(response, current = "") {
  const jar = new Map(current.split(";").map((part) => part.trim()).filter(Boolean).map((part) => [part.split("=")[0], part]));
  const values = response.headers.getSetCookie?.() || [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    for (const match of value.matchAll(/(?:^|,\s*)([^=;,\s]+=[^;,\s]*)/g)) jar.set(match[1].split("=")[0], match[1]);
  }
  return [...jar.values()].join("; ");
}

test("a trusted device can keep multiple accounts and switch without another password", async () => {
  const firstName = name(), secondName = name();
  const first = await call("auth/signup", "POST", { username: firstName, password: "Strong-test-9876" });
  let jar = mergeCookies(first.response);
  assert.match(jar, /reelbag_session=/);
  assert.match(jar, /reelbag_device=/);
  const second = await call("auth/signup", "POST", { username: secondName, password: "Strong-test-9876" }, jar);
  jar = mergeCookies(second.response, jar);
  const accounts = await call("auth/accounts", "GET", null, jar);
  assert.deepEqual(accounts.data.accounts.map((entry) => entry.username).sort(), [firstName, secondName].sort());
  const firstAccount = accounts.data.accounts.find((entry) => entry.username === firstName);
  const switched = await call("auth/switch", "POST", { userId: firstAccount.id }, jar);
  assert.equal(switched.status, 200, JSON.stringify(switched.data));
  jar = mergeCookies(switched.response, jar);
  assert.equal((await call("auth/session", "GET", null, jar)).data.user.username, firstName);
});

test("automatic initialization is repeatable and accounts use bcrypt with opaque HttpOnly sessions", async () => {
  const user = await account();
  await createDatabase(app.adapter).ready();
  const [stored] = await app.db.query("SELECT * FROM users WHERE username=$1", [
    user.username,
  ]);
  assert.match(stored.password_hash, /^\$2[aby]\$12\$/);
  assert.notEqual(stored.password_hash, user.password);
  const [session] = await app.db.query(
    "SELECT * FROM sessions WHERE user_id=$1",
    [stored.id],
  );
  assert.notEqual(session.token_hash, user.cookie.split("=")[1]);
  assert.equal(session.token_hash.length, 64);
  assert.match(user.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(user.response.headers.get("set-cookie"), /SameSite=Lax/);
  const secure = await call(
    "auth/login",
    "POST",
    { username: user.username, password: user.password },
    null,
    {},
    createApi({ db: app.db, secureCookies: true }),
  );
  assert.match(
    secure.response.headers.get("set-cookie"),
    /^__Host-reelbag_session=/,
  );
  assert.match(secure.response.headers.get("set-cookie"), /; Secure/);
  const duplicate = await call("auth/signup", "POST", {
    username: user.username.toUpperCase(),
    password: user.password,
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await call("library")).status, 401);
  assert.equal((await call("auth/session")).data.user, null);
});

test("friends can accept requests and receive dropped reels without moving the owner's copy", async () => {
  const sender = await account();
  const recipient = await account();
  const created = await call(
    "reels",
    "POST",
    {
      title: "Shared inspiration",
      url: "https://www.instagram.com/reel/DFriendShare1/",
      folderId: null,
    },
    sender.cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const reelId = created.data.reels[0].id;

  const requested = await call(
    "friends/request",
    "POST",
    { username: recipient.username },
    sender.cookie,
  );
  assert.equal(requested.status, 201, JSON.stringify(requested.data));
  assert.equal(requested.data.outgoingFriendRequests.length, 1);
  const friendshipId = requested.data.outgoingFriendRequests[0].id;

  const notifications = await call(
    "notifications",
    "GET",
    null,
    recipient.cookie,
  );
  assert.equal(notifications.status, 200, JSON.stringify(notifications.data));
  assert.equal(notifications.data.unread, 1);
  assert.equal(notifications.data.items[0].type, "friend_request");
  assert.equal(notifications.data.items[0].sender, sender.username);
  const blockedContentInvite = await call(
    `sharing/reel/${reelId}/send`,
    "POST",
    { username: recipient.username, role: "viewer" },
    sender.cookie,
  );
  assert.equal(blockedContentInvite.status, 200);
  assert.equal(blockedContentInvite.data.friendRequestSent, true);
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.reels.length,
    0,
  );

  const denied = await call(
    `friends/${friendshipId}/share/${reelId}`,
    "POST",
    {},
    sender.cookie,
  );
  assert.equal(denied.status, 404);

  const accepted = await call(
    `notifications/${friendshipId}/respond`,
    "POST",
    { status: "accepted" },
    recipient.cookie,
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.items.length, 0);
  const recipientLibrary = await call("library", "GET", null, recipient.cookie);
  assert.equal(recipientLibrary.data.friends[0].username, sender.username);
  const sharePicker = await call(
    `sharing/reel/${reelId}`,
    "GET",
    null,
    sender.cookie,
  );
  assert.equal(sharePicker.status, 200, JSON.stringify(sharePicker.data));
  assert.equal(sharePicker.data.friends[0].username, recipient.username);
  assert.equal(typeof sharePicker.data.friends[0].avatarUrl, "string");

  const shared = await call(
    `sharing/reel/${reelId}/send`,
    "POST",
    { username: recipient.username, role: "viewer" },
    sender.cookie,
  );
  assert.equal(shared.status, 200, JSON.stringify(shared.data));
  assert.equal(shared.data.sent, true);
  const senderLibrary = await call("library", "GET", null, sender.cookie);
  assert.equal(senderLibrary.data.reels.some((reel) => reel.id === reelId), true);
  assert.deepEqual(
    senderLibrary.data.reels.find((reel) => reel.id === reelId).sharedWith.map(({ recipientId, username }) => ({ recipientId, username })),
    [{ recipientId: recipient.data.user.id, username: recipient.username }],
  );
  const received = await call("library", "GET", null, recipient.cookie);
  const receivedReel = received.data.reels.find((reel) => reel.id === reelId);
  assert.equal(receivedReel.canManage, false);
  assert.equal(receivedReel.isDirectShared, true);
  assert.equal(receivedReel.sharedBy, sender.username);
  assert.equal(
    (await call("notifications", "GET", null, recipient.cookie)).data.items.length,
    0,
  );
  const ownerReaction = await call(
    `reels/${reelId}/reaction`,
    "POST",
    { emoji: "🔥" },
    sender.cookie,
  );
  assert.equal(ownerReaction.status, 200, JSON.stringify(ownerReaction.data));
  const friendReaction = await call(
    `reels/${reelId}/reaction`,
    "POST",
    { emoji: "😂" },
    recipient.cookie,
  );
  const reactedReel = friendReaction.data.reels.find((reel) => reel.id === reelId);
  assert.equal(reactedReel.reaction, "😂");
  assert.deepEqual(reactedReel.reactionCounts, { "🔥": 1, "😂": 1 });
  assert.deepEqual(
    reactedReel.reactionPeople.map(({ emoji, username }) => ({ emoji, username })),
    [
      { emoji: "🔥", username: sender.username },
      { emoji: "😂", username: recipient.username },
    ],
  );
  assert.equal(
    (await call(`reels/${reelId}/reaction`, "POST", { emoji: null }, recipient.cookie)).status,
    200,
  );
  const folder = await call(
    "folders",
    "POST",
    { name: "Friends ride", protected: false },
    sender.cookie,
  );
  const folderId = folder.data.folderId;
  const sharedFolder = await call(
    `sharing/folder/${folderId}/send`,
    "POST",
    { username: recipient.username, role: "viewer" },
    sender.cookie,
  );
  assert.equal(sharedFolder.status, 200, JSON.stringify(sharedFolder.data));
  const withSharedFolder = await call("library", "GET", null, recipient.cookie);
  assert.equal(withSharedFolder.data.folders[0].id, folderId);
  assert.equal(withSharedFolder.data.folders[0].role, "viewer");
  assert.equal(withSharedFolder.data.folders[0].memberCount, 2);

  const removed = await call(
    `friends/${friendshipId}`,
    "DELETE",
    {},
    recipient.cookie,
  );
  assert.equal(removed.status, 200);
  const revoked = await call("library", "GET", null, recipient.cookie);
  assert.equal(revoked.data.reels.some((reel) => reel.id === reelId), false);
  assert.equal(revoked.data.folders.some((folder) => folder.id === folderId), false);
});

test("recipients can trash shared reels privately, restore them, and protect Recently Deleted", async () => {
  const sender = await account();
  const recipient = await account();
  const created = await call(
    "reels",
    "POST",
    { title: "Keep the owner's copy", url: "https://www.instagram.com/reel/DPrivateTrash1/", folderId: null },
    sender.cookie,
  );
  const reelId = created.data.reels[0].id;
  const requested = await call("friends/request", "POST", { username: recipient.username }, sender.cookie);
  const friendshipId = requested.data.outgoingFriendRequests[0].id;
  await call(`notifications/${friendshipId}/respond`, "POST", { status: "accepted" }, recipient.cookie);
  await call(`sharing/reel/${reelId}/send`, "POST", { username: recipient.username, role: "viewer" }, sender.cookie);

  const trashed = await call(`reels/${reelId}/trash`, "POST", {}, recipient.cookie);
  assert.equal(trashed.status, 200, JSON.stringify(trashed.data));
  assert.equal(trashed.data.reels.some((reel) => reel.id === reelId), false);
  assert.equal(trashed.data.trashCount, 1);
  assert.equal((await call("library", "GET", null, sender.cookie)).data.reels.some((reel) => reel.id === reelId), true);

  const opened = await call("trash/open", "POST", {}, recipient.cookie);
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  assert.equal(opened.data.items[0].id, reelId);
  assert.equal(opened.data.items[0].canManage, false);
  const restored = await call(`trash/${reelId}/restore`, "POST", {}, recipient.cookie);
  assert.equal(restored.status, 200);
  const afterRestore = await call("library", "GET", null, recipient.cookie);
  assert.equal(afterRestore.data.reels.some((reel) => reel.id === reelId), true);
  assert.equal(afterRestore.data.trashCount, 0);

  const pin = await call("trash/pin", "POST", { enabled: true, newPin: "6427" }, recipient.cookie);
  assert.equal(pin.status, 200);
  assert.equal(pin.data.protected, true);
  assert.equal((await call("trash/open", "POST", {}, recipient.cookie)).status, 401);
  assert.equal((await call("trash/open", "POST", { pin: "0000" }, recipient.cookie)).status, 403);
  assert.equal((await call("trash/open", "POST", { pin: "6427" }, recipient.cookie)).status, 200);

  await call(`reels/${reelId}/trash`, "POST", {}, recipient.cookie);
  const removed = await call(`trash/${reelId}/permanent`, "POST", {}, recipient.cookie);
  assert.equal(removed.status, 200);
  assert.equal((await call("trash/open", "POST", { pin: "6427" }, recipient.cookie)).data.items.length, 0);
  assert.equal((await call("library", "GET", null, sender.cookie)).data.reels.some((reel) => reel.id === reelId), true);
});

test("private or removed Instagram embeds are rejected before they enter the library", async () => {
  const user = await account();
  const unavailableApi = createApi({
    db: app.db,
    secureCookies: false,
    fetchImpl: async () =>
      new Response(
        "The link to this photo or video may be broken, or the post may have been removed.",
        { status: 200 },
      ),
  });
  const result = await call(
    "reels",
    "POST",
    {
      title: "Private reel",
      url: "https://www.instagram.com/reel/DPrivateReel/",
      folderId: null,
    },
    user.cookie,
    {},
    unavailableApi,
  );
  assert.equal(result.status, 422);
  assert.match(result.data.error, /private account|removed/i);
  const library = await call("library", "GET", null, user.cookie);
  assert.equal(library.data.reels.length, 0);
});

test("reels without a custom title use the Reelbag fallback", async () => {
  const user = await account();
  const created = await call(
    "reels",
    "POST",
    { title: "", url: "https://www.instagram.com/reel/DNoCaption1/", folderId: null },
    user.cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.reels[0].title, "Reelbag");
});

test("Instagram photo and carousel posts can be saved with their canonical post URL", async () => {
  const user = await account();
  const saved = await call("reels", "POST", {
    title: "Carousel inspiration",
    url: "https://www.instagram.com/p/DdlzMA8iXG7/?img_index=9&obrf=tracking",
    folderId: null,
  }, user.cookie);
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const post = saved.data.reels.find((item) => item.title === "Carousel inspiration");
  assert.equal(post.url, "https://www.instagram.com/p/DdlzMA8iXG7/");
  assert.equal(post.shortcode, "DdlzMA8iXG7");
});

test("profiles expose only featured reels and enforce public, friends, and private visibility", async () => {
  const owner = await account();
  const saved = await call("reels", "POST", {
    title: "Profile showcase",
    url: "https://www.instagram.com/reel/DProfileShowcase1/",
    folderId: null,
  }, owner.cookie);
  const reelId = saved.data.reels.find((item) => item.title === "Profile showcase").id;
  await call(`reels/${reelId}/feature`, "PATCH", { featured: true }, owner.cookie);

  const friendsOnly = await call(`profiles/${owner.username}`);
  assert.equal(friendsOnly.status, 200);
  assert.equal(friendsOnly.data.profile.canView, false);
  assert.equal(friendsOnly.data.reels.length, 0);

  await call("account/profile", "PATCH", { profileVisibility: "public" }, owner.cookie);
  const publicProfile = await call(`profiles/${owner.username}`);
  assert.equal(publicProfile.data.profile.canView, true);
  assert.deepEqual(publicProfile.data.reels.map((item) => item.id), [reelId]);

  await call("account/profile", "PATCH", { profileVisibility: "private" }, owner.cookie);
  const privateProfile = await call(`profiles/${owner.username}`);
  assert.equal(privateProfile.data.profile.canView, false);
});

test("a new reel can be pinned as part of creation", async () => {
  const user = await account();
  const created = await call(
    "reels",
    "POST",
    {
      title: "Keep this handy",
      url: "https://www.instagram.com/reel/DPinnedOnAdd1/",
      folderId: null,
      isPinned: true,
    },
    user.cookie,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.reels[0].isPinned, true);
});

test("admin analytics require the named account and a constant-time PIN check", async () => {
  const password = "Strong-admin-test-8842";
  const admin = await call("auth/signup", "POST", {
    username: "chick_wasabi",
    password,
  });
  assert.equal(admin.status, 200, JSON.stringify(admin.data));
  const regular = await account();

  assert.equal((await call("admin/users")).status, 401);
  assert.equal(
    (
      await call("admin/users", "GET", null, regular.cookie, {
        "x-admin-pin": "8842",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("admin/users", "GET", null, admin.cookie, {
        "x-admin-pin": "0000",
      })
    ).status,
    401,
  );

  const result = await call("admin/users", "GET", null, admin.cookie, {
    "x-admin-pin": "8842",
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.ok(result.data.stats.totalUsers >= 2);
  assert.equal(typeof result.data.stats.totalReels, "number");
  assert.equal(typeof result.data.stats.totalFolders, "number");
  assert.equal(typeof result.data.stats.activeSharedFolders, "number");
  assert.equal(typeof result.data.stats.totalInvites, "number");
  assert.deepEqual(
    Object.keys(
      result.data.users.find((user) => user.username === "chick_wasabi"),
    ).sort(),
    [
      "accountStatus",
      "createdAt",
      "foldersCount",
      "id",
      "reelsCount",
      "username",
    ],
  );

  const deniedUpdate = await call(
    "admin/pin",
    "POST",
    { currentPin: "8842", newPin: "135790" },
    regular.cookie,
  );
  assert.equal(deniedUpdate.status, 403);
  const wrongCurrent = await call(
    "admin/pin",
    "POST",
    { currentPin: "0000", newPin: "135790" },
    admin.cookie,
  );
  assert.equal(wrongCurrent.status, 401);
  const updated = await call(
    "admin/pin",
    "POST",
    { currentPin: "8842", newPin: "135790" },
    admin.cookie,
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  const [setting] = await app.db.query(
    "SELECT value,updated_at FROM admin_settings WHERE key='admin_pin'",
  );
  assert.match(setting.value, /^\$2[aby]\$12\$/);
  assert.notEqual(setting.value, "135790");
  assert.ok(setting.updated_at);
  assert.equal(
    (
      await call("admin/users", "GET", null, admin.cookie, {
        "x-admin-pin": "135790",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("admin/users", "GET", null, admin.cookie, {
        "x-admin-pin": "8842",
      })
    ).status,
    200,
  );
  for (let attempt = 1; attempt <= 2; attempt++) {
    const failed = await call("admin/users", "GET", null, admin.cookie, {
      "x-admin-pin": "0000",
    });
    assert.equal(failed.status, 401);
  }
  const locked = await call("admin/users", "GET", null, admin.cookie, {
    "x-admin-pin": "0000",
  });
  assert.equal(locked.status, 429);
  assert.equal(locked.response.headers.get("retry-after"), "300");
  assert.equal(
    (
      await call("admin/users", "GET", null, admin.cookie, {
        "x-admin-pin": "8842",
      })
    ).status,
    429,
  );
  await app.db.query(
    `UPDATE security_lockouts SET lockout_until=now()-interval '1 second'
     WHERE escalated=true`,
  );
  const relocked = await call("admin/users", "GET", null, admin.cookie, {
    "x-admin-pin": "0000",
  });
  assert.equal(relocked.status, 429);
  assert.equal(relocked.response.headers.get("retry-after"), "300");
  await app.db.query(
    `UPDATE security_lockouts SET lockout_until=now()-interval '1 second'
     WHERE escalated=true`,
  );
  assert.equal(
    (
      await call("admin/users", "GET", null, admin.cookie, {
        "x-admin-pin": "8842",
      })
    ).status,
    200,
  );
});

test("two devices see the same Postgres reels while a different account cannot read or mutate them", async () => {
  const alice = await account();
  const bob = await account();
  const folder = await call(
    "folders",
    "POST",
    { name: "Bike Riding", protected: false },
    alice.cookie,
  );
  assert.equal(folder.status, 201, JSON.stringify(folder.data));
  const id = folder.data.folderId;
  const saved = await call(
    "reels",
    "POST",
    {
      title: "Sunset ' ride",
      url: "https://instagram.com/reel/BIKE_1/?igsh=tracking",
      folderId: id,
    },
    alice.cookie,
  );
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const reelId = saved.data.reels[0].id;
  const device = await call("auth/login", "POST", {
    username: alice.username,
    password: alice.password,
  });
  const deviceLibrary = await call("library", "GET", null, device.cookie);
  assert.equal(deviceLibrary.data.reels[0].title, "Sunset ' ride");
  assert.equal(
    deviceLibrary.data.reels[0].url,
    "https://www.instagram.com/reel/BIKE_1/",
  );
  assert.equal(
    (await call("library", "GET", null, bob.cookie)).data.reels.length,
    0,
  );
  for (const [path, method, body] of [
    [`reels/${reelId}`, "DELETE", {}],
    [
      `reels/${reelId}`,
      "PATCH",
      { title: "stolen", url: "https://instagram.com/reel/X/", folderId: null },
    ],
    [`folders/${id}`, "DELETE", {}],
    [
      "reels",
      "POST",
      {
        title: "Bad ownership",
        url: "https://instagram.com/reel/OTHER/",
        folderId: id,
      },
    ],
  ]) {
    assert.equal((await call(path, method, body, bob.cookie)).status, 404);
  }
  await assert.rejects(
    app.db.query(
      "INSERT INTO reels(id,user_id,folder_id,title,url) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        bob.data.user.id,
        id,
        "Cross-owner",
        "https://instagram.com/reel/X/",
      ],
    ),
    (error) => error.code === "23503",
  );
  const cold = createApi({
    db: createDatabase(app.adapter),
    secureCookies: false,
  });
  assert.equal(
    (await call("library", "GET", null, device.cookie, {}, cold)).data.reels
      .filter((reel) => reel.viewScope === "all").length,
    1,
  );
  await call("auth/logout", "POST", {}, alice.cookie);
  assert.equal((await call("library", "GET", null, alice.cookie)).status, 401);
  assert.equal((await call("library", "GET", null, device.cookie)).status, 200);
});

test("folder PINs are enforced on the server, grants are per session, and changing a PIN revokes other grants", async () => {
  const user = await account();
  const folder = await call(
    "folders",
    "POST",
    { name: "Magic", icon: "crown", protected: true, pin: "4567" },
    user.cookie,
  );
  assert.equal(folder.status, 201, JSON.stringify(folder.data));
  const id = folder.data.folderId;
  const saved = await call(
    "reels",
    "POST",
    {
      title: "Secret trick",
      url: "https://instagram.com/reel/SECRET/",
      folderId: id,
    },
    user.cookie,
  );
  const reelId = saved.data.reels[0].id;
  const device = await call("auth/login", "POST", {
    username: user.username,
    password: user.password,
  });
  const hidden = await call("library", "GET", null, device.cookie);
  assert.equal(hidden.data.reels.length, 0);
  assert.equal(hidden.data.folders[0].pin, true);
  assert.equal(hidden.data.folders[0].icon, "crown");
  assert.equal(hidden.data.folders[0].unlocked, false);
  assert.doesNotMatch(
    JSON.stringify(hidden.data),
    /pin_code|pin_version|password_hash|token_hash/,
  );
  assert.equal(
    (await call(`reels/${reelId}`, "DELETE", {}, device.cookie)).status,
    423,
  );
  assert.equal(
    (
      await call(
        `reels/${reelId}`,
        "PATCH",
        {
          title: "moved",
          url: "https://instagram.com/reel/SECRET/",
          folderId: null,
        },
        device.cookie,
      )
    ).status,
    423,
  );
  assert.equal(
    (
      await call(
        `folders/${id}`,
        "PATCH",
        { name: "Bypass", protected: false },
        device.cookie,
      )
    ).status,
    423,
  );
  assert.equal(
    (await call(`folders/${id}`, "DELETE", {}, device.cookie)).status,
    423,
  );
  assert.equal(
    (await call("library/export", "GET", null, device.cookie)).status,
    423,
  );
  assert.equal(
    (await call(`folders/${id}/unlock`, "POST", { pin: "0000" }, device.cookie))
      .status,
    403,
  );
  assert.equal(
    (await call(`folders/${id}/unlock`, "POST", { pin: "4567" }, device.cookie))
      .data.reels.filter((reel) => reel.viewScope === "all").length,
    1,
  );
  const change = await call(
    `folders/${id}`,
    "PATCH",
    { name: "Magic", protected: true, pin: "9876" },
    user.cookie,
  );
  assert.equal(change.status, 200, JSON.stringify(change.data));
  assert.equal(
    (await call("library", "GET", null, device.cookie)).data.reels.length,
    0,
  );
  assert.equal(
    (await call(`folders/${id}/unlock`, "POST", { pin: "4567" }, device.cookie))
      .status,
    403,
  );
  assert.equal(
    (await call(`folders/${id}/unlock`, "POST", { pin: "9876" }, device.cookie))
      .status,
    200,
  );
  const [stored] = await app.db.query(
    "SELECT pin_code FROM folders WHERE id=$1",
    [id],
  );
  assert.match(stored.pin_code, /^\$2[aby]\$12\$/);
  const removed = await call(`folders/${id}`, "DELETE", {}, user.cookie);
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.reels.filter((reel) => reel.viewScope === "all").length, 1);
  assert.equal(removed.data.folders.length, 0);
  const trash = await call("trash/open", "POST", {}, user.cookie);
  assert.equal(trash.status, 200, JSON.stringify(trash.data));
  assert.equal(trash.data.folders[0].id, id);
  assert.equal(trash.data.folders[0].reelCount, 1);
  assert.equal((await call(`trash/folder/${id}/restore`, "POST", {}, user.cookie)).status, 200);
  const restored = await call("library", "GET", null, user.cookie);
  assert.equal(restored.data.folders[0].id, id);
  assert.equal(restored.data.reels[0].folderId, id);
  await call(`folders/${id}`, "DELETE", {}, user.cookie);
  assert.equal((await call(`trash/folder/${id}/permanent`, "POST", {}, user.cookie)).status, 200);
  const emptied = await call("library", "GET", null, user.cookie);
  assert.equal(emptied.data.folders.length, 0);
  assert.equal(emptied.data.reels.length, 1);
  assert.equal(emptied.data.reels[0].viewScope, "all");
});

test("expired and forged sessions, CSRF, malformed inputs, and oversized bodies are rejected", async () => {
  const user = await account();
  assert.equal(
    (
      await call(
        "reels",
        "POST",
        { title: "x", url: "https://evil.com/reel/X/", folderId: null },
        user.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "folders",
        "POST",
        { name: "x", protected: true, pin: "12345" },
        user.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "folders",
        "POST",
        { name: "x", protected: true, pin: 1234 },
        user.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "folders",
        "POST",
        { name: "x", protected: false },
        user.cookie,
        { origin: "https://evil.com" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "folders",
        "POST",
        { name: "x", protected: false },
        user.cookie,
        { "sec-fetch-site": "cross-site" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "folders",
        "POST",
        { name: "x".repeat(20000), protected: false },
        user.cookie,
      )
    ).status,
    413,
  );
  assert.equal(
    (await call("library", "GET", null, "reelbag_session=" + "a".repeat(64)))
      .status,
    401,
  );
  await app.db.query(
    "UPDATE sessions SET expires_at=now() - interval '1 second' WHERE user_id=$1",
    [user.data.user.id],
  );
  assert.equal((await call("library", "GET", null, user.cookie)).status, 401);
});

test("portable backups contain no credential hashes; imports append atomically with new IDs and names", async () => {
  const user = await account();
  const payload = {
    version: 3,
    folders: [{ id: "source-folder", name: "Favorites" }],
    reels: [
      {
        title: "Recipe",
        url: "https://instagram.com/reel/RECIPE/",
        folderId: "source-folder",
      },
      {
        title: "No folder",
        url: "https://instagram.com/reel/LOOSE/",
        folderId: null,
      },
    ],
  };
  const imported = await call("library/import", "POST", payload, user.cookie);
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.equal(imported.data.reels.filter((reel) => reel.viewScope === "all").length, 2);
  assert.notEqual(imported.data.folders[0].id, "source-folder");
  const repeated = await call("library/import", "POST", payload, user.cookie);
  assert.equal(repeated.data.reels.filter((reel) => reel.viewScope === "all").length, 4);
  assert.equal(repeated.data.folders[1].name, "Favorites (2)");
  const exported = await call("library/export", "GET", null, user.cookie);
  assert.equal(exported.data.version, 4);
  assert.doesNotMatch(JSON.stringify(exported.data), /password|hash|pin/);
  const bad = structuredClone(payload);
  bad.reels[0].folderId = "missing";
  assert.equal(
    (await call("library/import", "POST", bad, user.cookie)).status,
    400,
  );
  assert.equal(
    (await call("library", "GET", null, user.cookie)).data.reels.filter((reel) => reel.viewScope === "all").length,
    4,
  );
});

test("database-backed login lockouts escalate after three failures and survive a fresh instance", async () => {
  const user = await account();
  let result;
  for (let i = 0; i < 2; i++) {
    result = await call("auth/login", "POST", {
      username: user.username,
      password: "wrong-password",
    });
    assert.equal(result.status, 401);
  }
  result = await call("auth/login", "POST", {
    username: user.username,
    password: "wrong-password",
  });
  assert.equal(result.status, 429);
  assert.equal(result.response.headers.get("retry-after"), "300");
  assert.equal(result.data.retryAfter, 300);
  const fresh = createApi({
    db: createDatabase(app.adapter),
    secureCookies: false,
  });
  result = await call(
    "auth/login",
    "POST",
    { username: user.username, password: "wrong-password" },
    null,
    {},
    fresh,
  );
  assert.equal(result.status, 429);
  assert.ok(Number(result.response.headers.get("retry-after")) <= 300);

  await app.db.query(
    `UPDATE security_lockouts SET lockout_until=now()-interval '1 second'
     WHERE escalated=true`,
  );
  result = await call("auth/login", "POST", {
    username: user.username,
    password: "wrong-password",
  });
  assert.equal(result.status, 429);
  assert.equal(result.response.headers.get("retry-after"), "300");

  await app.db.query(
    `UPDATE security_lockouts SET lockout_until=now()-interval '1 second'
     WHERE escalated=true`,
  );
  result = await call("auth/login", "POST", {
    username: user.username,
    password: user.password,
  });
  assert.equal(result.status, 200);
});

test("a session-store failure returns a safe API error instead of an uncaught rejection", async (t) => {
  t.mock.method(console, "error", () => {});
  const db = {
    async query(sql, params) {
      if (sql.includes("INSERT INTO sessions")) {
        const error = new Error(
          "Sensitive driver details must not be returned",
        );
        error.code = "08006";
        throw error;
      }
      return app.db.query(sql, params);
    },
    transaction: app.db.transaction,
  };
  const broken = createApi({ db, secureCookies: false });
  const result = await call(
    "auth/signup",
    "POST",
    { username: name(), password: "Secure-test-1234" },
    null,
    {},
    broken,
  );
  assert.equal(result.status, 503);
  assert.match(result.data.error, /database unavailable/i);
  assert.doesNotMatch(JSON.stringify(result.data), /Sensitive driver details/);
});

test("optional recovery resets with a normalized typo, revokes every device, and never exposes answers", async () => {
  const username = name();
  const original = "Secure-original-1234";
  const signup = await call("auth/signup", "POST", {
    username,
    password: original,
    securityQuestion: "First dream car?",
    securityAnswer: "Bugatti",
  });
  assert.equal(signup.status, 200, JSON.stringify(signup.data));
  const second = await call("auth/login", "POST", {
    username,
    password: original,
  });
  const question = await call("auth/recovery/question", "POST", { username });
  assert.equal(question.data.question, "First dream car?");
  assert.doesNotMatch(
    JSON.stringify(question.data),
    /security_answer|salt|deletions/,
  );
  const failed = await call("auth/recovery/reset", "POST", {
    username,
    answer: "Ferrari",
    newPassword: "New-strong-9876",
  });
  assert.equal(failed.status, 401);
  assert.equal((await call("library", "GET", null, signup.cookie)).status, 200);
  const reset = await call("auth/recovery/reset", "POST", {
    username,
    answer: " bugati!! ",
    newPassword: "New-strong-9876",
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal((await call("library", "GET", null, signup.cookie)).status, 401);
  assert.equal((await call("library", "GET", null, second.cookie)).status, 401);
  assert.equal(
    (await call("auth/login", "POST", { username, password: original })).status,
    401,
  );
  const login = await call("auth/login", "POST", {
    username,
    password: "New-strong-9876",
  });
  assert.equal(login.status, 200);
  assert.doesNotMatch(
    JSON.stringify((await call("library", "GET", null, login.cookie)).data),
    /security_answer|security_question|deletions/,
  );
  const [row] = await app.db.query(
    "SELECT security_answer FROM users WHERE username=$1",
    [username],
  );
  assert.doesNotMatch(row.security_answer, /bugatti/i);
});

test("accounts can skip recovery or configure and disable it with current-password verification", async () => {
  const user = await account();
  assert.equal(
    (await call("auth/recovery/question", "POST", { username: user.username }))
      .data.question,
    null,
  );
  assert.equal(
    (
      await call("auth/recovery/reset", "POST", {
        username: user.username,
        answer: "anything",
        newPassword: "New-strong-1234",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "account/recovery",
        "POST",
        {
          currentPassword: "wrong-password",
          enabled: true,
          securityQuestion: "A game?",
          securityAnswer: "PortalTwo",
        },
        user.cookie,
      )
    ).status,
    403,
  );
  const setup = await call(
    "account/recovery",
    "POST",
    {
      currentPassword: user.password,
      enabled: true,
      securityQuestion: "A game?",
      securityAnswer: "PortalTwo",
    },
    user.cookie,
  );
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  assert.equal(
    (await call("auth/recovery/question", "POST", { username: user.username }))
      .data.question,
    "A game?",
  );
  assert.equal(
    (
      await call(
        "account/recovery",
        "POST",
        { currentPassword: user.password, enabled: false },
        user.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("auth/recovery/question", "POST", { username: user.username }))
      .data.question,
    null,
  );
});

test("recovery throttling persists across instances and rejects cross-origin resets", async () => {
  const username = name();
  const signup = await call("auth/signup", "POST", {
    username,
    password: "Secure-original-1234",
    securityQuestion: "First car?",
    securityAnswer: "Bugatti",
  });
  assert.equal(signup.status, 200);
  const payload = {
    username,
    answer: "totallywrong",
    newPassword: "New-strong-1234",
  };
  assert.equal(
    (
      await call("auth/recovery/reset", "POST", payload, null, {
        origin: "https://evil.com",
      })
    ).status,
    403,
  );
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await call("auth/recovery/reset", "POST", payload)).status,
      401,
    );
  const fresh = createApi({
    db: createDatabase(app.adapter),
    secureCookies: false,
  });
  assert.equal(
    (await call("auth/recovery/reset", "POST", payload, null, {}, fresh))
      .status,
    429,
  );
});

test("pin and favorite flags persist, sort pinned reels first, and enforce ownership and folder locks", async () => {
  const user = await account();
  const outsider = await account();
  await call(
    "reels",
    "POST",
    {
      title: "Older",
      url: "https://instagram.com/reel/OLDER/",
      folderId: null,
    },
    user.cookie,
  );
  const newer = await call(
    "reels",
    "POST",
    {
      title: "Newer",
      url: "https://instagram.com/reel/NEWER/",
      folderId: null,
    },
    user.cookie,
  );
  const olderId = newer.data.reels.find((r) => r.title === "Older").id;
  const pinned = await call(
    `reels/${olderId}/flags`,
    "PATCH",
    { isPinned: true, isFavorite: true },
    user.cookie,
  );
  assert.equal(pinned.status, 200, JSON.stringify(pinned.data));
  assert.equal(pinned.data.reels[0].id, olderId);
  assert.equal(pinned.data.reels[0].isFavorite, true);
  assert.equal(
    (
      await call(
        `reels/${olderId}/flags`,
        "PATCH",
        { isPinned: false },
        outsider.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `reels/${olderId}/flags`,
        "PATCH",
        { isPinned: "yes" },
        user.cookie,
      )
    ).status,
    400,
  );
  const device = await call("auth/login", "POST", {
    username: user.username,
    password: user.password,
  });
  assert.equal(
    (await call("library", "GET", null, device.cookie)).data.reels[0].isPinned,
    true,
  );
  const exported = await call("library/export", "GET", null, user.cookie);
  assert.equal(exported.data.reels[0].isPinned, true);
  const copy = await call(
    "library/import",
    "POST",
    exported.data,
    outsider.cookie,
  );
  assert.ok(copy.data.reels.some((r) => r.isPinned && r.isFavorite));
  const locked = await call(
    "folders",
    "POST",
    { name: "Private", protected: true, pin: "4567" },
    user.cookie,
  );
  const id = locked.data.folderId;
  const hidden = await call(
    "reels",
    "POST",
    {
      title: "Hidden",
      url: "https://instagram.com/reel/HIDDEN/",
      folderId: id,
    },
    user.cookie,
  );
  const hiddenId = hidden.data.reels.find((r) => r.title === "Hidden").id;
  assert.equal(
    (
      await call(
        `reels/${hiddenId}/flags`,
        "PATCH",
        { isFavorite: true },
        device.cookie,
      )
    ).status,
    423,
  );
  await call(`folders/${id}/lock`, "POST", {}, user.cookie);
  assert.equal(
    (
      await call(
        `reels/${hiddenId}/flags`,
        "PATCH",
        { isPinned: true },
        user.cookie,
      )
    ).status,
    423,
  );
});

test("one owned Reel can use multiple folders with independent view flags and clean restore", async () => {
  const user = await account();
  const first = await call("folders", "POST", { name: "First", protected: false, pin: "" }, user.cookie);
  const second = await call("folders", "POST", { name: "Second", protected: false, pin: "" }, user.cookie);
  const created = await call("reels", "POST", {
    title: "One source Reel", url: "https://instagram.com/reel/ONE_SOURCE/", folderId: null,
  }, user.cookie);
  const reelId = created.data.reels.find((reel) => reel.viewScope === "all").id;
  await call(`reels/${reelId}/copy`, "POST", { folderId: first.data.folderId, favorite: false }, user.cookie);
  await call(`reels/${reelId}/copy`, "POST", { folderId: second.data.folderId, favorite: false }, user.cookie);
  await call(`reels/${reelId}/flags`, "PATCH", { scope: "all", isPinned: true }, user.cookie);
  await call(`reels/${reelId}/flags`, "PATCH", {
    scope: `folder:${first.data.folderId}`, isFavorite: true,
  }, user.cookie);

  let library = (await call("library", "GET", null, user.cookie)).data;
  const contexts = library.reels.filter((reel) => reel.id === reelId);
  assert.equal(contexts.length, 3);
  assert.equal(new Set(contexts.map((reel) => reel.id)).size, 1);
  assert.equal(contexts.find((reel) => reel.viewScope === "all").isPinned, true);
  assert.equal(contexts.find((reel) => reel.viewScope === `folder:${first.data.folderId}`).isPinned, false);
  assert.equal(contexts.find((reel) => reel.viewScope === `folder:${first.data.folderId}`).isFavorite, true);
  assert.equal(contexts.find((reel) => reel.viewScope === `folder:${second.data.folderId}`).isFavorite, false);

  await call(`reels/${reelId}/trash`, "POST", {}, user.cookie);
  library = (await call("library", "GET", null, user.cookie)).data;
  assert.equal(library.reels.some((reel) => reel.id === reelId), false);
  await call(`trash/${reelId}/restore`, "POST", {}, user.cookie);
  library = (await call("library", "GET", null, user.cookie)).data;
  const restored = library.reels.filter((reel) => reel.id === reelId);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].viewScope, "all");
  assert.equal(restored[0].isPinned, false);
  assert.equal(restored[0].isFavorite, false);
  assert.deepEqual(restored[0].folderNames, []);
});

test("avatar and optional hint persist across devices with validation, isolation, and no backup leakage", async () => {
  const {
    AVATARS,
    DEFAULT_AVATAR,
    LEGACY_AVATAR_REPLACEMENTS,
    normalizeAvatarUrl,
  } = await import("../utils/avatars.mjs");
  assert.equal(AVATARS.length, 30);
  assert.equal(new Set(AVATARS.map((a) => a.url)).size, 30);
  assert.equal(
    normalizeAvatarUrl(LEGACY_AVATAR_REPLACEMENTS[0].from),
    AVATARS[0].url,
  );
  assert.equal(
    normalizeAvatarUrl(LEGACY_AVATAR_REPLACEMENTS[1].from),
    AVATARS[0].url,
  );
  const username = name();
  const password = "Secure-profile-9876";
  const user = await call("auth/signup", "POST", {
    username,
    password,
    avatarUrl: AVATARS[2].url,
    passwordHint: "My private road trip clue",
  });
  assert.equal(user.status, 200);
  assert.equal(user.data.user.avatarUrl, AVATARS[2].url);
  assert.equal(
    (await call("auth/session", "GET", null, user.cookie)).data.user
      .passwordHint,
    "My private road trip clue",
  );
  const question = await call("auth/recovery/question", "POST", { username });
  assert.deepEqual(question.data, {
    question: null,
    hint: "My private road trip clue",
  });
  assert.equal(
    (await call("account/profile", "PATCH", { avatarUrl: AVATARS[1].url }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        "account/profile",
        "PATCH",
        { avatarUrl: "https://evil.example/avatar.svg" },
        user.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "account/profile",
        "PATCH",
        { passwordHint: "a".repeat(161) },
        user.cookie,
      )
    ).status,
    400,
  );
  const updated = await call(
    "account/profile",
    "PATCH",
    { avatarUrl: AVATARS[1].url, passwordHint: "Another clue" },
    user.cookie,
  );
  assert.equal(updated.status, 200);
  const device = await call("auth/login", "POST", { username, password });
  assert.equal(device.data.user.avatarUrl, AVATARS[1].url);
  assert.equal(
    (await call("library", "GET", null, device.cookie)).data.user.passwordHint,
    "Another clue",
  );
  const other = await account();
  assert.equal(other.data.user.avatarUrl, DEFAULT_AVATAR);
  assert.equal(other.data.user.passwordHint, null);
  const backup = await call("library/export", "GET", null, user.cookie);
  assert.doesNotMatch(
    JSON.stringify(backup.data),
    /Another clue|passwordHint|avatarUrl|password_hint/,
  );
  assert.equal(
    (
      await call("auth/signup", "POST", {
        username: name(),
        password,
        passwordHint: password,
      })
    ).status,
    400,
  );
});

test("recovery returns a configured hint and clears the obsolete hint after reset", async () => {
  const username = name();
  const user = await call("auth/signup", "POST", {
    username,
    password: "Secure-hint-9876",
    passwordHint: "The old password clue",
    securityQuestion: "Dream car?",
    securityAnswer: "Bugatti",
  });
  assert.equal(user.status, 200);
  const challenge = await call("auth/recovery/question", "POST", { username });
  assert.equal(challenge.data.hint, "The old password clue");
  const reset = await call("auth/recovery/reset", "POST", {
    username,
    answer: "bugati",
    newPassword: "Secure-next-9876",
  });
  assert.equal(reset.status, 200);
  assert.equal(
    (await call("auth/recovery/question", "POST", { username })).data.hint,
    null,
  );
});

test("display name and appearance persist independently of the login username and partial profile edits", async () => {
  const user = await account();
  const appearance = {
    theme: "light",
    accent: "#8a65ee",
    columns: "5",
    spacing: "compact",
    avatarFrame: "sovereign",
  };
  const saved = await call(
    "account/profile",
    "PATCH",
    { displayName: "Pixel Rider", appearance },
    user.cookie,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.data.user.username, user.username);
  assert.equal(saved.data.user.displayName, "Pixel Rider");
  assert.deepEqual(saved.data.user.appearance, appearance);
  await call(
    "account/profile",
    "PATCH",
    { passwordHint: "Independent hint" },
    user.cookie,
  );
  const device = await call("auth/login", "POST", {
    username: user.username,
    password: user.password,
  });
  assert.equal(device.status, 200);
  assert.equal(device.data.user.displayName, "Pixel Rider");
  assert.deepEqual(device.data.user.appearance, appearance);
  assert.equal(device.data.user.passwordHint, "Independent hint");
  for (const appearance of [
    { theme: "light" },
    {
      theme: "dark",
      accent: "red;display:none",
      columns: "5",
      spacing: "compact",
    },
    { theme: "dark", accent: "#b5f36d", columns: "100", spacing: "compact" },
    {
      theme: "dark",
      accent: "#b5f36d",
      columns: "auto",
      spacing: "comfortable",
      avatarFrame: "diamond",
    },
  ]) {
    assert.equal(
      (await call("account/profile", "PATCH", { appearance }, user.cookie))
        .status,
      400,
    );
  }
  assert.equal(
    (
      await call(
        "account/profile",
        "PATCH",
        { username: "another_user" },
        user.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "account/profile",
        "PATCH",
        { displayName: "x".repeat(61) },
        user.cookie,
      )
    ).status,
    400,
  );
  const other = await account();
  assert.equal(other.data.user.displayName, other.username);
  assert.equal(other.data.user.appearance.columns, "auto");
});

test("password updates require current credentials, revoke other devices, preserve this session and clear stale hints", async () => {
  const user = await account();
  await call(
    "account/profile",
    "PATCH",
    { passwordHint: "An old clue" },
    user.cookie,
  );
  const otherDevice = await call("auth/login", "POST", {
    username: user.username,
    password: user.password,
  });
  assert.equal(
    (
      await call(
        "account/password",
        "POST",
        {
          currentPassword: "Wrong-test-9876",
          newPassword: "Next-password-9876",
        },
        user.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "account/password",
        "POST",
        { currentPassword: user.password, newPassword: "short" },
        user.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "account/password",
        "POST",
        { currentPassword: user.password, newPassword: "Next-password-9876" },
        user.cookie,
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  const changed = await call(
    "account/password",
    "POST",
    { currentPassword: user.password, newPassword: "Next-password-9876" },
    user.cookie,
  );
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.passwordHint, null);
  assert.equal((await call("library", "GET", null, user.cookie)).status, 200);
  assert.equal(
    (await call("library", "GET", null, otherDevice.cookie)).status,
    401,
  );
  assert.equal(
    (
      await call("auth/login", "POST", {
        username: user.username,
        password: user.password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("auth/login", "POST", {
        username: user.username,
        password: "Next-password-9876",
      })
    ).status,
    200,
  );
});
