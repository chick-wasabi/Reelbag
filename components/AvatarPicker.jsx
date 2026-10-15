"use client";
import Avatar from "./Avatar";
import { AVATARS } from "../utils/avatars.mjs";
export default function AvatarPicker({ value, onChange, disabled }) {
  return (
    <fieldset className="avatar-picker" disabled={disabled}>
      <legend className="field-label">Profile avatar</legend>
      <details>
        <summary>
          <Avatar url={value} size={40} name="Selected avatar" />
          <span>Choose your avatar</span>
        </summary>
        <div className="avatar-grid" role="group" aria-label="30 pixel avatars">
          {AVATARS.map((avatar) => (
            <button
              type="button"
              key={avatar.seed}
              aria-label={`Choose ${avatar.name} avatar`}
              aria-pressed={value === avatar.url}
              onClick={() => onChange(avatar.url)}
            >
              <Avatar url={avatar.url} name={avatar.name} size={38} />
            </button>
          ))}
        </div>
      </details>
    </fieldset>
  );
}
