"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Folder,
  KeyRound,
  Link2,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import Logo from "../../components/Logo";
import Modal from "../../components/Modal";

const METRICS = [
  { key: "totalUsers", label: "Total Users", icon: Users },
  { key: "totalFolders", label: "Total Folders", icon: Folder },
  { key: "totalReels", label: "Reels Saved", icon: Video },
  { key: "activeSharedFolders", label: "Active Shared Links", icon: Link2 },
];

export default function AdminPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinForm, setPinForm] = useState({
    currentPin: "",
    newPin: "",
    confirmPin: "",
  });
  const [pinSaving, setPinSaving] = useState(false);
  const [pinFeedback, setPinFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function guard() {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || payload.user?.username !== "chick_wasabi") {
          router.replace("/");
          return;
        }
        setCheckingSession(false);
      } catch (requestError) {
        if (requestError.name !== "AbortError") router.replace("/");
      }
    }
    guard();
    return () => controller.abort();
  }, [router]);

  async function unlock(event) {
    event.preventDefault();
    if (!/^(?:\d{4}|\d{6})$/.test(pin) || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-Admin-Pin": pin },
      });
      const payload = await response.json();
      if (response.status === 403) {
        router.replace("/");
        return;
      }
      if (!response.ok)
        throw new Error(payload.error || "Unable to unlock the admin panel.");
      setAnalytics(payload);
      setPin("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function closePinModal() {
    if (pinSaving) return;
    setPinModalOpen(false);
    setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
    setPinFeedback(null);
  }

  async function savePin(event) {
    event.preventDefault();
    setPinFeedback(null);
    if (!/^(?:\d{4}|\d{6})$/.test(pinForm.currentPin)) {
      setPinFeedback({
        type: "error",
        message: "Enter your current custom PIN or the four-digit master PIN.",
      });
      return;
    }
    if (!/^\d{6}$/.test(pinForm.newPin)) {
      setPinFeedback({
        type: "error",
        message: "Your new custom PIN must contain exactly six digits.",
      });
      return;
    }
    if (pinForm.newPin !== pinForm.confirmPin) {
      setPinFeedback({ type: "error", message: "The new PINs do not match." });
      return;
    }
    setPinSaving(true);
    try {
      const response = await fetch("/api/admin/pin", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPin: pinForm.currentPin,
          newPin: pinForm.newPin,
        }),
      });
      const payload = await response.json();
      if (response.status === 403) {
        router.replace("/");
        return;
      }
      if (!response.ok)
        throw new Error(payload.error || "Unable to update the admin PIN.");
      setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
      setPinFeedback({ type: "success", message: payload.message });
    } catch (requestError) {
      setPinFeedback({ type: "error", message: requestError.message });
    } finally {
      setPinSaving(false);
    }
  }

  const users = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (analytics?.users || []).filter(
      (user) => !term || user.username.toLowerCase().includes(term),
    );
  }, [analytics, query]);

  if (checkingSession) {
    return (
      <main className="admin-gate" aria-busy="true">
        <div className="admin-verifying" role="status">
          <Logo />
          <span>Verifying administrator session…</span>
        </div>
      </main>
    );
  }

  if (!analytics) {
    return (
      <main className="admin-gate">
        <Link href="/" className="admin-back-link">
          <ArrowLeft size={16} /> Back to Vault
        </Link>
        <form className="admin-lock-card" onSubmit={unlock}>
          <div className="admin-lock-icon">
            <ShieldCheck size={29} />
          </div>
          <span className="admin-eyebrow">Restricted access</span>
          <h1>Admin Control Center</h1>
          <p>
            Enter the four-digit master PIN or your six-digit custom PIN to view
            Reelbag analytics.
          </p>
          <label className="admin-pin-label">
            Security PIN
            <span className="admin-pin-input">
              <KeyRound size={17} aria-hidden="true" />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                pattern="([0-9]{4}|[0-9]{6})"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                aria-describedby={error ? "admin-pin-error" : undefined}
                autoFocus
                required
              />
            </span>
          </label>
          {error && (
            <p className="admin-error" id="admin-pin-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button-primary admin-unlock-button"
            disabled={!/^(?:\d{4}|\d{6})$/.test(pin) || submitting}
          >
            {submitting ? "Verifying…" : "Unlock Dashboard"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <>
      <main className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-title-lockup">
          <span className="admin-title-logo">
            <Logo />
          </span>
          <div>
            <span className="admin-eyebrow">Reelbag operations</span>
            <h1>Admin Control Center</h1>
          </div>
        </div>
        <div className="admin-header-actions">
          <button
            className="button-secondary admin-change-pin"
            onClick={() => {
              setPinFeedback(null);
              setPinModalOpen(true);
            }}
          >
            <Settings size={16} /> Change PIN
          </button>
          <Link href="/" className="button-secondary">
            <ArrowLeft size={16} /> Back to Vault
          </Link>
        </div>
      </header>

      <section className="admin-metrics" aria-label="Global vault metrics">
        {METRICS.map((metric) => (
          <article className="admin-metric-card" key={metric.key}>
            <span><metric.icon size={19} /></span>
            <strong>{analytics.stats[metric.key].toLocaleString()}</strong>
            <p>{metric.label}</p>
          </article>
        ))}
      </section>

      <section className="admin-directory">
        <div className="admin-directory-header">
          <div>
            <span className="admin-eyebrow">User directory</span>
            <h2>Registered accounts</h2>
            <p>{analytics.stats.totalInvites.toLocaleString()} invitations recorded</p>
          </div>
          <label className="admin-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search users</span>
            <input
              type="search"
              placeholder="Search by username"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-user-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Joined</th>
                <th>Reels saved</th>
                <th>Folders created</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>@{user.username}</strong></td>
                  <td>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(user.createdAt))}</td>
                  <td>{user.reelsCount.toLocaleString()}</td>
                  <td>{user.foldersCount.toLocaleString()}</td>
                  <td><span className={`admin-status is-${user.accountStatus.toLowerCase()}`}>{user.accountStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && <p className="admin-empty">No usernames match your search.</p>}
        </div>
      </section>
      </main>
      {pinModalOpen && (
        <Modal
          title="Change Admin PIN"
          description="Set a private six-digit PIN. The master PIN remains available as an emergency override."
          onClose={closePinModal}
        >
          <form className="form-stack admin-pin-form" onSubmit={savePin}>
            <label className="field-label">
              Current PIN / Master PIN
              <input
                data-autofocus
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                pattern="([0-9]{4}|[0-9]{6})"
                value={pinForm.currentPin}
                onChange={(event) =>
                  setPinForm((current) => ({
                    ...current,
                    currentPin: event.target.value.replace(/\D/g, "").slice(0, 6),
                  }))
                }
                required
              />
            </label>
            <label className="field-label">
              New 6-Digit PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                pattern="[0-9]{6}"
                value={pinForm.newPin}
                onChange={(event) =>
                  setPinForm((current) => ({
                    ...current,
                    newPin: event.target.value.replace(/\D/g, "").slice(0, 6),
                  }))
                }
                required
              />
            </label>
            <label className="field-label">
              Confirm New 6-Digit PIN
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                pattern="[0-9]{6}"
                value={pinForm.confirmPin}
                onChange={(event) =>
                  setPinForm((current) => ({
                    ...current,
                    confirmPin: event.target.value.replace(/\D/g, "").slice(0, 6),
                  }))
                }
                required
              />
            </label>
            {pinFeedback && (
              <p
                className={`admin-pin-feedback is-${pinFeedback.type}`}
                role={pinFeedback.type === "error" ? "alert" : "status"}
              >
                {pinFeedback.message}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button-secondary"
                onClick={closePinModal}
                disabled={pinSaving}
              >
                Cancel
              </button>
              <button className="button-primary" disabled={pinSaving}>
                {pinSaving ? "Saving…" : "Save New PIN"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
