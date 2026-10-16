"use client";
import {
  Users,
  FolderPlus,
  Grid2X2,
  Pin,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import SidebarFolderItem from "./SidebarFolderItem";
import Brand from "./Brand";

export default function Sidebar({
  collapsed,
  onToggle,
  folders,
  reelCount,
  selected,
  onSelect,
  pinnedCount,
  favoriteCount,
  onCreate,
  onRename,
  onShare,
  onDelete,
  onLock,
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
        <div
          className="sidebar-folders overflow-y-auto max-h-[calc(100vh-160px)]"
          aria-label="Folders"
        >
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
            {folders
              .filter((folder) => folder.role === "owner")
              .map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
                  selected={selected}
                  onSelect={onSelect}
                  onRename={onRename}
                  onShare={onShare}
                  onDelete={onDelete}
                  onLock={onLock}
                />
              ))}
            {!folders.some((folder) => folder.role === "owner") && (
              <p className="sidebar-empty sidebar-label">
                A folder for every kind of inspiration.
              </p>
            )}
          </div>
          {folders.some((folder) => folder.role !== "owner") && (
            <>
              <div className="sidebar-folder-heading">
                <span className="sidebar-label">SHARED WITH ME</span>
                <Users size={16} aria-hidden="true" />
              </div>
              <div className="sidebar-folder-list shared-folder-list">
                {folders
                  .filter((folder) => folder.role !== "owner")
                  .map((folder) => (
                    <SidebarFolderItem
                      key={folder.id}
                      folder={folder}
                      selected={selected}
                      onSelect={onSelect}
                      onRename={onRename}
                      onShare={onShare}
                      onDelete={onDelete}
                      onLock={onLock}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      </nav>
    </aside>
  );
}
