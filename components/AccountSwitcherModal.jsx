"use client";

import { useEffect, useState } from "react";
import { Plus, UsersRound } from "lucide-react";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { api } from "../utils/api.mjs";

export default function AccountSwitcherModal({ currentUser, onSwitch, onAdd, onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api("auth/accounts", { signal: controller.signal }).then((result) => setAccounts(
      [...result.accounts].sort((a, b) => Number(b.id === currentUser.id) - Number(a.id === currentUser.id)),
    ))
      .catch((reason) => reason.name !== "AbortError" && setError(reason.message));
    return () => controller.abort();
  }, [currentUser.id]);
  return <Modal title="Switch account" description="Accounts saved securely on this device." onClose={onClose}>
    <div className="account-switch-list">
      {accounts.map((account) => {
        const current = account.id === currentUser.id;
        return <button key={account.id} type="button" disabled={busy || current} onClick={async () => {
          setBusy(true); setError("");
          try { await onSwitch(account); } catch (reason) { setError(reason.message); setBusy(false); }
        }}>
          <Avatar url={account.avatarUrl} frame={account.avatarFrame} name={account.displayName} size={42} />
          <span><strong>{account.displayName}</strong><small>@{account.username}</small></span>
          {current && <em>Current</em>}
        </button>;
      })}
      <button type="button" className="account-add-button" disabled={busy} onClick={onAdd}>
        <span className="account-add-icon"><Plus size={20} /></span>
        <span><strong>Add another account</strong><small>Log in or create a new account</small></span>
        <UsersRound size={17} />
      </button>
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
  </Modal>;
}
