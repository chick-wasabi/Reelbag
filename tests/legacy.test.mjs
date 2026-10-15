import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import {
  verifyPin,
  validateData,
  validateLegacy,
  migrateLegacy,
  loadData,
  loadLegacyData,
} from "../utils/legacy.mjs";
import { validateBackup } from "../utils/backup.mjs";
import { parseReelUrl } from "../utils/reels.mjs";
const salt = "0123456789abcdef0123456789abcdef";
const pin = {
  salt,
  hash: pbkdf2Sync("1234", salt, 210000, 32, "sha256").toString("hex"),
  iterations: 210000,
};
const fixture = () => ({
  version: 2,
  revision: 0,
  masterPin: pin,
  folders: [{ id: "f1", name: "Bike Riding", pin: null }],
  reels: [
    {
      id: "r1",
      title: "Sunset ride",
      url: "https://instagram.com/reel/ABC_123/?igsh=tracking",
      folderId: "f1",
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
      reels: [{ ...fixture().reels[0], note: "Old note", status: "Completed" }],
    },
    {
      id: "p2",
      name: "Friends",
      pin,
      folders: [{ id: "f1", name: "Favorites" }],
      reels: [fixture().reels[0]],
    },
  ],
});

test("legacy PBKDF2 credentials verify against an independently generated hash", async () => {
  assert.equal(await verifyPin("1234", pin), true);
  assert.equal(await verifyPin("0000", pin), false);
});
test("old local files are validated, URLs normalized, and unsupported fields removed", () => {
  const raw = fixture();
  raw.reels[0].note = "remove";
  raw.reels[0].status = "remove";
  const clean = validateData(raw);
  assert.equal(clean.reels[0].url, "https://www.instagram.com/reel/ABC_123/");
  assert.equal(clean.reels[0].note, undefined);
  assert.equal(clean.reels[0].status, undefined);
  raw.reels[0].folderId = "missing";
  assert.throws(() => validateData(raw));
  const extreme = fixture();
  extreme.masterPin = { ...pin, iterations: 999999999 };
  assert.throws(() => validateData(extreme));
});
test("legacy profile conversion preserves reels and remaps colliding IDs and folder names", () => {
  const original = legacyFixture();
  const result = migrateLegacy(validateLegacy(original), pin);
  assert.equal(result.reels.length, 2);
  assert.notEqual(result.reels[0].id, result.reels[1].id);
  assert.notEqual(result.reels[0].folderId, result.reels[1].folderId);
  assert.notEqual(result.folders[0].name, result.folders[1].name);
  assert.ok(result.reels.every((r) => !("note" in r)));
  assert.equal(original.profiles[0].reels[0].note, "Old note");
});
test("compatibility readers never overwrite old browser storage", () => {
  const memory = new Map([["reelbag.v1", JSON.stringify(legacyFixture())]]);
  const before = JSON.stringify([...memory]);
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: () => {
      throw new Error("Writes are forbidden");
    },
  };
  assert.equal(loadLegacyData().profiles.length, 2);
  assert.equal(loadData().reels.length, 0);
  assert.equal(JSON.stringify([...memory]), before);
  memory.set("reelbag.v2", JSON.stringify(fixture()));
  assert.equal(loadLegacyData(), null);
  assert.equal(loadData().reels.length, 1);
});
test("portable cloud backups whitelist content and reject unsafe URLs and missing relationships", () => {
  const source = {
    version: 3,
    password_hash: "never export",
    folders: [{ id: "f", name: "Rides", pin_code: "never export" }],
    reels: [
      { title: "Ride", url: "https://instagram.com/reel/RIDE/", folderId: "f" },
    ],
  };
  const clean = validateBackup(source);
  assert.equal(clean.password_hash, undefined);
  assert.equal(clean.folders[0].pin_code, undefined);
  source.reels[0].url = "https://instagram.com.evil.com/reel/RIDE/";
  assert.throws(() => validateBackup(source));
  for (const url of [
    "https://evil.com/reel/ABC/",
    "javascript:alert(1)",
    "https://user:password@instagram.com/reel/X/",
  ])
    assert.equal(parseReelUrl(url), null);
});
