"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  LogOut,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import Brand from "../components/Brand";
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
import SettingsPanel from "../components/SettingsPanel";
import { api } from "../utils/api.mjs";
import { parseReelUrl } from "../utils/reels.mjs";

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selected, setSelected] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [deleting, setDeleting] = useState(false);
  const epoch = useRef(0);
  const pending = useRef(0);
  const userId = data?.user?.id;
  const folderCounts = useMemo(
    () =>
      (data?.reels || []).reduce((counts, reel) => {
        if (reel.folderId)
          counts[reel.folderId] = (counts[reel.folderId] || 0) + 1;
        return counts;
      }, {}),
    [data],
  );
  function editFolder(folder) {
    setModal({
      type: folder.pin && !folder.unlocked ? "unlockFolder" : "folder",
      folder,
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
      ["all", "pinned", "favorites"].includes(previous) ||
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
    const interval = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, apply, clearSession]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  async function mutate(path, method, body = {}) {
    const version = ++epoch.current;
    pending.current += 1;
    try {
      const next = await api(path, { method, body });
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
  async function selectFolder(id, lockId) {
    if (lockId) {
      try {
        await mutate(`folders/${lockId}/lock`, "POST");
        setSelected("all");
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
        draft: { ...modal.returnTo.draft, folderId },
      });
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
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      if (modal.type === "deleteFolder") {
        await mutate(`folders/${modal.folder.id}`, "DELETE");
        setSelected("all");
      } else await mutate(`reels/${modal.reel.id}`, "DELETE");
      setModal(null);
      setNotice("Deleted from cloud.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }
  const reels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.reels || []).filter(
      (r) =>
        (selected === "all" ||
          (selected === "pinned"
            ? r.isPinned
            : selected === "favorites"
              ? r.isFavorite
              : r.folderId === selected)) &&
        (!query || r.title.toLowerCase().includes(query)),
    );
  }, [data, selected, search]);

  return (
    <>
      {loading ? (
        <main className="gate">
          <Brand />
          <p className="muted-copy mt-12" role="status">
            Connecting to your library…
          </p>
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
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((value) => !value)}
            folders={data.folders}
            counts={folderCounts}
            reelCount={data.reels.length}
            selected={selected}
            onSelect={selectFolder}
            pinnedCount={data.reels.filter((reel) => reel.isPinned).length}
            favoriteCount={data.reels.filter((reel) => reel.isFavorite).length}
            onCreate={() => setModal({ type: "folder" })}
            onSettings={() => setModal({ type: "settings" })}
            onLogout={logout}
            username={data.user.username}
          />
          <div className="workspace">
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
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <FolderBar
                folders={data.folders}
                selected={selected}
                unlocked={unlocked}
                onSelect={selectFolder}
                onCreate={() => setModal({ type: "folder" })}
                onEdit={editFolder}
              />
              <button
                className="button-primary add-reel"
                onClick={() => setModal({ type: "reel" })}
              >
                <Plus size={17} />
                <span>Add Reel</span>
              </button>
              <div className="header-actions mobile-header-actions">
                <button
                  className="icon-button"
                  aria-label="Settings"
                  title="Settings"
                  onClick={() => setModal({ type: "settings" })}
                >
                  <Settings size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={logout}
                >
                  <LogOut size={18} />
                </button>
              </div>
            </header>
            <main className="stream" id="main-content">
              {reels.length ? (
                <div className="reel-grid">
                  {reels.map((reel) => (
                    <ReelCard
                      key={reel.id}
                      reel={reel}
                      folder={data.folders.find((f) => f.id === reel.folderId)}
                      onEdit={() => setModal({ type: "reel", reel })}
                      onToggle={async (flag) => {
                        try {
                          await mutate(`reels/${reel.id}/flags`, "PATCH", {
                            [flag]: !reel[flag],
                          });
                        } catch (err) {
                          setError(err.message);
                        }
                      }}
                      onMove={() => setModal({ type: "moveReel", reel })}
                      onDelete={() => setModal({ type: "deleteReel", reel })}
                    />
                  ))}
                </div>
              ) : (
                <section className="empty-state">
                  <Bookmark size={30} strokeWidth={1.3} />
                  <h1>
                    {search
                      ? "No matching reels."
                      : "A place for the good ones."}
                  </h1>
                  <p>
                    {search
                      ? "Try another title."
                      : selected === "pinned"
                        ? "Pin a reel to find it here."
                        : selected === "favorites"
                          ? "Star a reel to add it to your favorites."
                          : "Add a reel, or open a folder above."}
                  </p>
                  <button
                    className="button-secondary"
                    onClick={() =>
                      search ? setSearch("") : setModal({ type: "reel" })
                    }
                  >
                    {search
                      ? "Clear search"
                      : ["pinned", "favorites"].includes(selected)
                        ? "Browse all reels"
                        : "Add your first reel"}
                  </button>
                </section>
              )}
            </main>
          </div>
          <button
            className="mobile-fab"
            aria-label="Add Reel"
            onClick={() => setModal({ type: "reel" })}
          >
            <Plus size={21} />
            <span>Add Reel</span>
          </button>
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
      {data?.user && modal?.type === "moveReel" && (
        <MoveReelModal
          reel={modal.reel}
          folders={data.folders}
          onClose={() => setModal(null)}
          onSave={(folderId) => saveReel({ ...modal.reel, folderId })}
        />
      )}
      {data?.user && modal?.type === "reel" && (
        <ReelModal
          reel={modal.reel}
          draft={modal.draft}
          initialUrl={modal.initialUrl}
          folders={data.folders}
          folderId={
            data.folders.some((folder) => folder.id === selected)
              ? selected
              : null
          }
          onSave={saveReel}
          onClose={() => setModal(null)}
          onCreateFolder={(draft) =>
            setModal({ type: "folder", returnTo: { ...modal, draft } })
          }
        />
      )}
      {data?.user && modal?.type === "folder" && (
        <FolderModal
          folder={modal.folder}
          onSave={saveFolder}
          onClose={() => setModal(modal.returnTo || null)}
          onDelete={() =>
            setModal({ type: "deleteFolder", folder: modal.folder })
          }
        />
      )}
      {data?.user && modal?.type === "unlockFolder" && (
        <Modal
          title={modal.folder.name}
          description="This folder is PIN protected."
          onClose={() => setModal(null)}
        >
          <PinForm
            onVerify={async (pin) => {
              await mutate(`folders/${modal.folder.id}/unlock`, "POST", {
                pin,
              });
              setSelected(modal.folder.id);
              setSearch("");
              setModal(null);
            }}
          />
        </Modal>
      )}
      {data?.user && modal?.type === "settings" && (
        <Modal title="Settings" onClose={() => setModal(null)}>
          <SettingsPanel
            user={data.user}
            onRecovery={() => setModal({ type: "recoverySettings" })}
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
      {data?.user && ["deleteReel", "deleteFolder"].includes(modal?.type) && (
        <Modal
          title={
            modal.type === "deleteFolder" ? "Delete folder?" : "Delete reel?"
          }
          description={
            modal.type === "deleteFolder"
              ? "The folder will be removed. Its reels will stay in your main stream without a folder or folder PIN. This affects every device."
              : "This removes the reel from your cloud library on every device. It cannot be undone."
          }
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
              onClick={remove}
            >
              {deleting
                ? "Deleting…"
                : `Delete ${modal.type === "deleteFolder" ? "folder" : "reel"}`}
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
