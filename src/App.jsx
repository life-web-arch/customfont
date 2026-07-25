import React, { useState, useRef } from 'react';
import UploadPage from './pages/UploadPage.jsx';
import MappingPage from './pages/MappingPage.jsx';
import ExportPage from './pages/ExportPage.jsx';
import HelpPage from './pages/HelpPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';

const TABS = ['Upload', 'Map Glyphs', 'Export', 'History', 'Help & Docs'];

export default function App() {
  const [tab, setTab] = useState(0);
  const [glyphs, setGlyphs] = useState([]); // segmented glyph data
  const [mappings, setMappings] = useState({}); // { index -> char }
  const [fontName, setFontName] = useState('');
  const fontNameInputRef = useRef(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  function clearSession() {
    setGlyphs([]);
    setMappings({});
    setFontName('');
    setTab(0);
    setShowClearConfirm(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const canMap = glyphs.length > 0;
  const canExport = canMap && Object.keys(mappings).length > 0;

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-row">
          <span className="app-brand">✍ Custom Font Studio</span>

          <nav className="app-nav">
            {TABS.map((t, i) => (
              <button
                key={t}
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

          {/* Clear session button — only shown when there's something to clear */}
          {canMap && (
            <button
              onClick={() => setShowClearConfirm(true)}
              title="Clear uploaded file and start over"
              style={{
                padding: '6px 11px',
                background: 'rgba(248,113,113,0.10)',
                border: '1px solid rgba(248,113,113,0.35)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--danger)',
                fontSize: '0.8rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >🗑 Clear</button>
          )}

          <input
            ref={fontNameInputRef}
            type="text"
            className="app-fontname"
            value={fontName}
            onChange={e => setFontName(e.target.value)}
            placeholder="Type a name for your custom font file"
            title="Font family name"
          />
        </div>
      </header>

      {/* Page */}
      <main>
        {tab === 0 && <UploadPage onGlyphs={g => { setGlyphs(g); setMappings({}); setTab(1); }} />}
        {tab === 1 && <MappingPage glyphs={glyphs} mappings={mappings} setMappings={setMappings} onDone={() => { setTab(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />}
        {tab === 2 && <ExportPage glyphs={glyphs} mappings={mappings} fontName={fontName} setFontName={setFontName} fontNameInputRef={fontNameInputRef} />}
        {tab === 3 && <HistoryPage />}
        {tab === 4 && <HelpPage />}
      </main>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }} onClick={() => setShowClearConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '28px 24px',
            maxWidth: 360,
            width: '100%',
            boxShadow: 'var(--shadow-md)',
          }}>
            <h3 style={{ marginBottom: 10, fontSize: '1.05rem' }}>🗑 Clear Session?</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 20 }}>
              This will remove the uploaded image, all detected glyphs, mappings, and the font name — returning you to the Upload screen.<br /><br />
              <strong style={{ color: 'var(--text)' }}>Your font history is kept safe.</strong>
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{ padding: '8px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: '0.88rem' }}
              >Cancel</button>
              <button
                onClick={clearSession}
                style={{ padding: '8px 18px', background: 'var(--danger)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}
              >Yes, Clear</button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span>Made with 💙 by BM</span>
        <a href="https://github.com/life-web-arch/customfont" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
