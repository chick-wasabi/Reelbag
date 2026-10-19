"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export default function ViewMenu({ onSelectReels }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const leaveTimer = useRef(null);
  const close = useCallback(() => setPosition(null), []);
  const cancelClose = () => clearTimeout(leaveTimer.current);
  const scheduleClose = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(close, 320);
  };
  const open = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 190;
    setPosition({
      top: Math.min(rect.bottom + 7, window.innerHeight - 70),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      width,
    });
  }, []);
  useEffect(() => {
    if (!position) return;
    function outside(event) {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
    }
    function keydown(event) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", close);
    return () => {
      clearTimeout(leaveTimer.current);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", close);
    };
  }, [position, close]);
  return <>
    <button ref={trigger} type="button" className="icon-button view-menu-trigger" aria-label="View menu"
      aria-haspopup="menu" aria-expanded={Boolean(position)} onClick={() => position ? close() : open()}
      onPointerEnter={cancelClose} onPointerLeave={scheduleClose}>
      <MoreHorizontal size={18} />
    </button>
    {position && createPortal(
      <div ref={panel} role="menu" className="reel-menu-panel view-menu-panel" style={position}
        onPointerEnter={cancelClose} onPointerLeave={scheduleClose}>
        <button role="menuitem" onClick={() => { close(); onSelectReels(); }}>Select Reels</button>
      </div>, document.body,
    )}
  </>;
}
