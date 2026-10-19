"use client";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { DEFAULT_APPEARANCE } from "../utils/preferences.mjs";
const BASIC_SWATCHES = [
  ["Neon Green", "#b5f36d"], ["Electric Blue", "#3b82f6"],
  ["Purple", "#a855f7"], ["Rose", "#f43f5e"],
  ["Amber", "#f59e0b"], ["Cyan", "#06b6d4"],
];
const NEO_SWATCHES = {
  dark: [
    ["Bubblegum", "#ff5da2"], ["Electric Lemon", "#f8e748"],
    ["Pool Blue", "#45d9e8"], ["Tangerine", "#ff8a3d"],
    ["Orchid", "#bc7aff"], ["Mint", "#69e6a6"],
  ],
  light: [
    ["Cobalt", "#3157d5"], ["Tomato", "#e94f37"],
    ["Royal Purple", "#7746c8"], ["Forest", "#20845b"],
    ["Hot Pink", "#d93683"], ["Burnt Orange", "#cf651f"],
  ],
};
function normalizeHex(value) {
  const hex = value.trim().replace(/^#/, "");
  if (/^[a-f0-9]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[a-f0-9]{3}$/i.test(hex))
    return `#${hex.toLowerCase().split("").map((c) => c + c).join("")}`;
  return null;
}
export default function AppearanceModal({ value, onSave, onClose, onPreview }) {
  const [draft, setDraft] = useState({ ...DEFAULT_APPEARANCE, ...value, columns: "auto", spacing: "comfortable" });
  const [hex, setHex] = useState(value?.accent || DEFAULT_APPEARANCE.accent);
  const validHex = normalizeHex(hex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const swatches = draft.design === "neo-brutalism" ? NEO_SWATCHES[draft.theme] : BASIC_SWATCHES;
  useEffect(() => {
    onPreview(draft);
  }, [draft, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const update = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  };
  return (
    <Modal
      title="Appearance & Settings"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validHex) return;
          setBusy(true);
          setError("");
          try {
            await onSave(draft);
            setSaved(true);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="interface-style-picker" disabled={busy}>
          <legend className="field-label">Interface style</legend>
          <div className="interface-style-options">
            <button type="button" className={draft.design === "basic" ? "is-selected" : ""} onClick={() => update("design", "basic")}>
              <span className="style-preview style-preview-basic"><i /><i /><i /></span>
              <strong>Basic</strong>
              <small>The original clean glass interface</small>
            </button>
            <button type="button" className={draft.design === "neo-brutalism" ? "is-selected" : ""} onClick={() => update("design", "neo-brutalism")}>
              <span className="style-preview style-preview-brutal"><i /><i /><i /></span>
              <strong>Neo Brutalism</strong>
              <small>Bold blocks, hard shadows and playful contrast</small>
            </button>
          </div>
        </fieldset>
        <label className="field-label">
          Theme
          <select
            aria-label="Theme"
            value={draft.theme}
            disabled={busy}
            onChange={(e) => update("theme", e.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <fieldset className="accent-picker" disabled={busy}>
          <legend className="field-label">Accent color</legend>
          <div className="accent-swatches" aria-label="Preset accent colors">
            {swatches.map(([name, color]) => (
              <button
                key={color}
                type="button"
                className="accent-swatch"
                aria-label={`Use ${name}`}
                aria-pressed={draft.accent === color}
                style={{ backgroundColor: color }}
                onClick={() => { setHex(color); update("accent", color); }}
              >
                {draft.accent === color && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="accent-hex">Hex color</label>
          <div className="accent-hex-row">
            <span className="accent-preview" style={{ backgroundColor: draft.accent }} aria-hidden="true" />
            <input
              id="accent-hex"
              aria-label="Accent color"
              aria-describedby="accent-help"
              aria-invalid={!validHex}
              type="text"
              value={hex}
              maxLength={7}
              autoComplete="off"
              spellCheck={false}
              placeholder="#a564fd"
              onChange={(e) => {
                const next = e.target.value;
                setHex(next);
                setSaved(false);
                const color = normalizeHex(next);
                if (color) update("accent", color);
              }}
            />
          </div>
          <p id="accent-help" className="fine-print">
            {validHex ? "Enter a 3- or 6-digit hex color, with or without #." : "Enter a valid hex color to save. The preview keeps your last valid color."}
          </p>
        </fieldset>
        <p className="fine-print !mt-0">
          Colors preview instantly; save to sync them to
          your account. Closing without saving restores your saved theme.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="success-text" role="status">
            Appearance saved.
          </p>
        )}
        <button className="button-primary" disabled={busy || !validHex}>
          {busy ? "Saving…" : "Save appearance"}
        </button>
        <button
          className="button-quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft({ ...DEFAULT_APPEARANCE });
            setHex(DEFAULT_APPEARANCE.accent);
            setSaved(false);
          }}
        >
          Restore defaults
        </button>
      </form>
    </Modal>
  );
}
