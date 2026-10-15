"use client";
import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CloudUpload } from "lucide-react";
import { api } from "../utils/api.mjs";
import {
  downloadBackup,
  MAX_BACKUP_BYTES,
  validateBackup,
} from "../utils/backup.mjs";

export default function SettingsPanel({ user, onImport, onLegacy }) {
  const input = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await run(async () => {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Backups must be smaller than 10 MB.");
      const raw = JSON.parse(await file.text());
      if (raw?.version === 3) onImport(validateBackup(raw));
      else {
        const { validateData, validateLegacy } = await import(
          "../utils/legacy.mjs"
        );
        onLegacy(raw?.version === 1 ? validateLegacy(raw) : validateData(raw));
      }
    });
  }
  return (
    <div className="form-stack">
      <p className="muted-copy">
        Signed in as <strong>{user.username}</strong>. Your library is saved in
        Postgres and available on every device you sign into.
      </p>
      <section className="settings-section">
        <h3>Backups & import</h3>
        <p className="muted-copy">
          Unlock all folders before exporting. Backups contain links and folder
          names, never passwords or PIN hashes. Imported folders start without
          PIN protection. Imports add to your cloud library.
        </p>
        <div className="form-stack mt-4">
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => downloadBackup(await api("library/export")))
            }
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
            Import JSON Backup
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { loadData, loadLegacyData } = await import(
                  "../utils/legacy.mjs"
                );
                const data = loadLegacyData() || loadData();
                if (
                  !data.profiles?.length &&
                  !data.reels?.length &&
                  !data.folders?.length
                )
                  throw new Error(
                    "No previous local library was found in this browser.",
                  );
                onLegacy(data);
              })
            }
          >
            <CloudUpload size={16} />
            Import previous browser library
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
        Passwords and folder PINs are hashed on the server. Folder access is
        enforced by your session. Instagram controls embed availability and may
        use cookies. Signing out revokes this device’s session.
      </p>
    </div>
  );
}
