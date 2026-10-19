"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, Plus, X } from "lucide-react";
import Brand from "../components/Brand";
import ShareModal from "../components/ShareModal";
import Sidebar from "../components/Sidebar";
import RecoverySettingsModal from "../components/RecoverySettingsModal";
import MoveReelModal from "../components/MoveReelModal";
import AuthScreen from "../components/AuthScreen";
import FolderBar from "../components/FolderBar";
import FolderModal from "../components/FolderModal";
import LegacyImport from "../components/LegacyImport";
import Modal from "../components/Modal";
import PinForm from "../components/PinForm";
import ReelCard from "../components/ReelCard";
import ReelModal from "../components/ReelModal";
import SharedFolderPinModal from "../components/SharedFolderPinModal";
import Header from "../components/Header";
import LoadingScreen from "../components/LoadingScreen";
import ProfileModal from "../components/ProfileModal";
import SecurityModal from "../components/SecurityModal";
import AppearanceModal from "../components/AppearanceModal";
import DataPanel from "../components/DataPanel";
import DeletedFolderCard from "../components/DeletedFolderCard";
import FriendsModal from "../components/FriendsModal";
import TrashSettingsModal from "../components/TrashSettingsModal";
import AccountSwitcherModal from "../components/AccountSwitcherModal";
import { DEFAULT_APPEARANCE } from "../utils/preferences.mjs";
import { createLogoSvg, LOGO_DARK } from "../utils/logo.mjs";
import { api } from "../utils/api.mjs";
import { parseReelUrl } from "../utils/reels.mjs";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const showLoading = loading || !minTimeElapsed;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selected, setSelected] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletedReels, setDeletedReels] = useState([]);
  const [deletedFolders, setDeletedFolders] = useState([]);
  const [trashUnlocked, setTrashUnlocked] = useState(false);
  const [appUpdate, setAppUpdate] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [accountGate, setAccountGate] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [viewFilter, setViewFilter] = useState("all");
  const [mobileGrid, setMobileGrid] = useState(false);
  const [mobileHeaderCompact, setMobileHeaderCompact] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedReels, setSelectedReels] = useState(() => new Set());
  const feed = useRef(null);
  const epoch = useRef(0);
  const pending = useRef(0);
  const modalRef = useRef(null);
  const pullStart = useRef(null);
  const pullDistanceRef = useRef(0);
  const trashPinRef = useRef("");
  const accountGateRef = useRef(false);
  const mobileHeaderState = useRef({ compact: false, lastY: 0, direction: null, directionStart: 0, lockedUntil: 0 });
  const suppressAccountGatePop = useRef(false);
  const userId = data?.user?.id;
  useEffect(() => {
    if (!userId || new URLSearchParams(window.location.search).get("editProfile") !== "1") return;
    history.replaceState(history.state, "", window.location.pathname);
    const timer = window.setTimeout(() => setModal({ type: "profile" }), 0);
    return () => window.clearTimeout(timer);
  }, [userId]);
  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);
  useEffect(() => { accountGateRef.current = accountGate; }, [accountGate]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setMobileGrid(localStorage.getItem("reelbag-mobile-grid") === "true"); } catch {}
    });
    const state = mobileHeaderState.current;
    state.lastY = window.scrollY;
    state.directionStart = window.scrollY;
    function trackMobileScroll() {
      if (window.innerWidth >= 768) {
        if (state.compact) { state.compact = false; setMobileHeaderCompact(false); }
        state.lastY = window.scrollY;
        return;
      }
      const current = window.scrollY;
      const delta = current - state.lastY;
      if (Math.abs(delta) < 2) return;
      const direction = delta > 0 ? "down" : "up";
      if (direction !== state.direction) {
        state.direction = direction;
        state.directionStart = current;
      }
      if (Date.now() >= state.lockedUntil) {
        if (!state.compact && direction === "down" && current > 110 && current - state.directionStart >= 44) {
          state.compact = true;
          state.lockedUntil = Date.now() + 420;
          setMobileHeaderCompact(true);
        } else if (state.compact && (current < 24 || direction === "up" && state.directionStart - current >= 64)) {
          state.compact = false;
          state.lockedUntil = Date.now() + 420;
          setMobileHeaderCompact(false);
        }
      }
      state.lastY = current;
    }
    window.addEventListener("scroll", trackMobileScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", trackMobileScroll);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    async function check() {
      try {
        const [info, response] = await Promise.all([
          CapacitorApp.getInfo(),
          fetch("/api/app-update", { cache: "no-store" }),
        ]);
        if (!response.ok) return;
        const latest = await response.json();
        const currentBuild = Number(info.build || info.version.split(".").at(-1));
        if (active && Number.isInteger(latest.build) && latest.build > currentBuild) {
          setAppUpdate({
            ...latest,
            install: () => Browser.open({ url: latest.downloadUrl }),
          });
        }
      } catch {
        // Update checks must never interrupt the vault.
      }
    }
    check();
    const timer = setInterval(check, 15 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.dataset.nativeApp = "true";
    let lastBackPress = 0;
    let listener;
    CapacitorApp.addListener("backButton", () => {
      if (accountGateRef.current) {
        window.history.back();
        return;
      }
      if (document.querySelector('[role="dialog"]')) {
        window.history.back();
        return;
      }
      if (document.querySelector('.profile-menu, .reel-menu[open]')) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        return;
      }
      if (window.location.pathname !== "/") {
        window.history.back();
        return;
      }
      const now = Date.now();
      if (now - lastBackPress < 2000) {
        CapacitorApp.exitApp();
        return;
      }
      lastBackPress = now;
      setNotice("Press back again to exit Reelbag.");
    }).then((handle) => {
      listener = handle;
    });
    return () => {
      delete document.documentElement.dataset.nativeApp;
      listener?.remove();
    };
  }, []);
  useEffect(() => {
    const back = () => {
      if (suppressAccountGatePop.current) {
        suppressAccountGatePop.current = false;
        return;
      }
      setAccountGate(false);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("reelbag-splash-seen") === "true"; } catch {}
    const timer = window.setTimeout(() => {
      setMinTimeElapsed(true);
      try { sessionStorage.setItem("reelbag-splash-seen", "true"); } catch {}
    }, seen ? 0 : 3000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const target = feed.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation;
    if (target?.animate && !reduced.matches) {
      animation = target.animate(
        [
          { opacity: 0.35, transform: "translateY(8px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 300, easing: "cubic-bezier(0.2,0.7,0.2,1)" },
      );
    }
    const stop = () => {
      if (reduced.matches) animation?.cancel();
    };
    reduced.addEventListener("change", stop);
    return () => {
      animation?.cancel();
      reduced.removeEventListener("change", stop);
    };
  }, [selected, userId]);
  const [appearancePreview, setAppearancePreview] = useState(null);
  const appearance =
    appearancePreview || data?.user?.appearance || DEFAULT_APPEARANCE;
  useEffect(() => {
    const root = document.documentElement;
    const rgb = appearance.accent
      .slice(1)
      .match(/.{2}/g)
      .map((value) => parseInt(value, 16))
      .join(" ");
    root.style.setProperty("--accent", appearance.accent);
    root.style.setProperty("--accent-rgb", rgb);
    const channels = rgb.split(" ").map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance =
      channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    root.style.setProperty(
      "--on-accent",
      luminance > 0.179 ? LOGO_DARK : "#ffffff",
    );
    root.dataset.theme = appearance.theme;
    root.dataset.design = appearance.design || "basic";
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/svg+xml";
    favicon.setAttribute("sizes", "any");
    favicon.dataset.reelbagTheme = "true";
    favicon.href = `data:image/svg+xml,${encodeURIComponent(createLogoSvg(appearance.accent))}`;
    document.head.appendChild(favicon);
    const browserTheme = document.querySelector('meta[name="theme-color"]');
    const previousTheme = browserTheme?.getAttribute("content");
    browserTheme?.setAttribute("content", appearance.accent);

    return () => {
      favicon.remove();
      if (previousTheme != null)
        browserTheme?.setAttribute("content", previousTheme);
      for (const name of ["--accent", "--accent-rgb", "--on-accent"])
        root.style.removeProperty(name);
      delete root.dataset.theme;
      delete root.dataset.design;
    };
  }, [appearance]);
  function manageFolder(folder, action) {
    if (folder.role !== "owner") return;
    if (folder.pin && !folder.unlocked) {
      setModal({ type: "unlockFolder", folder, afterUnlock: action });
      return;
    }
    if (action === "share")
      setModal({ type: "share", kind: "folder", item: folder });
    else
      setModal({
        type: action === "delete" ? "deleteFolder" : "folder",
        folder,
        preserveSelection: true,
      });
  }

  const unlocked = useMemo(
    () =>
      new Set(data?.folders.filter((f) => f.unlocked).map((f) => f.id) || []),
    [data],
  );

  const apply = useCallback((next) => {
    setData(next);
    setSelected((previous) =>
      ["all", "shared", "trash"].includes(previous) ||
      next.folders.some((f) => f.id === previous && (!f.pin || f.unlocked))
        ? previous
        : "all",
    );
    setError("");
  }, []);
  const clearSession = useCallback(() => {
    epoch.current += 1;
    setData(null);
    setSelected("all");
    setSearch("");
    setModal(null);
    setDeletedReels([]);
    setDeletedFolders([]);
    setSelectionMode(false);
    setSelectedReels(new Set());
    setViewFilter("all");
    setTrashUnlocked(false);
    trashPinRef.current = "";
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function start() {
      try {
        const session = await api("auth/session", {
          signal: controller.signal,
        });
        if (session.user) {
          const library = await api("library", { signal: controller.signal });
          if (!controller.signal.aborted) {
            apply(library);
            const params = new URLSearchParams(window.location.search);
            const folderId = params.get("folder");
            if (
              library.folders.some(
                (folder) => folder.id === folderId && folder.unlocked,
              )
            )
              setSelected(folderId);
            const link = parseReelUrl(
              params.get("url") ||
                params.get("text")?.match(/https?:\/\/[^\s]+/)?.[0],
            );
            if (link) setModal({ type: "reel", initialUrl: link.url });
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const params = new URLSearchParams(window.location.search);
    const link = parseReelUrl(
      params.get("url") || params.get("text")?.match(/https?:\/\/[^\s]+/)?.[0],
    );
    const frame = requestAnimationFrame(() => {
      if (link) setSharedUrl(link.url);
    });
    start();
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
    };
  }, [apply]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    async function refresh() {
      if (pending.current || document.visibilityState === "hidden") return;
      const version = ++epoch.current;
      try {
        const next = await api("library");
        if (active && version === epoch.current && !pending.current)
          apply(next);
      } catch (err) {
        if (!active || version !== epoch.current) return;
        if (err.status === 401) clearSession();
        setError(err.message);
      }
    }
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, apply, clearSession]);

  useEffect(() => {
    if (!userId) return;
    function startPull(event) {
      if (window.innerWidth >= 768 || window.scrollY > 0 || modalRef.current)
        return;
      pullStart.current = event.touches[0]?.clientY ?? null;
      pullDistanceRef.current = 0;
    }
    function movePull(event) {
      if (pullStart.current == null || pullRefreshing) return;
      const distance = Math.max(
        0,
        Math.min(110, (event.touches[0].clientY - pullStart.current) * 0.55),
      );
      pullDistanceRef.current = distance;
      setPullDistance(distance);
      if (distance > 4) event.preventDefault();
    }
    async function endPull() {
      const shouldRefresh = pullDistanceRef.current >= 68;
      pullStart.current = null;
      pullDistanceRef.current = 0;
      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }
      setPullRefreshing(true);
      setPullDistance(52);
      try {
        const next = await api("library");
        apply(next);
        setNotice("Reelbag refreshed.");
      } catch (err) {
        setError(err.message);
      } finally {
        setPullRefreshing(false);
        setPullDistance(0);
      }
    }
    window.addEventListener("touchstart", startPull, { passive: true });
    window.addEventListener("touchmove", movePull, { passive: false });
    window.addEventListener("touchend", endPull, { passive: true });
    window.addEventListener("touchcancel", endPull, { passive: true });
    return () => {
      window.removeEventListener("touchstart", startPull);
      window.removeEventListener("touchmove", movePull);
      window.removeEventListener("touchend", endPull);
      window.removeEventListener("touchcancel", endPull);
    };
  }, [userId, pullRefreshing, apply]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function mutate(path, method, body = {}) {
    const version = ++epoch.current;
    pending.current += 1;
    try {
      const next = await api(path, {
        method,
        body: method === "GET" ? undefined : body,
      });
      if (version === epoch.current) apply(next);
      return next;
    } catch (err) {
      if (err.status === 401) clearSession();
      throw err;
    } finally {
      pending.current -= 1;
    }
  }
  async function login() {
    const next = await api("library");
    apply(next);
    setSelected("all");
    setDeletedReels([]);
    setTrashUnlocked(false);
    trashPinRef.current = "";
    setAccountGate(false);
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (/^\/share\/(folder|reel)\/[a-f0-9-]{36}$/i.test(returnTo || "")) {
      window.location.assign(returnTo);
      return;
    }
    setModal(sharedUrl ? { type: "reel", initialUrl: sharedUrl } : null);
  }
  async function logout() {
    try {
      await api("auth/logout", { method: "POST", body: {} });
      clearSession();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  function addAccount() {
    // Closing the account switcher removes its own history entry. Ignore that
    // one popstate so the new account gate remains open; the next Back still
    // returns to the currently authenticated account as expected.
    suppressAccountGatePop.current = true;
    setModal(null);
    setAccountGate(true);
    window.history.pushState({ reelbagAccountGate: true }, "");
  }
  function cancelAddAccount() {
    if (window.history.state?.reelbagAccountGate) window.history.back();
    else setAccountGate(false);
  }
  async function switchAccount(account) {
    await api("auth/switch", { method: "POST", body: { userId: account.id } });
    const next = await api("library");
    apply(next);
    setSelected("all");
    setDeletedReels([]);
    setTrashUnlocked(false);
    trashPinRef.current = "";
    setModal(null);
    setNotice(`Switched to @${account.username}.`);
  }
  async function selectFolder(id, lockId) {
    if (!lockId && id !== selected) cancelSelection();
    if (lockId) {
      try {
        const target = data.folders.find((folder) => folder.id === lockId);
        await mutate(`folders/${lockId}/${target?.role === "owner" ? "lock" : "shared-lock"}`, "POST");
        setSelected((previous) => (previous === lockId ? "all" : previous));
      } catch (err) {
        setError(err.message);
      }
      return;
    }
    if (id === "trash") {
      if (data.user.trashProtected && !trashUnlocked) {
        setModal({ type: "unlockTrash" });
        return;
      }
      try {
        const result = await api("trash/open", {
          method: "POST",
          body: data.user.trashProtected ? { pin: trashPinRef.current } : {},
        });
        setDeletedReels(result.items);
        setDeletedFolders(result.folders || []);
        setTrashUnlocked(true);
        setSelected("trash");
        setSearch("");
      } catch (err) {
        setError(err.message);
      }
      return;
    }
    const folder = data.folders.find((f) => f.id === id);
    if (folder?.pin && !folder.unlocked) {
      setModal({ type: "unlockFolder", folder });
      return;
    }
    setSelected(id);
    setShowHidden(false);
    setFolderSort("latest");
    setViewFilter("all");
    setSearch("");
  }
  async function saveFolder(folder) {
    const next = await mutate(
      folder.id ? `folders/${folder.id}` : "folders",
      folder.id ? "PATCH" : "POST",
      folder,
    );
    const folderId = folder.id || next.folderId;
    if (modal.returnTo)
      setModal({
        ...modal.returnTo,
        createdFolderId: folderId,
        ...(modal.returnTo.draft ? { draft: { ...modal.returnTo.draft, folderId } } : {}),
      });
    else if (modal.preserveSelection) setModal(null);
    else {
      setSelected(folderId);
      setSearch("");
      setModal(null);
    }
    setNotice("Folder saved to cloud.");
  }
  async function saveReel(reel) {
    const next = await mutate(
      modal.reel ? `reels/${modal.reel.id}` : "reels",
      modal.reel ? "PATCH" : "POST",
      reel,
    );
    const target = next.folders.find((f) => f.id === reel.folderId);
    setSelected(target && (!target.pin || target.unlocked) ? target.id : "all");
    setSearch("");
    setModal(null);
    setSharedUrl("");
    setNotice("Reel saved to cloud.");
    const url = new URL(window.location.href);
    ["url", "text", "title"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  async function importLibrary(backup) {
    await mutate("library/import", "POST", backup);
    setSelected("all");
    setModal(null);
    setNotice("Library copied to your cloud account.");
  }
  async function removeFolder() {
    if (deleting) return;
    setDeleting(true);
    try {
      await mutate(`folders/${modal.folder.id}`, "DELETE");
      if (selected === modal.folder.id) setSelected("all");
      setModal(null);
      setNotice("Folder moved to Recently Deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }
  async function deleteReel(reel) {
    try {
      await mutate(`reels/${reel.id}/trash`, "POST");
      setNotice("Reel moved to Recently Deleted.");
    } catch (err) {
      setError(err.message);
    }
  }
  async function updateDeletedReel(reel, action) {
    if (action === "permanent" && !window.confirm(`Permanently delete “${reel.title}”? This cannot be undone.`)) return;
    try {
      await api(`trash/${reel.id}/${action}`, { method: "POST", body: {} });
      setDeletedReels((items) => items.filter((item) => item.id !== reel.id));
      await mutate("library", "GET");
      setNotice(action === "restore" ? "Reel restored." : "Reel permanently deleted.");
    } catch (err) {
      setError(err.message);
    }
  }
  async function updateDeletedFolder(folder, action) {
    if (action === "permanent" && !window.confirm(`Permanently delete “${folder.name}” and all ${folder.reelCount} Reels inside it? This cannot be undone.`)) return;
    try {
      await api(`trash/folder/${folder.id}/${action}`, { method: "POST", body: {} });
      setDeletedFolders((items) => items.filter((item) => item.id !== folder.id));
      await mutate("library", "GET");
      setNotice(action === "restore" ? "Folder restored." : "Folder permanently deleted.");
    } catch (err) { setError(err.message); }
  }
  function toggleReelSelection(id) {
    setSelectedReels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function startSelection() {
    setSelectionMode(true);
    setSelectedReels(new Set());
  }
  function cancelSelection() {
    setSelectionMode(false);
    setSelectedReels(new Set());
  }
  async function runBulkAction(action, folderId) {
    const items = [...new Map(reels.filter((reel) => selectedReels.has(reel.id)).map((reel) => [reel.id, reel])).values()];
    if (!items.length) return;
    if (action === "permanent" && !window.confirm(`Permanently delete ${items.length} selected ${items.length === 1 ? "Reel" : "Reels"}? This cannot be undone.`)) return;
    try {
      if (action === "restore" || action === "permanent") {
        await Promise.all(items.map((reel) => api(`trash/${reel.id}/${action}`, { method: "POST", body: {} })));
        const ids = new Set(items.map((reel) => reel.id));
        setDeletedReels((current) => current.filter((reel) => !ids.has(reel.id)));
      } else if (action === "delete") {
        await Promise.all(items.map((reel) => api(`reels/${reel.id}/trash`, { method: "POST", body: {} })));
      } else if (action === "hide" || action === "unhide") {
        await Promise.all(items.map((reel) => api(`reels/${reel.id}/${action}`, { method: "POST", body: { scope: reel.viewScope || "all" } })));
      } else {
        await Promise.all(items.map((reel) => api(`reels/${reel.id}/copy`, { method: "POST", body: { folderId, favorite: false } })));
      }
      await mutate("library", "GET");
      cancelSelection();
      setModal(null);
      setNotice(`${items.length} ${items.length === 1 ? "Reel" : "Reels"} ${action === "restore" ? "restored" : action === "permanent" ? "permanently deleted" : "updated"}.`);
    } catch (err) { setError(err.message); }
  }
  async function changeFolderMemberRole(folder, member, role) {
    await api(`sharing/folder/${folder.id}/members/${member.recipientId}`, {
      method: "PATCH",
      body: { role },
    });
    await mutate("library", "GET");
    setNotice(`@${member.username} is now a ${role}.`);
  }
  async function revokeFolderMember(folder, member) {
    await api(`sharing/folder/${folder.id}/members/${member.recipientId}`, { method: "DELETE" });
    await mutate("library", "GET");
    setNotice(`Access revoked for @${member.username}.`);
  }
  async function leaveSharedFolder(folder) {
    if (!window.confirm(`Leave “${folder.name}”? You will lose access to its shared Reels.`)) return;
    try {
      await api(`sharing/folder/${folder.id}/leave`, { method: "DELETE", body: {} });
      setSelected("all");
      await mutate("library", "GET");
      setNotice(`You left “${folder.name}”.`);
    } catch (err) {
      setError(err.message);
    }
  }
  const reels = (() => {
    const query = search.trim().toLowerCase();
    const source = selected === "trash" ? deletedReels : (data?.reels || []);
    const filtered = source.filter(
      (r) =>
        (selected === "trash" || (selected === "all" && r.viewScope === "all") ||
          (selected === "shared" ? r.viewScope === "shared" : r.folderId === selected && r.viewScope === `folder:${selected}`)) &&
        (selected === "trash" || Boolean(r.isHidden) === showHidden) &&
        (selected === "trash" || viewFilter === "all" || viewFilter === "top-rated" ||
          (viewFilter === "pinned" ? r.isPinned : r.isFavorite)) &&
        (!query || r.title.toLowerCase().includes(query)),
    );
    if (viewFilter === "top-rated") {
      filtered.sort((a, b) => {
        const total = (reel) => Object.values(reel.reactionCounts || {}).reduce((sum, count) => sum + count, 0);
        return total(b) - total(a) || new Date(b.createdAt) - new Date(a.createdAt);
      });
    }
    return filtered;
  })();

  const activeFolder = data?.folders.find((folder) => folder.id === selected);
  const sectionTitle =
    selected === "shared"
          ? "Shared with Me"
        : selected === "trash"
          ? "Recently Deleted"
        : activeFolder?.name
          ? `${activeFolder.name}${showHidden ? " · Hidden" : ""}`
          : "All Reels";
  const sectionCount = selected === "trash" ? deletedReels.length + deletedFolders.length : reels.length;

  return (
    <>
      {showLoading ? (
        <LoadingScreen />
      ) : accountGate ? (
        <main className="gate">
          <Brand />
          <AuthScreen onSuccess={login} onCancel={cancelAddAccount} />
        </main>
      ) : !data?.user ? (
        <main className="gate">
          <Brand />
          <AuthScreen onSuccess={login} />
        </main>
      ) : (
        <div
          className={`app-shell has-sidebar ${sidebarCollapsed ? "is-collapsed" : ""}`}
        >
          <div
            className={`pull-refresh-indicator ${pullDistance > 0 ? "is-visible" : ""} ${pullRefreshing ? "is-refreshing" : ""}`}
            style={{ transform: `translate(-50%, ${pullDistance - 48}px)` }}
            role="status"
            aria-live="polite"
          >
            <span>{pullRefreshing ? "Refreshing…" : pullDistance >= 68 ? "Release to refresh" : "Pull to refresh"}</span>
          </div>
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((value) => !value)}
            folders={data.folders}
            reelCount={data.reels.filter((reel) => reel.viewScope === "all").length}
            selected={selected}
            onSelect={selectFolder}
            sharedCount={data.reels.filter((reel) => reel.viewScope === "shared").length}
            onRename={(folder) => manageFolder(folder, "rename")}
            onShare={(folder) => manageFolder(folder, "share")}
            onDelete={(folder) => manageFolder(folder, "delete")}
            onLock={(folder) => selectFolder(selected, folder.id)}
            onChangeRole={changeFolderMemberRole}
            onRevokeMember={revokeFolderMember}
            onLeaveFolder={leaveSharedFolder}
            onTrashSettings={() => setModal({ type: "trashSettings" })}
            onProtectSharedFolder={(folder) => setModal({ type: "sharedFolderPin", folder })}
            friends={data.friends || []}
            onOpenFriends={() => setModal({ type: "friends" })}
            onShareWithFriend={async (reelId, friend) => {
              try {
                await api(`sharing/reel/${reelId}/send`, { method: "POST", body: { username: friend.username, role: "viewer" } });
                await mutate("library", "GET");
                setNotice(`Reel shared with ${friend.displayName || `@${friend.username}`}.`);
              } catch (err) { setError(err.message); }
            }}
          />
          <div className="workspace">
            <Header
              user={data.user}
              sectionTitle={sectionTitle}
              sectionCount={sectionCount}
              sectionKind={activeFolder ? "folder" : selected}
              sectionIcon={activeFolder?.icon}
              search={search}
              onSearch={setSearch}
              onOpen={(type) => setModal({ type })}
              onLogout={logout}
              onLibraryChange={() => mutate("library", "GET")}
              appUpdate={appUpdate}
              onOpenTrash={() => selectFolder("trash")}
              hiddenAvailable={selected !== "trash"}
              showingHidden={showHidden}
              hiddenCount={(data.reels || []).filter((reel) => reel.isHidden && (selected === "all" ? reel.viewScope === "all" : selected === "shared" ? reel.viewScope === "shared" : reel.viewScope === `folder:${selected}`)).length}
              onToggleHidden={() => setShowHidden((value) => !value)}
              friendRequestCount={data.friendRequests?.length || 0}
              activeFolder={activeFolder}
              onChangeFolderRole={changeFolderMemberRole}
              onRevokeFolderMember={revokeFolderMember}
              onOpenFolderShare={(folder) => manageFolder(folder, "share")}
              onFolderSettings={(folder) => manageFolder(folder, "rename")}
              onFolderDelete={(folder) => manageFolder(folder, "delete")}
              onFolderLock={(folder) => selectFolder(selected, folder.id)}
              onLeaveFolder={leaveSharedFolder}
              onProtectSharedFolder={(folder) => setModal({ type: "sharedFolderPin", folder })}
              selectionMode={selectionMode}
              selectionCount={selectedReels.size}
              onStartSelection={startSelection}
              onCancelSelection={cancelSelection}
              onBulkAction={(action) => action === "add" ? setModal({ type: "bulkFolder", action }) : runBulkAction(action)}
              selectionCanDelete={selectedReels.size > 0 && reels.filter((reel) => selectedReels.has(reel.id)).every((reel) => reel.canManage)}
              viewFilter={viewFilter}
              onViewFilter={setViewFilter}
              mobileGrid={mobileGrid}
              mobileCompact={mobileHeaderCompact}
              onMobileGrid={() => setMobileGrid((value) => {
                const next = !value;
                try { localStorage.setItem("reelbag-mobile-grid", String(next)); } catch {}
                return next;
              })}
            />
            <div className="stream-navigation md:hidden">
              <FolderBar
                folders={data.folders}
                selected={selected}
                unlocked={unlocked}
                onSelect={selectFolder}
                onCreate={() => setModal({ type: "folder" })}
                onRename={(folder) => manageFolder(folder, "rename")}
                onShare={(folder) => manageFolder(folder, "share")}
                onDelete={(folder) => manageFolder(folder, "delete")}
                onLock={(folder) => selectFolder(selected, folder.id)}
                onTrashSettings={() => setModal({ type: "trashSettings" })}
                onChangeRole={changeFolderMemberRole}
                onLeaveFolder={leaveSharedFolder}
                onProtectSharedFolder={(folder) => setModal({ type: "sharedFolderPin", folder })}
                onAdd={() => setModal({ type: "reel" })}
              />
            </div>
            <main
              ref={feed}
              data-view={selected}
              className="stream mobile-feed-padding"
              id="main-content"
            >
              {reels.length || (selected === "trash" && deletedFolders.length) ? (
                <div
                  className={`reel-grid mx-auto w-full max-w-[1600px] grid-cols-[repeat(auto-fill,270px)] justify-between gap-x-0 gap-y-6 ${mobileGrid ? "is-mobile-grid" : ""}`}
                  role="region"
                  aria-label="Saved Reels"
                >
                  {selected === "trash" && deletedFolders.map((folder) => <DeletedFolderCard key={`folder-${folder.id}`} folder={folder}
                    onRestore={() => updateDeletedFolder(folder, "restore")}
                    onPermanentDelete={() => updateDeletedFolder(folder, "permanent")} />)}
                  {reels.map((reel) => (
                    <ReelCard
                      key={`${reel.id}:${reel.viewScope || "trash"}`}
                      reel={reel}
                      folder={data.folders.find((f) => f.id === reel.folderId)}
                      onShare={() =>
                        setModal({ type: "share", kind: "reel", item: reel })
                      }
                      onEdit={() => setModal({ type: "reel", reel })}
                      onToggle={async (flag) => {
                        try {
                          await mutate(`reels/${reel.id}/flags`, "PATCH", {
                            [flag]: !reel[flag],
                            scope: reel.viewScope || "all",
                          });
                        } catch (err) {
                          setError(err.message);
                        }
                      }}
                      onAddToFolder={() => setModal({ type: "addToFolder", reel })}
                      onFeature={async () => {
                        try {
                          await mutate(`reels/${reel.id}/feature`, "PATCH", { featured: !reel.isFeatured });
                          setNotice(reel.isFeatured ? "Removed from your profile." : "Featured on your profile.");
                        } catch (err) { setError(err.message); }
                      }}
                      onDelete={() => deleteReel(reel)}
                      hiddenMode={showHidden}
                      onHide={async () => {
                        try {
                          await mutate(`reels/${reel.id}/hide`, "POST", { scope: reel.viewScope || "all" });
                          setNotice("Reel hidden from your view.");
                        } catch (err) { setError(err.message); }
                      }}
                      onUnhide={async () => {
                        try {
                          await mutate(`reels/${reel.id}/unhide`, "POST", { scope: reel.viewScope || "all" });
                          setNotice("Reel is visible again.");
                        } catch (err) { setError(err.message); }
                      }}
                      onCopyToLibrary={async (favorite) => {
                        try {
                          await mutate(`reels/${reel.id}/copy`, "POST", { favorite });
                          setNotice(favorite ? "Saved a personal copy to Favorites." : "Saved a personal copy to All Reels.");
                        } catch (err) { setError(err.message); }
                      }}
                      onExternalShare={async () => {
                        try {
                          if (navigator.share) await navigator.share({ title: reel.title, url: reel.url });
                          else {
                            await navigator.clipboard.writeText(reel.url);
                            setNotice("Instagram Reel link copied.");
                          }
                        } catch (err) {
                          if (err?.name !== "AbortError") {
                            try {
                              await navigator.clipboard.writeText(reel.url);
                              setNotice("Instagram Reel link copied.");
                            } catch { setError("Could not share this Reel."); }
                          }
                        }
                      }}
                      onRevokeShare={async (person) => {
                        try {
                          await api(`sharing/reel/${reel.id}/members/${person.recipientId}`, { method: "DELETE", body: {} });
                          await mutate("library", "GET");
                          setNotice(`Sharing with @${person.username} revoked.`);
                        } catch (err) { setError(err.message); }
                      }}
                      trashMode={selected === "trash"}
                      onRestore={() => updateDeletedReel(reel, "restore")}
                      onPermanentDelete={() => updateDeletedReel(reel, "permanent")}
                      onReact={async (emoji) => {
                        try {
                          await mutate(`reels/${reel.id}/reaction`, "POST", { emoji });
                        } catch (err) {
                          setError(err.message);
                          throw err;
                        }
                      }}
                      onDragStart={() => setNotice(`Drop “${reel.title}” onto a friend in the sidebar.`)}
                      onDragEnd={() => setNotice("")}
                      selectionMode={selectionMode}
                      selected={selectedReels.has(reel.id)}
                      onSelect={() => toggleReelSelection(reel.id)}
                    />
                  ))}
                </div>
              ) : (
                <section className="empty-state">
                  <Bookmark size={30} strokeWidth={1.3} />
                  <h2>
                    {search
                      ? "No matching reels."
                      : showHidden
                        ? "Nothing hidden here."
                      : "A place for the good ones."}
                  </h2>
                  <p>
                    {search
                      ? "Try another title."
                      : showHidden
                        ? "Reels you hide from this shared folder will appear here."
                      : viewFilter === "pinned"
                        ? "No pinned Reels in this view."
                        : viewFilter === "favorites"
                          ? "No favorite Reels in this view."
                          : selected === "shared"
                            ? "Reels sent by your friends will appear here automatically."
                          : selected === "trash"
                            ? "Deleted Reels will wait here until you restore or permanently delete them."
                          : "Add a reel, or open a folder above."}
                  </p>
                  <button
                    className="button-secondary"
                    onClick={() => {
                      if (search) setSearch("");
                      else if (showHidden) setShowHidden(false);
                      else if (viewFilter !== "all") setViewFilter("all");
                      else if (["shared", "trash"].includes(selected)) setSelected("all");
                      else setModal({ type: "reel" });
                    }}
                  >
                    {search
                      ? "Clear search"
                      : showHidden
                        ? "Back to folder"
                      : viewFilter !== "all"
                        ? "Clear filter"
                      : ["shared", "trash"].includes(selected)
                        ? "Browse all reels"
                        : "Add your first reel"}
                  </button>
                </section>
              )}
            </main>
          </div>
          {selected !== "trash" && <button
            className="reel-fab"
            aria-label="Add Reel"
            onClick={() => setModal({ type: "reel" })}
          >
            <Plus size={21} />
            <span>Add Reel</span>
          </button>}
        </div>
      )}

      {data?.user && modal?.type === "recoverySettings" && (
        <RecoverySettingsModal
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            setNotice(message);
          }}
        />
      )}
      {data?.user && modal?.type === "friends" && (
        <FriendsModal
          data={data}
          onClose={() => setModal(null)}
          onMutate={mutate}
          onNotice={setNotice}
        />
      )}
      {data?.user && modal?.type === "unlockTrash" && (
        <Modal title="Recently Deleted" description="This view is PIN protected." onClose={() => setModal(null)}>
          <PinForm
            label="Recently Deleted PIN"
            submitLabel="Open Recently Deleted"
            onVerify={async (pin) => {
              const result = await api("trash/open", { method: "POST", body: { pin } });
              trashPinRef.current = pin;
              setDeletedReels(result.items);
              setDeletedFolders(result.folders || []);
              setTrashUnlocked(true);
              setSelected("trash");
              setSearch("");
              setModal(null);
            }}
          />
        </Modal>
      )}
      {data?.user && modal?.type === "trashSettings" && (
        <TrashSettingsModal
          protectedTrash={data.user.trashProtected}
          onClose={() => setModal(null)}
          onSaved={async (protectedTrash) => {
            await mutate("library", "GET");
            if (protectedTrash) {
              setTrashUnlocked(false);
              trashPinRef.current = "";
            }
            setModal(null);
            setNotice(protectedTrash ? "Recently Deleted PIN saved." : "Recently Deleted PIN removed.");
          }}
        />
      )}
      {data?.user && modal?.type === "accounts" && (
        <AccountSwitcherModal currentUser={data.user} onSwitch={switchAccount} onAdd={addAccount} onClose={() => setModal(null)} />
      )}
      {data?.user && modal?.type === "share" && (
        <ShareModal
          type={modal.kind}
          item={modal.item}
          onClose={() => setModal(null)}
          onChange={() => mutate("library", "GET")}
        />
      )}
      {data?.user && modal?.type === "addToFolder" && (
        <MoveReelModal
          copy
          reel={modal.reel}
          folders={data.folders.filter((folder) => folder.role === "owner" || folder.role === "collaborator")}
          onClose={() => setModal(null)}
          initialFolderId={modal.createdFolderId}
          onCreateFolder={() => setModal({ type: "folder", returnTo: modal })}
          onSave={async (folderId) => {
            await mutate(`reels/${modal.reel.id}/copy`, "POST", { folderId, favorite: false });
            setModal(null);
            setSelected(folderId);
            setNotice("Reel added to the folder.");
          }}
        />
      )}
      {data?.user && modal?.type === "bulkFolder" && (
        <MoveReelModal
          copy
          reel={{ title: `${selectedReels.size} selected ${selectedReels.size === 1 ? "Reel" : "Reels"}`, folderId: selected }}
          title="Add selected to folder"
          folders={data.folders.filter((folder) => folder.role === "owner" || folder.role === "collaborator")}
          initialFolderId={modal.createdFolderId}
          onClose={() => setModal(null)}
          onCreateFolder={() => setModal({ type: "folder", returnTo: modal })}
          onSave={(folderId) => runBulkAction(modal.action, folderId)}
        />
      )}
      {data?.user && modal?.type === "reel" && (
        <ReelModal
          reel={modal.reel}
          draft={modal.draft}
          initialUrl={modal.initialUrl}
          folders={data.folders.filter(
            (folder) =>
              folder.role === "owner" ||
              (!modal.reel && folder.role === "collaborator"),
          )}
          folderId={
            data.folders.some(
              (folder) => folder.id === selected && folder.role !== "viewer",
            )
              ? selected
              : null
          }
          onSave={saveReel}
          onClose={() => setModal(null)}
          onCreateFolder={async (name) => {
            const next = await mutate("folders", "POST", {
              name,
              protected: false,
              pin: "",
            });
            return next.folderId;
          }}
        />
      )}
      {data?.user && modal?.type === "folder" && (
        <FolderModal
          folder={modal.folder}
          onSave={saveFolder}
          onClose={() => setModal(modal.returnTo || null)}
        />
      )}
      {data?.user && modal?.type === "sharedFolderPin" && (
        <SharedFolderPinModal folder={modal.folder} onClose={() => setModal(null)} onSave={async (settings) => {
          await mutate(`folders/${modal.folder.id}/recipient-pin`, "POST", settings);
          setModal(null);
          setNotice(settings.enabled ? "Shared folder PIN saved." : "Shared folder PIN removed.");
        }} />
      )}
      {data?.user && modal?.type === "unlockFolder" && (
        <Modal
          title={modal.folder.name}
          description="This folder is PIN protected."
          onClose={() => setModal(null)}
        >
          <PinForm
            onVerify={async (pin) => {
              const next = await mutate(
                `folders/${modal.folder.id}/${modal.folder.role === "owner" ? "unlock" : "shared-unlock"}`,
                "POST",
                {
                  pin,
                },
              );
              if (modal.afterUnlock) {
                manageFolder(
                  next.folders.find((folder) => folder.id === modal.folder.id),
                  modal.afterUnlock,
                );
              } else {
                setSelected(modal.folder.id);
                setSearch("");
                setModal(null);
              }
            }}
          />
        </Modal>
      )}
      {data?.user && modal?.type === "profile" && (
        <ProfileModal
          user={data.user}
          onClose={() => setModal(null)}
          onSaveProfile={(profile) =>
            mutate("account/profile", "PATCH", profile)
          }
        />
      )}
      {data?.user && modal?.type === "security" && (
        <SecurityModal
          user={data.user}
          onClose={() => setModal(null)}
          onSaveHint={(passwordHint) =>
            mutate("account/profile", "PATCH", { passwordHint })
          }
          onRecovery={() => setModal({ type: "recoverySettings" })}
          onChangePassword={(body) => mutate("account/password", "POST", body)}
        />
      )}
      {data?.user && modal?.type === "appearance" && (
        <AppearanceModal
          value={data.user.appearance || DEFAULT_APPEARANCE}
          onPreview={setAppearancePreview}
          onClose={() => setModal(null)}
          onSave={(appearance) =>
            mutate("account/profile", "PATCH", { appearance })
          }
        />
      )}
      {data?.user && modal?.type === "data" && (
        <Modal title="Data & Backups" onClose={() => setModal(null)}>
          <DataPanel
            user={data.user}
            onImport={(backup) => setModal({ type: "import", backup })}
            onLegacy={(backup) => setModal({ type: "legacyImport", backup })}
          />
        </Modal>
      )}
      {data?.user && modal?.type === "import" && (
        <Modal
          title="Copy backup to cloud?"
          description="This adds reels and folders to your account without replacing existing data. Imported folders start without PINs. Protect them again after importing. Passwords are never included."
          onClose={() => setModal(null)}
        >
          <div className="dialog-actions">
            <button className="button-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="button-primary"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await importLibrary(modal.backup);
                } catch (err) {
                  setError(err.message);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Importing…" : "Import to cloud"}
            </button>
          </div>
        </Modal>
      )}
      {data?.user && modal?.type === "legacyImport" && (
        <Modal title="Import previous library" onClose={() => setModal(null)}>
          <LegacyImport data={modal.backup} onComplete={importLibrary} />
        </Modal>
      )}
      {data?.user && modal?.type === "deleteFolder" && (
        <Modal
          title="Delete folder?"
          description="The complete folder and its Reels will move to Recently Deleted. You can restore it later or delete it permanently."
          onClose={() => {
            if (!deleting) setModal(null);
          }}
        >
          <div className="dialog-actions">
            <button
              className="button-secondary"
              disabled={deleting}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="button-danger"
              disabled={deleting}
              onClick={removeFolder}
            >
              {deleting
                ? "Removing…"
                : "Delete folder"}
            </button>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
