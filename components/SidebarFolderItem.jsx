"use client";
import { Folder, LockKeyhole, Users } from "lucide-react";
import FolderMenu from "./FolderMenu";
import FolderMembersPopover from "./FolderMembersPopover";

export default function SidebarFolderItem({
  folder,
  selected,
  onSelect,
  onRename,
  onShare,
  onDelete,
  onLock,
  onChangeRole,
}) {
  const owner = folder.role === "owner";
  const active = selected === folder.id;
  return (
    <div className={`sidebar-folder-row ${active ? "is-active" : ""} ${folder.isShared ? "has-members" : ""}`}>
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
        <span className="sidebar-label">{folder.name}</span>
      </button>
      {folder.isShared && (
        <FolderMembersPopover folder={folder} onChangeRole={onChangeRole} />
      )}
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
