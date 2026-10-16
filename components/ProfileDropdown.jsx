"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  UserRound,
  ShieldCheck,
  Palette,
  Database,
  LogOut,
  UsersRound,
  Download,
} from "lucide-react";
import Avatar from "./Avatar";
const ITEMS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "friends", label: "Friends", icon: UsersRound },
  { id: "security", label: "Account Security", icon: ShieldCheck },
  { id: "appearance", label: "Appearance & Settings", icon: Palette },
  { id: "data", label: "Data & Backups", icon: Database },
];
export default function ProfileDropdown({ user, onOpen, onLogout, appUpdate }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();
  function close(focus = false) {
    setOpen(false);
    if (focus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector('[role="menuitem"]')?.focus();
    function outside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="profile-dropdown"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="avatar-button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        title={user.displayName || user.username}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Avatar
          key={user.avatarUrl}
          url={user.avatarUrl}
          frame={user.appearance?.avatarFrame}
          name={`${user.displayName || user.username}'s avatar`}
          size={36}
        />
      </button>
      {open && (
        <div
          id={id}
          ref={panel}
          role="menu"
          aria-label="Profile menu"
          className="profile-menu"
          onKeyDown={(e) => {
            const items = [
              ...panel.current.querySelectorAll('[role="menuitem"]'),
            ];
            const index = items.indexOf(document.activeElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              const next =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? items.length - 1
                    : (index +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }
            if (e.key === "Tab") close();
          }}
        >
          <div className="profile-menu-identity">
            <strong>{user.displayName || user.username}</strong>
            <span>@{user.username}</span>
          </div>
          {appUpdate && (
            <button
              role="menuitem"
              className="profile-update-action"
              onClick={() => {
                close(true);
                appUpdate.install();
              }}
            >
              <Download size={17} aria-hidden="true" />
              <span>Update Reelbag <small>{appUpdate.tag}</small></span>
            </button>
          )}
          {ITEMS.map((item) => (
            <button
              role="menuitem"
              key={item.id}
              onClick={() => {
                close(true);
                onOpen(item.id);
              }}
            >
              <item.icon size={17} aria-hidden="true" />
              {item.label}
            </button>
          ))}
          <div className="profile-menu-divider" />
          <a
            role="menuitem"
            href="https://github.com/chick-wasabi/Reelbag/releases/latest"
            target="_blank"
            rel="noreferrer"
            onClick={() => close(false)}
          >
            <Download size={17} aria-hidden="true" />
            Download Android App
          </a>
          <div className="profile-menu-divider" />
          {user.username === "chick_wasabi" && (
            <>
              <a
                role="menuitem"
                href="/admin"
                className="admin-menu-link"
                onClick={() => close(false)}
              >
                <ShieldCheck size={17} aria-hidden="true" />
                Admin Panel
              </a>
              <div className="profile-menu-divider" />
            </>
          )}
          <button
            role="menuitem"
            onClick={() => {
              close(true);
              onLogout();
            }}
          >
            <LogOut size={17} aria-hidden="true" />
            Sign Out
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close(true);
              onLogout();
            }}
          >
            <UsersRound size={17} aria-hidden="true" />
            Switch Account
          </button>
        </div>
      )}
    </div>
  );
}
