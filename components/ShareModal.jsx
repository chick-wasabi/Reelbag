"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Instagram, Link2, Send, UserRound, X } from "lucide-react";
import Modal from "./Modal";
import { api } from "../utils/api.mjs";

export default function ShareModal({ type, item, onClose, onChange }) {
  const [details, setDetails] = useState(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [instagramCopied, setInstagramCopied] = useState(false);
  const copiedTimer = useRef(null);
  const hasUsername = username.trim() !== "";
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
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
    clearTimeout(copiedTimer.current);
    setCopied(false);
    setInstagramCopied(false);
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
  const secretLinkSection = (
    <section className="sharing-section form-stack">
      <h3>
        <Link2 size={17} /> Secret link
      </h3>
      <p className="muted-copy">
        Anyone with this link can join as a viewer after logging in. Treat it
        as private. Disabling a link stops future joins; revoke existing
        members separately.
      </p>
      {link && (
        <label className="field-label">
          Secret share URL
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <button
        className={`button-primary secret-link-button ${copied ? "is-copied" : ""}`}
        type="button"
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
              setCopied(true);
              copiedTimer.current = setTimeout(() => setCopied(false), 2200);
            } catch {
              throw new Error(
                "Link created. Select and copy the Secret share URL above.",
              );
            }
          }, "Secret link copied.")
        }
      >
        <span
          className="secret-link-label"
          aria-live="polite"
          aria-atomic="true"
        >
          {copied ? (
            "✓ Link Copied!"
          ) : (
            <>
              <Copy size={16} aria-hidden="true" /> Copy Secret Link
            </>
          )}
        </span>
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
  );
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
          {type === "reel" && secretLinkSection}
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
              <UserRound size={17} />
              {type === "reel" ? "Send to Reelbag user" : "Invite by username"}
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
            {type === "folder" && (
              <label className="field-label">
                Access role
                <select
                  aria-label="Access role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={busy}
                >
                  <option value="viewer">Viewer — watch only</option>
                  <option value="collaborator">
                    Collaborator — watch and add reels
                  </option>
                </select>
              </label>
            )}
            <button
              className={`invite-button ${hasUsername ? "is-ready" : ""}`}
              disabled={busy}
            >
              <span className="invite-button-label">
                <Send size={16} /> Send Invite
              </span>
            </button>
          </form>
          {type === "folder" && secretLinkSection}
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
          {type === "reel" && (
            <section className="sharing-section form-stack">
              <h3>
                <Instagram size={17} /> Original Instagram Reel
              </h3>
              <p className="muted-copy">
                Copy the original Instagram link without granting Reelbag access.
              </p>
              <button
                className="button-secondary"
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setCopied(false);
                    await navigator.clipboard.writeText(item.url);
                    setInstagramCopied(true);
                    clearTimeout(copiedTimer.current);
                    copiedTimer.current = setTimeout(
                      () => setInstagramCopied(false),
                      2200,
                    );
                  } catch {
                    setError(
                      "Could not access your clipboard. Copy the Reel link from Instagram instead.",
                    );
                  }
                }}
              >
                {instagramCopied ? <Check size={16} /> : <Copy size={16} />}
                {instagramCopied
                  ? "Instagram Link Copied!"
                  : "Copy Instagram Link"}
              </button>
            </section>
          )}
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
