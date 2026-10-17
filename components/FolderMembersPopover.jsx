"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserMinus, Users } from "lucide-react";
import Avatar from "./Avatar";

export default function FolderMembersPopover({ folder, onChangeRole, onRevoke, onInvite, mobile = false, inline = false }) {
  const [position, setPosition] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const trigger = useRef(null);
  const panel = useRef(null);
  const closeTimer = useRef(null);
  const openTimer = useRef(null);
  const id = useId();
  const owner = folder.role === "owner";
  const close = useCallback(() => setPosition(null), []);
  const open = useCallback(() => {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(310, window.innerWidth - 16);
    const left = mobile
      ? Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
      : Math.max(8, Math.min(rect.right + 8, window.innerWidth - width - 8));
    setPosition({ left, top: Math.max(8, Math.min(rect.top, window.innerHeight - 390)), width });
  }, [mobile]);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const cancelOpen = () => clearTimeout(openTimer.current);
  const scheduleOpen = () => {
    cancelOpen();
    openTimer.current = setTimeout(open, 500);
  };
  const scheduleClose = () => {
    cancelOpen();
    cancelClose();
    closeTimer.current = setTimeout(close, 140);
  };
  useEffect(() => {
    if (!position) return;
    const outside = (event) => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
    };
    const escape = (event) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
    };
  }, [position, close]);
  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
  }, []);
  const groups = [
    ["owner", "Owner"],
    ["collaborator", "Collaborators"],
    ["viewer", "Viewers"],
  ];
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`sidebar-share-badge ${mobile ? "is-mobile" : ""} ${inline ? "is-inline" : ""}`}
        aria-label={`View people sharing ${folder.name}`}
        aria-haspopup="dialog"
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        onPointerEnter={!mobile ? scheduleOpen : undefined}
        onPointerLeave={!mobile ? scheduleClose : undefined}
        onClick={(event) => { event.stopPropagation(); cancelOpen(); position ? close() : open(); }}
      >
        <Users size={14} />
        {folder.memberCount > 1 && <small>{folder.memberCount}</small>}
      </button>
      {position && createPortal(
        <section
          ref={panel}
          id={id}
          role="dialog"
          aria-label={`People sharing ${folder.name}`}
          className="folder-members-popover"
          style={position}
          onPointerEnter={() => { cancelOpen(); cancelClose(); }}
          onPointerLeave={!mobile ? scheduleClose : undefined}
        >
          <header><strong>{folder.name}</strong><span>{folder.memberCount} {folder.memberCount === 1 ? "person" : "people"}</span></header>
          {onInvite && <button className="folder-members-invite" type="button" onClick={() => { close(); onInvite(folder); }}>
            Add friends to folder
          </button>}
          {error && <p className="folder-members-error" role="alert">{error}</p>}
          {groups.map(([role, label]) => {
            const members = role === "owner"
              ? [folder.ownerMember].filter(Boolean)
              : (folder.members || []).filter((member) => member.role === role);
            return (
              <div className="folder-member-group" key={role}>
                <h4>{label} <span>{members.length}</span></h4>
                {members.length ? members.map((member) => (
                  <div className="folder-member-person" key={member.recipientId}>
                    <Avatar url={member.avatarUrl} frame={member.avatarFrame} name={member.displayName} size={28} />
                    <span><strong>{member.displayName}</strong><small>@{member.username}</small></span>
                    {role !== "owner" && owner && (
                      <div className="folder-member-actions">
                        {onChangeRole && <select
                          aria-label={`Role for ${member.username}`}
                          value={member.role}
                          disabled={busy === member.recipientId}
                          onChange={async (event) => {
                            setBusy(member.recipientId);
                            setError("");
                            try { await onChangeRole(folder, member, event.target.value); }
                            catch (reason) { setError(reason.message || "Could not update that role."); }
                            finally { setBusy(null); }
                          }}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="collaborator">Collaborator</option>
                        </select>}
                        {onRevoke && <button type="button" className="folder-member-revoke"
                          aria-label={`Revoke access for ${member.username}`} title="Revoke access"
                          disabled={busy === member.recipientId}
                          onClick={async () => {
                            setBusy(member.recipientId);
                            setError("");
                            try { await onRevoke(folder, member); }
                            catch (reason) { setError(reason.message || "Could not revoke access."); }
                            finally { setBusy(null); }
                          }}>
                          <UserMinus size={14} />
                        </button>}
                      </div>
                    )}
                  </div>
                )) : <p className="folder-members-empty">No {label.toLowerCase()}</p>}
              </div>
            );
          })}
        </section>, document.body,
      )}
    </>
  );
}
