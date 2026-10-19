"use client";
import { useState } from "react";
import {
  Users,
  Grid2X2,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import SidebarFolderItem from "./SidebarFolderItem";
import Brand from "./Brand";
import Avatar from "./Avatar";

export default function Sidebar({
  collapsed,
  onToggle,
  folders,
  reelCount,
  selected,
  onSelect,
  sharedCount,
  onRename,
  onShare,
  onDelete,
  onLock,
  onChangeRole,
  onRevokeMember,
  onLeaveFolder,
  onTrashSettings,
  onProtectSharedFolder,
  friends = [],
  onOpenFriends,
  onShareWithFriend,
}) {
  const [dropTarget, setDropTarget] = useState(null);
  const ownedFolders = folders.filter((folder) => folder.role === "owner");
  const sharedFolders = folders.filter((folder) => folder.role !== "owner");
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
          {selected === "all" && <span className="sidebar-count" aria-hidden="true">{reelCount}</span>}
        </button>
        {[
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
            {selected === item.id && <span className="sidebar-count" aria-hidden="true">{item.count}</span>}
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
          </div>
          <div className="sidebar-folder-list">
            {ownedFolders.map((folder) => (
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
                  onRevoke={onRevokeMember}
                  onLeave={onLeaveFolder}
                  onProtect={onProtectSharedFolder}
                />
              ))}
            {!ownedFolders.length && (
              <p className="sidebar-empty sidebar-label">
                A folder for every kind of inspiration.
              </p>
            )}
          </div>
          {sharedFolders.length > 0 && <>
            <div className="sidebar-folder-heading">
              <span className="sidebar-label">SHARED BY OTHERS</span>
            </div>
            <div className="sidebar-folder-list">
              {sharedFolders.map((folder) => <SidebarFolderItem key={folder.id} folder={folder} selected={selected}
                onSelect={onSelect} onRename={onRename} onShare={onShare} onDelete={onDelete} onLock={onLock}
                onChangeRole={onChangeRole} onRevoke={onRevokeMember} onLeave={onLeaveFolder} onProtect={onProtectSharedFolder} />)}
            </div>
          </>}
          <div className="sidebar-folder-heading sidebar-friends-heading">
            <span className="sidebar-label">FRIENDS</span>
          </div>
          <div className="sidebar-friend-list">
            {friends.map((friend) => (
              <div key={friend.id} className={`sidebar-friend ${dropTarget === friend.id ? "is-drop-target" : ""}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropTarget(friend.id); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
                onDrop={(event) => {
                  event.preventDefault();
                  const reelId = event.dataTransfer.getData("application/x-reelbag-reel") || event.dataTransfer.getData("text/plain");
                  setDropTarget(null);
                  if (reelId) onShareWithFriend?.(reelId, friend);
                }}>
                <a href={`/profile/${friend.username}`} title={`Open ${friend.displayName || friend.username}'s profile`}>
                  <Avatar url={friend.avatarUrl} frame={friend.avatarFrame} name={friend.displayName} size={30} />
                </a>
                <span className="sidebar-label">{friend.displayName || friend.username}</span>
                <small className="friend-drop-hint">Share</small>
              </div>
            ))}
            {!friends.length && <button className="friend-empty-button muted-copy sidebar-label" onClick={onOpenFriends}>Add friends</button>}
          </div>
        </div>
      </nav>
    </aside>
  );
}
