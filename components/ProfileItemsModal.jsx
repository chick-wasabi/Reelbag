"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Folder, LoaderCircle, Search } from "lucide-react";
import Modal from "./Modal";
import FolderGlyph from "./FolderGlyph";
import { api } from "../utils/api.mjs";
import { parseReelUrl } from "../utils/reels.mjs";

export default function ProfileItemsModal({ onClose, onSaved }) {
  const [library, setLibrary] = useState(null);
  const [folderIds, setFolderIds] = useState(new Set());
  const [reelIds, setReelIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("library").then((next) => {
      if (!active) return;
      setLibrary(next);
      setFolderIds(new Set(next.folders.filter((folder) => folder.role === "owner" && folder.isFeatured).map((folder) => folder.id)));
      setReelIds(new Set(next.reels.filter((reel) => reel.viewScope === "all" && reel.isFeatured).map((reel) => reel.id)));
    }).catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, []);

  const folders = useMemo(() => (library?.folders || []).filter((folder) =>
    folder.role === "owner" && !folder.pin && folder.name.toLowerCase().includes(query.toLowerCase())), [library, query]);
  const reels = useMemo(() => {
    const seen = new Set();
    return (library?.reels || []).filter((reel) => {
      if (reel.viewScope !== "all" || seen.has(reel.id)) return false;
      seen.add(reel.id);
      return reel.title.toLowerCase().includes(query.toLowerCase());
    });
  }, [library, query]);

  const toggleFolder = (id) => setFolderIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    return next;
  });
  const toggleReel = (id) => setReelIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <Modal title="Add profile items" description="Show up to four folders, then feature as many individual Reels as you like." onClose={onClose} wide className="profile-items-modal">
    <div className="profile-items-editor">
      <label className="profile-items-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!library && !error ? <div className="profile-items-loading"><LoaderCircle className="spin" /> Loading your library…</div> : <>
        <section>
          <div className="profile-items-heading"><div><Folder size={18} /><h3>Folders</h3></div><span>{folderIds.size}/4 selected</span></div>
          <div className="profile-folder-choices">
            {folders.map((folder) => <button key={folder.id} type="button" className={folderIds.has(folder.id) ? "selected" : ""} onClick={() => toggleFolder(folder.id)} aria-pressed={folderIds.has(folder.id)}>
              <FolderGlyph icon={folder.icon} size={21} /><span><strong>{folder.name}</strong><small>{folderIds.has(folder.id) ? "Visible on profile" : "Select folder"}</small></span>{folderIds.has(folder.id) && <Check size={17} />}
            </button>)}
            {!folders.length && <p className="fine-print">No unlocked folders match this search.</p>}
          </div>
        </section>
        <section>
          <div className="profile-items-heading"><div><span className="profile-items-reel-glyph">▶</span><h3>Reels</h3></div><span>{reelIds.size} selected</span></div>
          <div className="profile-reel-choices">
            {reels.map((reel) => {
              const parsed = parseReelUrl(reel.url);
              const embedUrl = parsed ? `https://www.instagram.com/${parsed.type === "post" ? "p" : "reel"}/${parsed.shortcode}/embed/` : null;
              return <button key={reel.id} type="button" className={reelIds.has(reel.id) ? "selected" : ""} onClick={() => toggleReel(reel.id)} aria-pressed={reelIds.has(reel.id)}>
                <span className="profile-choice-preview">{embedUrl ? <iframe src={embedUrl} title="" tabIndex={-1} sandbox="allow-scripts allow-same-origin" loading="lazy" /> : null}</span>
                <span className="profile-choice-copy"><strong>{reel.title}</strong><small>{reel.folderNames?.length ? reel.folderNames.join(" · ") : "All Reels"}</small></span>
                <span className="profile-choice-check">{reelIds.has(reel.id) && <Check size={18} />}</span>
              </button>;
            })}
            {!reels.length && <p className="fine-print">No Reels match this search.</p>}
          </div>
        </section>
      </>}
      <button className="button-primary profile-items-save" disabled={!library || busy} onClick={async () => {
        setBusy(true); setError("");
        try {
          await api("account/featured", { method: "PATCH", body: { folderIds: [...folderIds], reelIds: [...reelIds] } });
          await onSaved();
          onClose();
        } catch (err) { setError(err.message); } finally { setBusy(false); }
      }}>{busy ? "Saving showcase…" : "Save profile showcase"}</button>
    </div>
  </Modal>;
}
