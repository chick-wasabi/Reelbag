'use client';
import { useState } from 'react';
import { LockKeyhole, Loader2, Check } from 'lucide-react';
import Modal from './Modal';
import { COLORS, hashPin, uid, verifyPin } from '../utils/storage';

export default function AccountModal({ account, mode = 'create', onSave, onClose }) {
  const [name, setName] = useState(account?.name || ''); const [color, setColor] = useState(account?.color || 'lime');
  const [pin, setPin] = useState(''); const [confirmation, setConfirmation] = useState(''); const [currentPin, setCurrentPin] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const unlocking = mode === 'unlock';
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      if (unlocking) {
        if (!(await verifyPin(pin, account.pin))) throw new Error('That PIN doesn’t match. Please try again.');
        await onSave(account);
      } else {
        if (mode === 'edit' && !(await verifyPin(currentPin, account.pin))) throw new Error('Your current PIN doesn’t match.');
        if ((mode === 'create' || pin) && pin !== confirmation) throw new Error('The new PINs don’t match.');
        const credential = mode === 'edit' && !pin ? account.pin : await hashPin(pin);
        await onSave({ ...(account || { id: uid(), folders: [], reels: [] }), name: name.trim(), color, pin: credential });
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Modal title={unlocking ? `Welcome back, ${account.name}` : mode === 'edit' ? 'Edit your profile' : 'A space of your own'} description={unlocking ? 'Enter your PIN to open this library.' : 'Keep your interests in their own little worlds.'} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit} className="space-y-5">
      {!unlocking && <><label className="field-label">Profile name<input data-autofocus required maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="Personal, Bike Riding, With Friends…"/></label>
      <fieldset><legend className="field-label mb-3">Choose your color</legend><div className="flex gap-3">{COLORS.map(c => <button key={c} type="button" aria-label={c} aria-pressed={c === color} className={`color-dot color-${c} ${c === color ? 'selected' : ''}`} onClick={() => setColor(c)}>{c === color && <Check size={16}/>}</button>)}</div></fieldset></>}
      {mode === 'edit' && <label className="field-label">Current PIN<input required type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete="current-password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} /></label>}
      <label className="field-label">{unlocking ? 'Your PIN' : mode === 'edit' ? 'New PIN (leave empty to keep current)' : 'Create a PIN'}<input data-autofocus={unlocking ? true : undefined} required={mode !== 'edit'} type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete={unlocking ? 'current-password' : 'new-password'} value={pin} onChange={e => setPin(e.target.value)} placeholder="4–8 digits" /></label>
      {!unlocking && <label className="field-label">Confirm {mode === 'edit' ? 'new ' : ''}PIN<input required={mode === 'create' || Boolean(pin)} type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)}/></label>}
      {error && <p role="alert" className="error-text">{error}</p>}
      {!unlocking && <p className="flex gap-2 text-xs leading-relaxed text-zinc-400"><LockKeyhole size={15} className="shrink-0 mt-0.5"/>PINs are salted and hashed. Data stays in this browser and is not encrypted. There is no PIN recovery.</p>}
      <button disabled={busy || (!unlocking && !name.trim())} className="button-primary w-full" type="submit">{busy ? <Loader2 size={17} className="animate-spin"/> : <LockKeyhole size={16}/>} {busy ? 'One moment…' : unlocking ? 'Unlock library' : mode === 'edit' ? 'Save profile' : 'Create profile'}</button>
    </form>
  </Modal>;
}
