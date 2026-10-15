"use client";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { api } from "../utils/api.mjs";

export default function AuthScreen({ onSuccess }) {
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(signup ? "auth/signup" : "auth/login", {
        method: "POST",
        body: { username, password },
      });
      await onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="gate-panel">
      <h1>{signup ? "Make yourself at home." : "Welcome back."}</h1>
      <p className="muted-copy">Your reels. Every device. One little bag.</p>
      <div className="auth-tabs" role="group" aria-label="Account access">
        <button
          aria-pressed={!signup}
          disabled={busy}
          onClick={() => {
            setSignup(false);
            setError("");
          }}
        >
          Log In
        </button>
        <button
          aria-pressed={signup}
          disabled={busy}
          onClick={() => {
            setSignup(true);
            setError("");
          }}
        >
          Sign Up
        </button>
      </div>
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
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            placeholder="Your username"
          />
        </label>
        <label className="field-label">
          Password or PIN
          <input
            required
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder="At least 8 characters"
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
          {busy ? "One moment…" : signup ? "Create account" : "Log in"}
        </button>
      </form>
      <p className="fine-print">
        {signup
          ? "Usernames use 3–32 letters, numbers, or underscores and are case-insensitive. Choose a strong password or a PIN with at least 8 digits. "
          : ""}
        Sign in on each device to access the same cloud library. Sessions last
        30 days. There is no password recovery yet.
      </p>
    </section>
  );
}
