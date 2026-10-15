'use client';
import { useState } from 'react';
import { Check, Folder } from 'lucide-react';
import Modal from './Modal';
import { COLORS, uid } from '../utils/storage';

export default function FolderModal({ folder, onSave, onClose }) {
  const [name, setName] = useState(folder?.name || ''); const [color, setColor] = useState(folder?.color || 'violet'); const [error, setError] = useState('');
  return <Modal title={folder ? 'Edit collection' : 'Make room for an idea'} description="A collection is a folder for the things you want to try." onClose={onClose}>
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); try { onSave({ id: folder?.id || uid(), name: name.trim(), color }); } catch (err) { setError(err.message); } }}>
      <label className="field-label">Collection name<input data-autofocus required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Weekend adventures"/></label>
      <fieldset><legend className="field-label mb-3">Folder color</legend><div className="flex gap-3">{COLORS.map(c => <button key={c} type="button" className={`color-dot color-${c} ${color === c ? 'selected' : ''}`} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c}>{color === c && <Check size={16}/>}</button>)}</div></fieldset>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="button-primary w-full" disabled={!name.trim()}><Folder size={16}/>{folder ? 'Save changes' : 'Create collection'}</button>
    </form>
  </Modal>;
}
