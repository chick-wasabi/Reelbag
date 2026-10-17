"use client";
import { useEffect, useRef, useState } from "react";
import {
  Pin,
  Star,
  MoreHorizontal,
  FolderInput,
  Pencil,
  Trash2,
  Instagram,
  RefreshCw,
  Share2,
  UserRound,
  SmilePlus,
} from "lucide-react";

import { parseReelUrl } from "../utils/reels.mjs";

export default function ReelCard({
  reel,
  folder,
  onEdit,
  onMove,
  onDelete,
  onToggle,
  onShare,
  onDragStart,
  onDragEnd,
  trashMode = false,
  onRestore,
  onPermanentDelete,
  onReact,
}) {
  const canManage = reel.canManage !== false && Boolean(onEdit);
  const ref = useRef(null);
  const menu = useRef(null);
  const reactionMenu = useRef(null);
  const parsed = parseReelUrl(reel.url);
  const embedUrl = parsed
    ? `https://www.instagram.com/reel/${parsed.shortcode}/embed/`
    : null;
  const [toggling, setToggling] = useState(false);
  async function toggle(flag) {
    setToggling(true);
    try {
      await onToggle(flag);
    } finally {
      setToggling(false);
    }
  }
  function closeMenu() {
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
  }
  function closeReactionMenu() {
    if (reactionMenu.current) reactionMenu.current.open = false;
  }
  useEffect(() => {
    function outside(event) {
      if (menu.current && !menu.current.contains(event.target))
        menu.current.open = false;
      if (reactionMenu.current && !reactionMenu.current.contains(event.target))
        reactionMenu.current.open = false;
    }
    function escape(event) {
      if (event.key === "Escape" && menu.current?.open) {
        event.preventDefault();
        closeMenu();
      }
      if (event.key === "Escape" && reactionMenu.current?.open) {
        event.preventDefault();
        closeReactionMenu();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [reacting, setReacting] = useState(false);
  function replay() {
    if (!playerReady) return;
    setFailed(false);
    setPlayerReady(false);
    setAttempt((value) => value + 1);
  }
  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <article
      className={`reel-card ambient-glass-card justify-self-center ${canManage ? "reel-card-draggable" : ""}`}
      style={{ width: "270px", maxWidth: "100%" }}
      ref={ref}
      draggable={canManage}
      onDragStart={(event) => {
        if (!canManage) return;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-reelbag-reel", reel.id);
        event.dataTransfer.setData("text/plain", reel.id);
        onDragStart?.(reel);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className="reel-heading">
        <div className="min-w-0">
          <h2 title={reel.title}>{reel.title}</h2>
          <span className="reel-folder">
            {reel.isDirectShared ? (
              <span className="reel-shared-by">
                <UserRound size={11} /> Shared by {reel.sharedByDisplayName || `@${reel.sharedBy}`}
              </span>
            ) : folder?.name || "\u00a0"}
          </span>
        </div>
        <div className="reel-actions">
          {canManage && reel.isPinned && (
              <button
                className="icon-button flag-toggle is-pinned active-flag"
                aria-label={`Unpin ${reel.title}`}
                aria-pressed="true"
                title="Pinned — click to unpin"
                disabled={toggling}
                onClick={() => toggle("isPinned")}
              >
                <Pin size={15} fill="currentColor" />
              </button>
          )}
          {canManage && reel.isFavorite && (
              <button
                className="icon-button flag-toggle is-favorite active-flag"
                aria-label={`Remove ${reel.title} from favorites`}
                aria-pressed="true"
                title="Favorite — click to remove"
                disabled={toggling}
                onClick={() => toggle("isFavorite")}
              >
                <Star size={16} fill="currentColor" />
              </button>
          )}
          <details ref={menu} className="reel-menu">
                <summary
                  className="icon-button"
                  aria-label={`Actions for ${reel.title}`}
                  title="Reel actions"
                >
                  <MoreHorizontal size={19} />
                </summary>
                <div className="reel-menu-panel">
                  {trashMode ? (
                    <>
                      <button onClick={() => { closeMenu(); onRestore(); }}>
                        <RefreshCw size={15} /> Restore
                      </button>
                      <button className="danger" onClick={() => { closeMenu(); onPermanentDelete(); }}>
                        <Trash2 size={15} /> Delete Permanently
                      </button>
                    </>
                  ) : <>
                  {canManage && <button
                    disabled={toggling}
                    onClick={async () => {
                      closeMenu();
                      await toggle("isFavorite");
                    }}
                  >
                    <Star size={15} fill={reel.isFavorite ? "currentColor" : "none"} />
                    {reel.isFavorite ? "Remove Favorite" : "Add to Favorites"}
                  </button>}
                  {canManage && <button
                    disabled={toggling}
                    onClick={async () => {
                      closeMenu();
                      await toggle("isPinned");
                    }}
                  >
                    <Pin size={15} fill={reel.isPinned ? "currentColor" : "none"} />
                    {reel.isPinned ? "Unpin Reel" : "Pin Reel"}
                  </button>}
                  {canManage && onShare && (
                    <button
                      aria-label={`Share ${reel.title}`}
                      onClick={() => {
                        closeMenu();
                        onShare();
                      }}
                    >
                      <Share2 size={15} /> Share
                    </button>
                  )}
                  {canManage && <button
                    onClick={() => {
                      closeMenu();
                      onEdit();
                    }}
                    aria-label={`Edit ${reel.title}`}
                  >
                    <Pencil size={15} />
                    Edit Title
                  </button>}
                  {canManage && <button
                    onClick={() => {
                      closeMenu();
                      onMove();
                    }}
                    aria-label={`Move ${reel.title}`}
                  >
                    <FolderInput size={15} />
                    Move Folder
                  </button>}
                  <button
                    className="danger"
                    onClick={() => {
                      closeMenu();
                      onDelete();
                    }}
                    aria-label={`${canManage ? "Move" : "Remove"} ${reel.title}`}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                  </>}
                </div>
            </details>
        </div>
      </div>
      <div
        className="embed-viewport relative mb-2 h-[430px] w-full overflow-hidden rounded-xl bg-slate-900 md:h-[460px]"
        aria-label={`Video player: ${reel.title}`}
      >
        <div
          className="embed-shell absolute top-[-10px] h-[450px] overflow-hidden rounded-xl bg-slate-900 md:h-[480px]"
          style={{ left: "-55px", width: "calc(100% + 110px)" }}
        >
          {visible && embedUrl ? (
            <iframe
              key={`${embedUrl}-${attempt}`}
              className="reel-iframe absolute top-[-50px] left-0 w-full h-[calc(100%+210px)] object-cover"
              src={`${embedUrl}${attempt > 0 ? "?autoplay=1&muted=0" : ""}`}
              title={`Instagram Reel: ${reel.title}`}
              // Do not allow popups or top navigation, including on user gestures.
              // Player controls remain native; an overlay would swallow play/pause.
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              scrolling="no"
              onLoad={() => {
                setFailed(false);
                setPlayerReady(true);
              }}
              onError={() => {
                setFailed(true);
                setPlayerReady(false);
              }}
            />
          ) : (
            <div className="embed-fallback">
              <Instagram size={29} />
              <span>{embedUrl ? "Loading preview…" : "Invalid Reel link"}</span>
            </div>
          )}
        </div>
      </div>
      <footer className="reel-card-footer">
        {!trashMode && (
          <details ref={reactionMenu} className="reaction-picker">
            <summary
              className={`reaction-trigger ${reel.reaction ? "has-reaction" : ""}`}
              aria-label="React to this Reel"
              title="Add reaction"
            >
              {reel.reaction || <SmilePlus size={16} />}
              {Object.values(reel.reactionCounts || {}).reduce((sum, count) => sum + Number(count), 0) > 0 && (
                <span>{Object.values(reel.reactionCounts || {}).reduce((sum, count) => sum + Number(count), 0)}</span>
              )}
            </summary>
            <div className="reaction-palette">
              {["❤️", "😂", "🔥", "😮", "👏"].map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  className={reel.reaction === emoji ? "active" : ""}
                  disabled={reacting}
                  aria-label={`React ${emoji}`}
                  onClick={async () => {
                    setReacting(true);
                    try {
                      await onReact(reel.reaction === emoji ? null : emoji);
                      closeReactionMenu();
                    } finally {
                      setReacting(false);
                    }
                  }}
                >
                  {emoji}
                  {Number(reel.reactionCounts?.[emoji] || 0) > 0 && <small>{reel.reactionCounts[emoji]}</small>}
                </button>
              ))}
            </div>
          </details>
        )}
        <button
          className={`replay-icon-button ${playerReady ? "is-ready" : ""}`}
          aria-label={`Replay ${reel.title}`}
          title={playerReady ? "Replay" : "Player loading"}
          disabled={!playerReady}
          onClick={replay}
        >
          <RefreshCw size={14} />
        </button>
      </footer>
      {failed && (
        <div className="embed-error">
          <span>
            Preview unavailable.{" "}
            <a href={reel.url} target="_blank" rel="noopener noreferrer">
              Open original
            </a>
          </span>
          <button
            onClick={() => {
              setFailed(false);
              setPlayerReady(false);
              setAttempt((a) => a + 1);
            }}
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}
    </article>
  );
}
