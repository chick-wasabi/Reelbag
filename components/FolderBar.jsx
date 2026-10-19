"use client";

import FolderMenu from "./FolderMenu";
import { Folder, Grid2X2, LockKeyhole, MoreHorizontal, Plus, Users } from "lucide-react";
import FolderGlyph from "./FolderGlyph";

export default function FolderBar({
  folders,
  selected,
  unlocked,
  onSelect,
  onRename,
  onDelete,
  onLock,
  onShare,
  onTrashSettings,
  onLeaveFolder,
  onProtectSharedFolder,
  onAdd,
}) {
  const current = folders.find((f) => f.id === selected);
  return (
    <div className="folder-controls">
      <nav className="folder-tabs" aria-label="Library navigation">
        <button className={selected === "all" ? "active" : ""} aria-pressed={selected === "all"} onClick={() => onSelect("all")}>
          <Grid2X2 size={17} /><span>All</span>
        </button>
        <button className={selected === "shared" ? "active" : ""} aria-pressed={selected === "shared"} onClick={() => onSelect("shared")}>
          <Users size={17} /><span>Shared</span>
        </button>
        <details className="mobile-folder-picker">
          <summary className={current ? "active" : ""} aria-label="Choose folder">
            <Folder size={17} /><span>Folders</span>
          </summary>
          <div className="mobile-folder-picker-panel">
            {folders.length ? folders.map((folder) => (
          <button
            key={folder.id}
            className={selected === folder.id ? "active" : ""}
            aria-label={`Filter ${folder.name}`}
            aria-pressed={selected === folder.id}
            onClick={(event) => {
              onSelect(folder.id);
              const picker = event.currentTarget.closest("details");
              if (picker) picker.open = false;
            }}
          >
            {folder.pin && !unlocked.has(folder.id) && (
              <LockKeyhole size={13} />
            )}
            {!(folder.pin && !unlocked.has(folder.id)) && <FolderGlyph icon={folder.icon} size={13} />}
            {folder.name}
          </button>
            )) : <p>No folders yet</p>}
          </div>
        </details>
        <button className="mobile-dock-add" onClick={onAdd}>
          <Plus size={20} /><span>Add</span>
        </button>
      </nav>
      {current && (
        <>
          <FolderMenu
            folder={current}
            onRename={onRename}
            onShare={onShare}
            onDelete={onDelete}
            onLock={onLock}
            onSelect={onSelect}
            onLeave={onLeaveFolder}
            onProtect={onProtectSharedFolder}
          />
        </>
      )}
      {selected === "trash" && (
        <button className="icon-button" onClick={onTrashSettings} aria-label="Recently Deleted settings" title="Recently Deleted settings">
          <MoreHorizontal size={17} />
        </button>
      )}
    </div>
  );
}
