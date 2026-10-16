"use client";
import { useCallback, useEffect, useState } from "react";
import Brand from "./Brand";
import ReelCard from "./ReelCard";
import { api } from "../utils/api.mjs";

export default function ShareLanding({ type, token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `share/${type}/${token}`;
  const loginUrl = `/?returnTo=${encodeURIComponent(`/share/${type}/${token}`)}`;
  const load = useCallback(
    async (signal) => {
      const next = await api(path, { signal });
      setData(next);
      setError("");
    },
    [path],
  );
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () =>
      load(controller.signal).catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    refresh();
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 30000);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [load]);
  return (
    <main className="share-landing">
      <Brand slogan />
      <section className="share-intro form-stack">
        <h1>
          {data?.title ||
            `You’ve been invited to view ${type === "folder" ? "a Reelbag collection" : "a Reelbag reel"}.`}
        </h1>
        {data?.requiresAuth ? (
          <>
            <p className="muted-copy">
              Log in to join securely. Your library stays separate from the
              sender’s account.
            </p>
            <a className="button-primary" href={loginUrl}>
              Log In or Sign Up
            </a>
          </>
        ) : !data ? (
          !error && <p role="status">Checking invitation…</p>
        ) : (
          <>
            <p className="muted-copy">
              Shared by @{data.owner}
              {data.role ? ` · ${data.role}` : " · viewer invitation"}
            </p>
            {!data.role ? (
              <>
                <p className="muted-copy">
                  Joining gives you read-only access. The owner can revoke
                  access at any time.
                </p>
                <button
                  className="button-primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api(`${path}/join`, { method: "POST", body: {} });
                      await load();
                    } catch (err) {
                      setError(err.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Joining…" : "Join as viewer"}
                </button>
              </>
            ) : (
              <a
                className="button-secondary"
                href={type === "folder" ? `/?folder=${data.id}` : "/"}
              >
                Open in my library
              </a>
            )}
          </>
        )}
        {error && (
          <div role="alert" className="error-text">
            {error}
            <div className="flex flex-wrap gap-3 mt-4">
              <a className="button-secondary" href={loginUrl}>
                Log In or Sign Up
              </a>
              <button
                className="button-quiet"
                onClick={() => load().catch((err) => setError(err.message))}
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </section>
      {!error && data?.role && (
        <section
          className="reel-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-label="Shared reels"
        >
          {data.reels.length ? (
            data.reels.map((reel) => <ReelCard key={reel.id} reel={reel} />)
          ) : (
            <p className="muted-copy">This folder has no reels yet.</p>
          )}
        </section>
      )}
    </main>
  );
}
