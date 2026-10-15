"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import Modal from "./Modal";
import SettingsPanel from "./SettingsPanel";
import AvatarPicker from "./AvatarPicker";
import { DEFAULT_AVATAR } from "../utils/avatars.mjs";
export default function SettingsModal({
  user,
  onClose,
  onSaveProfile,
  onLogout,
  ...settings
}) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || DEFAULT_AVATAR);
  const [passwordHint, setPasswordHint] = useState(user.passwordHint || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      title="Settings"
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
            await onSaveProfile({ avatarUrl, passwordHint });
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
          Password hint (optional)
          <input
            value={passwordHint}
            maxLength={160}
            disabled={busy}
            onChange={(e) => setPasswordHint(e.target.value)}
            placeholder="A clue only you would understand"
          />
        </label>
        <p className="fine-print !mt-0">
          Your hint is visible during recovery to anyone who knows your
          username. Never include your password or recovery answer.
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
      <SettingsPanel user={user} {...settings} />
      <button
        className="button-quiet w-full mt-4"
        onClick={onLogout}
        disabled={busy}
      >
        <LogOut size={17} />
        Sign out
      </button>
    </Modal>
  );
}
