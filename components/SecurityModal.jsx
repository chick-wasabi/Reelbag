"use client";
import { useState } from "react";
import Modal from "./Modal";
import PasswordField from "./PasswordField";
export default function SecurityModal({
  user,
  onClose,
  onSaveHint,
  onRecovery,
  onChangePassword,
}) {
  const [hint, setHint] = useState(user.passwordHint || "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(action, success) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Account Security"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form-stack">
        <form
          className="form-stack settings-section"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => onSaveHint(hint), "Password hint saved.");
          }}
        >
          <label className="field-label">
            Password hint (optional)
            <input
              maxLength={160}
              value={hint}
              disabled={busy}
              onChange={(e) => setHint(e.target.value)}
            />
          </label>
          <p className="fine-print !mt-0">
            Visible during recovery to anyone who knows your username. Never
            include your password or recovery answer.
          </p>
          <button className="button-primary" disabled={busy}>
            Save password hint
          </button>
        </form>
        <section className="settings-section">
          <h3>Optional recovery question</h3>
          <p className="muted-copy">
            Set, replace, or disable a recovery question with your current
            password.
          </p>
          <button
            className="button-secondary mt-3"
            disabled={busy}
            onClick={onRecovery}
          >
            Account recovery
          </button>
        </section>
        <form
          className="form-stack settings-section"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (next !== confirm)
                throw new Error("The new passwords don’t match.");
              await onChangePassword({
                currentPassword: current,
                newPassword: next,
              });
              setCurrent("");
              setNext("");
              setConfirm("");
              setHint("");
            }, "Password updated. Other devices have been signed out. Your old hint was cleared.");
          }}
        >
          <h3>Change password</h3>
          <PasswordField
            label="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={busy}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={busy}
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
          />
          <button className="button-primary" disabled={busy}>
            Update password
          </button>
        </form>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-text" role="status">
            {message}
          </p>
        )}
      </div>
    </Modal>
  );
}
