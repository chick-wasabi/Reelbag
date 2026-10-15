"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import Modal from "./Modal";
import { parseReelUrl, uid } from "../utils/storage";

export default function ReelModal({
  reel,
  draft,
  folders,
  folderId,
  initialUrl = "",
  onSave,
  onCreateFolder,
  onClose,
}) {
  const [url, setUrl] = useState(draft?.url ?? reel?.url ?? initialUrl);
  const [title, setTitle] = useState(draft?.title ?? reel?.title ?? "");
  const [folder, setFolder] = useState(
    draft?.folderId ?? reel?.folderId ?? folderId ?? "",
  );
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    const parsed = parseReelUrl(url);
    if (!parsed) {
      setError("Enter a valid Instagram Reel link.");
      return;
    }
    try {
      onSave({
        id: reel?.id || uid(),
        ...parsed,
        title: title.trim(),
        folderId: folder || null,
        createdAt: reel?.createdAt || new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Modal title={reel ? "Edit reel" : "Add reel"} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field-label">
          Instagram Reel Link
          <input
            data-autofocus
            required
            type="url"
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/…"
          />
        </label>
        <label className="field-label">
          Title / Name
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A name to remember it by"
          />
        </label>
        <label className="field-label">
          Folder <span className="font-normal text-zinc-500">(optional)</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.pin ? "🔒 " : ""}
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="inline-action"
          type="button"
          onClick={() => onCreateFolder({ url, title, folderId: folder })}
        >
          <Plus size={14} />
          Create New Folder
        </button>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="button-primary w-full" disabled={!title.trim()}>
          {reel ? "Save changes" : "Save reel"}
        </button>
      </form>
    </Modal>
  );
}
