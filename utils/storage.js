export const STORAGE_KEY = "reelbag.v2";
export const LEGACY_KEY = "reelbag.v1";
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const ITERATIONS = 210000;
const encoder = new TextEncoder();

export function emptyData() {
  return { version: 2, revision: 0, masterPin: null, folders: [], reels: [] };
}
export function uid() {
  return crypto.randomUUID();
}

export function parseReelUrl(input) {
  try {
    const url = new URL(input.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password
    )
      return null;
    const match = url.pathname.match(/^\/reels?\/([A-Za-z0-9_-]{1,100})\/?$/);
    return match
      ? {
          shortcode: match[1],
          url: `https://www.instagram.com/reel/${match[1]}/`,
        }
      : null;
  } catch {
    return null;
  }
}

function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function derive(pin, salt, iterations) {
  if (!globalThis.crypto?.subtle)
    throw new Error("PIN protection requires HTTPS or localhost.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(salt),
          iterations,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  );
}
export async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Choose a PIN with 4–8 digits.");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return {
    salt,
    hash: await derive(pin, salt, ITERATIONS),
    iterations: ITERATIONS,
  };
}
export async function verifyPin(pin, credential) {
  const result = await derive(pin, credential.salt, credential.iterations);
  let different = result.length ^ credential.hash.length;
  for (let i = 0; i < result.length; i++)
    different |= result.charCodeAt(i) ^ credential.hash.charCodeAt(i);
  return different === 0;
}

function fail() {
  throw new Error(
    "Invalid Reelbag backup. Your current library has not been changed.",
  );
}
function text(value, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail();
  return value;
}
function list(value, max) {
  if (!Array.isArray(value) || value.length > max) fail();
  return value;
}
function unique(items) {
  if (new Set(items.map((x) => x.id)).size !== items.length) fail();
}
function credential(value) {
  if (
    !value ||
    typeof value.salt !== "string" ||
    !/^[a-f0-9]{32}$/.test(value.salt) ||
    typeof value.hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.hash) ||
    !Number.isInteger(value.iterations) ||
    value.iterations < 100000 ||
    value.iterations > 1000000
  )
    fail();
  return { salt: value.salt, hash: value.hash, iterations: value.iterations };
}
function reel(value, folders) {
  if (!value) fail();
  const parsed = parseReelUrl(value.url);
  if (
    !parsed ||
    (value.folderId !== null &&
      !folders.some((f) => f.id === value.folderId)) ||
    typeof value.createdAt !== "string" ||
    value.createdAt.length > 40 ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    fail();
  return {
    id: text(value.id, 100),
    title: text(value.title, 200),
    ...parsed,
    folderId: value.folderId,
    createdAt: value.createdAt,
  };
}

// Reconstruct only supported fields; imported objects never become application state directly.
export function validateData(raw) {
  if (!raw || raw.version !== 2) fail();
  const folders = list(raw.folders, 500).map((f) => ({
    id: text(f?.id, 100),
    name: text(f?.name, 60),
    pin: f.pin === null ? null : credential(f.pin),
  }));
  unique(folders);
  const reels = list(raw.reels, 10000).map((r) => reel(r, folders));
  unique(reels);
  const masterPin = raw.masterPin === null ? null : credential(raw.masterPin);
  if (!masterPin && (folders.length || reels.length)) fail();
  return {
    version: 2,
    revision:
      Number.isSafeInteger(raw.revision) && raw.revision >= 0
        ? raw.revision
        : 0,
    masterPin,
    folders,
    reels,
  };
}

export function validateLegacy(raw) {
  if (!raw || raw.version !== 1) fail();
  const profiles = list(raw.profiles, 100).map((p) => {
    const folders = list(p.folders, 500).map((f) => ({
      id: text(f?.id, 100),
      name: text(f?.name, 60),
    }));
    unique(folders);
    const reels = list(p.reels, 10000).map((r) => reel(r, folders));
    unique(reels);
    return {
      id: text(p.id, 100),
      name: text(p.name, 40),
      pin: credential(p.pin),
      folders,
      reels,
    };
  });
  unique(profiles);
  return { version: 1, profiles };
}

// Call only after verifying every legacy PIN in MigrationWizard.
// The original v1 storage entry remains untouched as a recovery copy.
export function migrateLegacy(legacy, masterPin) {
  const old = validateLegacy(legacy);
  const folders = [];
  const reels = [];
  const names = new Set();
  for (const profile of old.profiles) {
    const folderIds = new Map();
    for (const f of profile.folders) {
      const id = uid();
      folderIds.set(f.id, id);
      let name = f.name;
      let suffix = 2;
      while (names.has(name.toLowerCase()))
        name = `${f.name.slice(0, 50)} (${suffix++})`;
      names.add(name.toLowerCase());
      folders.push({ id, name, pin: null });
    }
    reels.push(
      ...profile.reels.map((r) => ({
        ...r,
        id: uid(),
        folderId: r.folderId ? folderIds.get(r.folderId) : null,
      })),
    );
  }
  return validateData({ ...emptyData(), masterPin, folders, reels });
}

export function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === null ? emptyData() : validateData(JSON.parse(saved));
}
export function loadLegacyData() {
  if (localStorage.getItem(STORAGE_KEY) !== null) return null;
  const saved = localStorage.getItem(LEGACY_KEY);
  if (saved === null) return null;
  const result = validateLegacy(JSON.parse(saved));
  return result.profiles.length ? result : null;
}
export function saveData(next, expectedRevision) {
  if (loadData().revision !== expectedRevision)
    throw new Error(
      "Your library changed in another tab. Reload before saving.",
    );
  const validated = validateData({ ...next, revision: expectedRevision + 1 });
  const serialized = JSON.stringify(validated);
  if (new Blob([serialized]).size > MAX_BACKUP_BYTES)
    throw new Error(
      "Your library is too large. Export a backup and remove unused reels.",
    );
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    throw new Error(
      "Could not save. Browser storage may be full or unavailable. Export a backup and free some space.",
    );
  }
  return validated;
}
export function exportData(data) {
  const blob = new Blob([JSON.stringify(validateData(data), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reelbag-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readBackup(file) {
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("Backups must be smaller than 10 MB.");
  try {
    const raw = JSON.parse(await file.text());
    return raw?.version === 1 ? validateLegacy(raw) : validateData(raw);
  } catch (error) {
    throw new Error(
      error instanceof SyntaxError
        ? "This file is not valid JSON."
        : error.message,
    );
  }
}
