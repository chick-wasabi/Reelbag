"use client";
import { useState } from "react";
import Modal from "./Modal";
import AvatarPicker from "./AvatarPicker";
import {
  DEFAULT_AVATAR,
  DEFAULT_AVATAR_FRAME,
} from "../utils/avatars.mjs";
import { DEFAULT_APPEARANCE } from "../utils/preferences.mjs";
export default function ProfileModal({ user, onClose, onSaveProfile }) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || DEFAULT_AVATAR);
  const [avatarFrame, setAvatarFrame] = useState(
    user.appearance?.avatarFrame || DEFAULT_AVATAR_FRAME,
  );
  const [displayName, setDisplayName] = useState(
    user.displayName || user.username,
  );
  const [profileVisibility, setProfileVisibility] = useState(user.profileVisibility || "friends");
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
            await onSaveProfile({
              avatarUrl,
              displayName,
              appearance: {
                ...DEFAULT_APPEARANCE,
                ...user.appearance,
                avatarFrame,
              },
              profileVisibility,
            });
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
          frame={avatarFrame}
          onFrameChange={setAvatarFrame}
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
        <label className="field-label">
          Who can view your profile
          <select value={profileVisibility} disabled={busy} onChange={(event) => setProfileVisibility(event.target.value)}>
            <option value="public">Everyone</option>
            <option value="friends">Friends only</option>
            <option value="private">Only me</option>
          </select>
        </label>
        <p className="fine-print !mt-0">Choose “Feature on Profile” from any Reel menu to build your profile showcase.</p>
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
