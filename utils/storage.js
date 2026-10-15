export const STORAGE_KEY = 'reelbag.v1';
export const STATUSES = ['To Try', 'In Progress', 'Completed'];
export const COLORS = ['lime', 'violet', 'pink', 'sky', 'amber'];
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const ITERATIONS = 210000;
const encoder = new TextEncoder();

export function emptyData() { return { version: 1, revision: 0, profiles: [] }; }
export function uid() { return crypto.randomUUID(); }

export function parseReelUrl(input) {
  try {
    const url = new URL(input.trim());
    if (!['https:', 'http:'].includes(url.protocol) || !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname) || url.username || url.password) return null;
    const match = url.pathname.match(/^\/reels?\/([A-Za-z0-9_-]{1,100})\/?$/);
    return match ? { shortcode: match[1], url: `https://www.instagram.com/reel/${match[1]}/` } : null;
  } catch { return null; }
}

function hex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
async function derive(pin, salt, iterations) {
  if (!globalThis.crypto?.subtle) throw new Error('PIN protection needs HTTPS or localhost. Open Reelbag using a secure connection.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' }, key, 256)));
}
export async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Choose a PIN with 4–8 digits.');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS };
}
export async function verifyPin(pin, credential) {
  const result = await derive(pin, credential.salt, credential.iterations);
  let different = result.length ^ credential.hash.length;
  for (let i = 0; i < result.length; i++) different |= result.charCodeAt(i) ^ credential.hash.charCodeAt(i);
  return different === 0;
}

function fail() { throw new Error('This backup is not a valid Reelbag v1 file. Your current data has not been changed.'); }
function text(value, max, allowEmpty = false) { if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) fail(); return value; }
function list(value, max) { if (!Array.isArray(value) || value.length > max) fail(); return value; }
function unique(items) { if (new Set(items.map(x => x.id)).size !== items.length) fail(); }

// Reconstruct a whitelisted shape. Never trust backup objects or URL strings.
export function validateData(raw) {
  if (!raw || raw.version !== 1) fail();
  const profiles = list(raw.profiles, 100).map(p => {
    if (!p || !COLORS.includes(p.color) || !p.pin || !/^[a-f0-9]{32}$/.test(p.pin.salt) || !/^[a-f0-9]{64}$/.test(p.pin.hash) || !Number.isInteger(p.pin.iterations) || p.pin.iterations < 100000 || p.pin.iterations > 1000000) fail();
    const folders = list(p.folders, 500).map(f => ({ id: text(f.id, 100), name: text(f.name, 60), color: COLORS.includes(f.color) ? f.color : 'lime' }));
    unique(folders);
    const reels = list(p.reels, 10000).map(r => {
      const parsed = parseReelUrl(r?.url || '');
      if (!parsed || !STATUSES.includes(r.status) || (r.folderId !== null && !folders.some(f => f.id === r.folderId)) || typeof r.createdAt !== 'string' || r.createdAt.length > 40 || !Number.isFinite(Date.parse(r.createdAt))) fail();
      return { id: text(r.id, 100), title: text(r.title, 200), note: text(r.note ?? '', 2000, true), url: parsed.url, shortcode: parsed.shortcode, folderId: r.folderId, status: r.status, createdAt: r.createdAt };
    });
    unique(reels);
    return { id: text(p.id, 100), name: text(p.name, 40), color: p.color, pin: { salt: p.pin.salt, hash: p.pin.hash, iterations: p.pin.iterations }, folders, reels };
  });
  unique(profiles);
  return { version: 1, revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0, profiles };
}

export function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === null ? emptyData() : validateData(JSON.parse(saved));
}

export function saveData(next, expectedRevision) {
  const current = loadData();
  if (current.revision !== expectedRevision) throw new Error('Your library changed in another tab. Reload this page before making more changes.');
  const validated = validateData({ ...next, revision: expectedRevision + 1 });
  const serialized = JSON.stringify(validated);
  if (new Blob([serialized]).size > MAX_BACKUP_BYTES) throw new Error('Your library is too large. Export a backup and remove unused reels.');
  try { localStorage.setItem(STORAGE_KEY, serialized); }
  catch { throw new Error('Could not save. Browser storage may be full or unavailable. Export your data and free some storage.'); }
  return validated;
}

export function exportData(data) {
  const blob = new Blob([JSON.stringify(validateData(data), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `reelbag-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file) {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Backups must be smaller than 10 MB.');
  try { return validateData(JSON.parse(await file.text())); }
  catch (error) { throw new Error(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a Reelbag backup.' : error.message); }
}
