"use client";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

// Normal folder verification runs on the server. Legacy credentials are only
// accepted by the explicit local-data import wizard, never for cloud login.
export default function PinForm({
  onSuccess,
  onVerify,
  credential,
  label = "Folder PIN",
  submitLabel = "Open folder",
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (credential) {
        const { verifyPin } = await import("../utils/legacy.mjs");
        if (!(await verifyPin(pin, credential)))
          throw new Error("That PIN doesn’t match.");
      } else await onVerify(pin);
      await onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label className="field-label">
        {label}
        <input
          data-autofocus
          required
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern={credential ? "[0-9]{4,8}" : "[0-9]{4}"}
          minLength={4}
          maxLength={credential ? 8 : 4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={busy}
        />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="button-primary w-full" disabled={busy}>
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <ArrowRight size={17} />
        )}{" "}
        {busy ? "Checking…" : submitLabel}
      </button>
    </form>
  );
}
