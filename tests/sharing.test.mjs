import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { testApplication } from "./helpers/application.mjs";
let app;
before(async () => {
  app = await testApplication();
});
after(async () => {
  await app.pg.close();
});
async function call(path, method = "GET", data, cookie, extra = {}) {
  const response = await app.handle(
    new Request(`http://localhost/api/${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(method === "GET"
          ? {}
          : { origin: "http://localhost", "content-type": "application/json" }),
        ...extra,
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(data || {}) }),
    }),
    path.split("/"),
  );
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function user() {
  const username = `share_${randomBytes(5).toString("hex")}`;
  const result = await call("auth/signup", "POST", {
    username,
    password: "Sharing-test-9876",
  });
  assert.equal(result.status, 200);
  return { ...result, username, id: result.data.user.id };
}
async function folder(owner, pin) {
  const result = await call(
    "folders",
    "POST",
    { name: "Secret bike folder", protected: Boolean(pin), pin },
    owner.cookie,
  );
  assert.equal(result.status, 201);
  return result.data.folderId;
}
async function reel(owner, folderId = null, title = "Private motorcycle") {
  const result = await call(
    "reels",
    "POST",
    { title, url: "https://instagram.com/reel/SHARING/", folderId },
    owner.cookie,
  );
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.reels.find((r) => r.title === title).id;
}

test("folder invites require recipient acceptance, enforce roles at SQL writes, and revoke immediately", async () => {
  const owner = await user(),
    recipient = await user(),
    outsider = await user();
  const id = await folder(owner);
  const reelId = await reel(owner, id);
  const route = `sharing/folder/${id}`;
  assert.equal(
    (
      await call(
        `${route}/invite`,
        "POST",
        { username: recipient.username, role: "admin" },
        owner.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `${route}/invite`,
        "POST",
        { username: recipient.username.toUpperCase(), role: "viewer" },
        owner.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.folders.length,
    0,
  );
  assert.equal((await call(route, "GET", null, outsider.cookie)).status, 404);
  let notices = (await call("notifications", "GET", null, recipient.cookie))
    .data;
  assert.equal(notices.unread, 1);
  assert.equal(notices.items[0].sender, owner.username);
  const notification = notices.items[0].id;
  assert.equal(
    (
      await call(
        `notifications/${notification}/respond`,
        "POST",
        { status: "accepted" },
        outsider.cookie,
      )
    ).status,
    404,
  );
  await call("notifications/read", "POST", {}, recipient.cookie);
  assert.equal(
    (await call("notifications", "GET", null, recipient.cookie)).data.unread,
    0,
  );
  assert.equal(
    (
      await call(
        `notifications/${notification}/respond`,
        "POST",
        { status: "accepted" },
        recipient.cookie,
      )
    ).status,
    200,
  );
  const library = (await call("library", "GET", null, recipient.cookie)).data;
  assert.equal(library.folders[0].role, "viewer");
  assert.deepEqual(
    library.folders[0].members.map(({ recipientId, username, role }) => ({ recipientId, username, role })),
    [{ recipientId: recipient.id, username: recipient.username, role: "viewer" }],
  );
  assert.equal(library.reels[0].canManage, false);
  assert.equal(
    (
      await call(
        "reels",
        "POST",
        {
          title: "Not allowed",
          url: "https://instagram.com/reel/DENY/",
          folderId: id,
        },
        recipient.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(`reels/${reelId}`, "DELETE", {}, recipient.cookie)).status,
    404,
  );
  assert.equal(
    (await call(`folders/${id}`, "DELETE", {}, recipient.cookie)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `${route}/invite`,
        "POST",
        { username: outsider.username, role: "collaborator" },
        recipient.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call(`${route}/members/${recipient.id}`, "PATCH", { role: "admin" }, owner.cookie)).status,
    400,
  );
  assert.equal(
    (await call(`${route}/members/${recipient.id}`, "PATCH", { role: "collaborator" }, owner.cookie)).status,
    200,
  );
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.folders[0].role,
    "collaborator",
  );
  const added = await call(
    "reels",
    "POST",
    {
      title: "Collaborator contribution",
      url: "https://instagram.com/reel/ADD/",
      folderId: id,
    },
    recipient.cookie,
  );
  assert.equal(added.status, 201, JSON.stringify(added.data));
  assert.equal(added.data.reels.length, 2);
  const contributed = added.data.reels.find(
    (r) => r.title === "Collaborator contribution",
  );
  assert.equal(
    (
      await call(
        `reels/${contributed.id}`,
        "PATCH",
        { title: "Changed", url: contributed.url, folderId: null },
        recipient.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `reels/${reelId}/flags`,
        "PATCH",
        { isPinned: true },
        recipient.cookie,
      )
    ).status,
    200,
  );
  const backup = await call("library/export", "GET", null, recipient.cookie);
  assert.equal(backup.data.reels.length, 0);
  assert.equal(backup.data.folders.length, 0);
  assert.equal(
    (await call(`${route}/leave`, "DELETE", {}, recipient.cookie)).status,
    200,
  );
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.folders.length,
    0,
  );
  await call(
    `${route}/invite`,
    "POST",
    { username: recipient.username, role: "viewer" },
    owner.cookie,
  );
  notices = (await call("notifications", "GET", null, recipient.cookie)).data;
  await call(
    `notifications/${notices.items[0].id}/respond`,
    "POST",
    { status: "accepted" },
    recipient.cookie,
  );
  await call(`${route}/members/${recipient.id}`, "DELETE", {}, owner.cookie);
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.reels.length,
    0,
  );
  assert.equal(
    (
      await call(
        "reels",
        "POST",
        { title: "Revoked", url: contributed.url, folderId: id },
        recipient.cookie,
      )
    ).status,
    404,
  );
});

test("UUID links reveal no anonymous metadata, join as viewer, rotate, revoke and resist role escalation", async () => {
  const owner = await user(),
    recipient = await user();
  const id = await folder(owner, "1234");
  await reel(owner, id);
  const manage = `sharing/folder/${id}`;
  const enabled = await call(`${manage}/link`, "POST", {}, owner.cookie);
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
  const token = enabled.data.shareToken;
  assert.match(token, /^[a-f0-9-]{36}$/);
  assert.notEqual(token, id);
  const link = `share/folder/${token}`;
  assert.deepEqual((await call(link)).data, { requiresAuth: true });
  const preview = await call(link, "GET", null, recipient.cookie);
  assert.equal(preview.data.reels.length, 0);
  assert.equal(preview.data.role, null);
  assert.equal((await call(`${link}/join`, "POST", {})).status, 401);
  assert.equal(
    (
      await call(
        `${link}/join`,
        "POST",
        { role: "collaborator", owner_id: recipient.id },
        recipient.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(link, "GET", null, recipient.cookie)).data.role,
    "viewer",
  );
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.reels.length,
    1,
  );
  assert.equal(
    (await call(`${manage}/link`, "DELETE", {}, recipient.cookie)).status,
    404,
  );
  assert.equal(
    (await call(`${manage}/link`, "DELETE", {}, owner.cookie)).status,
    200,
  );
  assert.equal((await call(link, "GET", null, recipient.cookie)).status, 404);
  assert.equal(
    (await call(`${link}/join`, "POST", {}, recipient.cookie)).status,
    404,
  );
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.folders.length,
    1,
  );
  const newer = await call(`${manage}/link`, "POST", {}, owner.cookie);
  assert.notEqual(newer.data.shareToken, token);
  await call(`${manage}/members/${recipient.id}`, "DELETE", {}, owner.cookie);
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.reels.length,
    0,
  );
  assert.equal(
    (await call(`share/folder/${randomUUID()}`, "GET", null, recipient.cookie))
      .status,
    404,
  );
  assert.equal(
    (
      await call(`${manage}/link`, "POST", {}, owner.cookie, {
        origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  await call(`folders/${id}/lock`, "POST", {}, owner.cookie);
  assert.equal((await call(manage, "GET", null, owner.cookie)).status, 404);
});

test("single reel sharing is isolated, invitations can be declined, and deletion cascades invitations", async () => {
  const owner = await user(),
    recipient = await user();
  const id = await folder(owner);
  const first = await reel(owner, id, "One reel");
  await reel(owner, id, "Sibling reel");
  const manage = `sharing/reel/${first}`;
  assert.equal(
    (
      await call(
        `${manage}/invite`,
        "POST",
        { username: recipient.username, role: "collaborator" },
        owner.cookie,
      )
    ).status,
    400,
  );
  await call(
    `${manage}/invite`,
    "POST",
    { username: recipient.username, role: "viewer" },
    owner.cookie,
  );
  let notice = (await call("notifications", "GET", null, recipient.cookie)).data
    .items[0];
  await call(
    `notifications/${notice.id}/respond`,
    "POST",
    { status: "declined" },
    recipient.cookie,
  );
  assert.equal(
    (await call("library", "GET", null, recipient.cookie)).data.reels.length,
    0,
  );
  await call(
    `${manage}/invite`,
    "POST",
    { username: recipient.username, role: "viewer" },
    owner.cookie,
  );
  notice = (await call("notifications", "GET", null, recipient.cookie)).data
    .items[0];
  await call(
    `notifications/${notice.id}/respond`,
    "POST",
    { status: "accepted" },
    recipient.cookie,
  );
  let library = (await call("library", "GET", null, recipient.cookie)).data;
  assert.equal(library.folders.length, 0);
  assert.equal(library.reels.length, 1);
  const enabled = await call(`${manage}/link`, "POST", {}, owner.cookie);
  assert.equal(
    (
      await call(
        `share/reel/${enabled.data.shareToken}`,
        "GET",
        null,
        recipient.cookie,
      )
    ).data.reels.length,
    1,
  );
  await call(`reels/${first}`, "DELETE", {}, owner.cookie);
  assert.equal(
    (await call("notifications", "GET", null, recipient.cookie)).data.items
      .length,
    0,
  );
  library = (await call("library", "GET", null, recipient.cookie)).data;
  assert.equal(library.reels.length, 0);
});

test("collaborators can pin shared reels, keep personal copies, and hide without changing the owner", async () => {
  const owner = await user(), collaborator = await user();
  const folderId = await folder(owner);
  const reelId = await reel(owner, folderId, "Shared keeper");
  await call(
    `sharing/folder/${folderId}/invite`,
    "POST",
    { username: collaborator.username, role: "collaborator" },
    owner.cookie,
  );
  const invite = (await call("notifications", "GET", null, collaborator.cookie)).data.items[0];
  await call(
    `notifications/${invite.id}/respond`,
    "POST",
    { status: "accepted" },
    collaborator.cookie,
  );

  const pinned = await call(
    `reels/${reelId}/flags`,
    "PATCH",
    { isPinned: true },
    collaborator.cookie,
  );
  assert.equal(pinned.status, 200, JSON.stringify(pinned.data));
  assert.equal(
    (await call("library", "GET", null, owner.cookie)).data.reels[0].isPinned,
    true,
  );

  const copied = await call(
    `reels/${reelId}/copy`,
    "POST",
    { favorite: true },
    collaborator.cookie,
  );
  assert.equal(copied.status, 201, JSON.stringify(copied.data));
  assert.ok(copied.data.reels.some((item) => item.canManage && item.isFavorite));

  const hidden = await call(`reels/${reelId}/hide`, "POST", {}, collaborator.cookie);
  assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
  assert.equal(hidden.data.reels.some((item) => item.id === reelId), false);
  assert.equal(hidden.data.hiddenReels.some((item) => item.id === reelId), true);
  const restored = await call(`reels/${reelId}/unhide`, "POST", {}, collaborator.cookie);
  assert.equal(restored.status, 200, JSON.stringify(restored.data));
  assert.equal(restored.data.hiddenReels.length, 0);
  assert.equal(restored.data.reels.some((item) => item.id === reelId), true);
});

test("collaborator additions recheck revoked grants between authorization and INSERT", async () => {
  const owner = await user(),
    recipient = await user();
  const id = await folder(owner);
  await call(
    `sharing/folder/${id}/invite`,
    "POST",
    { username: recipient.username, role: "collaborator" },
    owner.cookie,
  );
  const n = (await call("notifications", "GET", null, recipient.cookie)).data
    .items[0];
  await call(
    `notifications/${n.id}/respond`,
    "POST",
    { status: "accepted" },
    recipient.cookie,
  );
  const original = app.db.query;
  let revoked = false;
  app.db.query = async (sql, values) => {
    if (
      !revoked &&
      sql.startsWith("INSERT INTO reels(id,user_id,folder_id,title,url)")
    ) {
      revoked = true;
      await original(
        "DELETE FROM folder_shares WHERE folder_id=$1 AND recipient_id=$2",
        [id, recipient.id],
      );
    }
    return original(sql, values);
  };
  try {
    const result = await call(
      "reels",
      "POST",
      {
        title: "Racing contribution",
        url: "https://instagram.com/reel/RACE/",
        folderId: id,
      },
      recipient.cookie,
    );
    assert.equal(result.status, 403);
    assert.equal(revoked, true);
    assert.equal(
      (await call("library", "GET", null, owner.cookie)).data.reels.length,
      0,
    );
  } finally {
    app.db.query = original;
  }
});

test("share content rechecks membership at read time after concurrent revocation", async () => {
  const owner = await user(),
    recipient = await user();
  const id = await folder(owner);
  await reel(owner, id);
  const enabled = await call(
    `sharing/folder/${id}/link`,
    "POST",
    {},
    owner.cookie,
  );
  const path = `share/folder/${enabled.data.shareToken}`;
  await call(`${path}/join`, "POST", {}, recipient.cookie);
  const original = app.db.query;
  let revoked = false;
  app.db.query = async (sql, values) => {
    const result = await original(sql, values);
    if (!revoked && sql.includes('e.user_id AS "ownerId"')) {
      revoked = true;
      await original(
        "DELETE FROM folder_shares WHERE folder_id=$1 AND recipient_id=$2",
        [id, recipient.id],
      );
    }
    return result;
  };
  try {
    const response = await call(path, "GET", null, recipient.cookie);
    assert.equal(response.status, 200);
    assert.equal(revoked, true);
    assert.equal(response.data.reels.length, 0);
  } finally {
    app.db.query = original;
  }
});
