"use client";
import { useState } from "react";
import PinForm from "./PinForm";
import { migrateLegacy } from "../utils/legacy.mjs";

export default function LegacyImport({ data, onComplete }) {
  const [step, setStep] = useState(0);
  const library = data.version === 1 ? null : data;
  const checks = library
    ? [
        ...(library.masterPin
          ? [{ label: "Previous Master PIN", credential: library.masterPin }]
          : []),
        ...library.folders
          .filter((f) => f.pin)
          .map((f) => ({
            label: `Previous PIN for ${f.name}`,
            credential: f.pin,
          })),
      ]
    : data.profiles.map((p) => ({
        label: `Previous PIN for ${p.name}`,
        credential: p.pin,
      }));
  const check = checks[step];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function complete() {
    setBusy(true);
    setError("");
    try {
      const source =
        library ||
        (data.profiles.length
          ? migrateLegacy(data, data.profiles[0].pin)
          : { folders: [], reels: [] });
      await onComplete({
        version: 3,
        folders: source.folders.map((f) => ({ id: f.id, name: f.name })),
        reels: source.reels.map((r) => ({
          title: r.title,
          url: r.url,
          folderId: r.folderId,
        })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <p className="muted-copy">
        Verify your old PINs before copying this library to your cloud account.
        Original browser data is untouched. Imported folders start without PINs;
        you can protect them again afterward.
      </p>
      {check ? (
        <PinForm
          key={step}
          label={check.label}
          credential={check.credential}
          submitLabel="Verify & continue"
          onSuccess={() => setStep((s) => s + 1)}
        />
      ) : (
        <button className="button-primary" disabled={busy} onClick={complete}>
          {busy ? "Importing…" : "Copy to cloud account"}
        </button>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
