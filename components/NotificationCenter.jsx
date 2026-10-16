"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import Modal from "./Modal";
import { api } from "../utils/api.mjs";

export default function NotificationCenter({ onChange }) {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (signal) => {
    const next = await api("notifications", { signal });
    setData(next);
    setLoading(false);
    setError("");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () =>
      load(controller.signal).catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setLoading(false);
        }
      });
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  async function show() {
    setOpen(true);
    setError("");
    try {
      setData(await api("notifications/read", { method: "POST", body: {} }));
      setLoading(false);
    } catch (err) {
      setError(err.message);
    }
  }
  async function respond(id, status) {
    setBusy(true);
    setError("");
    try {
      setData(
        await api(`notifications/${id}/respond`, {
          method: "POST",
          body: { status },
        }),
      );
      await onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="icon-button notification-bell"
        onClick={show}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`}
        title="Notifications"
      >
        <Bell size={20} />
        {data.unread > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {data.unread > 99 ? "99+" : data.unread}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <Modal
            title="Notifications"
            onClose={() => {
              if (!busy) setOpen(false);
            }}
          >
            {loading && <p role="status">Loading invitations…</p>}
            {!loading && !data.items.length && (
              <p className="muted-copy">
                You’re all caught up. New invitations will appear here.
              </p>
            )}
            <div className="notification-list">
              {data.items.map((item) => (
                <section key={item.id} className="sharing-section form-stack">
                  {item.type === "friend_request" ? (
                    <>
                      <p>
                        <strong>@{item.sender}</strong> sent you a friend request.
                      </p>
                      <p className="fine-print">
                        Friends can share Reels with you directly.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>@{item.sender}</strong> invited you to{" "}
                        {item.role === "collaborator" ? "collaborate on" : "view"}{" "}
                        <strong>{item.title}</strong>.
                      </p>
                      <p className="fine-print">
                        {item.type === "folder_invite" ? "Folder" : "Reel"} ·{" "}
                        {item.role === "collaborator"
                          ? "Watch and add reels"
                          : "Read-only player access"}
                      </p>
                    </>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="button-primary"
                      aria-label={`Accept ${item.type === "friend_request" ? `friend request from ${item.sender}` : item.title}`}
                      disabled={busy}
                      onClick={() => respond(item.id, "accepted")}
                    >
                      Accept
                    </button>
                    <button
                      className="button-secondary"
                      aria-label={`Decline ${item.type === "friend_request" ? `friend request from ${item.sender}` : item.title}`}
                      disabled={busy}
                      onClick={() => respond(item.id, "declined")}
                    >
                      Decline
                    </button>
                  </div>
                </section>
              ))}
            </div>
            {error && (
              <div className="mt-4">
                <p role="alert" className="error-text">
                  {error}
                </p>
                <button
                  className="button-quiet"
                  disabled={busy}
                  onClick={() => load().catch((err) => setError(err.message))}
                >
                  Retry notifications
                </button>
              </div>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}
