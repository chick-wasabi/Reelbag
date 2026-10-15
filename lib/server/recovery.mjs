import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);

export function normalizeAnswer(value) {
  return typeof value === "string"
    ? value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/\p{M}/gu, "")
        .replace(/[^\p{L}\p{N}]/gu, "")
    : "";
}
const points = (value) => Array.from(value);
async function fingerprint(value, salt) {
  return (
    await scrypt(value, salt, 32, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    })
  ).toString("hex");
}
function equal(a, b) {
  return (
    typeof b === "string" &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  );
}
export async function hashRecoveryAnswer(answer) {
  const normalized = normalizeAnswer(answer);
  const chars = points(normalized);
  if (
    typeof answer !== "string" ||
    answer.length > 200 ||
    chars.length < 4 ||
    chars.length > 64
  )
    throw new Error(
      "Use an answer with 4–64 letters or numbers (up to 200 input characters).",
    );
  const salt = randomBytes(16).toString("hex");
  const exact = await fingerprint(normalized, salt);
  const deletions = [];
  // Position-tagged one-character deletions allow one edit without retaining a
  // plaintext/reversible answer. Position tags prevent accidental two-edit matches.
  if (chars.length >= 6) {
    for (let i = 0; i < chars.length; i++)
      deletions.push(
        await fingerprint(chars.filter((_, j) => i !== j).join(""), salt),
      );
  }
  return JSON.stringify({
    version: 1,
    salt,
    length: chars.length,
    exact,
    deletions,
  });
}
export async function verifyRecoveryAnswer(answer, encoded) {
  if (typeof answer !== "string" || answer.length > 200) return false;
  const normalized = normalizeAnswer(answer);
  const chars = points(normalized);
  if (chars.length < 4 || chars.length > 65) return false;
  let stored;
  try {
    stored = JSON.parse(encoded);
  } catch {
    return false;
  }
  if (
    stored?.version !== 1 ||
    !/^[a-f0-9]{32}$/.test(stored.salt || "") ||
    !Number.isInteger(stored.length) ||
    stored.length < 4 ||
    stored.length > 64 ||
    !Array.isArray(stored.deletions) ||
    stored.deletions.length > 64
  )
    return false;
  const full = await fingerprint(normalized, stored.salt);
  if (equal(full, stored.exact)) return true;
  if (
    Math.min(chars.length, stored.length) < 6 ||
    Math.abs(chars.length - stored.length) > 1
  )
    return false;
  // A shorter input matches a stored deletion (missing character).
  if (chars.length === stored.length - 1)
    return stored.deletions.some((hash) => equal(full, hash));
  for (let i = 0; i < chars.length; i++) {
    const deleted = await fingerprint(
      chars.filter((_, j) => i !== j).join(""),
      stored.salt,
    );
    // A longer input removes one extra character; equal-length strings must
    // delete the SAME position, permitting one substitution, not two edits.
    if (
      equal(
        deleted,
        chars.length === stored.length ? stored.deletions[i] : stored.exact,
      )
    )
      return true;
  }
  return false;
}
