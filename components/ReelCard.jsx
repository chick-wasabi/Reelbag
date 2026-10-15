"use client";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
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

export default function ReelCard({ reel, folder, onEdit, onDelete }) {
  const ref = useRef(null);
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
            className="icon-button"
            onClick={onEdit}
            aria-label={`Edit ${reel.title}`}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button danger"
            onClick={onDelete}
            aria-label={`Delete ${reel.title}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="embed-shell" key={`${reel.url}-${attempt}`}>
        {visible ? (
          <blockquote
            className="instagram-media"
            data-instgrm-permalink={reel.url}
            data-instgrm-version="14"
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
