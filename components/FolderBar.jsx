"use client";

import { Folder, FolderPlus, LockKeyhole, Pencil } from "lucide-react";

export default function FolderBar({
  folders,
  selected,
  unlocked,
  onSelect,
  onCreate,
  onEdit,
}) {
  const current = folders.find((f) => f.id === selected);
  return (
    <div className="folder-controls">
      <label className="folder-select">
        <Folder size={16} />
        <span className="sr-only">Folders</span>
        <select
          aria-label="Folders"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="all">All reels</option>
          <option value="pinned">Pinned</option>
          <option value="favorites">Favorites</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.pin && !unlocked.has(f.id) ? "🔒 " : ""}
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <button
          className="icon-button"
          aria-label="Edit folder"
          title="Edit folder"
          onClick={() => onEdit(current)}
        >
          <Pencil size={16} />
        </button>
      )}
      {current?.pin && (
        <button
          className="icon-button"
          aria-label="Lock folder"
          title="Lock folder"
          onClick={() => onSelect("all", current.id)}
        >
          <LockKeyhole size={16} />
        </button>
      )}
      <button
        className="icon-button folder-create"
        onClick={onCreate}
        aria-label="New folder"
        title="New folder"
      >
        <FolderPlus size={17} />
      </button>
    </div>
  );
}
