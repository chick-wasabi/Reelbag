"use client";
import { useState } from "react";
import { FolderInput } from "lucide-react";
import Modal from "./Modal";

export default function MoveReelModal({ reel, folders, onSave, onClose }) {
  const [folderId, setFolderId] = useState(reel.folderId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Move reel"
      description={reel.title}
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
          Move to folder
          <select
            aria-label="Move to folder"
            data-autofocus
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            disabled={busy}
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.pin ? "🔒 " : ""}
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="button-primary" disabled={busy}>
          <FolderInput size={17} />
          {busy ? "Moving…" : "Move reel"}
        </button>
      </form>
    </Modal>
  );
}
