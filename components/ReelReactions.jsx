"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import Avatar from "./Avatar";

const EMOJIS = ["❤️", "😂", "🔥", "😮", "👏"];

export default function ReelReactions({ reel, onReact }) {
  const [openEmoji, setOpenEmoji] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState(null);
  const [reacting, setReacting] = useState(false);
  const panel = useRef(null);
  const closeTimer = useRef(null);
  const people = (reel.reactionPeople || []).filter((person) => person.emoji === openEmoji);
  function open(emoji, target, keepOpen = false) {
    clearTimeout(closeTimer.current);
    const rect = target.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16);
    const count = (reel.reactionPeople || []).filter((person) => person.emoji === emoji).length;
    setOpenEmoji(emoji);
    setPinned(keepOpen);
    setPosition({
      width,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.top - Math.min(300, 76 + count * 44), window.innerHeight - 320)),
    });
  }
  function close() { setOpenEmoji(null); setPosition(null); setPinned(false); }
  function scheduleClose() {
    if (!pinned) closeTimer.current = setTimeout(close, 130);
  }
  useEffect(() => {
    if (!position) return;
    const outside = (event) => {
      if (pinned && !panel.current?.contains(event.target) && !event.target.closest(".reaction-count-chip")) close();
    };
    const escape = (event) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [position, pinned]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  return (
    <div className="reel-reactions">
      <details className="reaction-picker">
        <summary className={`reaction-trigger ${reel.reaction ? "has-reaction" : ""}`} aria-label="React to this Reel" title="Add reaction">
          <SmilePlus size={16} />
        </summary>
        <div className="reaction-palette">
          {EMOJIS.map((emoji) => (
            <button type="button" key={emoji} className={reel.reaction === emoji ? "active" : ""} disabled={reacting}
              aria-label={`React ${emoji}`} onClick={async (event) => {
                const picker = event.currentTarget.closest("details");
                setReacting(true);
                try { await onReact(reel.reaction === emoji ? null : emoji); picker.open = false; }
                finally { setReacting(false); }
              }}>
              {emoji}
            </button>
          ))}
        </div>
      </details>
      {EMOJIS.filter((emoji) => Number(reel.reactionCounts?.[emoji] || 0) > 0).map((emoji) => (
        <button key={emoji} type="button" className="reaction-count-chip"
          aria-label={`${emoji} ${reel.reactionCounts[emoji]} reactions. View people.`}
          onPointerEnter={(event) => open(emoji, event.currentTarget)}
          onPointerLeave={scheduleClose}
          onClick={(event) => openEmoji === emoji && pinned ? close() : open(emoji, event.currentTarget, true)}>
          <span>{emoji}</span><small>{reel.reactionCounts[emoji]}</small>
        </button>
      ))}
      {position && createPortal(
        <section ref={panel} className="reaction-people-popover" style={position} role="dialog" aria-label={`${openEmoji} reactions`}
          onPointerEnter={() => clearTimeout(closeTimer.current)} onPointerLeave={scheduleClose}>
          <header><strong>{openEmoji} Reactions</strong><span>{people.length}</span></header>
          <div className="reaction-people-list">
            {people.map((person) => (
              <div className="reaction-person" key={person.userId}>
                <Avatar url={person.avatarUrl} frame={person.avatarFrame} name={person.displayName} size={30} />
                <span><strong>{person.displayName}</strong><small>@{person.username}</small></span>
              </div>
            ))}
          </div>
        </section>, document.body,
      )}
    </div>
  );
}
