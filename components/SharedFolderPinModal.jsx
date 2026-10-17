"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import Modal from "./Modal";

export default function SharedFolderPinModal({ folder, onSave, onClose }) {
  const [enabled, setEnabled] = useState(Boolean(folder.pin));
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="Protect shared folder" description={folder.name} onClose={() => !busy && onClose()}>
    <form className="form-stack" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try { await onSave({ enabled, pin }); } catch (reason) { setError(reason.message); } finally { setBusy(false); }
    }}>
      <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <LockKeyhole size={16} /> Require my PIN to open this folder</label>
      {enabled && <label className="field-label">New 4-digit PIN
        <input data-autofocus type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4}
          required value={pin} onChange={(event) => setPin(event.target.value)} />
      </label>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button-primary" disabled={busy || (enabled && !/^\d{4}$/.test(pin))}>{busy ? "Saving…" : "Save PIN protection"}</button>
    </form>
  </Modal>;
}
