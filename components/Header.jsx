"use client";
import { Search, Folder, Grid2X2, Pin, Star, Users } from "lucide-react";
import Brand from "./Brand";
import NotificationCenter from "./NotificationCenter";
import ProfileDropdown from "./ProfileDropdown";
export default function Header({
  user,
  search,
  onSearch,
  onOpen,
  onLogout,
  onLibraryChange,
  sectionTitle,
  sectionCount,
  sectionKind,
}) {
  const SectionIcon =
    { folder: Folder, pinned: Pin, favorites: Star, shared: Users }[sectionKind] || Grid2X2;
  return (
    <header className="topbar safe-area-header">
      <div className="mobile-brand">
        <Brand slogan />
      </div>
      <div className="section-heading" role="region" aria-label="Current view">
        <SectionIcon size={22} aria-hidden="true" />
        <h1>{sectionTitle}</h1>
        <span
          className="section-count"
          aria-label={`${sectionCount} ${sectionCount === 1 ? "reel" : "reels"} in this view`}
        >
          {sectionCount}
        </span>
      </div>
      <label className="search-box">
        <Search size={17} />
        <span className="sr-only">Search reels</span>
        <input
          type="search"
          placeholder="Search reels…"
          value={search}
          maxLength={200}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      <div className="header-actions">
        <NotificationCenter key={user.id} onChange={onLibraryChange} />
        <ProfileDropdown user={user} onOpen={onOpen} onLogout={onLogout} />
      </div>
    </header>
  );
}
