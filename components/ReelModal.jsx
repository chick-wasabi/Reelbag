'use client';
import { useState } from 'react';
import { Link2, BookmarkPlus } from 'lucide-react';
import Modal from './Modal';
import { parseReelUrl, STATUSES, uid } from '../utils/storage';

export default function ReelModal({ reel, folders, folderId, initialUrl = '', onSave, onClose }) {
  const [url, setUrl] = useState(reel?.url || initialUrl); const [title, setTitle] = useState(reel?.title || ''); const [note, setNote] = useState(reel?.note || '');
  const [folder, setFolder] = useState(reel?.folderId || folderId || ''); const [status, setStatus] = useState(reel?.status || 'To Try'); const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault(); const parsed = parseReelUrl(url);
    if (!parsed) { setError('Paste an Instagram Reel link, like https://www.instagram.com/reel/ABC123/'); return; }
    try { onSave({ id: reel?.id || uid(), ...parsed, title: title.trim(), note: note.trim(), folderId: folder || null, status, createdAt: reel?.createdAt || new Date().toISOString() }); } catch (err) { setError(err.message); }
  }
  return <Modal title={reel ? 'Edit your reel' : 'Found something good?'} description="Save the link. Give it a home. Come back inspired." onClose={onClose}>
    <form onSubmit={submit} className="space-y-5">
      <label className="field-label"><span className="flex items-center gap-2"><Link2 size={14}/>Instagram Reel link</span><input data-autofocus required type="url" maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…"/></label>
      <label className="field-label">Title or caption<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Something you’ll remember it by"/></label>
      <div className="grid grid-cols-2 gap-4"><label className="field-label">Collection<select value={folder} onChange={e => setFolder(e.target.value)}><option value="">Unfiled</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="field-label">Status<select value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label></div>
      <label className="field-label">A note for later <span className="text-zinc-500 font-normal">(optional)</span><textarea rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} placeholder="What caught your eye?"/></label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button disabled={!title.trim()} className="button-primary w-full"><BookmarkPlus size={17}/>{reel ? 'Save changes' : 'Save to my library'}</button>
    </form>
  </Modal>;
}
