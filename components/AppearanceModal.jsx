"use client";
import { useState } from "react";
import Modal from "./Modal";
import { DEFAULT_APPEARANCE } from "../utils/preferences.mjs";
export default function AppearanceModal({ value, onSave, onClose }) {
  const [draft, setDraft] = useState(value || DEFAULT_APPEARANCE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
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
        <label className="field-label">
          Accent color
          <input
            type="color"
            value={draft.accent}
            disabled={busy}
            onChange={(e) => update("accent", e.target.value)}
          />
        </label>
        <p className="muted-copy">{draft.accent}</p>
        <label className="field-label">
          Desktop grid
          <select
            aria-label="Desktop grid"
            value={draft.columns}
            disabled={busy}
            onChange={(e) => update("columns", e.target.value)}
          >
            <option value="auto">Automatic</option>
            <option value="4">4 videos per row</option>
            <option value="5">5 videos per row</option>
          </select>
        </label>
        <label className="field-label">
          Card spacing
          <select
            aria-label="Card spacing"
            value={draft.spacing}
            disabled={busy}
            onChange={(e) => update("spacing", e.target.value)}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>
        <p className="fine-print !mt-0">
          Grid choices apply on wide desktops. Phones and tablets keep
          responsive columns. Preferences sync to your account.
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
        <button className="button-primary" disabled={busy}>
          {busy ? "Saving…" : "Save appearance"}
        </button>
        <button
          className="button-quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft({ ...DEFAULT_APPEARANCE });
            setSaved(false);
          }}
        >
          Restore defaults
        </button>
      </form>
    </Modal>
  );
}
