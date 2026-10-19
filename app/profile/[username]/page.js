"use client";

import { use, useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, UserPlus } from "lucide-react";
import Avatar from "../../../components/Avatar";
import Brand from "../../../components/Brand";
import { api } from "../../../utils/api.mjs";
import { parseReelUrl } from "../../../utils/reels.mjs";

export default function PublicProfilePage({ params }) {
  const { username } = use(params);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api(`profiles/${encodeURIComponent(username)}`).then((next) => active && setData(next)).catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [username]);
  const person = data?.profile;
  return <main className="public-profile-page">
    <header className="public-profile-topbar">
      <button className="icon-button" onClick={() => history.back()} aria-label="Back"><ArrowLeft size={20} /></button>
      <Brand />
    </header>
    {error ? <section className="public-profile-state"><h1>Profile unavailable</h1><p>{error}</p></section> : !person ?
      <section className="public-profile-state"><p>Loading profile…</p></section> : <>
      <section className="public-profile-hero">
        <Avatar url={person.avatarUrl} frame={person.avatarFrame} name={person.displayName} size={92} />
        <div><h1>{person.displayName}</h1><p>@{person.username}</p></div>
        {!person.isSelf && !person.isFriend && person.friendStatus !== "pending" && data.authenticated && <button className="button-primary" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { await api("friends/request", { method: "POST", body: { username: person.username } }); setData((current) => ({ ...current, profile: { ...current.profile, friendStatus: "pending", requestSentByViewer: true } })); }
          catch (err) { setError(err.message); } finally { setBusy(false); }
        }}><UserPlus size={17} /> Add friend</button>}
        {person.friendStatus === "pending" && <span className="profile-friend-status">{person.requestSentByViewer ? "Request sent" : "Friend request received"}</span>}
      </section>
      {!person.canView ? <section className="public-profile-state private-profile-state"><LockKeyhole size={34} /><h2>This profile is private</h2><p>Only people this user allows can see their featured Reels.</p></section> :
      <section className="public-profile-library">
        <div><h2>Featured Reels</h2><span>{data.reels.length}</span></div>
        {data.reels.length ? <div className="public-profile-grid">{data.reels.map((reel) => {
          const parsed = parseReelUrl(reel.url);
          const src = parsed ? `https://www.instagram.com/${parsed.type === "post" ? "p" : "reel"}/${parsed.shortcode}/embed/` : "";
          return <article className="public-profile-reel" key={reel.id}><h3>{reel.title}</h3><div><iframe src={src} title={reel.title} scrolling="no" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" /></div></article>;
        })}</div> : <div className="public-profile-state"><p>No featured Reels yet.</p></div>}
      </section>}
    </>}
  </main>;
}
