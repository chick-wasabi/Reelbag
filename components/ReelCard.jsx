"use client";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Pin,
  Star,
  MoreHorizontal,
  FolderInput,
  Pencil,
  Trash2,
  Instagram,
  RefreshCw,
} from "lucide-react";

import { parseReelUrl } from "../utils/reels.mjs";

export default function ReelCard({
  reel,
  folder,
  onEdit,
  onMove,
  onDelete,
  onToggle,
}) {
  const ref = useRef(null);
  const menu = useRef(null);
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
  useEffect(() => {
    function outside(event) {
      if (menu.current && !menu.current.contains(event.target))
        menu.current.open = false;
    }
    function escape(event) {
      if (event.key === "Escape" && menu.current?.open) {
        event.preventDefault();
        closeMenu();
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
    <article className="reel-card" ref={ref}>
      <div className="reel-heading">
        <div className="min-w-0">
          <h2>{reel.title}</h2>
          {folder && <span className="reel-folder">{folder.name}</span>}
        </div>
        <div className="reel-actions">
          <a
            className="icon-button"
            href={reel.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${reel.title} on Instagram`}
          >
            <ExternalLink size={15} />
          </a>
          <button
            className={`icon-button flag-toggle ${reel.isPinned ? "is-pinned" : ""}`}
            aria-label={`${reel.isPinned ? "Unpin" : "Pin"} ${reel.title}`}
            aria-pressed={Boolean(reel.isPinned)}
            title={reel.isPinned ? "Unpin reel" : "Pin reel"}
            disabled={toggling}
            onClick={() => toggle("isPinned")}
          >
            <Pin size={15} fill={reel.isPinned ? "currentColor" : "none"} />
          </button>
          <button
            className={`icon-button flag-toggle ${reel.isFavorite ? "is-favorite" : ""}`}
            aria-label={`${reel.isFavorite ? "Unfavorite" : "Favorite"} ${reel.title}`}
            aria-pressed={Boolean(reel.isFavorite)}
            title={reel.isFavorite ? "Remove favorite" : "Add favorite"}
            disabled={toggling}
            onClick={() => toggle("isFavorite")}
          >
            <Star size={16} fill={reel.isFavorite ? "currentColor" : "none"} />
          </button>
          <details ref={menu} className="reel-menu">
            <summary
              className="icon-button"
              aria-label={`Actions for ${reel.title}`}
              title="Reel actions"
            >
              <MoreHorizontal size={19} />
            </summary>
            <div className="reel-menu-panel">
              <button
                onClick={() => {
                  closeMenu();
                  onEdit();
                }}
                aria-label={`Edit ${reel.title}`}
              >
                <Pencil size={15} />
                Edit Title
              </button>
              <button
                onClick={() => {
                  closeMenu();
                  onMove();
                }}
                aria-label={`Move ${reel.title}`}
              >
                <FolderInput size={15} />
                Move Folder
              </button>
              <button
                className="danger"
                onClick={() => {
                  closeMenu();
                  onDelete();
                }}
                aria-label={`Delete ${reel.title}`}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </details>
        </div>
      </div>
      <div className="embed-shell" aria-label={`Video player: ${reel.title}`}>
        {visible && embedUrl ? (
          <iframe
            key={`${embedUrl}-${attempt}`}
            className="reel-iframe"
            src={embedUrl}
            title={`Instagram Reel: ${reel.title}`}
            // Do not allow popups or top navigation, including on user gestures.
            // Player controls remain native; an overlay would swallow play/pause.
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setFailed(false)}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="embed-fallback">
            <Instagram size={29} />
            <span>{embedUrl ? "Loading preview…" : "Invalid Reel link"}</span>
          </div>
        )}
      </div>
      <div className="reel-playback-actions">
        <button
          className="replay-button"
          aria-label={`Replay ${reel.title}`}
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          <RefreshCw size={15} />
          Replay
        </button>
      </div>
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
