"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { hashPin, verifyPin } from "../utils/storage";

export default function PinForm({
  credential,
  onSuccess,
  create = false,
  folder = false,
  label,
  submitLabel,
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [failures, setFailures] = useState(0);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (Date.now() < retryAt) {
      setError("Please wait 30 seconds before trying again.");
      return;
    }
    setBusy(true);
    try {
      if (create) {
        if (pin !== confirm) throw new Error("The PINs don’t match.");
        await onSuccess(await hashPin(pin));
      } else {
        if (!(await verifyPin(pin, credential))) {
          const attempts = failures + 1;
          setFailures(attempts);
          if (attempts >= 5) {
            setRetryAt(Date.now() + 30000);
            setFailures(0);
          }
          throw new Error(
            attempts >= 5
              ? "Too many attempts. Please wait 30 seconds."
              : "That PIN doesn’t match. Try again.",
          );
        }
        await onSuccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label className="field-label">
        {label || (create ? "Master PIN" : "Enter Master PIN")}
        <input
          data-autofocus
          required
          type="password"
          inputMode="numeric"
          autoComplete={create ? "new-password" : "current-password"}
          pattern={folder ? "[0-9]{4}" : "[0-9]{4,8}"}
          minLength={4}
          maxLength={folder ? 4 : 8}
          placeholder={folder ? "4 digits" : "4–8 digits"}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={busy}
        />
      </label>
      {create && (
        <label className="field-label">
          Confirm PIN
          <input
            required
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern={folder ? "[0-9]{4}" : "[0-9]{4,8}"}
            minLength={4}
            maxLength={folder ? 4 : 8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="button-primary w-full" disabled={busy}>
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <ArrowRight size={17} />
        )}
        {busy
          ? "One moment…"
          : submitLabel || (create ? "Set Master PIN" : "Unlock Reelbag")}
      </button>
    </form>
  );
}
