"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import Modal from "./Modal";
import PinForm from "./PinForm";
import { api } from "../utils/api.mjs";

export default function RecentlyDeletedModal({ user, onClose, onLibraryChange }) {
  const [items, setItems] = useState(null);
  const [protectedTrash, setProtectedTrash] = useState(Boolean(user.trashProtected));
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busyId, setBusyId] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function open(pin) {
    const result = await api("trash/open", { method: "POST", body: pin ? { pin } : {} });
    setItems(result.items);
    setProtectedTrash(result.protected);
  }

  useEffect(() => {
    if (user.trashProtected) return;
    let active = true;
    api("trash/open", { method: "POST", body: {} })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setProtectedTrash(result.protected);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [user.trashProtected]);

  async function changeItem(item, action) {
    if (action === "permanent" && !window.confirm(
      item.canManage
        ? `Permanently delete “${item.title}”? This cannot be undone.`
        : `Permanently remove “${item.title}” from your account?`,
    )) return;
    setBusyId(`${item.id}:${action}`);
    setError("");
    try {
      await api(`trash/${item.id}/${action}`, { method: "POST", body: {} });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      await onLibraryChange();
      setMessage(action === "restore" ? "Reel restored." : "Reel permanently removed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function savePin(event, enabled = true) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (enabled && !/^\d{4}$/.test(newPin)) {
      setError("Use exactly 4 digits for the new PIN.");
      return;
    }
    if (enabled && newPin !== confirmPin) {
      setError("The new PINs do not match.");
      return;
    }
    setSavingPin(true);
    try {
      const result = await api("trash/pin", {
        method: "POST",
        body: { enabled, currentPin, newPin },
      });
      setProtectedTrash(result.protected);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setMessage(result.protected ? "Recently Deleted PIN saved." : "PIN protection removed.");
      await onLibraryChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPin(false);
    }
  }

  if (items === null && protectedTrash)
    return (
      <Modal
        title="Recently Deleted"
        description="Enter your PIN to view deleted Reels."
        onClose={onClose}
      >
        <PinForm
          label="Recently Deleted PIN"
          submitLabel="Open Recently Deleted"
          onVerify={open}
        />
      </Modal>
    );

  return (
    <Modal
      title="Recently Deleted"
      description="Restore Reels or remove them permanently. Shared Reels are removed only from your account."
      onClose={onClose}
      wide
    >
      <div className="trash-layout">
        <section className="trash-list" aria-label="Deleted Reels">
          {items?.length ? items.map((item) => (
            <article className="trash-item" key={item.id}>
              <div className="min-w-0">
                <strong title={item.title}>{item.title}</strong>
                <span>
                  {item.canManage
                    ? item.folderName || "Your Reel"
                    : `Shared by ${item.ownerDisplayName || `@${item.owner}`}`}
                  {item.deletedAt ? ` · Deleted ${new Date(item.deletedAt).toLocaleDateString()}` : ""}
                </span>
              </div>
              <div className="trash-item-actions">
                <button
                  className="button-secondary"
                  disabled={Boolean(busyId)}
                  onClick={() => changeItem(item, "restore")}
                >
                  <RotateCcw size={15} />
                  {busyId === `${item.id}:restore` ? "Restoring…" : "Restore"}
                </button>
                <button
                  className="button-danger"
                  disabled={Boolean(busyId)}
                  onClick={() => changeItem(item, "permanent")}
                >
                  <Trash2 size={15} />
                  {busyId === `${item.id}:permanent` ? "Removing…" : "Delete permanently"}
                </button>
              </div>
            </article>
          )) : (
            <div className="trash-empty">
              <Trash2 size={28} />
              <strong>Recently Deleted is empty.</strong>
              <span>Reels you remove will wait here until you restore or permanently delete them.</span>
            </div>
          )}
        </section>

        <section className="trash-pin-panel">
          <div className="trash-pin-title">
            {protectedTrash ? <ShieldCheck size={18} /> : <LockKeyhole size={18} />}
            <div>
              <strong>PIN protection</strong>
              <span>{protectedTrash ? "Protected with a 4-digit PIN" : "Add an optional 4-digit PIN"}</span>
            </div>
          </div>
          <form className="form-stack" onSubmit={(event) => savePin(event, true)}>
            {protectedTrash && (
              <label className="field-label">Current PIN
                <input required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} />
              </label>
            )}
            <label className="field-label">{protectedTrash ? "New 4-digit PIN" : "4-digit PIN"}
              <input required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value)} />
            </label>
            <label className="field-label">Confirm new PIN
              <input required type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
            </label>
            <button className="button-primary" disabled={savingPin}>Save PIN</button>
            {protectedTrash && (
              <button
                type="button"
                className="button-secondary"
                disabled={savingPin || !/^\d{4}$/.test(currentPin)}
                onClick={(event) => savePin(event, false)}
              >
                Remove PIN protection
              </button>
            )}
          </form>
        </section>
      </div>
      {error && <p className="error-text mt-4" role="alert">{error}</p>}
      {message && <p className="success-text mt-4" role="status">{message}</p>}
    </Modal>
  );
}
