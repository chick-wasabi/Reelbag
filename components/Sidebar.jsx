"use client";
import {
  Users,
  FolderPlus,
  Grid2X2,
  Pin,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  UserPlus,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import SidebarFolderItem from "./SidebarFolderItem";
import Brand from "./Brand";
import Avatar from "./Avatar";
import { useState } from "react";

export default function Sidebar({
  collapsed,
  onToggle,
  folders,
  reelCount,
  selected,
  onSelect,
  pinnedCount,
  favoriteCount,
  sharedCount,
  onCreate,
  onRename,
  onShare,
  onDelete,
  onLock,
  onChangeRole,
  friends = [],
  friendRequestCount = 0,
  onOpenFriends,
  onDropReel,
  onTrashSettings,
}) {
  const [dropTarget, setDropTarget] = useState(null);
  return (
    <aside
      className={`sidebar sidebar-ambient hidden md:flex ${collapsed ? "sidebar-collapsed" : ""}`}
      data-collapsed={collapsed}
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
          { id: "shared", label: "Shared with Me", icon: Users, count: sharedCount },
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
        <div className={`sidebar-trash-row ${selected === "trash" ? "is-active" : ""}`}>
          <button
            className={`sidebar-link ${selected === "trash" ? "active" : ""}`}
            onClick={() => onSelect("trash")}
            aria-current={selected === "trash" ? "page" : undefined}
            title="Recently Deleted"
          >
            <Trash2 size={18} />
            <span className="sidebar-label">Recently Deleted</span>
          </button>
          <button
            className="icon-button sidebar-trash-settings"
            onClick={onTrashSettings}
            aria-label="Recently Deleted settings"
            title="Recently Deleted settings"
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
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
            {folders.map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
                  selected={selected}
                  onSelect={onSelect}
                  onRename={onRename}
                  onShare={onShare}
                  onDelete={onDelete}
                  onLock={onLock}
                  onChangeRole={onChangeRole}
                />
              ))}
            {!folders.length && (
              <p className="sidebar-empty sidebar-label">
                A folder for every kind of inspiration.
              </p>
            )}
          </div>
          <div className="sidebar-folder-heading sidebar-friends-heading">
            <span className="sidebar-label">FRIENDS</span>
            {friendRequestCount > 0 && (
              <span className="friend-request-count" title={`${friendRequestCount} pending request${friendRequestCount === 1 ? "" : "s"}`}>
                {friendRequestCount}
              </span>
            )}
            <button
              className="icon-button"
              aria-label="Add or manage friends"
              title="Add or manage friends"
              onClick={onOpenFriends}
            >
              <UserPlus size={17} />
            </button>
          </div>
          <div className="sidebar-friend-list">
            {friends.map((friend) => (
              <button
                key={friend.id}
                className={`sidebar-friend ${dropTarget === friend.id ? "is-drop-target" : ""}`}
                onClick={onOpenFriends}
                onDragEnter={(event) => {
                  if (event.dataTransfer.types.includes("application/x-reelbag-reel")) {
                    event.preventDefault();
                    setDropTarget(friend.id);
                  }
                }}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes("application/x-reelbag-reel")) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const reelId = event.dataTransfer.getData("application/x-reelbag-reel");
                  setDropTarget(null);
                  if (reelId) onDropReel(friend, reelId);
                }}
                title={`Drop a Reel to share with @${friend.username}`}
              >
                <Avatar url={friend.avatarUrl} frame={friend.avatarFrame} name={friend.displayName} size={28} />
                <span className="sidebar-label">{friend.displayName}</span>
                <span className="friend-drop-hint">Drop</span>
              </button>
            ))}
            {!friends.length && (
              <button className="sidebar-empty friend-empty-button sidebar-label" onClick={onOpenFriends}>
                Add a friend, then drop Reels here.
              </button>
            )}
          </div>
        </div>
      </nav>
    </aside>
  );
}
