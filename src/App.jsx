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

          <input
            ref={fontNameInputRef}
            type="text"
            className="app-fontname"
            value={fontName}
            onChange={e => setFontName(e.target.value)}
            placeholder="Type font name…"
            title="Font family name"
          />
        </div>
      </header>

      {/* Page */}
      <main>
        {tab === 0 && <UploadPage onGlyphs={g => { setGlyphs(g); setMappings({}); setTab(1); }} />}
        {tab === 1 && <MappingPage glyphs={glyphs} mappings={mappings} setMappings={setMappings} onDone={() => setTab(2)} />}
        {tab === 2 && <ExportPage glyphs={glyphs} mappings={mappings} fontName={fontName} setFontName={setFontName} fontNameInputRef={fontNameInputRef} />}
        {tab === 3 && <HistoryPage />}
        {tab === 4 && <HelpPage />}
      </main>

      <footer className="app-footer">
        <span>Custom Font Studio — MIT License</span>
        <a href="https://github.com/life-web-arch/customfont" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
