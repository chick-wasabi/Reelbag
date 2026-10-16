"use client";

import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import Modal from "./Modal";
import { api } from "../utils/api.mjs";

export default function TrashSettingsModal({ protectedTrash, onClose, onSaved }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event, enabled = true) {
    event.preventDefault();
    setError("");
    if (enabled && !/^\d{4}$/.test(newPin)) return setError("Use exactly 4 digits for the new PIN.");
    if (enabled && newPin !== confirmPin) return setError("The new PINs do not match.");
    setBusy(true);
    try {
      const result = await api("trash/pin", {
        method: "POST",
        body: { enabled, currentPin, newPin },
      });
      await onSaved(result.protected);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Recently Deleted settings"
      description="Add an optional 4-digit PIN, just like a protected folder."
      onClose={onClose}
    >
      <div className="trash-pin-title">
        {protectedTrash ? <ShieldCheck size={18} /> : <LockKeyhole size={18} />}
        <div>
          <strong>PIN protection</strong>
          <span>{protectedTrash ? "Protected with a 4-digit PIN" : "Currently unprotected"}</span>
        </div>
      </div>
      <form className="form-stack" onSubmit={(event) => save(event, true)}>
        {protectedTrash && (
          <label className="field-label">Current PIN
            <input data-autofocus required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} />
          </label>
        )}
        <label className="field-label">{protectedTrash ? "New 4-digit PIN" : "4-digit PIN"}
          <input data-autofocus={!protectedTrash} required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value)} />
        </label>
        <label className="field-label">Confirm new PIN
          <input required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="button-primary w-full" disabled={busy}>Save PIN</button>
        {protectedTrash && (
          <button
            type="button"
            className="button-secondary w-full"
            disabled={busy || !/^\d{4}$/.test(currentPin)}
            onClick={(event) => save(event, false)}
          >
            Remove PIN protection
          </button>
        )}
      </form>
    </Modal>
  );
}
