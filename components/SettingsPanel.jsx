"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, KeyRound } from "lucide-react";
import { exportData, readBackup } from "../utils/storage";

export default function SettingsPanel({ data, onImport, onChangePin }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      onImport(await readBackup(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <button className="button-secondary justify-start" onClick={onChangePin}>
        <KeyRound size={16} />
        Change Master PIN
      </button>
      <section className="settings-section">
        <h3>Backups</h3>
        <p className="muted-copy">
          Export your library to move it between devices. Backups contain all
          reels, including locked folders, and hashed PINs. Keep them private.
        </p>
        <div className="form-stack mt-4">
          <button
            className="button-secondary"
            onClick={() => {
              try {
                exportData(data);
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <ArrowDownToLine size={16} />
            Export JSON Backup
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ArrowUpFromLine size={16} />
            {busy ? "Checking file…" : "Import JSON Backup"}
          </button>
        </div>
        <input
          ref={input}
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept="application/json,.json"
          aria-label="Import Reelbag backup"
          onChange={importFile}
        />
      </section>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <p className="fine-print">
        PINs keep the interface private, but data in this browser and in backups
        is not encrypted. Clearing browser storage removes your library. There
        is no PIN recovery or automatic device sync. Instagram controls embed
        availability and may use cookies.
      </p>
    </div>
  );
}
