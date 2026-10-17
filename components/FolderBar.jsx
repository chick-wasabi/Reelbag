"use client";

import FolderMenu from "./FolderMenu";
import { FolderPlus, LockKeyhole, MoreHorizontal, Trash2, Users } from "lucide-react";
import FolderMembersPopover from "./FolderMembersPopover";
import FolderGlyph from "./FolderGlyph";

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
  onTrashSettings,
  onChangeRole,
  onLeaveFolder,
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
          { id: "trash", name: "Recently deleted", trash: true },
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
            {folder.trash && <Trash2 size={13} />}
            {folder.pin && !unlocked.has(folder.id) && (
              <LockKeyhole size={13} />
            )}
            {!folder.virtual && !folder.trash && !(folder.pin && !unlocked.has(folder.id)) && <FolderGlyph icon={folder.icon} size={13} />}
            {folder.name}
          </button>
        ))}
      </nav>
      {current && (
        <>
          {current.isShared && <FolderMembersPopover folder={current} onChangeRole={onChangeRole} mobile />}
          <FolderMenu
            folder={current}
            onRename={onRename}
            onShare={onShare}
            onDelete={onDelete}
            onLock={onLock}
            onSelect={onSelect}
            onLeave={onLeaveFolder}
          />
        </>
      )}
      {selected === "trash" && (
        <button className="icon-button" onClick={onTrashSettings} aria-label="Recently Deleted settings" title="Recently Deleted settings">
          <MoreHorizontal size={17} />
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
