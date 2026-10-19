"use client";

import { useState } from "react";
import { Pin, Plus } from "lucide-react";
import Modal from "./Modal";
import { parseReelUrl, uid } from "../utils/reels.mjs";

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
  const [busy, setBusy] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [pinned, setPinned] = useState(Boolean(draft?.isPinned));
  async function submit(event) {
    event.preventDefault();
    const parsed = parseReelUrl(url);
    if (!parsed) {
      setError("Enter a valid Instagram Reel or post link.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        id: reel?.id || uid(),
        ...parsed,
        title: title.trim() || "Reelbag",
        folderId: folder || null,
        ...(!reel ? { isPinned: pinned } : {}),
        createdAt: reel?.createdAt || new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={reel ? "Edit reel" : "Add reel"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <label className="field-label">
          Instagram Reel or Post Link
          <input
            data-autofocus={!draft}
            required
            type="url"
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/… or /p/…"
          />
        </label>
        <label className="field-label">
          Title / Name <span className="font-normal text-zinc-500">(optional)</span>
          <input
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Something to remember this by"
          />
        </label>
        {!reel && <label className="field-label">
          Folder <span className="font-normal text-zinc-500">(optional)</span>
          <select data-autofocus={Boolean(draft)} value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.pin ? "🔒 " : ""}
                {f.name}
              </option>
            ))}
          </select>
        </label>}
        {!reel && <button
          className="inline-action"
          type="button"
          disabled={busy}
          onClick={() => setCreatingFolder((value) => !value)}
        >
          <Plus size={14} />
          Create New Folder
        </button>}
        {!reel && creatingFolder && (
          <div className="inline-folder-create">
            <input
              autoFocus
              value={folderName}
              maxLength={60}
              placeholder="New folder name"
              aria-label="New folder name"
              onChange={(event) => setFolderName(event.target.value)}
            />
            <button
              type="button"
              className="button-secondary"
              disabled={folderBusy || !folderName.trim()}
              onClick={async () => {
                setFolderBusy(true);
                setError("");
                try {
                  const id = await onCreateFolder(folderName.trim());
                  setFolder(id);
                  setFolderName("");
                  setCreatingFolder(false);
                } catch (err) {
                  setError(err.message);
                } finally {
                  setFolderBusy(false);
                }
              }}
            >
              {folderBusy ? "Creating…" : "Create"}
            </button>
          </div>
        )}
        {!reel && (
          <button
            className={`reel-pin-on-add ${pinned ? "is-active" : ""}`}
            type="button"
            aria-pressed={pinned}
            disabled={busy}
            onClick={() => setPinned((value) => !value)}
          >
            <Pin size={15} fill={pinned ? "currentColor" : "none"} />
            <span>{pinned ? "Pinned when saved" : "Pin this Reel"}</span>
          </button>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button
          className="button-primary w-full"
          disabled={busy || !parseReelUrl(url)}
        >
          {busy ? "Checking Instagram…" : reel ? "Save changes" : "Save to Reelbag"}
        </button>
      </form>
    </Modal>
  );
}
