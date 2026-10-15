import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../utils/storage.js', import.meta.url), 'utf8');
const { emptyData, parseReelUrl, hashPin, verifyPin, validateData, saveData, loadData, STORAGE_KEY, readBackup, MAX_BACKUP_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const credential = await hashPin('123456');
const fixture = () => ({ version: 1, revision: 0, profiles: [{ id: 'p1', name: 'Personal', color: 'lime', pin: credential, folders: [{ id: 'f1', name: 'Rides', color: 'sky' }], reels: [{ id: 'r1', title: 'Mountain route', note: '', url: 'https://www.instagram.com/reel/ABC_123/?igsh=tracking', shortcode: 'ABC_123', folderId: 'f1', status: 'To Try', createdAt: new Date().toISOString() }] }] });

test('normalizes reel links and strips tracking while rejecting unsafe hosts and paths', () => {
  assert.deepEqual(parseReelUrl('https://m.instagram.com/reels/Abc_-1/?igsh=test'), { shortcode: 'Abc_-1', url: 'https://www.instagram.com/reel/Abc_-1/' });
  for (const value of ['https://instagram.com.evil.com/reel/ABC/', 'javascript:alert(1)', 'https://evil.com/reel/ABC/', 'https://instagram.com/p/ABC/', 'https://instagram.com/reel/ABC/extra', 'https://user:pass@instagram.com/reel/ABC/', null]) assert.equal(parseReelUrl(value), null);
});
test('PINs use distinct salts and verify only the matching PIN', async () => {
  const other = await hashPin('123456');
  assert.notEqual(credential.salt, other.salt); assert.notEqual(credential.hash, other.hash);
  assert.equal(await verifyPin('123456', credential), true); assert.equal(await verifyPin('000000', credential), false);
  await assert.rejects(hashPin('123')); await assert.rejects(hashPin('abcd'));
});
test('validates full backups and discards unknown properties', () => {
  const raw = fixture(); raw.injected = 'bad'; raw.profiles[0].pin.rawPin = 'bad';
  const clean = validateData(raw);
  assert.equal(clean.injected, undefined); assert.equal(clean.profiles[0].pin.rawPin, undefined);
  assert.equal(clean.profiles[0].reels[0].url, 'https://www.instagram.com/reel/ABC_123/');
  assert.deepEqual(validateData(emptyData()), emptyData());
});
test('rejects broken relationships, unsafe URLs, duplicate IDs, and extreme hashing work', () => {
  const mutations = [d => d.profiles[0].reels[0].folderId = 'missing', d => d.profiles[0].reels[0].status = 'invalid', d => d.profiles[0].reels[0].url = 'https://evil.com/reel/abc', d => d.profiles.push(d.profiles[0]), d => d.profiles[0].pin = { ...credential, iterations: 999999999 }, d => d.profiles[0].reels[0].createdAt = 'invalid'];
  for (const mutate of mutations) { const d = fixture(); mutate(d); assert.throws(() => validateData(d)); }
});
test('storage round trips, refuses stale writes, and preserves saved data on quota failure', () => {
  const memory = new Map(); globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.deepEqual(loadData(), emptyData());
  const saved = saveData(fixture(), 0); assert.equal(saved.revision, 1); assert.deepEqual(loadData(), saved);
  assert.throws(() => saveData(fixture(), 0), /another tab/);
  const before = memory.get(STORAGE_KEY);
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => saveData(saved, 1), /Could not save/); assert.equal(memory.get(STORAGE_KEY), before);
  memory.set(STORAGE_KEY, '{broken'); assert.throws(() => loadData());
});
test('backup file reader rejects oversized and malformed files and accepts a real backup', async () => {
  const original = fixture();
  assert.deepEqual(await readBackup(new File([JSON.stringify(original)], 'backup.json')), validateData(original));
  await assert.rejects(readBackup(new File(['{invalid'], 'bad.json')), /not valid JSON/);
  await assert.rejects(readBackup({ size: MAX_BACKUP_BYTES + 1 }), /10 MB/);
});
