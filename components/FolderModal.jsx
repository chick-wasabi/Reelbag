"use client";

import { useState } from "react";
import { Folder, LockKeyhole } from "lucide-react";
import Modal from "./Modal";
import FolderGlyph from "./FolderGlyph";
import { FOLDER_ICONS } from "../utils/folder-icons.mjs";

export default function FolderModal({ folder, onSave, onClose }) {
  const [name, setName] = useState(folder?.name || "");
  const [icon, setIcon] = useState(folder?.icon || "folder");
  const [protectedFolder, setProtected] = useState(Boolean(folder?.pin));
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (protectedFolder && (pin || !folder?.pin) && !/^\d{4}$/.test(pin))
        throw new Error("Folder PINs must be exactly 4 digits.");
      await onSave({
        id: folder?.id,
        name: name.trim(),
        icon,
        protected: protectedFolder,
        pin,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={folder ? "Folder settings" : "New folder"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} className="form-stack">
        <label className="field-label">
          Folder name
          <input
            data-autofocus
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bike Riding"
            disabled={busy}
          />
        </label>
        <fieldset className="folder-icon-picker">
          <legend>Folder icon</legend>
          <div>
            {FOLDER_ICONS.map((option) => (
              <button key={option} type="button" className={icon === option ? "active" : ""}
                aria-label={`Use ${option} folder icon`} aria-pressed={icon === option}
                onClick={() => setIcon(option)} disabled={busy}>
                <FolderGlyph icon={option} size={18} />
              </button>
            ))}
          </div>
        </fieldset>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={protectedFolder}
            onChange={(e) => setProtected(e.target.checked)}
            disabled={busy}
          />
          <LockKeyhole size={16} />
          Protect with a PIN
        </label>
        {protectedFolder && (
          <label className="field-label">
            {folder?.pin
              ? "New 4-digit PIN (leave blank to keep)"
              : "4-digit folder PIN"}
            <input
              required={!folder?.pin}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              minLength={4}
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button
          className="button-primary w-full"
          disabled={busy || !name.trim()}
        >
          <Folder size={16} />
          {busy ? "Saving…" : folder ? "Save folder" : "Create folder"}
        </button>
      </form>
    </Modal>
  );
}
