import React, { useState, useRef, useEffect } from 'react';
import UploadPage from './pages/UploadPage.jsx';
import MappingPage from './pages/MappingPage.jsx';
import ExportPage from './pages/ExportPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';

const TABS = ['Upload', 'Map Glyphs', 'Export', 'History', 'Help & Docs'];
const SESSION_KEY = 'cfs_session';

// ── SVG icons ────────────────────────────────────────────────────────────────
const IcoPen    = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>;
const IcoTrash  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IcoX      = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;

// ── Session persistence helpers ───────────────────────────────────────────────
function saveSession(tab, glyphs, mappings, fontName, preview) {
  try {
    const slim = glyphs.map(g => ({
      id: g.id, blob: g.blob, thumbUrl: g.thumbUrl, pad: g.pad, row: g.row,
      w: g.canvas.width, h: g.canvas.height,
    }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ tab, glyphs: slim, mappings, fontName, preview }));
  } catch (e) { console.warn('Session save failed:', e); }
}

async function restoreGlyph(slim) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = slim.w; canvas.height = slim.h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, slim.w, slim.h);
      resolve({ ...slim, canvas, imageData });
    };
    img.src = slim.thumbUrl;
  });
}

async function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { tab, glyphs: slim, mappings, fontName, preview } = JSON.parse(raw);
    if (!slim?.length) return null;
    const glyphs = await Promise.all(slim.map(restoreGlyph));
    return { tab: tab ?? 0, glyphs, mappings: mappings ?? {}, fontName: fontName ?? '', preview: preview ?? null };
  } catch (e) { console.warn('Session restore failed:', e); return null; }
}

// ── Custom confirm modal ──────────────────────────────────────────────────────
function ConfirmModal({ open, title, body, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.6)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onCancel}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', padding:'28px 24px',
        maxWidth:360, width:'100%', boxShadow:'var(--shadow-md)',
        animation:'fadeInUp .2s var(--ease) both',
      }}>
        <h3 style={{ marginBottom:10, fontSize:'1.05rem', display:'flex', alignItems:'center', gap:8 }}>
          {danger && <span style={{ color:'var(--danger)' }}><IcoTrash /></span>}
          {title}
        </h3>
        <p style={{ color:'var(--muted)', fontSize:'0.88rem', lineHeight:1.6, marginBottom:20 }}
          dangerouslySetInnerHTML={{ __html: body }} />
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding:'8px 18px', background:'var(--surface2)', border:'1px solid var(--border)',
              borderRadius:7, color:'var(--text)', fontSize:'0.88rem' }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding:'8px 18px', background: danger ? 'var(--danger)' : 'var(--accent2)',
              borderRadius:7, color:'#fff', fontWeight:700, fontSize:'0.88rem' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]           = useState(0);
  const [glyphs, setGlyphs]     = useState([]);
  const [mappings, setMappings] = useState({});
  const [fontName, setFontName] = useState('');
  const [preview, setPreview]   = useState(null);   // upload preview dataURL
  const [hydrated, setHydrated] = useState(false);  // wait for session restore
  const [showClear, setShowClear] = useState(false);
  const fontNameInputRef = useRef(null);

  // Restore session on mount
  useEffect(() => {
    loadSession().then(s => {
      if (s) {
        setGlyphs(s.glyphs);
        setMappings(s.mappings);
        setFontName(s.fontName);
        setPreview(s.preview);
        setTab(s.tab);
      }
      setHydrated(true);
    });
  }, []);

  // Persist session on every relevant change (debounced)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSession(tab, glyphs, mappings, fontName, preview);
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [tab, glyphs, mappings, fontName, preview, hydrated]);

  function clearSession() {
    setGlyphs([]); setMappings({}); setFontName(''); setPreview(null); setTab(0);
    setShowClear(false);
    localStorage.removeItem(SESSION_KEY);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const canMap    = glyphs.length > 0;
  const canExport = canMap && Object.keys(mappings).length > 0;

  // Don't render until session is hydrated to avoid flash
  if (!hydrated) return (
    <div style={{ minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:'0.9rem' }}>
      Restoring session…
    </div>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-row">
          <span className="app-brand">
            <IcoPen />
            Custom Font Studio
          </span>

          <nav className="app-nav">
            {TABS.map((t, i) => (
              <button key={t}
                className={`app-tab${tab === i ? ' is-active' : ''}`}
                onClick={() => {
                  if (i === 1 && !canMap) return;
                  if (i === 2 && !canExport) return;
                  setTab(i);
                }}
                disabled={(i === 1 && !canMap) || (i === 2 && !canExport)}
              >{t}</button>
            ))}
          </nav>

          {canMap && (
            <button onClick={() => setShowClear(true)} title="Clear session and start over"
              style={{ padding:'6px 11px', background:'rgba(248,113,113,0.10)',
                border:'1px solid rgba(248,113,113,0.35)', borderRadius:'var(--radius-sm)',
                color:'var(--danger)', fontSize:'0.8rem', fontWeight:600,
                whiteSpace:'nowrap', flexShrink:0,
                display:'flex', alignItems:'center', gap:5 }}>
              <IcoTrash /> Clear
            </button>
          )}

          <input ref={fontNameInputRef} type="text" className="app-fontname"
            value={fontName} onChange={e => setFontName(e.target.value)}
            placeholder="Type a name for your custom font file"
            title="Font family name" />
        </div>
      </header>

      <main>
        {tab === 0 && <UploadPage
          initialPreview={preview}
          onGlyphs={(g, dataUrl) => { setGlyphs(g); setMappings({}); setPreview(dataUrl); setTab(1); }} />}
        {tab === 1 && <MappingPage glyphs={glyphs} mappings={mappings} setMappings={setMappings}
          onDone={() => { setTab(2); window.scrollTo({ top:0, behavior:'smooth' }); }} />}
        {tab === 2 && <ExportPage glyphs={glyphs} mappings={mappings} fontName={fontName}
          setFontName={setFontName} fontNameInputRef={fontNameInputRef} />}
        {tab === 3 && <HistoryPage />}
        {tab === 4 && <HelpPage />}
      </main>

      <footer className="app-footer">
        <span>Made with care by BM</span>
        <a href="https://github.com/life-web-arch/customfont" target="_blank" rel="noreferrer">GitHub</a>
      </footer>

      <ConfirmModal
        open={showClear}
        title="Clear Session?"
        body="This will remove the uploaded image, all detected glyphs, mappings and the font name — returning you to the Upload screen.<br/><br/><strong style='color:var(--text)'>Your font history is kept safe.</strong>"
        confirmLabel="Yes, Clear"
        onConfirm={clearSession}
        onCancel={() => setShowClear(false)}
      />
    </div>
  );
}
