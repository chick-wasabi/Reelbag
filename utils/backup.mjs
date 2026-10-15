import { parseReelUrl } from "./reels.mjs";
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function validateBackup(raw) {
  const fail = () => {
    throw new Error("Choose a valid Reelbag cloud backup.");
  };
  const text = (value, max) => {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      fail();
    return value.trim();
  };
  if (
    !raw ||
    raw.version !== 3 ||
    !Array.isArray(raw.folders) ||
    !Array.isArray(raw.reels) ||
    raw.folders.length > 500 ||
    raw.reels.length > 10000
  )
    fail();
  const folders = raw.folders.map((f) => ({
    id: text(f?.id, 100),
    name: text(f?.name, 60),
  }));
  if (
    new Set(folders.map((f) => f.id)).size !== folders.length ||
    new Set(folders.map((f) => f.name.toLowerCase())).size !== folders.length
  )
    fail();
  const reels = raw.reels.map((r) => {
    const parsed = parseReelUrl(r?.url);
    if (
      !parsed ||
      (r.folderId !== null && !folders.some((f) => f.id === r.folderId))
    )
      fail();
    return { title: text(r.title, 200), url: parsed.url, folderId: r.folderId };
  });
  return { version: 3, folders, reels };
}
export function downloadBackup(data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(validateBackup(data), null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `reelbag-cloud-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
