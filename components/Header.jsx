"use client";
import { Search, Settings } from "lucide-react";
import Brand from "./Brand";
import Avatar from "./Avatar";
export default function Header({ user, search, onSearch, onSettings }) {
  return (
    <header className="topbar">
      <div className="mobile-brand">
        <Brand slogan />
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
        <button
          className="avatar-button"
          aria-label="Edit profile"
          title={user.username}
          onClick={onSettings}
        >
          <Avatar
            url={user.avatarUrl}
            name={`${user.username}'s avatar`}
            size={36}
          />
        </button>
        <button
          className="icon-button"
          aria-label="Open settings"
          title="Settings"
          onClick={onSettings}
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
