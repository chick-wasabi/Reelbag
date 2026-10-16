"use client";

import { FolderPlus, LockKeyhole, Pencil, Share2 } from "lucide-react";

export default function FolderBar({
  folders,
  selected,
  unlocked,
  onSelect,
  onCreate,
  onEdit,
  onShare,
}) {
  const current = folders.find((f) => f.id === selected);
  return (
    <div className="folder-controls">
      <nav className="folder-tabs" aria-label="Reel filters">
        {[
          { id: "all", name: "All reels" },
          { id: "pinned", name: "Pinned" },
          { id: "favorites", name: "Favorites" },
          ...folders,
        ].map((folder) => (
          <button
            key={folder.id}
            className={selected === folder.id ? "active" : ""}
            aria-label={`Filter ${folder.name}`}
            aria-pressed={selected === folder.id}
            onClick={() => onSelect(folder.id)}
          >
            {folder.pin && !unlocked.has(folder.id) && (
              <LockKeyhole size={13} />
            )}
            {folder.name}
          </button>
        ))}
      </nav>
      {current && <span className="current-folder-name">{current.name}</span>}
      {current && current.role === "owner" && (
        <button
          className="icon-button"
          aria-label="Edit folder"
          title="Edit folder"
          onClick={() => onEdit(current)}
        >
          <Pencil size={16} />
        </button>
      )}
      {current?.role === "owner" && (
        <button
          className="icon-button"
          aria-label="Share folder"
          title="Share folder"
          onClick={() => onShare(current)}
        >
          <Share2 size={16} />
        </button>
      )}
      {current && current.role !== "owner" && (
        <span className="shared-role">{current.role}</span>
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
