"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import Avatar from "./Avatar";

export default function ReelSharedPopover({ reel }) {
  const [position, setPosition] = useState(null);
  const [pinned, setPinned] = useState(false);
  const panel = useRef(null);
  const timer = useRef(null);
  const open = (target, keep = false) => {
    clearTimeout(timer.current);
    const rect = target.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    setPinned(keep);
    setPosition({ width, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: Math.min(rect.bottom + 7, window.innerHeight - 300) });
  };
  const close = () => { setPosition(null); setPinned(false); };
  const schedule = () => { if (!pinned) timer.current = setTimeout(close, 130); };
  useEffect(() => {
    if (!position) return;
    const outside = (event) => pinned && !panel.current?.contains(event.target) && !event.target.closest(".reel-shared-trigger") && close();
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [position, pinned]);
  return <>
    <button type="button" className="icon-button reel-shared-trigger" aria-label={`Shared with ${reel.sharedWith.length} people`}
      onPointerEnter={(event) => open(event.currentTarget)} onPointerLeave={schedule}
      onClick={(event) => position && pinned ? close() : open(event.currentTarget, true)}>
      <Users size={15} /><small>{reel.sharedWith.length}</small>
    </button>
    {position && createPortal(<section ref={panel} className="reel-shared-popover" style={position} role="dialog"
      onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={schedule}>
      <header><strong>Shared with</strong><span>{reel.sharedWith.length}</span></header>
      {reel.sharedWith.map((person) => <div className="reaction-person" key={person.recipientId}>
        <Avatar url={person.avatarUrl} frame={person.avatarFrame} name={person.displayName} size={30} />
        <span><strong>{person.displayName}</strong><small>@{person.username}</small></span>
      </div>)}
    </section>, document.body)}
  </>;
}
