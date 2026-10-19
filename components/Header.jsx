"use client";
import { Search, Folder, FolderPlus, Grid2X2, List, Pin, Star, Trash2, Users, Eye, EyeOff, UserRoundPlus, X, MoreHorizontal } from "lucide-react";
import Brand from "./Brand";
import NotificationCenter from "./NotificationCenter";
import ProfileDropdown from "./ProfileDropdown";
import FolderGlyph from "./FolderGlyph";
import FolderMembersPopover from "./FolderMembersPopover";
import FolderMenu from "./FolderMenu";
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
  friendRequestCount = 0,
  activeFolder,
  onChangeFolderRole,
  onRevokeFolderMember,
  onOpenFolderShare,
  onFolderSettings,
  onFolderDelete,
  onFolderLock,
  onLeaveFolder,
  onProtectSharedFolder,
  selectionMode = false,
  selectionCount = 0,
  onStartSelection,
  onCancelSelection,
  onBulkAction,
  selectionCanDelete = false,
  viewFilter = "all",
  onViewFilter,
  mobileGrid = false,
  onMobileGrid,
  mobileCompact = false,
}) {
  const SectionIcon =
    { folder: Folder, pinned: Pin, favorites: Star, shared: Users, trash: Trash2 }[sectionKind] || Grid2X2;
  return (
    <header className={`topbar safe-area-header ${mobileCompact ? "is-mobile-compact" : ""}`}>
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
        {sectionKind !== "trash" && <select className="folder-sort-select" value={viewFilter} onChange={(event) => onViewFilter(event.target.value)}
          aria-label="Filter Reels" title="Filter Reels">
          <option value="all">All Reels</option>
          <option value="pinned">Pinned</option>
          <option value="favorites">Favorites</option>
          <option value="top-rated">Top Rated</option>
        </select>}
        {sectionKind !== "trash" && <button className="icon-button mobile-grid-toggle" onClick={onMobileGrid}
          aria-label={mobileGrid ? "Use single-column view" : "Use two-column grid view"}
          title={mobileGrid ? "Single-column view" : "Two-column grid view"}>
          {mobileGrid ? <List size={18} /> : <Grid2X2 size={18} />}
        </button>}
        {activeFolder && <FolderMembersPopover folder={activeFolder} onChangeRole={onChangeFolderRole} onRevoke={onRevokeFolderMember}
          onInvite={activeFolder.role === "owner" ? onOpenFolderShare : undefined} inline />}
        {hiddenAvailable && (
          <button className={`hidden-reels-toggle ${showingHidden ? "is-active" : ""}`} onClick={onToggleHidden}
            aria-pressed={showingHidden} title={showingHidden ? "Show folder Reels" : "Show Reels hidden by me"}>
            {showingHidden ? <EyeOff size={17} /> : <Eye size={17} />}
            <span>{showingHidden ? "Visible" : "Hidden"}</span>
            {hiddenCount > 0 && <small>{hiddenCount}</small>}
          </button>
        )}
        {selectionMode && <div className="bulk-reel-actions" aria-label={`${selectionCount} selected`}>
          <span>{selectionCount} selected</span>
          <button className="icon-button" disabled={!selectionCount} onClick={() => onBulkAction("add")} title="Add selected to folder"><FolderPlus size={17} /></button>
          <button className="icon-button" disabled={!selectionCount} onClick={() => onBulkAction(showingHidden ? "unhide" : "hide")} title={showingHidden ? "Unhide selected" : "Hide selected"}>{showingHidden ? <Eye size={17} /> : <EyeOff size={17} />}</button>
          {selectionCanDelete && <button className="icon-button danger" disabled={!selectionCount} onClick={() => onBulkAction("delete")} title="Delete selected"><Trash2 size={17} /></button>}
          <button className="icon-button" onClick={onCancelSelection} title="Cancel selection"><X size={17} /></button>
        </div>}
        {activeFolder && !selectionMode && <FolderMenu folder={activeFolder} inline onSelectReels={onStartSelection}
          onRename={onFolderSettings} onShare={onOpenFolderShare} onDelete={onFolderDelete} onLock={onFolderLock}
          onSelect={() => {}} onLeave={onLeaveFolder} onProtect={onProtectSharedFolder} />}
        {!activeFolder && !selectionMode && ["all", "shared"].includes(sectionKind) && <details className="reel-menu">
          <summary className="icon-button" title="View menu" aria-label="View menu"><MoreHorizontal size={18} /></summary>
          <div className="reel-menu-panel"><button onClick={onStartSelection}>Select Reels</button></div>
        </details>}
      </div>
      <div className="header-actions">
        <NotificationCenter key={user.id} onChange={onLibraryChange} />
        <button className="icon-button header-friends-button" onClick={() => onOpen("friends")}
          aria-label="Friends" title="Friends">
          <UserRoundPlus size={19} />
          {friendRequestCount > 0 && <small>{friendRequestCount}</small>}
        </button>
        <ProfileDropdown user={user} onOpen={onOpen} onLogout={onLogout} appUpdate={appUpdate} />
      </div>
    </header>
  );
}
