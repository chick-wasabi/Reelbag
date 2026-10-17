"use client";
import { useState } from "react";
import { FolderInput, FolderPlus } from "lucide-react";
import Modal from "./Modal";

export default function MoveReelModal({ reel, folders, onSave, onClose, onCreateFolder, initialFolderId, copy = false, title }) {
  const [folderId, setFolderId] = useState(initialFolderId || (copy ? "" : (reel?.folderId || "")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={title || (copy ? "Add to folder" : "Move reel")}
      description={reel?.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(folderId || null);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          {copy ? "Add a separate copy to" : "Move to folder"}
          <select
            aria-label="Move to folder"
            data-autofocus
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            disabled={busy}
          >
            <option value="">{copy ? "Choose a folder" : "No folder"}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.pin ? "🔒 " : ""}
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        {onCreateFolder && <button type="button" className="button-secondary" disabled={busy} onClick={onCreateFolder}>
          <FolderPlus size={17} /> Create new folder
        </button>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="button-primary" disabled={busy || (copy && !folderId)}>
          <FolderInput size={17} />
          {busy ? (copy ? "Adding…" : "Moving…") : (copy ? "Add copy" : "Move reel")}
        </button>
      </form>
    </Modal>
  );
}
