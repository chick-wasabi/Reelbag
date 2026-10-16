"use client";
import { Folder, LockKeyhole, Users } from "lucide-react";
import FolderMenu from "./FolderMenu";

export default function SidebarFolderItem({
  folder,
  selected,
  onSelect,
  onRename,
  onShare,
  onDelete,
  onLock,
}) {
  const owner = folder.role === "owner";
  const active = selected === folder.id;
  return (
    <div className={`sidebar-folder-row ${active ? "is-active" : ""}`}>
      <button
        className={`sidebar-link folder-link ${active ? "active" : ""}`}
        aria-label={`Open ${owner ? "" : "shared "}folder ${folder.name}`}
        aria-current={active ? "page" : undefined}
        title={owner ? folder.name : `${folder.name} — ${folder.role}`}
        onClick={() => onSelect(folder.id)}
      >
        {!owner ? (
          <Users size={17} />
        ) : folder.pin && !folder.unlocked ? (
          <LockKeyhole size={17} />
        ) : (
          <Folder size={17} />
        )}
        <span className="sidebar-label">
          {folder.name}
          {!owner && <small className="shared-role">{folder.role}</small>}
        </span>
        {owner && folder.isShared && (
          <Users
            className="sidebar-share-badge"
            size={13}
            aria-label="Shared folder"
          />
        )}
      </button>
      <FolderMenu
        folder={folder}
        onRename={onRename}
        onShare={onShare}
        onDelete={onDelete}
        onLock={onLock}
        onSelect={onSelect}
      />
    </div>
  );
}
