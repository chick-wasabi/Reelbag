"use client";
import { Folder, FolderPlus, LockKeyhole, Pencil } from "lucide-react";

export default function FoldersPanel({
  folders,
  counts,
  onSelect,
  onCreate,
  onEdit,
}) {
  return (
    <div className="form-stack">
      <button className="button-secondary" onClick={onCreate}>
        <FolderPlus size={17} />
        Create folder
      </button>
      <div className="folder-browser">
        {folders.map((folder) => (
          <div key={folder.id} className="folder-browser-row">
            <button
              onClick={() => onSelect(folder.id)}
              className="folder-browser-open"
            >
              {folder.pin && !folder.unlocked ? (
                <LockKeyhole size={18} />
              ) : (
                <Folder size={18} />
              )}
              <span>
                {folder.name}
                <small>
                  {folder.pin && !folder.unlocked
                    ? "PIN protected"
                    : `${counts[folder.id] || 0} reels`}
                </small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={`Manage ${folder.name}`}
              onClick={() => onEdit(folder)}
            >
              <Pencil size={15} />
            </button>
          </div>
        ))}
      </div>
      {!folders.length && (
        <p className="muted-copy">
          Create a folder for the ideas you want to come back to.
        </p>
      )}
    </div>
  );
}
