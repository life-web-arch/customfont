import React, { useState, useRef, useCallback, useEffect } from 'react';

// SVG icons
const IcoTrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;

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

export default function MappingPage({ glyphs, mappings, setMappings, sourceUrl, setGlyphs, onDone }) {
  const [selected, setSelected] = useState(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [search, setSearch] = useState('');
  const [customChar, setCustomChar] = useState('');
  const [zoom, setZoom] = useState(40);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);
  const [cropAdj, setCropAdj] = useState({ t:0, b:0, l:0, r:0 });
  const cropPreviewRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 720);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 720);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

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

  const clearAll = () => setShowClearConfirm(true);

  const filteredChars = search
    ? CHAR_GROUPS.flatMap(g => [...g.chars]).filter(c => {
        const n = c.codePointAt(0).toString(16).toUpperCase();
        return c.toLowerCase().includes(search.toLowerCase()) || `U+${n}`.toLowerCase().includes(search.toLowerCase());
      })
    : [...CHAR_GROUPS[activeGroup].chars];

  const usedChars = new Set(Object.values(mappings));

  const openCropEditor = (i) => {
    const g = glyphs[i];
    setCropTarget({ glyphIdx: i, blob: g.blob, pad: g.pad ?? 24 });
    setCropAdj({ t:0, b:0, l:0, r:0 });
  };

  useEffect(() => {
    if (!cropTarget || !cropPreviewRef.current || !sourceUrl) return;
    const { blob, pad } = cropTarget;
    const img = new Image();
    img.onload = () => {
      const { t, b, l, r } = cropAdj;
      const x0 = Math.max(0, blob.x0 - pad - l);
      const y0 = Math.max(0, blob.y0 - pad - t);
      const x1 = Math.min(img.width,  blob.x1 + pad + r);
      const y1 = Math.min(img.height, blob.y1 + pad + b);
      const sw = x1 - x0, sh = y1 - y0;
      const maxW = Math.min(340, window.innerWidth - 80);
      const scale = Math.min(1, maxW / sw, 300 / sh);
      const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
      const c = cropPreviewRef.current;
      c.width = dw; c.height = dh;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, x0, y0, sw, sh, 0, 0, dw, dh);
      ctx.strokeStyle = '#7f9cf5';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, dw-2, dh-2);
    };
    img.src = sourceUrl;
  }, [cropTarget, cropAdj, sourceUrl]);

  const applyCrop = () => {
    if (!cropTarget || !sourceUrl) return;
    const { glyphIdx, blob, pad } = cropTarget;
    const { t, b, l, r } = cropAdj;
    const img = new Image();
    img.onload = () => {
      const x0 = Math.max(0, blob.x0 - pad - l);
      const y0 = Math.max(0, blob.y0 - pad - t);
      const x1 = Math.min(img.width,  blob.x1 + pad + r);
      const y1 = Math.min(img.height, blob.y1 + pad + b);
      const cw = x1 - x0, ch = y1 - y0;
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, x0, y0, cw, ch, 0, 0, cw, ch);
      const imageData = ctx.getImageData(0, 0, cw, ch);
      const thumbUrl = canvas.toDataURL('image/png');
      setGlyphs(prev => {
        const next = [...prev];
        next[glyphIdx] = { ...next[glyphIdx], canvas, imageData, thumbUrl, blob: { x0, y0, x1, y1 }, pad: 0 };
        return next;
      });
      setCropTarget(null);
    };
    img.src = sourceUrl;
  };

  return (<>
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
          maxHeight: isMobile
            ? `${2 * (zoom + 30) + 8}px`
            : '480px',
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
                <div style={{ position:'relative' }}>
                  <img src={g.thumbUrl} alt={`Glyph ${i}`} style={{ width: '100%', imageRendering: 'pixelated', display: 'block', background: '#fff' }} />
                  {sourceUrl && (
                    <button
                      onClick={e => { e.stopPropagation(); openCropEditor(i); }}
                      title="Adjust crop"
                      style={{
                        position:'absolute', top:2, right:2,
                        background:'rgba(0,0,0,0.55)', border:'none',
                        borderRadius:4, color:'#fff', fontSize:'0.65rem',
                        padding:'1px 4px', cursor:'pointer', lineHeight:1.4,
                        opacity: zoom < 50 ? 0 : 1,
                      }}
                    >✂</button>
                  )}
                </div>
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

      {cropTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.7)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setCropTarget(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', padding:'20px 18px',
            maxWidth:400, width:'100%', boxShadow:'var(--shadow-md)',
            animation:'fadeInUp .2s var(--ease) both',
          }}>
            <h3 style={{ marginBottom:4, fontSize:'1rem' }}>Adjust Crop — Glyph #{cropTarget.glyphIdx + 1}</h3>
            <p style={{ color:'var(--muted)', fontSize:'0.78rem', marginBottom:12 }}>
              Positive = expand outward · Negative = trim inward
            </p>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:14,
              background:'#fff', borderRadius:6, overflow:'hidden', border:'1px solid var(--border)' }}>
              <canvas ref={cropPreviewRef} style={{ display:'block', maxWidth:'100%' }} />
            </div>
            {[
              { key:'t', label:'Top' },
              { key:'b', label:'Bottom' },
              { key:'l', label:'Left' },
              { key:'r', label:'Right' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, fontSize:'0.85rem' }}>
                <span style={{ minWidth:52, color:'var(--muted)' }}>{label}</span>
                <input type="range" min={-30} max={80} value={cropAdj[key]}
                  onChange={e => setCropAdj(a => ({ ...a, [key]: +e.target.value }))}
                  style={{ flex:1 }} />
                <span style={{ fontFamily:'var(--font-mono)', minWidth:32, textAlign:'right', fontSize:'0.8rem' }}>
                  {cropAdj[key] > 0 ? '+' : ''}{cropAdj[key]}px
                </span>
              </label>
            ))}
            <div style={{ display:'flex', gap:10, marginTop:14, justifyContent:'flex-end' }}>
              <button onClick={() => setCropAdj({ t:0, b:0, l:0, r:0 })}
                style={{ padding:'7px 14px', background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:7, fontSize:'0.85rem', color:'var(--text)' }}>Reset</button>
              <button onClick={() => setCropTarget(null)}
                style={{ padding:'7px 14px', background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:7, fontSize:'0.85rem', color:'var(--text)' }}>Cancel</button>
              <button onClick={applyCrop}
                style={{ padding:'7px 16px', background:'var(--accent2)', color:'#fff',
                  borderRadius:7, fontWeight:700, fontSize:'0.85rem' }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom confirm modal */}
      {showClearConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:999, background:'rgba(0,0,0,0.6)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setShowClearConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', padding:'28px 24px',
            maxWidth:360, width:'100%', boxShadow:'var(--shadow-md)',
            animation:'fadeInUp .2s var(--ease) both' }}>
            <h3 style={{ marginBottom:10, fontSize:'1.05rem', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:'var(--danger)' }}><IcoTrash /></span> Clear All Mappings?
            </h3>
            <p style={{ color:'var(--muted)', fontSize:'0.88rem', lineHeight:1.6, marginBottom:20 }}>
              This will remove all character assignments. Glyph images are kept.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setShowClearConfirm(false)}
                style={{ padding:'8px 18px', background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:7, color:'var(--text)', fontSize:'0.88rem' }}>Cancel</button>
              <button onClick={() => { setMappings({}); setShowClearConfirm(false); }}
                style={{ padding:'8px 18px', background:'var(--danger)',
                  borderRadius:7, color:'#fff', fontWeight:700, fontSize:'0.88rem' }}>Yes, Clear All</button>
            </div>
          </div>
        </div>
      )}
  </>);
}
