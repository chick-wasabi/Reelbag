"use client";
import Avatar from "./Avatar";
import {
  AVATARS,
  AVATAR_FRAMES,
  DEFAULT_AVATAR_FRAME,
} from "../utils/avatars.mjs";
export default function AvatarPicker({
  value,
  onChange,
  frame = DEFAULT_AVATAR_FRAME,
  onFrameChange,
  disabled,
}) {
  return (
    <fieldset className="avatar-picker" disabled={disabled}>
      <legend className="field-label">Profile avatar</legend>
      <details>
        <summary>
          <Avatar url={value} frame={frame} size={44} name="Selected avatar" />
          <span>Choose your avatar</span>
        </summary>
        <div className="avatar-grid" role="group" aria-label="30 premium avatars">
          {AVATARS.map((avatar) => (
            <button
              type="button"
              key={avatar.seed}
              aria-label={`Choose ${avatar.name} avatar`}
              aria-pressed={value === avatar.url}
              onClick={() => onChange(avatar.url)}
            >
              <Avatar
                url={avatar.url}
                frame="none"
                name={avatar.name}
                size={48}
              />
            </button>
          ))}
        </div>
      </details>
      {onFrameChange && (
        <fieldset className="avatar-frame-picker">
          <legend className="field-label">Avatar frame</legend>
          <div className="avatar-frame-grid">
            {AVATAR_FRAMES.map((option) => (
              <button
                type="button"
                key={option.id}
                aria-label={`Use ${option.name} avatar frame`}
                aria-pressed={frame === option.id}
                title={option.description}
                onClick={() => onFrameChange(option.id)}
              >
                <Avatar
                  url={value}
                  frame={option.id}
                  name={`${option.name} frame preview`}
                  size={46}
                />
                <span>{option.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </fieldset>
  );
}
