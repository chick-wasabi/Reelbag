"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserMinus, Users } from "lucide-react";
import Avatar from "./Avatar";

export default function ReelSharedPopover({ reel, onRevoke }) {
  const [position, setPosition] = useState(null);
  const [pinned, setPinned] = useState(false);
  const panel = useRef(null);
  const closeTimer = useRef(null);
  const openTimer = useRef(null);
  const trigger = useRef(null);
  const [busy, setBusy] = useState(null);
  const open = (target, keep = false) => {
    clearTimeout(openTimer.current);
    const rect = target.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    setPinned(keep);
    setPosition({ width, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: Math.max(8, Math.min(rect.bottom + 7, window.innerHeight - 308)) });
  };
  const close = () => { setPosition(null); setPinned(false); };
  const scheduleOpen = (target) => {
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => open(target), 500);
  };
  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    if (!pinned) closeTimer.current = setTimeout(close, 150);
  };
  useEffect(() => {
    if (!position) return;
    const outside = (event) => pinned && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target) && close();
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [position, pinned]);
  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);
  return <>
    <button ref={trigger} type="button" className="icon-button reel-shared-trigger" aria-label={`Shared with ${reel.sharedWith.length} people`}
      aria-expanded={Boolean(position)} aria-haspopup="dialog"
      onPointerEnter={(event) => scheduleOpen(event.currentTarget)} onPointerLeave={scheduleClose}
      onClick={(event) => { clearTimeout(openTimer.current); position && pinned ? close() : open(event.currentTarget, true); }}>
      <Users size={15} />
    </button>
    {position && createPortal(<section ref={panel} className="reel-shared-popover" style={position} role="dialog"
      onPointerEnter={() => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); }} onPointerLeave={scheduleClose}>
      <header><strong>Shared with</strong><span>{reel.sharedWith.length}</span></header>
      <div className="reel-shared-list">
        {reel.sharedWith.map((person) => <div className="reel-shared-person" key={person.recipientId}>
          <Avatar url={person.avatarUrl} frame={person.avatarFrame} name={person.displayName} size={30} />
          <span><strong>{person.displayName}</strong><small>@{person.username}</small></span>
          <button className="icon-button danger" title={`Revoke access for @${person.username}`} aria-label={`Revoke access for ${person.username}`}
            disabled={busy === person.recipientId} onClick={async () => {
              setBusy(person.recipientId);
              try { await onRevoke(person); } finally { setBusy(null); }
            }}><UserMinus size={14} /></button>
        </div>)}
      </div>
    </section>, document.body)}
  </>;
}
