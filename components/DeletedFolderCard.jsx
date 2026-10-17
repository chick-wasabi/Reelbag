"use client";

import { Folder, RefreshCw, Trash2 } from "lucide-react";
import FolderGlyph from "./FolderGlyph";

export default function DeletedFolderCard({ folder, onRestore, onPermanentDelete }) {
  return (
    <article className="deleted-folder-card">
      <div className="deleted-folder-art">
        <span><FolderGlyph icon={folder.icon} size={42} /></span>
      </div>
      <div className="deleted-folder-copy">
        <div>
          <small>Deleted folder</small>
          <h2>{folder.name}</h2>
          <p><Folder size={13} /> {folder.reelCount} {folder.reelCount === 1 ? "Reel" : "Reels"} preserved</p>
        </div>
        <div className="deleted-folder-actions">
          <button className="button-secondary" onClick={onRestore}><RefreshCw size={15} /> Restore</button>
          <button className="button-danger" onClick={onPermanentDelete}><Trash2 size={15} /> Delete permanently</button>
        </div>
      </div>
    </article>
  );
}
