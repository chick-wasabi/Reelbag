"use client";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { api } from "../utils/api.mjs";
import AvatarPicker from "./AvatarPicker";
import { DEFAULT_AVATAR } from "../utils/avatars.mjs";
import PasswordField from "./PasswordField";
import RecoveryFields, { QUESTIONS } from "./RecoveryFields";

export default function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);
  const [passwordHint, setPasswordHint] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const recovering = mode === "recovery";
  function changeMode(next) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setChallenge(null);
    setAnswer("");
    setNewPassword("");
    setConfirm("");
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (recovering) {
        if (!challenge) {
          const result = await api("auth/recovery/question", {
            method: "POST",
            body: { username },
          });
          setChallenge(result);
          if (!result.question && !result.hint)
            setError(
              "No recovery question or password hint is available for this username.",
            );
        } else {
          if (newPassword !== confirm)
            throw new Error("The new passwords don’t match.");
          await api("auth/recovery/reset", {
            method: "POST",
            body: { username, answer, newPassword },
          });
          changeMode("login");
          setMessage(
            "Password reset. Log in with your new password. All previous sessions have been signed out.",
          );
        }
      } else {
        await api(signup ? "auth/signup" : "auth/login", {
          method: "POST",
          body: {
            username,
            password,
            ...(signup ? { avatarUrl, passwordHint } : {}),
            ...(signup && recovery
              ? {
                  securityQuestion:
                    question === "custom" ? customQuestion : question,
                  securityAnswer: answer,
                }
              : {}),
          },
        });
        await onSuccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="gate-panel">
      <h1>
        {recovering
          ? "Find your way back."
          : signup
            ? "Make yourself at home."
            : "Welcome back."}
      </h1>
      <p className="muted-copy">
        {recovering
          ? "Use the recovery question you chose for your account."
          : "Your reels. Every device. One little bag."}
      </p>
      {!recovering && (
        <div className="auth-tabs" role="group" aria-label="Account access">
          <button
            aria-pressed={!signup}
            disabled={busy}
            onClick={() => changeMode("login")}
          >
            Log In
          </button>
          <button
            aria-pressed={signup}
            disabled={busy}
            onClick={() => changeMode("signup")}
          >
            Sign Up
          </button>
        </div>
      )}
      <form onSubmit={submit} className="form-stack">
        <label className="field-label">
          Username
          <input
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]{3,32}"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setChallenge(null);
              setAnswer("");
            }}
            disabled={busy || !!challenge}
            placeholder="Your username"
          />
        </label>
        {!recovering && (
          <PasswordField
            label="Password or PIN"
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder="At least 8 characters"
          />
        )}
        {signup && (
          <>
            <AvatarPicker
              value={avatarUrl}
              onChange={setAvatarUrl}
              disabled={busy}
            />
            <label className="field-label">
              Password hint (optional)
              <input
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                maxLength={160}
                disabled={busy}
                placeholder="A clue only you would understand"
              />
            </label>
            <p className="fine-print !mt-0">
              Visible to anyone who knows your username. Never include your
              password or recovery answer.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={recovery}
                onChange={(e) => setRecovery(e.target.checked)}
                disabled={busy}
              />
              Set up account recovery (optional)
            </label>
            {recovery && (
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
          </>
        )}
        {recovering && challenge?.hint && (
          <p className="recovery-question" role="status">
            Password hint: {challenge.hint}
          </p>
        )}
        {recovering && challenge && !challenge.question && (
          <p className="muted-copy">
            Password reset requires a recovery question set up beforehand. Use
            your hint to remember your password, then return to login.
          </p>
        )}
        {recovering && challenge?.question && (
          <>
            <p className="recovery-question">{challenge.question}</p>
            <PasswordField
              label="Your recovery answer"
              minLength={1}
              maxLength={200}
              autoComplete="off"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={busy}
            />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={busy}
            />
            <PasswordField
              label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </>
        )}
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
        <button
          className="button-primary w-full"
          disabled={busy || (recovering && challenge && !challenge.question)}
        >
          {busy ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <ArrowRight size={17} />
          )}{" "}
          {busy
            ? "One moment…"
            : recovering
              ? challenge
                ? "Reset password"
                : "Find recovery question"
              : signup
                ? "Create account"
                : "Log in"}
        </button>
      </form>
      <button
        className="button-quiet w-full mt-3"
        disabled={busy}
        onClick={() => changeMode(recovering ? "login" : "recovery")}
      >
        {recovering ? "Back to login" : "Forgot password?"}
      </button>
      <p className="fine-print">
        {signup
          ? "Recovery is optional. Without it, a forgotten password cannot be reset. "
          : ""}
        Sign in on each device to access the same cloud library. Sessions last
        30 days.
      </p>
    </section>
  );
}
