"use client";
import { useState } from "react";
import Modal from "./Modal";
import PasswordField from "./PasswordField";
import RecoveryFields, { QUESTIONS } from "./RecoveryFields";
import { api } from "../utils/api.mjs";
export default function RecoverySettingsModal({ onClose, onSaved }) {
  const [enabled, setEnabled] = useState(true);
  const [password, setPassword] = useState("");
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Account recovery"
      description="Set, replace, or disable your optional recovery question. Your current password is required."
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
            const result = await api("account/recovery", {
              method: "POST",
              body: {
                currentPassword: password,
                enabled,
                ...(enabled
                  ? {
                      securityQuestion:
                        question === "custom" ? customQuestion : question,
                      securityAnswer: answer,
                    }
                  : {}),
              },
            });
            onSaved(result.message);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordField
          label="Current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={busy}
          />
          Enable recovery question
        </label>
        {enabled && (
          <RecoveryFields
            question={question}
            setQuestion={setQuestion}
            customQuestion={customQuestion}
            setCustomQuestion={setCustomQuestion}
            answer={answer}
            setAnswer={setAnswer}
            disabled={busy}
          />
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className="button-primary" disabled={busy}>
          {busy
            ? "Saving…"
            : enabled
              ? "Save recovery question"
              : "Disable recovery"}
        </button>
      </form>
    </Modal>
  );
}
