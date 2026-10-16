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
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import Logo from "../../components/Logo";

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
    if (!/^\d{4}$/.test(pin) || submitting) return;
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
          <p>Enter the four-digit security PIN to view Reelbag analytics.</p>
          <label className="admin-pin-label">
            Security PIN
            <span className="admin-pin-input">
              <KeyRound size={17} aria-hidden="true" />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                pattern="[0-9]{4}"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
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
            disabled={pin.length !== 4 || submitting}
          >
            {submitting ? "Verifying…" : "Unlock Dashboard"}
          </button>
        </form>
      </main>
    );
  }

  return (
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
        <Link href="/" className="button-secondary">
          <ArrowLeft size={16} /> Back to Vault
        </Link>
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
  );
}
