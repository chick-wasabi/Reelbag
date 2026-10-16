"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FolderOpen,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";

export default function FolderMenu({
  folder,
  onRename,
  onShare,
  onDelete,
  onLock,
  onSelect,
}) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();
  const owner = folder.role === "owner";
  const close = useCallback((restoreFocus = false) => {
    setPosition(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  const open = useCallback(() => {
    const rect = trigger.current.getBoundingClientRect();
    const scroller = trigger.current
      .closest(".sidebar-folders")
      ?.getBoundingClientRect();
    if (
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight ||
      (scroller && (rect.bottom <= scroller.top || rect.top >= scroller.bottom))
    ) {
      close();
      return;
    }
    const width = Math.min(224, window.innerWidth - 16);
    const height = owner ? (folder.pin && folder.unlocked ? 190 : 150) : 120;
    const top = Math.max(
      8,
      rect.bottom + height + 8 <= window.innerHeight
        ? rect.bottom + 6
        : rect.top - height - 6,
    );
    setPosition({
      left: Math.max(
        8,
        Math.min(rect.right - width, window.innerWidth - width - 8),
      ),
      top,
      width,
      maxHeight: window.innerHeight - top - 8,
    });
  }, [owner, folder.pin, folder.unlocked, close]);
  const isOpen = Boolean(position);
  useEffect(() => {
    if (!isOpen) return;
    panel.current?.querySelector('[role="menuitem"]')?.focus();
    function outside(event) {
      if (
        !panel.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        close();
    }
    function escape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }
    function scroll(event) {
      if (!panel.current?.contains(event.target)) open();
    }
    const resize = () => open();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(open);
    if (trigger.current?.parentElement)
      observer?.observe(trigger.current.parentElement);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", scroll, true);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [isOpen, open, close]);
  const act = (action) => {
    close(true);
    action(folder);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button folder-menu-trigger"
        aria-label={`Folder actions for ${folder.name}`}
        title={`Folder actions for ${folder.name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (position) close();
          else open();
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            open();
          }
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            ref={panel}
            role="menu"
            aria-label={`Actions for folder ${folder.name}`}
            className="folder-context-menu"
            style={position}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                close();
            }}
            onKeyDown={(event) => {
              const items = [
                ...panel.current.querySelectorAll('[role="menuitem"]'),
              ];
              const index = items.indexOf(document.activeElement);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          items.length) %
                        items.length;
                items[next]?.focus();
              } else if (event.key === "Tab") close();
            }}
          >
            {owner ? (
              <>
                <button role="menuitem" onClick={() => act(onRename)}>
                  <Pencil size={16} /> Rename Folder
                </button>
                <button role="menuitem" onClick={() => act(onShare)}>
                  <Share2 size={16} /> Share Folder
                </button>
                {folder.pin && folder.unlocked && (
                  <button role="menuitem" onClick={() => act(onLock)}>
                    <LockKeyhole size={16} /> Lock Folder
                  </button>
                )}
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => act(onDelete)}
                >
                  <Trash2 size={16} /> Delete Folder
                </button>
              </>
            ) : (
              <>
                <p className="folder-menu-note">
                  {folder.role === "collaborator"
                    ? "Collaborator · watch and add reels"
                    : "Viewer · read-only access"}
                  . Only the owner can manage this folder.
                </p>
                <button
                  role="menuitem"
                  onClick={() => act((folder) => onSelect(folder.id))}
                >
                  <FolderOpen size={16} /> Open Folder
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
