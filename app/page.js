"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  LockKeyhole,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import FolderBar from "../components/FolderBar";
import FolderModal from "../components/FolderModal";
import MigrationWizard from "../components/MigrationWizard";
import Modal from "../components/Modal";
import PinForm from "../components/PinForm";
import ReelCard from "../components/ReelCard";
import ReelModal from "../components/ReelModal";
import SettingsPanel from "../components/SettingsPanel";
import {
  LEGACY_KEY,
  loadData,
  loadLegacyData,
  parseReelUrl,
  saveData,
  STORAGE_KEY,
} from "../utils/storage";

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Bookmark size={20} strokeWidth={2} />
      </span>
      Reelbag<span className="brand-dot">.</span>
    </span>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [unlocked, setUnlocked] = useState(new Set());
  const [selected, setSelected] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");

  useEffect(() => {
    function read() {
      try {
        setData(loadData());
        setLegacy(loadLegacyData());
        setLoadError("");
      } catch (err) {
        setLoadError(err.message);
      }
    }
    const frame = requestAnimationFrame(() => {
      read();
      const params = new URLSearchParams(window.location.search);
      const input =
        params.get("url") ||
        params.get("text")?.match(/https?:\/\/[^\s]+/)?.[0];
      if (parseReelUrl(input)) setSharedUrl(parseReelUrl(input).url);
    });
    function changed(event) {
      if (![STORAGE_KEY, LEGACY_KEY, null].includes(event.key)) return;
      read();
      setAuthenticated(false);
      setUnlocked(new Set());
      setSelected("all");
      setSearch("");
      setModal(null);
      setNotice("Library updated in another tab. Please unlock again.");
    }
    window.addEventListener("storage", changed);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", changed);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function commit(next) {
    const saved = saveData(next, data.revision);
    setData(saved);
    setError("");
    return saved;
  }
  function guard(action) {
    try {
      action();
    } catch (err) {
      setError(err.message);
    }
  }
  function lock() {
    setAuthenticated(false);
    setUnlocked(new Set());
    setSelected("all");
    setSearch("");
    setModal(null);
    setError("");
  }
  function openLibrary() {
    setAuthenticated(true);
    setModal(sharedUrl ? { type: "reel", initialUrl: sharedUrl } : null);
  }
  function selectFolder(id, lockId) {
    if (lockId)
      setUnlocked((previous) => {
        const next = new Set(previous);
        next.delete(lockId);
        return next;
      });
    const folder = data.folders.find((f) => f.id === id);
    if (folder?.pin && !unlocked.has(id)) {
      setModal({ type: "unlockFolder", folder });
      return;
    }
    setSelected(id);
    setSearch("");
  }
  function saveFolder(folder) {
    if (
      data.folders.some(
        (f) =>
          f.id !== folder.id &&
          f.name.toLowerCase() === folder.name.toLowerCase(),
      )
    )
      throw new Error("A folder with this name already exists.");
    const exists = data.folders.some((f) => f.id === folder.id);
    commit({
      ...data,
      folders: exists
        ? data.folders.map((f) => (f.id === folder.id ? folder : f))
        : [...data.folders, folder],
    });
    setUnlocked((previous) => new Set([...previous, folder.id]));
    if (modal.returnTo) {
      setModal({
        ...modal.returnTo,
        draft: { ...modal.returnTo.draft, folderId: folder.id },
      });
    } else {
      setSelected(folder.id);
      setSearch("");
      setModal(null);
    }
    setNotice("Folder saved.");
  }
  function saveReel(reel) {
    if (
      data.reels.some(
        (r) =>
          r.id !== reel.id &&
          r.shortcode === reel.shortcode &&
          r.folderId === reel.folderId,
      )
    )
      throw new Error("This reel is already saved in that folder.");
    commit({
      ...data,
      reels: modal.reel
        ? data.reels.map((r) => (r.id === reel.id ? reel : r))
        : [reel, ...data.reels],
    });
    // A reel moved into a locked folder must disappear from the current stream.
    if (
      reel.folderId &&
      data.folders.some((f) => f.id === reel.folderId && f.pin) &&
      !unlocked.has(reel.folderId)
    )
      setNotice("Reel saved in the locked folder.");
    else {
      setSelected(reel.folderId || "all");
      setSearch("");
      setNotice("Reel saved.");
    }
    setModal(null);
    setSharedUrl("");
    const url = new URL(window.location.href);
    ["url", "text", "title"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  function restore(backup) {
    commit({ ...backup, revision: data.revision });
    setLegacy(null);
    lock();
    setNotice("Backup restored. Unlock with the backup’s Master PIN.");
  }
  const reels = useMemo(() => {
    if (!data || !authenticated) return [];
    const lockedIds = new Set(
      data.folders.filter((f) => f.pin && !unlocked.has(f.id)).map((f) => f.id),
    );
    const query = search.trim().toLowerCase();
    return data.reels
      .filter(
        (r) =>
          !lockedIds.has(r.folderId) &&
          (selected === "all" || r.folderId === selected) &&
          (!query || r.title.toLowerCase().includes(query)),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [data, authenticated, unlocked, selected, search]);

  return (
    <>
      {loadError ? (
        <main className="gate">
          <Brand />
          <section className="gate-panel">
            <h1>Your library couldn’t be opened</h1>
            <p className="muted-copy" role="alert">
              {loadError}
            </p>
            <p className="muted-copy">
              Your stored data has not been changed. Enable browser storage, or
              preserve the Reelbag storage entries before restoring a backup.
            </p>
            <button
              className="button-primary"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </section>
        </main>
      ) : !data ? (
        <main className="gate">
          <Brand />
          <p className="muted-copy" role="status">
            Opening your library…
          </p>
        </main>
      ) : legacy ? (
        <main className="gate">
          <Brand />
          <section className="gate-panel">
            <MigrationWizard
              legacy={legacy}
              onComplete={(next) => {
                commit(next);
                setLegacy(null);
                openLibrary();
              }}
            />
          </section>
        </main>
      ) : !authenticated ? (
        <main className="gate">
          <Brand />
          <section className="gate-panel">
            <div className="gate-icon">
              <LockKeyhole size={22} />
            </div>
            <h1>
              {data.masterPin ? "Welcome back." : "Your reels. Your space."}
            </h1>
            <p className="muted-copy">
              {data.masterPin
                ? "One PIN. Everything worth keeping."
                : "Set a Master PIN to start your library."}
            </p>
            <PinForm
              create={!data.masterPin}
              credential={data.masterPin}
              onSuccess={(pin) => {
                if (!data.masterPin) commit({ ...data, masterPin: pin });
                openLibrary();
              }}
            />
            {!data.masterPin && (
              <p className="fine-print">
                Your library stays in this browser. PINs are hashed; data isn’t
                encrypted. There is no PIN recovery.
              </p>
            )}
          </section>
        </main>
      ) : (
        <div className="app-shell">
          <header className="topbar">
            <Brand />
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
              onEdit={(folder) => setModal({ type: "folder", folder })}
            />
            <button
              className="button-primary add-reel"
              onClick={() => setModal({ type: "reel" })}
            >
              <Plus size={17} />
              <span>Add Reel</span>
            </button>
            <div className="header-actions">
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
                aria-label="Lock app"
                title="Lock app"
                onClick={lock}
              >
                <LockKeyhole size={18} />
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
                    onDelete={() => setModal({ type: "deleteReel", reel })}
                  />
                ))}
              </div>
            ) : (
              <section className="empty-state">
                <Bookmark size={30} strokeWidth={1.3} />
                <h1>
                  {search ? "No matching reels." : "A place for the good ones."}
                </h1>
                <p>
                  {search
                    ? "Try another title."
                    : "Add a reel, or open a folder above."}
                </p>
                <button
                  className="button-secondary"
                  onClick={() =>
                    search ? setSearch("") : setModal({ type: "reel" })
                  }
                >
                  {search ? "Clear search" : "Add your first reel"}
                </button>
              </section>
            )}
          </main>
        </div>
      )}

      {authenticated && modal?.type === "reel" && (
        <ReelModal
          reel={modal.reel}
          draft={modal.draft}
          initialUrl={modal.initialUrl}
          folders={data.folders}
          folderId={selected === "all" ? null : selected}
          onSave={saveReel}
          onClose={() => setModal(null)}
          onCreateFolder={(draft) =>
            setModal({ type: "folder", returnTo: { ...modal, draft } })
          }
        />
      )}
      {authenticated && modal?.type === "folder" && (
        <FolderModal
          folder={modal.folder}
          onSave={saveFolder}
          onClose={() => setModal(modal.returnTo || null)}
          onDelete={() =>
            setModal({ type: "deleteFolder", folder: modal.folder })
          }
        />
      )}
      {authenticated && modal?.type === "unlockFolder" && (
        <Modal
          title={modal.folder.name}
          description="This folder is PIN protected."
          onClose={() => setModal(null)}
        >
          <PinForm
            folder
            credential={modal.folder.pin}
            label="Folder PIN"
            submitLabel="Open folder"
            onSuccess={() => {
              setUnlocked(
                (previous) => new Set([...previous, modal.folder.id]),
              );
              setSelected(modal.folder.id);
              setSearch("");
              setModal(null);
            }}
          />
        </Modal>
      )}
      {authenticated && modal?.type === "settings" && (
        <Modal title="Settings" onClose={() => setModal(null)}>
          <SettingsPanel
            data={data}
            onImport={(backup) => setModal({ type: "import", backup })}
            onChangePin={() => setModal({ type: "verifyMaster" })}
          />
        </Modal>
      )}
      {authenticated && modal?.type === "verifyMaster" && (
        <Modal
          title="Change Master PIN"
          description="Verify your current PIN first."
          onClose={() => setModal(null)}
        >
          <PinForm
            credential={data.masterPin}
            label="Current Master PIN"
            submitLabel="Continue"
            onSuccess={() => setModal({ type: "setMaster" })}
          />
        </Modal>
      )}
      {authenticated && modal?.type === "setMaster" && (
        <Modal title="New Master PIN" onClose={() => setModal(null)}>
          <PinForm
            create
            onSuccess={(pin) => {
              commit({ ...data, masterPin: pin });
              lock();
              setNotice("Master PIN updated. Unlock to continue.");
            }}
          />
        </Modal>
      )}
      {authenticated && modal?.type === "import" && (
        <Modal
          title="Replace your library?"
          description="This replaces every reel, folder, and PIN on this device. Export your current library first. This cannot be undone."
          onClose={() => setModal(null)}
        >
          <div className="form-stack">
            <p className="muted-copy">
              {modal.backup.version === 1
                ? "This is an older backup. Verify every old PIN and choose a new Master PIN in the next step."
                : "You will need the Master PIN from this backup. Folder PINs will also be preserved."}
            </p>
            <button
              className="button-primary"
              onClick={() =>
                guard(() =>
                  modal.backup.version === 1
                    ? setModal({ type: "legacyImport", backup: modal.backup })
                    : restore(modal.backup),
                )
              }
            >
              {modal.backup.version === 1
                ? "Continue migration"
                : "Replace & import"}
            </button>
            <button className="button-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {authenticated && modal?.type === "legacyImport" && (
        <Modal title="Migrate backup" onClose={() => setModal(null)}>
          <MigrationWizard legacy={modal.backup} onComplete={restore} />
        </Modal>
      )}
      {authenticated &&
        ["deleteReel", "deleteFolder"].includes(modal?.type) && (
          <Modal
            title={
              modal.type === "deleteFolder" ? "Delete folder?" : "Delete reel?"
            }
            description={
              modal.type === "deleteFolder"
                ? "The folder will be removed. Its reels will stay in your main stream without a folder or folder PIN."
                : "This removes the reel from your library. It cannot be undone."
            }
            onClose={() => setModal(null)}
          >
            <div className="dialog-actions">
              <button
                className="button-secondary"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                className="button-danger"
                onClick={() =>
                  guard(() => {
                    if (modal.type === "deleteFolder") {
                      commit({
                        ...data,
                        folders: data.folders.filter(
                          (f) => f.id !== modal.folder.id,
                        ),
                        reels: data.reels.map((r) =>
                          r.folderId === modal.folder.id
                            ? { ...r, folderId: null }
                            : r,
                        ),
                      });
                      setSelected("all");
                      setSearch("");
                      setUnlocked((previous) => {
                        const next = new Set(previous);
                        next.delete(modal.folder.id);
                        return next;
                      });
                    } else
                      commit({
                        ...data,
                        reels: data.reels.filter((r) => r.id !== modal.reel.id),
                      });
                    setModal(null);
                    setNotice("Deleted.");
                  })
                }
              >
                Delete {modal.type === "deleteFolder" ? "folder" : "reel"}
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
