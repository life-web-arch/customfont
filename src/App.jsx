import React, { useState } from 'react';
import UploadPage from './pages/UploadPage.jsx';
import MappingPage from './pages/MappingPage.jsx';
import ExportPage from './pages/ExportPage.jsx';
import HelpPage from './pages/HelpPage.jsx';

const TABS = ['Upload', 'Map Glyphs', 'Export', 'Help & Docs'];

export default function App() {
  const [tab, setTab] = useState(0);
  const [glyphs, setGlyphs] = useState([]); // segmented glyph data
  const [mappings, setMappings] = useState({}); // { index -> char }
  const [fontName, setFontName] = useState('My Custom Font');

  const canMap = glyphs.length > 0;
  const canExport = canMap && Object.keys(mappings).length > 0;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <span style={{ fontWeight: 700, fontSize: '1.15rem', letterSpacing: '-0.02em', color: 'var(--accent)' }}>
          ✍ Custom Font Studio
        </span>
        <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => {
                if (i === 1 && !canMap) return;
                if (i === 2 && !canExport) return;
                setTab(i);
              }}
              disabled={(i === 1 && !canMap) || (i === 2 && !canExport)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: tab === i ? 'var(--accent)' : 'transparent',
                color: tab === i ? '#1a1a2e' : 'var(--muted)',
                fontWeight: tab === i ? 700 : 400,
                fontSize: '0.88rem',
              }}
            >{t}</button>
          ))}
        </nav>
        <input
          type="text"
          value={fontName}
          onChange={e => setFontName(e.target.value)}
          placeholder="Font name…"
          style={{ width: 180, fontSize: '0.88rem' }}
          title="Font family name"
        />
      </header>

      {/* Page */}
      <main style={{ flex: 1, padding: '24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {tab === 0 && <UploadPage onGlyphs={g => { setGlyphs(g); setMappings({}); setTab(1); }} />}
        {tab === 1 && <MappingPage glyphs={glyphs} mappings={mappings} setMappings={setMappings} onDone={() => setTab(2)} />}
        {tab === 2 && <ExportPage glyphs={glyphs} mappings={mappings} fontName={fontName} />}
        {tab === 3 && <HelpPage />}
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '12px 24px', color: 'var(--muted)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
        <span>Custom Font Studio — MIT License</span>
        <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
