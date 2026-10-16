"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Instagram, Link2, Send, UserRound, X } from "lucide-react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { api } from "../utils/api.mjs";

export default function ShareModal({ type, item, onClose, onChange }) {
  const [details, setDetails] = useState(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("viewer");
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [instagramCopied, setInstagramCopied] = useState(false);
  const copiedTimer = useRef(null);
  const friendListId = useId();
  const recipients = [
    ...selectedFriends,
    ...(username.trim() ? [username.trim().toLowerCase()] : []),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const hasRecipients = recipients.length > 0;
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
      const result = await action();
      await load();
      await onChange();
      setMessage(typeof success === "function" ? success(result) : success);
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
              const invitees = recipients;
              if (!invitees.length) return;
              run(async () => {
                const results = await Promise.all(
                  invitees.map((invitee) =>
                    api(`${base}/send`, {
                      method: "POST",
                      body: { username: invitee, role },
                    }),
                  ),
                );
                setUsername("");
                setSelectedFriends([]);
                setFriendPickerOpen(false);
                return results;
              }, (results) => {
                const requests = results.filter((result) => result.friendRequestSent).length;
                const shared = results.length - requests;
                if (requests && shared)
                  return `Shared with ${shared}; sent ${requests} friend request${requests === 1 ? "" : "s"}. Share with them after they accept.`;
                if (requests)
                  return `${requests === 1 ? "Friend request" : `${requests} friend requests`} sent. Share with them after they accept.`;
                return `${type === "reel" ? "Reel" : "Folder"} shared with ${shared} ${shared === 1 ? "friend" : "friends"}.`;
              });
            }}
          >
            <h3>
              <UserRound size={17} />
              {type === "reel" ? "Send to Reelbag user" : "Invite by username"}
            </h3>
            <label
              className="field-label friend-picker-field"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setFriendPickerOpen(false);
              }}
            >
              Reelbag username
              <input
                maxLength={32}
                pattern="[a-zA-Z0-9_]{3,32}"
                autoCapitalize="none"
                autoComplete="off"
                value={username}
                onFocus={() => setFriendPickerOpen(true)}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFriendPickerOpen(true);
                }}
                placeholder="friend_username"
                disabled={busy}
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                aria-expanded={friendPickerOpen}
                aria-controls={friendListId}
              />
              {friendPickerOpen && details.friends?.length > 0 && (
                <div
                  id={friendListId}
                  className="friend-picker-dropdown"
                  role="listbox"
                  aria-label="Select friends"
                  aria-multiselectable="true"
                >
                  {details.friends
                    .filter((friend) => {
                      const query = username.trim().toLowerCase();
                      return (
                        !query ||
                        friend.username.includes(query) ||
                        friend.displayName.toLowerCase().includes(query)
                      );
                    })
                    .map((friend) => {
                      const selected = selectedFriends.includes(friend.username);
                      return (
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`friend-picker-option ${selected ? "is-selected" : ""}`}
                          key={friend.id}
                          onClick={() =>
                            setSelectedFriends((current) =>
                              selected
                                ? current.filter((name) => name !== friend.username)
                                : [...current, friend.username],
                            )
                          }
                        >
                          <Avatar
                            url={friend.avatarUrl}
                            frame={friend.avatarFrame}
                            name={friend.displayName}
                            size={34}
                          />
                          <span>
                            <strong>{friend.displayName}</strong>
                            <small>@{friend.username}</small>
                          </span>
                          <span className="friend-picker-check" aria-hidden="true">
                            {selected ? <Check size={14} /> : null}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </label>
            {selectedFriends.length > 0 && (
              <div className="selected-friend-chips" aria-label="Selected friends">
                {selectedFriends.map((name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() =>
                      setSelectedFriends((current) =>
                        current.filter((selected) => selected !== name),
                      )
                    }
                    aria-label={`Remove @${name}`}
                  >
                    @{name} <X size={12} />
                  </button>
                ))}
              </div>
            )}
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
              className={`invite-button ${hasRecipients ? "is-ready" : ""}`}
              disabled={busy || !hasRecipients}
            >
              <span className="invite-button-label">
                <Send size={16} /> {type === "reel" ? "Send Reel" : "Share Folder"}
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
