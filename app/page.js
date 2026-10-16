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
import Header from "../components/Header";
import ProfileModal from "../components/ProfileModal";
import SecurityModal from "../components/SecurityModal";
import AppearanceModal from "../components/AppearanceModal";
import DataPanel from "../components/DataPanel";
import { DEFAULT_APPEARANCE } from "../utils/preferences.mjs";
import { createLogoSvg, LOGO_DARK } from "../utils/logo.mjs";
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
  const feed = useRef(null);
  const epoch = useRef(0);
  const pending = useRef(0);
  const userId = data?.user?.id;
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
  async function selectFolder(id, lockId) {
    if (lockId) {
      try {
        await mutate(`folders/${lockId}/lock`, "POST");
        setSelected((previous) => (previous === lockId ? "all" : previous));
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
  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      if (modal.type === "deleteFolder") {
        await mutate(`folders/${modal.folder.id}`, "DELETE");
        if (selected === modal.folder.id) setSelected("all");
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

  const activeFolder = data?.folders.find((folder) => folder.id === selected);
  const sectionTitle =
    selected === "pinned"
      ? "Pinned Reels"
      : selected === "favorites"
        ? "Favorites"
        : activeFolder?.name || "All Reels";
  const sectionCount = (data?.reels || []).filter(
    (reel) =>
      selected === "all" ||
      (selected === "pinned"
        ? reel.isPinned
        : selected === "favorites"
          ? reel.isFavorite
          : reel.folderId === selected),
  ).length;

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
            reelCount={data.reels.length}
            selected={selected}
            onSelect={selectFolder}
            pinnedCount={data.reels.filter((reel) => reel.isPinned).length}
            favoriteCount={data.reels.filter((reel) => reel.isFavorite).length}
            onCreate={() => setModal({ type: "folder" })}
            onRename={(folder) => manageFolder(folder, "rename")}
            onShare={(folder) => manageFolder(folder, "share")}
            onDelete={(folder) => manageFolder(folder, "delete")}
            onLock={(folder) => selectFolder(selected, folder.id)}
          />
          <div className="workspace">
            <Header
              user={data.user}
              sectionTitle={sectionTitle}
              sectionCount={sectionCount}
              sectionKind={activeFolder ? "folder" : selected}
              search={search}
              onSearch={setSearch}
              onOpen={(type) => setModal({ type })}
              onLogout={logout}
              onLibraryChange={() => mutate("library", "GET")}
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
              />
            </div>
            <main
              ref={feed}
              data-view={selected}
              className="stream"
              id="main-content"
            >
              {reels.length ? (
                <div
                  className="reel-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  role="region"
                  aria-label="Saved Reels"
                >
                  {reels.map((reel) => (
                    <ReelCard
                      key={reel.id}
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
                  <h2>
                    {search
                      ? "No matching reels."
                      : "A place for the good ones."}
                  </h2>
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
            className="reel-fab"
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
      {data?.user && modal?.type === "share" && (
        <ShareModal
          type={modal.kind}
          item={modal.item}
          onClose={() => setModal(null)}
          onChange={() => mutate("library", "GET")}
        />
      )}
      {data?.user && modal?.type === "moveReel" && (
        <MoveReelModal
          reel={modal.reel}
          folders={data.folders.filter((folder) => folder.role === "owner")}
          onClose={() => setModal(null)}
          onSave={(folderId) => saveReel({ ...modal.reel, folderId })}
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
              const next = await mutate(
                `folders/${modal.folder.id}/unlock`,
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
