import React, { useState, useRef, useCallback } from 'react';

// All character groups for the picker
const CHAR_GROUPS = [
  { label: 'Uppercase', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { label: 'Lowercase', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { label: 'Digits', chars: '0123456789' },
  { label: 'Punctuation', chars: '.,;:!?\'"()-' },
  { label: 'Symbols', chars: '@#&+/$%=<>*^~_[]{}\\|/`' },
  { label: 'Currency', chars: '$€£¥₹₩₿' },
  { label: 'Accented (Latin)', chars: 'ÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ' },
  { label: 'Greek', chars: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω' },
  { label: 'Math', chars: '±×÷∞≠≈≤≥∑∏√∂∫∆∇' },
  { label: 'Arrows', chars: '←→↑↓↔↕⇐⇒⇑⇓' },
  { label: 'Misc', chars: '©®™°•·…‽§¶†‡' },
];

// Quick-fill sequences
const QUICK_FILL = [
  { label: 'A→Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { label: 'a→z', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { label: '0→9', chars: '0123456789' },
  { label: 'Full Latin', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' },
];

export default function MappingPage({ glyphs, mappings, setMappings, onDone }) {
  const [selected, setSelected] = useState(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [search, setSearch] = useState('');
  const [customChar, setCustomChar] = useState('');
  const [zoom, setZoom] = useState(80);

  const mapped = Object.keys(mappings).length;
  const total = glyphs.length;

  const assign = useCallback((glyphIdx, char) => {
    if (!char) return;
    setMappings(prev => {
      const next = { ...prev };
      // Remove char from any other glyph first (1:1 mapping)
      for (const k in next) if (next[k] === char && +k !== glyphIdx) delete next[k];
      next[glyphIdx] = char;
      return next;
    });
  }, [setMappings]);

  const unassign = useCallback((glyphIdx) => {
    setMappings(prev => { const n={...prev}; delete n[glyphIdx]; return n; });
  }, [setMappings]);

  const quickFill = useCallback((chars) => {
    const arr = [...chars];
    setMappings(prev => {
      const next = { ...prev };
      glyphs.forEach((g, i) => {
        if (i < arr.length) next[i] = arr[i];
      });
      return next;
    });
  }, [glyphs, setMappings]);

  const clearAll = () => { if (confirm('Clear all mappings?')) setMappings({}); };

  const filteredChars = search
    ? CHAR_GROUPS.flatMap(g => [...g.chars]).filter(c => {
        const n = c.codePointAt(0).toString(16).toUpperCase();
        return c.toLowerCase().includes(search.toLowerCase()) || `U+${n}`.toLowerCase().includes(search.toLowerCase());
      })
    : [...CHAR_GROUPS[activeGroup].chars];

  const usedChars = new Set(Object.values(mappings));

  return (
    <div className="mapping-layout">
      {/* Left: Glyph Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: 4 }}>Map Glyphs</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{mapped}/{total} mapped — click a glyph, then click a character</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {QUICK_FILL.map(q => (
              <button key={q.label} onClick={() => quickFill(q.chars)} style={{ padding: '5px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text)' }}>{q.label}</button>
            ))}
            <button onClick={clearAll} style={{ padding: '5px 10px', background: 'rgba(248,113,113,0.1)', border: '1px solid var(--danger)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--danger)' }}>Clear All</button>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>
              Zoom
              <input type="range" min={40} max={160} value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 80 }} />
            </label>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${zoom}px, 1fr))`,
          gap: 8,
          maxHeight: 'calc(100dvh - 260px)',
          overflowY: 'auto',
          paddingRight: 4,
        }}>
          {glyphs.map((g, i) => {
            const ch = mappings[i];
            const isSel = selected === i;
            return (
              <div
                key={i}
                onClick={() => setSelected(isSel ? null : i)}
                title={ch ? `Mapped to: ${ch}` : 'Not mapped — click to select'}
                className={`glyph-card${isSel ? ' is-selected' : ''}${ch ? ' is-mapped' : ''}`}
              >
                <img src={g.thumbUrl} alt={`Glyph ${i}`} style={{ width: '100%', imageRendering: 'pixelated', display: 'block', background: '#fff' }} />
                <div style={{
                  width: '100%',
                  background: ch ? 'rgba(74,222,128,0.15)' : 'var(--surface2)',
                  borderTop: '1px solid var(--border)',
                  textAlign: 'center',
                  fontSize: zoom < 60 ? '0.65rem' : '0.8rem',
                  padding: '2px 0',
                  color: ch ? 'var(--success)' : 'var(--muted)',
                  fontWeight: ch ? 700 : 400,
                  minHeight: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}>
                  {ch ? (
                    <>
                      <span>{ch}</span>
                      <button onClick={e => { e.stopPropagation(); unassign(i); }}
                        style={{ background: 'none', color: 'var(--muted)', fontSize: '0.7rem', lineHeight: 1, padding: '0 2px' }}
                        title="Remove mapping">✕</button>
                    </>
                  ) : <span style={{ opacity: .4 }}>#{i+1}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Done button */}
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button
            onClick={onDone}
            disabled={mapped === 0}
            className="btn-primary"
            style={{ padding: '10px 28px', fontSize: '0.95rem' }}
          >
            Export Font →
          </button>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem', alignSelf: 'center' }}>
            {mapped === 0 ? 'Map at least one glyph first' : `${mapped} glyph${mapped!==1?'s':''} ready to export`}
          </span>
        </div>
      </div>

      {/* Right: Character Picker */}
      <div className="card mapping-sidebar">
        <h3 style={{ marginBottom: 12, fontSize: '1rem' }}>
          {selected !== null ? `Assign to Glyph #${selected+1}` : 'Select a glyph first'}
        </h3>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search characters…" style={{ marginBottom: 10, fontSize: '0.88rem' }} />

        {/* Group tabs */}
        {!search && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {CHAR_GROUPS.map((g,i) => (
              <button key={g.label} onClick={() => setActiveGroup(i)}
                className={`group-tab${activeGroup===i ? ' is-active' : ''}`}>
                {g.label}
              </button>
            ))}
          </div>
        )}

        {/* Character grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
          {filteredChars.map(c => {
            const used = usedChars.has(c);
            const isCurrent = selected !== null && mappings[selected] === c;
            return (
              <button
                key={c}
                onClick={() => { if (selected !== null) assign(selected, c); }}
                disabled={selected === null}
                title={`U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')} — ${used && !isCurrent ? 'already mapped' : ''}`}
                className={`char-btn${isCurrent ? ' is-current' : ''}${used && !isCurrent ? ' is-used' : ''}`}
                style={{ cursor: selected === null ? 'default' : 'pointer' }}
              >{c}</button>
            );
          })}
        </div>

        {/* Custom character input */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>Or type any character / Unicode:</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={customChar}
              onChange={e => setCustomChar(e.target.value)}
              placeholder="Type char or U+1F600"
              style={{ fontSize: '0.88rem' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && selected !== null) {
                  let ch = customChar.trim();
                  if (/^U\+[0-9A-Fa-f]+$/i.test(ch)) ch = String.fromCodePoint(parseInt(ch.slice(2),16));
                  if (ch.length >= 1) { assign(selected, [...ch][0]); setCustomChar(''); }
                }
              }}
            />
            <button
              onClick={() => {
                if (selected === null) return;
                let ch = customChar.trim();
                if (/^U\+[0-9A-Fa-f]+$/i.test(ch)) ch = String.fromCodePoint(parseInt(ch.slice(2),16));
                if (ch.length >= 1) { assign(selected, [...ch][0]); setCustomChar(''); }
              }}
              style={{ padding: '8px 12px', background: 'var(--accent2)', color: '#fff', borderRadius: 7, whiteSpace: 'nowrap', fontSize: '0.85rem' }}
            >Assign</button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>Supports emoji, CJK, any Unicode</p>
        </div>

        {/* Mapping summary */}
        <div style={{ marginTop: 12, padding: 10, background: 'var(--surface2)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{mapped}</strong> mapped · <strong style={{ color: 'var(--text)' }}>{total - mapped}</strong> unassigned
        </div>
      </div>
    </div>
  );
}
