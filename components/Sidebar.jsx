"use client";
import {
  Folder,
  FolderPlus,
  Grid2X2,
  Pin,
  Star,
  LockKeyhole,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import Avatar from "./Avatar";
import Brand from "./Brand";

export default function Sidebar({
  collapsed,
  onToggle,
  folders,
  counts,
  reelCount,
  selected,
  onSelect,
  pinnedCount,
  favoriteCount,
  onCreate,
  onSettings,
  onLogout,
  username,
  avatarUrl,
}) {
  return (
    <aside
      className={`sidebar hidden md:flex ${collapsed ? "sidebar-collapsed" : ""}`}
      aria-label="Desktop workspace"
    >
      <div className="sidebar-brand">
        <Brand slogan compact={collapsed} />
        <button
          className={`sidebar-toggle icon-button ${collapsed ? "w-full flex items-center justify-center py-3 mb-2" : ""}`}
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="sidebar-navigation"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </div>
      <nav
        id="sidebar-navigation"
        aria-label="Workspace navigation"
        className="sidebar-navigation"
      >
        <button
          className={`sidebar-link ${selected === "all" ? "active" : ""}`}
          onClick={() => onSelect("all")}
          aria-label="All Reels"
          aria-current={selected === "all" ? "page" : undefined}
          title="All Reels"
        >
          <Grid2X2 size={18} />
          <span className="sidebar-label">All Reels</span>
          <span className="sidebar-count" aria-hidden="true">
            {reelCount}
          </span>
        </button>
        {[
          { id: "pinned", label: "Pinned", icon: Pin, count: pinnedCount },
          {
            id: "favorites",
            label: "Favorites",
            icon: Star,
            count: favoriteCount,
          },
        ].map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${selected === item.id ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
            aria-label={item.label}
            aria-current={selected === item.id ? "page" : undefined}
            title={item.label}
          >
            <item.icon size={18} />
            <span className="sidebar-label">{item.label}</span>
            <span className="sidebar-count" aria-hidden="true">
              {item.count}
            </span>
          </button>
        ))}
        <div className="sidebar-folder-heading">
          <span className="sidebar-label">YOUR FOLDERS</span>
          <button
            className="icon-button"
            aria-label="New folder"
            title="New folder"
            onClick={onCreate}
          >
            <FolderPlus size={17} />
          </button>
        </div>
        <div className="sidebar-folder-list">
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={`sidebar-link folder-link ${selected === folder.id ? "active" : ""}`}
              aria-label={`Open folder ${folder.name}`}
              aria-current={selected === folder.id ? "page" : undefined}
              title={folder.name}
              onClick={() => onSelect(folder.id)}
            >
              {folder.pin && !folder.unlocked ? (
                <LockKeyhole size={17} />
              ) : (
                <Folder size={17} />
              )}
              <span className="sidebar-label">{folder.name}</span>
              <span className="sidebar-count" aria-hidden="true">
                {folder.pin && !folder.unlocked ? "—" : counts[folder.id] || 0}
              </span>
            </button>
          ))}
          {!folders.length && (
            <p className="sidebar-empty sidebar-label">
              A folder for every kind of inspiration.
            </p>
          )}
        </div>
      </nav>
      <div className="sidebar-bottom">
        <button
          className="sidebar-link"
          onClick={onSettings}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} />
          <span className="sidebar-label">Settings</span>
        </button>
        <button
          className="sidebar-link"
          onClick={onLogout}
          aria-label="Sign out"
          title="Logout"
        >
          <LogOut size={18} />
          <span className="sidebar-label">Logout</span>
        </button>
        <div className="sidebar-account">
          <Avatar url={avatarUrl} name={`${username}'s avatar`} size={34} />
          <span className="sidebar-label">
            {username}
            <small>Cloud library</small>
          </span>
        </div>
      </div>
    </aside>
  );
}
