"use client";

import FolderMenu from "./FolderMenu";
import { FolderPlus, LockKeyhole, Users } from "lucide-react";

export default function FolderBar({
  folders,
  selected,
  unlocked,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onLock,
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
          { id: "shared", name: "Shared with me", virtual: true },
          ...folders,
        ].map((folder) => (
          <button
            key={folder.id}
            className={selected === folder.id ? "active" : ""}
            aria-label={`Filter ${folder.name}`}
            aria-pressed={selected === folder.id}
            onClick={() => onSelect(folder.id)}
          >
            {folder.virtual && <Users size={13} />}
            {folder.pin && !unlocked.has(folder.id) && (
              <LockKeyhole size={13} />
            )}
            {folder.name}
          </button>
        ))}
      </nav>
      {current && (
        <FolderMenu
          folder={current}
          onRename={onRename}
          onShare={onShare}
          onDelete={onDelete}
          onLock={onLock}
          onSelect={onSelect}
        />
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
