"use client";
import { Search } from "lucide-react";
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
}) {
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
        <NotificationCenter key={user.id} onChange={onLibraryChange} />
        <ProfileDropdown user={user} onOpen={onOpen} onLogout={onLogout} />
      </div>
    </header>
  );
}
