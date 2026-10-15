'use client';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, Trash2, Instagram, RefreshCw } from 'lucide-react';
import { STATUSES } from '../utils/storage';

let embedPromise;
function loadInstagram() {
  if (window.instgrm?.Embeds) return Promise.resolve();
  if (embedPromise) return embedPromise;
  embedPromise = new Promise((resolve, reject) => {
    let script = document.getElementById('instagram-embed-script');
    if (script) script.remove();
    script = document.createElement('script'); script.id = 'instagram-embed-script'; script.src = 'https://www.instagram.com/embed.js'; script.async = true;
    const timeout = setTimeout(() => { script.remove(); embedPromise = undefined; reject(new Error('Instagram timed out')); }, 20000);
    script.onload = () => { clearTimeout(timeout); if (window.instgrm?.Embeds) resolve(); else { embedPromise = undefined; reject(new Error('Instagram is unavailable')); } };
    script.onerror = () => { clearTimeout(timeout); script.remove(); embedPromise = undefined; reject(new Error('Instagram is unavailable')); };
    document.body.appendChild(script);
  });
  return embedPromise;
}

export default function ReelCard({ reel, folder, onEdit, onDelete, onStatus }) {
  const ref = useRef(null); const [visible, setVisible] = useState(false); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { const frame = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(frame); }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '250px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    loadInstagram().then(() => { if (!cancelled) { setFailed(false); window.instgrm.Embeds.process(); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [visible, reel.url, attempt]);
  return <article className="reel-card" ref={ref}>
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[.06]"><span className={`folder-label text-${folder?.color || 'lime'}`}><span className={`tiny-dot bg-${folder?.color || 'lime'}`}/><span className="truncate">{folder?.name || 'Unfiled'}</span></span><a href={reel.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${reel.title} on Instagram`} className="icon-button small"><ExternalLink size={15}/></a></div>
    <div className="embed-shell" key={`${reel.url}-${attempt}`}>
      {visible ? <blockquote className="instagram-media" data-instgrm-permalink={reel.url} data-instgrm-version="14" data-instgrm-captioned="true"><a href={reel.url} target="_blank" rel="noopener noreferrer" className="embed-fallback"><Instagram size={32}/><span>View this reel on Instagram</span><span className="text-xs opacity-60">Official Instagram preview</span></a></blockquote> : <div className="embed-fallback"><Instagram size={32}/><span>Reel preview</span></div>}
    </div>
    <div className="px-4 pt-3 pb-4"><h3 className="font-medium text-sm leading-relaxed break-words">{reel.title}</h3>{reel.note && <p className="mt-1.5 text-xs text-zinc-400 whitespace-pre-wrap break-words line-clamp-3">{reel.note}</p>}
      <div className="mt-4 flex items-center justify-between gap-2"><label className="sr-only" htmlFor={`status-${reel.id}`}>Status for {reel.title}</label><select id={`status-${reel.id}`} value={reel.status} onChange={e => onStatus(e.target.value)} className={`status-select status-${STATUSES.indexOf(reel.status)}`}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select><div className="flex gap-1"><button className="icon-button small" onClick={onEdit} aria-label={`Edit ${reel.title}`}><Pencil size={14}/></button><button className="icon-button small danger" onClick={onDelete} aria-label={`Delete ${reel.title}`}><Trash2 size={14}/></button></div></div>
      <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">{failed ? 'Instagram couldn’t load. ' : 'Preview unavailable or private? '}<a className="underline hover:text-zinc-200" href={reel.url} target="_blank" rel="noopener noreferrer">Open original</a>{failed && <button className="ml-2 inline-flex items-center gap-1 underline" onClick={() => setAttempt(a => a + 1)}><RefreshCw size={10}/>Retry</button>}</p>
    </div>
  </article>;
}
