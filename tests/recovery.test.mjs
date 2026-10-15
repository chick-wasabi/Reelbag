import test from "node:test";
import assert from "node:assert/strict";
import {
  hashRecoveryAnswer,
  normalizeAnswer,
  verifyRecoveryAnswer,
} from "../lib/server/recovery.mjs";

test("answer normalization ignores case, punctuation, spacing, and accents", () => {
  assert.equal(normalizeAnswer("  BÜGATTI, Chiron!! "), "bugattichiron");
  assert.equal(normalizeAnswer("Dream—Road_Trip 2026"), "dreamroadtrip2026");
});
test("one-edit recovery handles missing doubles, insertions and substitutions, but refuses two edits", async () => {
  const stored = await hashRecoveryAnswer("Bugatti");
  assert.ok(!stored.toLowerCase().includes("bugatti"));
  for (const answer of [" BUGATTI! ", "bugati", "bugaatti", "bugatzi"])
    assert.equal(await verifyRecoveryAnswer(answer, stored), true, answer);
  for (const answer of ["bvgatzi", "bguatti", "ferrari", "bugat", ""])
    assert.equal(await verifyRecoveryAnswer(answer, stored), false, answer);
  const other = await hashRecoveryAnswer("Bugatti");
  assert.notEqual(stored, other);
});
test("short answers require exact normalized matches and oversized or invalid input is rejected", async () => {
  const stored = await hashRecoveryAnswer("Rome");
  assert.equal(await verifyRecoveryAnswer(" ROME. ", stored), true);
  assert.equal(await verifyRecoveryAnswer("Rime", stored), false);
  await assert.rejects(hashRecoveryAnswer("!!!"));
  await assert.rejects(hashRecoveryAnswer("a".repeat(65)));
  assert.equal(await verifyRecoveryAnswer("a".repeat(201), stored), false);
  assert.equal(await verifyRecoveryAnswer("anything", "broken"), false);
});
