"use client";

import { useState } from "react";
import { Check, Clock3, UserMinus, UserPlus, Users, X } from "lucide-react";
import Avatar from "./Avatar";
import Modal from "./Modal";

export default function FriendsModal({ data, onClose, onMutate, onNotice }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function action(key, path, method, body, success) {
    setBusy(key);
    setError("");
    try {
      await onMutate(path, method, body);
      if (success) onNotice(success);
      if (key === "request") setUsername("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal
      title="Friends"
      description="Connect by username, then drop a Reel onto a friend in the sidebar to share it without moving your copy."
      onClose={onClose}
      wide
    >
      <form
        className="friend-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!username.trim()) return;
          action(
            "request",
            "friends/request",
            "POST",
            { username: username.trim() },
            `Friend request sent to @${username.trim().toLowerCase()}.`,
          );
        }}
      >
        <label className="field grow">
          <span>Reelbag username</span>
          <input
            data-autofocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="friend_username"
            maxLength={32}
            autoComplete="off"
          />
        </label>
        <button
          className="button-primary friend-add-button"
          disabled={!username.trim() || Boolean(busy)}
        >
          <UserPlus size={17} /> Add friend
        </button>
      </form>

      {error && <p className="form-error mt-3">{error}</p>}

      {data.friendRequests?.length > 0 && (
        <section className="friend-modal-section">
          <h3>Friend requests</h3>
          <div className="friend-modal-list">
            {data.friendRequests.map((request) => (
              <div className="friend-modal-row" key={request.id}>
                <Avatar
                  url={request.avatarUrl}
                  frame={request.avatarFrame}
                  name={request.displayName}
                  size={42}
                />
                <div className="friend-modal-identity">
                  <strong>{request.displayName}</strong>
                  <span>@{request.username}</span>
                </div>
                <div className="friend-request-actions">
                  <button
                    className="button-primary compact-button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      action(
                        `accept-${request.id}`,
                        `friends/${request.id}/respond`,
                        "POST",
                        { status: "accepted" },
                        `You and @${request.username} are now friends.`,
                      )
                    }
                  >
                    <Check size={15} /> Accept
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Decline @${request.username}`}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      action(
                        `decline-${request.id}`,
                        `friends/${request.id}/respond`,
                        "POST",
                        { status: "declined" },
                      )
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="friend-modal-section">
        <h3><Users size={16} /> Your friends</h3>
        <div className="friend-modal-list">
          {data.friends?.map((friend) => (
            <div className="friend-modal-row" key={friend.id}>
              <a className="friend-profile-link" href={`/profile/${friend.username}`}>
                <Avatar url={friend.avatarUrl} frame={friend.avatarFrame} name={friend.displayName} size={42} />
                <span className="friend-modal-identity"><strong>{friend.displayName}</strong><span>@{friend.username}</span></span>
              </a>
              <button
                className="icon-button danger"
                aria-label={`Remove @${friend.username} from friends`}
                title="Remove friend"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (window.confirm(`Remove @${friend.username} from your friends?`))
                    action(`remove-${friend.id}`, `friends/${friend.id}`, "DELETE");
                }}
              >
                <UserMinus size={17} />
              </button>
            </div>
          ))}
          {!data.friends?.length && (
            <p className="friend-empty">Your accepted friends will appear here and in the sidebar.</p>
          )}
        </div>
      </section>

      {data.outgoingFriendRequests?.length > 0 && (
        <section className="friend-modal-section">
          <h3><Clock3 size={16} /> Sent requests</h3>
          <div className="friend-pending-list">
            {data.outgoingFriendRequests.map((request) => (
              <span key={request.id}>@{request.username}</span>
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}
