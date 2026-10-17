"use client";
import { Search, Folder, Grid2X2, Pin, Star, Trash2, Users, Eye, EyeOff } from "lucide-react";
import Brand from "./Brand";
import NotificationCenter from "./NotificationCenter";
import ProfileDropdown from "./ProfileDropdown";
import FolderGlyph from "./FolderGlyph";
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
  appUpdate,
  sectionIcon,
  hiddenAvailable = false,
  showingHidden = false,
  hiddenCount = 0,
  onToggleHidden,
}) {
  const SectionIcon =
    { folder: Folder, pinned: Pin, favorites: Star, shared: Users, trash: Trash2 }[sectionKind] || Grid2X2;
  return (
    <header className="topbar safe-area-header">
      <div className="mobile-brand">
        <Brand slogan />
      </div>
      <div className="section-heading" role="region" aria-label="Current view">
        {sectionKind === "folder" ? <FolderGlyph icon={sectionIcon} size={22} aria-hidden="true" /> : <SectionIcon size={22} aria-hidden="true" />}
        <h1>{sectionTitle}</h1>
        <span
          className="section-count"
          aria-label={`${sectionCount} ${sectionCount === 1 ? "reel" : "reels"} in this view`}
        >
          {sectionCount}
        </span>
      </div>
      <div className="search-tools">
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
        {hiddenAvailable && (
          <button className={`hidden-reels-toggle ${showingHidden ? "is-active" : ""}`} onClick={onToggleHidden}
            aria-pressed={showingHidden} title={showingHidden ? "Show folder Reels" : "Show Reels hidden by me"}>
            {showingHidden ? <EyeOff size={17} /> : <Eye size={17} />}
            <span>{showingHidden ? "Folder Reels" : "Hidden"}</span>
            {hiddenCount > 0 && <small>{hiddenCount}</small>}
          </button>
        )}
      </div>
      <div className="header-actions">
        <NotificationCenter key={user.id} onChange={onLibraryChange} />
        <ProfileDropdown user={user} onOpen={onOpen} onLogout={onLogout} appUpdate={appUpdate} />
      </div>
    </header>
  );
}
