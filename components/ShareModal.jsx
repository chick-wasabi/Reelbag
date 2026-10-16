"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Send, UserRound, X } from "lucide-react";
import Modal from "./Modal";
import { api } from "../utils/api.mjs";

export default function ShareModal({ type, item, onClose, onChange }) {
  const [details, setDetails] = useState(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `sharing/${type}/${item.id}`;
  const load = useCallback(
    async (signal) => {
      setDetails(await api(base, { signal }));
    },
    [base],
  );
  useEffect(() => {
    const controller = new AbortController();
    api(base, { signal: controller.signal })
      .then(setDetails)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => controller.abort();
  }, [base]);
  async function run(action, success) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await load();
      await onChange();
      setMessage(success);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const link = details?.shareToken
    ? `${window.location.origin}/share/${type}/${details.shareToken}`
    : "";
  return (
    <Modal
      title={`Share ${type}`}
      description={item.name || item.title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!details ? (
        <p role="status">Loading sharing settings…</p>
      ) : (
        <div className="form-stack">
          <form
            className="sharing-section form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api(`${base}/invite`, {
                  method: "POST",
                  body: { username: username.trim(), role },
                });
                setUsername("");
              }, "Invitation sent. Accepted members receive role updates immediately.");
            }}
          >
            <h3>
              <UserRound size={17} /> Invite by username
            </h3>
            <label className="field-label">
              Reelbag username
              <input
                required
                maxLength={32}
                pattern="[a-zA-Z0-9_]{3,32}"
                autoCapitalize="none"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="friend_username"
                disabled={busy}
              />
            </label>
            <label className="field-label">
              Access role
              <select
                aria-label="Access role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={busy}
              >
                <option value="viewer">Viewer — watch only</option>
                {type === "folder" && (
                  <option value="collaborator">
                    Collaborator — watch and add reels
                  </option>
                )}
              </select>
            </label>
            <button className="button-primary" disabled={busy}>
              <Send size={16} /> Send Invite
            </button>
          </form>
          <section className="sharing-section form-stack">
            <h3>
              <Link2 size={17} /> Secret link
            </h3>
            <p className="muted-copy">
              Anyone with this link can join as a viewer after logging in. Treat
              it as private. Disabling a link stops future joins; revoke
              existing members separately.
            </p>
            {link && (
              <label className="field-label">
                Secret share URL
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await api(`${base}/link`, {
                    method: "POST",
                    body: {},
                  });
                  setDetails((previous) => ({
                    ...previous,
                    shareToken: result.shareToken,
                  }));
                  const url = `${window.location.origin}/share/${type}/${result.shareToken}`;
                  try {
                    await navigator.clipboard.writeText(url);
                  } catch {
                    throw new Error(
                      "Link created. Select and copy the Secret share URL above.",
                    );
                  }
                }, "Secret link copied.")
              }
            >
              <Copy size={16} /> Copy Secret Link
            </button>
            {link && (
              <button
                className="button-quiet"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api(`${base}/link`, { method: "DELETE", body: {} }),
                    "Secret link disabled.",
                  )
                }
              >
                Disable secret link
              </button>
            )}
          </section>
          <section className="sharing-section">
            <h3>People with access</h3>
            {!details.members.filter((member) => member.status !== "declined")
              .length && (
              <p className="muted-copy">No invitations or members yet.</p>
            )}
            {details.members
              .filter((member) => member.status !== "declined")
              .map((member) => (
                <div className="share-member" key={member.recipientId}>
                  <span className="min-w-0 break-words">
                    @{member.username}
                    <small>
                      {member.role} · {member.status}
                    </small>
                  </span>
                  <button
                    className="icon-button danger"
                    aria-label={`Revoke ${member.username}`}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          api(`${base}/members/${member.recipientId}`, {
                            method: "DELETE",
                            body: {},
                          }),
                        "Access revoked.",
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
          </section>
        </div>
      )}
      {error && (
        <p role="alert" className="error-text mt-4">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-text mt-4">
          {message}
        </p>
      )}
    </Modal>
  );
}
