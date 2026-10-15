"use client";
import { useState } from "react";
import Modal from "./Modal";
import AvatarPicker from "./AvatarPicker";
import { DEFAULT_AVATAR } from "../utils/avatars.mjs";
export default function ProfileModal({ user, onClose, onSaveProfile }) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || DEFAULT_AVATAR);
  const [displayName, setDisplayName] = useState(
    user.displayName || user.username,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      title="Profile"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form-stack profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            await onSaveProfile({ avatarUrl, displayName });
            setSaved(true);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <AvatarPicker
          value={avatarUrl}
          onChange={setAvatarUrl}
          disabled={busy}
        />
        <label className="field-label">
          Display name
          <input
            value={displayName}
            maxLength={60}
            disabled={busy}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.username}
          />
        </label>
        <p className="fine-print !mt-0">
          Your login username stays @{user.username}.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="success-text" role="status">
            Profile saved.
          </p>
        )}
        <button className="button-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </form>
    </Modal>
  );
}
