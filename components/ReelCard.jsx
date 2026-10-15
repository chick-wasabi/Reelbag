"use client";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Pin,
  Star,
  MoreHorizontal,
  FolderInput,
  Scan,
  Crop,
  Pencil,
  Trash2,
  Instagram,
  RefreshCw,
} from "lucide-react";

let embedPromise;
function loadInstagram() {
  if (window.instgrm?.Embeds) return Promise.resolve();
  if (embedPromise) return embedPromise;
  embedPromise = new Promise((resolve, reject) => {
    let script = document.getElementById("instagram-embed-script");
    if (script) script.remove();
    script = document.createElement("script");
    script.id = "instagram-embed-script";
    script.src = "https://www.instagram.com/embed.js";
    script.async = true;
    const timeout = setTimeout(() => {
      script.remove();
      embedPromise = undefined;
      reject(new Error("Instagram timed out"));
    }, 20000);
    script.onload = () => {
      clearTimeout(timeout);
      if (window.instgrm?.Embeds) resolve();
      else {
        embedPromise = undefined;
        reject(new Error("Instagram is unavailable"));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      embedPromise = undefined;
      reject(new Error("Instagram is unavailable"));
    };
    document.body.appendChild(script);
  });
  return embedPromise;
}

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
  const [fullEmbed, setFullEmbed] = useState(false);
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
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Instagram treats this option as a presence flag. JSX declares false;
    // omit the flag before the native scanner runs so captions stay disabled.
    ref.current
      ?.querySelectorAll('[data-instgrm-captioned="false"]')
      .forEach((node) => node.removeAttribute("data-instgrm-captioned"));
    loadInstagram()
      .then(() => {
        if (!cancelled) {
          setFailed(false);
          window.instgrm.Embeds.process();
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, reel.url, attempt]);
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
                onClick={() => {
                  closeMenu();
                  setFullEmbed((value) => !value);
                }}
              >
                {fullEmbed ? <Crop size={15} /> : <Scan size={15} />}{" "}
                {fullEmbed ? "Video-only view" : "Show full embed"}
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
      <div
        className={`embed-shell ${fullEmbed ? "is-full" : "is-cropped"}`}
        key={`${reel.url}-${attempt}`}
      >
        <div className="embed-stage">
          {visible ? (
            <blockquote
              className="instagram-media"
              data-instgrm-permalink={reel.url}
              data-instgrm-version="14"
              data-instgrm-captioned="false"
            >
              <a
                href={reel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="embed-fallback"
              >
                <Instagram size={29} />
                <span>View reel on Instagram</span>
              </a>
            </blockquote>
          ) : (
            <div className="embed-fallback">
              <Instagram size={29} />
              <span>Loading preview…</span>
            </div>
          )}
        </div>
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
