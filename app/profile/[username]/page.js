"use client";

import { use, useEffect, useState } from "react";
import { ArrowLeft, FolderOpen, LockKeyhole, Pencil, Plus, UserPlus, X } from "lucide-react";
import Avatar from "../../../components/Avatar";
import Brand from "../../../components/Brand";
import ProfileModal from "../../../components/ProfileModal";
import ProfileItemsModal from "../../../components/ProfileItemsModal";
import FolderGlyph from "../../../components/FolderGlyph";
import Modal from "../../../components/Modal";
import ReelCard from "../../../components/ReelCard";
import { api } from "../../../utils/api.mjs";
import { DEFAULT_APPEARANCE } from "../../../utils/preferences.mjs";
import { LOGO_DARK } from "../../../utils/logo.mjs";

export default function PublicProfilePage({ params }) {
  const { username } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [openFolder, setOpenFolder] = useState(null);
  const loadProfile = async () => {
    const next = await api(`profiles/${encodeURIComponent(username)}`);
    setData(next);
    return next;
  };
  const removeFeatured = async ({ reelId, folderId }) => {
    const reelIds = data.reels.map((reel) => reel.id).filter((id) => id !== reelId);
    const folderIds = (data.folders || []).map((folder) => folder.id).filter((id) => id !== folderId);
    await api("account/featured", { method: "PATCH", body: { reelIds, folderIds } });
    await loadProfile();
  };
  const react = async (reel, emoji) => {
    await api(`reels/${reel.id}/reaction`, { method: "POST", body: { emoji } });
    const next = await loadProfile();
    setOpenFolder((current) => current ? (next.folders || []).find((folder) => folder.id === current.id) || current : null);
  };
  useEffect(() => {
    let active = true;
    api(`profiles/${encodeURIComponent(username)}`).then((next) => active && setData(next)).catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [username]);
  const person = data?.profile;
  useEffect(() => {
    if (!person?.appearance) return;
    const root = document.documentElement;
    const appearance = { ...DEFAULT_APPEARANCE, ...person.appearance };
    const previous = {
      theme: root.dataset.theme,
      design: root.dataset.design,
      accent: root.style.getPropertyValue("--accent"),
      rgb: root.style.getPropertyValue("--accent-rgb"),
      onAccent: root.style.getPropertyValue("--on-accent"),
    };
    const rgb = appearance.accent.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16)).join(" ");
    const channels = rgb.split(" ").map((value) => {
      const channel = Number(value) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    root.dataset.theme = appearance.theme;
    root.dataset.design = appearance.design || "basic";
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--accent-rgb", rgb);
    root.style.setProperty("--on-accent", luminance > .179 ? LOGO_DARK : "#ffffff");
    return () => {
      if (previous.theme) root.dataset.theme = previous.theme; else delete root.dataset.theme;
      if (previous.design) root.dataset.design = previous.design; else delete root.dataset.design;
      for (const [name, value] of [["--accent", previous.accent], ["--accent-rgb", previous.rgb], ["--on-accent", previous.onAccent]]) {
        if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
      }
    };
  }, [person?.appearance]);
  return <main className="public-profile-page">
    <header className="public-profile-topbar">
      <button className="icon-button" onClick={() => history.back()} aria-label="Back"><ArrowLeft size={20} /></button>
      <Brand />
    </header>
    {error ? <section className="public-profile-state"><h1>Profile unavailable</h1><p>{error}</p></section> : !person ?
      <section className="public-profile-state"><p>Loading profile…</p></section> : <>
      <section className="public-profile-hero">
        {person.isSelf ? <button className="public-profile-avatar-edit" onClick={() => setEditing(true)} aria-label="Edit profile avatar" title="Edit profile">
          <Avatar url={person.avatarUrl} frame={person.avatarFrame} name={person.displayName} size={92} />
        </button> : <Avatar url={person.avatarUrl} frame={person.avatarFrame} name={person.displayName} size={92} />}
        <div><h1>{person.displayName}</h1><p>@{person.username}</p></div>
        {person.isSelf && <div className="public-profile-owner-actions"><button className="button-secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Edit Profile</button><button className="button-primary" onClick={() => setEditingItems(true)}><Plus size={17} /> Add Items</button></div>}
        {!person.isSelf && !person.isFriend && person.friendStatus !== "pending" && data.authenticated && <button className="button-primary" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { await api("friends/request", { method: "POST", body: { username: person.username } }); setData((current) => ({ ...current, profile: { ...current.profile, friendStatus: "pending", requestSentByViewer: true } })); }
          catch (err) { setError(err.message); } finally { setBusy(false); }
        }}><UserPlus size={17} /> Add friend</button>}
        {person.friendStatus === "pending" && <span className="profile-friend-status">{person.requestSentByViewer ? "Request sent" : "Friend request received"}</span>}
      </section>
      {!person.canView ? <section className="public-profile-state private-profile-state"><LockKeyhole size={34} /><h2>This profile is private</h2><p>Only people this user allows can see their featured Reels.</p></section> :
      <section className="public-profile-library">
        {data.folders?.length > 0 && <section className="public-profile-folders">
          <div><h2>Featured Folders</h2><span>{data.folders.length}</span></div>
          <div className="public-profile-folder-grid">{data.folders.map((folder) => <div className="public-profile-folder-wrap" key={folder.id}><button type="button" onClick={() => setOpenFolder(folder)}>
            <span><FolderGlyph icon={folder.icon} size={25} /></span><strong>{folder.name}</strong><small>{folder.reelCount} {folder.reelCount === 1 ? "Reel" : "Reels"}</small><FolderOpen size={17} />
          </button>{person.isSelf && <button className="public-profile-remove" title={`Remove ${folder.name} from profile`} aria-label={`Remove ${folder.name} from profile`} onClick={() => removeFeatured({ folderId: folder.id })}><X size={14} /></button>}</div>)}</div>
        </section>}
        <div className="public-profile-section-heading"><h2>Featured Reels</h2><span>{data.reels.length}</span></div>
        {data.reels.length ? <div className="public-profile-grid">{data.reels.map((reel) =>
          <div className="public-profile-reel-wrap" key={reel.id}><ReelCard reel={{ ...reel, canManage: false }} readOnly onReact={data.authenticated ? (emoji) => react(reel, emoji) : undefined} />{person.isSelf && <button className="public-profile-remove" title={`Remove ${reel.title} from profile`} aria-label={`Remove ${reel.title} from profile`} onClick={() => removeFeatured({ reelId: reel.id })}><X size={14} /></button>}</div>
        )}</div> : <div className="public-profile-state"><p>No featured Reels yet.</p></div>}
      </section>}
    </>}
    {editing && person?.isSelf && <ProfileModal
      user={{ ...person, profileVisibility: person.visibility }}
      onClose={() => setEditing(false)}
      onSaveProfile={async (profile) => {
        const result = await api("account/profile", { method: "PATCH", body: profile });
        setData((current) => ({ ...current, profile: {
          ...current.profile,
          ...result.user,
          visibility: result.user.profileVisibility,
          avatarFrame: result.user.appearance?.avatarFrame || current.profile.avatarFrame,
        } }));
      }}
    />}
    {editingItems && person?.isSelf && <ProfileItemsModal onClose={() => setEditingItems(false)} onSaved={loadProfile} />}
    {openFolder && <Modal title={openFolder.name} description={`${openFolder.reels.length} ${openFolder.reels.length === 1 ? "Reel" : "Reels"}`} onClose={() => setOpenFolder(null)} wide className="public-folder-modal">
      {openFolder.reels.length ? <div className="public-profile-grid">{openFolder.reels.map((reel) => <ReelCard key={reel.id} reel={{ ...reel, canManage: false }} readOnly onReact={data.authenticated ? (emoji) => react(reel, emoji) : undefined} />)}</div> : <div className="public-profile-state"><p>This folder is empty.</p></div>}
    </Modal>}
  </main>;
}
