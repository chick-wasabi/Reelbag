import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const source = await readFile(
  new URL("../utils/storage.js", import.meta.url),
  "utf8",
);
const storage = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const {
  emptyData,
  parseReelUrl,
  hashPin,
  verifyPin,
  validateData,
  validateLegacy,
  migrateLegacy,
  saveData,
  loadData,
  loadLegacyData,
  STORAGE_KEY,
  LEGACY_KEY,
  readBackup,
  MAX_BACKUP_BYTES,
} = storage;
const pin = await hashPin("1234");
const fixture = () => ({
  version: 2,
  revision: 0,
  masterPin: pin,
  folders: [
    { id: "f1", name: "Bike Riding", pin: null },
    { id: "f2", name: "Pranks", pin },
  ],
  reels: [
    {
      id: "r1",
      title: "Sunset ride",
      url: "https://www.instagram.com/reel/ABC_123/?igsh=tracking",
      folderId: "f1",
      createdAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "r2",
      title: "A good recipe",
      url: "https://www.instagram.com/reel/RECIPE/",
      folderId: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
});
const legacyFixture = () => ({
  version: 1,
  profiles: [
    {
      id: "p1",
      name: "Personal",
      pin,
      folders: [{ id: "f1", name: "Favorites" }],
      reels: [{ ...fixture().reels[0], status: "To Try", note: "Old note" }],
    },
    {
      id: "p2",
      name: "Friends",
      pin,
      folders: [{ id: "f1", name: "Favorites" }],
      reels: [
        { ...fixture().reels[0], status: "Completed", note: "Other note" },
        fixture().reels[1],
      ],
    },
  ],
});
function mockStorage() {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  return memory;
}

test("normalizes reel URLs and rejects lookalike hosts, credentials, and unsupported paths", () => {
  assert.deepEqual(
    parseReelUrl("https://m.instagram.com/reels/Abc_-1/?igsh=test"),
    { shortcode: "Abc_-1", url: "https://www.instagram.com/reel/Abc_-1/" },
  );
  for (const value of [
    "https://instagram.com.evil.com/reel/ABC/",
    "javascript:alert(1)",
    "https://evil.com/reel/ABC/",
    "https://instagram.com/p/ABC/",
    "https://instagram.com/reel/ABC/extra",
    "https://user:pass@instagram.com/reel/ABC/",
    null,
  ])
    assert.equal(parseReelUrl(value), null);
});
test("PINs use distinct salts and verify only the matching PIN", async () => {
  const other = await hashPin("1234");
  assert.notEqual(pin.salt, other.salt);
  assert.notEqual(pin.hash, other.hash);
  assert.equal(await verifyPin("1234", pin), true);
  assert.equal(await verifyPin("0000", pin), false);
  await assert.rejects(hashPin("123"));
  await assert.rejects(hashPin("abcd"));
});
test("v2 backs up one library, folder PINs, and reels with no folder; strips obsolete fields", () => {
  const raw = fixture();
  raw.profiles = [];
  raw.reels[0].note = "remove";
  raw.reels[0].status = "remove";
  const clean = validateData(raw);
  assert.equal(clean.profiles, undefined);
  assert.equal(clean.reels[0].note, undefined);
  assert.equal(clean.reels[0].status, undefined);
  assert.equal(clean.reels[1].folderId, null);
  assert.deepEqual(clean.folders[1].pin, pin);
  assert.equal(clean.reels[0].url, "https://www.instagram.com/reel/ABC_123/");
  assert.deepEqual(validateData(emptyData()), emptyData());
});
test("rejects broken folder references, malformed PIN hashes, duplicate IDs, and unprotected populated libraries", () => {
  const mutations = [
    (d) => (d.reels[0].folderId = "missing"),
    (d) => d.folders.push(d.folders[0]),
    (d) => (d.reels[0].url = "https://evil.com/reel/abc"),
    (d) => d.reels.push(d.reels[0]),
    (d) => (d.masterPin = { ...pin, iterations: 999999999 }),
    (d) => (d.masterPin = null),
    (d) => (d.folders[1].pin = { hash: "bad" }),
    (d) => (d.reels[0].createdAt = "invalid"),
  ];
  for (const mutate of mutations) {
    const d = fixture();
    mutate(d);
    assert.throws(() => validateData(d));
  }
});
test("legacy migration preserves every reel, remaps colliding IDs, and removes old workflow metadata", () => {
  const result = migrateLegacy(legacyFixture(), pin);
  assert.equal(result.version, 2);
  assert.equal(result.reels.length, 3);
  assert.equal(result.folders.length, 2);
  assert.equal(new Set(result.reels.map((r) => r.id)).size, 3);
  assert.equal(new Set(result.folders.map((f) => f.id)).size, 2);
  assert.notEqual(result.folders[0].name, result.folders[1].name);
  assert.notEqual(result.reels[0].folderId, result.reels[1].folderId);
  assert.equal(result.reels[2].folderId, null);
  assert.ok(result.reels.every((r) => !("note" in r) && !("status" in r)));
  assert.equal(result.profiles, undefined);
});
test("migration writes v2 atomically and leaves the original v1 storage unchanged", () => {
  const memory = mockStorage();
  const original = JSON.stringify(legacyFixture());
  memory.set(LEGACY_KEY, original);
  const legacy = loadLegacyData();
  assert.equal(legacy.profiles.length, 2);
  saveData(migrateLegacy(legacy, pin), 0);
  assert.equal(loadData().reels.length, 3);
  assert.equal(loadLegacyData(), null);
  assert.equal(memory.get(LEGACY_KEY), original);
});
test("storage refuses stale writes and preserves saved data on quota failure", () => {
  const memory = mockStorage();
  assert.deepEqual(loadData(), emptyData());
  const saved = saveData(fixture(), 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual(loadData(), saved);
  assert.throws(() => saveData(fixture(), 0), /another tab/);
  const before = memory.get(STORAGE_KEY);
  globalThis.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.throws(() => saveData(saved, 1), /Could not save/);
  assert.equal(memory.get(STORAGE_KEY), before);
  memory.set(STORAGE_KEY, "{broken");
  assert.throws(() => loadData());
});
test("file reader accepts current and legacy backups, rejects oversized or malformed files", async () => {
  const original = fixture();
  assert.deepEqual(
    await readBackup(new File([JSON.stringify(original)], "backup.json")),
    validateData(original),
  );
  assert.deepEqual(
    await readBackup(new File([JSON.stringify(legacyFixture())], "v1.json")),
    validateLegacy(legacyFixture()),
  );
  await assert.rejects(
    readBackup(new File(["{invalid"], "bad.json")),
    /not valid JSON/,
  );
  await assert.rejects(readBackup({ size: MAX_BACKUP_BYTES + 1 }), /10 MB/);
});
