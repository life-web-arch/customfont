import React, { useState, useRef, useEffect } from 'react';
import { band, CAP, XH, DESC } from '../lib/metrics.js';

const GUIDES = [
  { y: CAP,  label: 'Cap',  color: '#6366f1' },
  { y: XH,   label: 'x',    color: '#8b5cf6' },
  { y: 0,    label: 'Base', color: '#e0c97f' },
  { y: DESC, label: 'Desc', color: '#f87171' },
];

export default function AlignPage({ glyphs, mappings, glyphOverrides, setGlyphOverrides, onNext }) {
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);
  const thumbRefs = useRef({});
  const previewRef = useRef(null);
  const dragRef = useRef(null);

  function getOvr(idx) {
    return glyphOverrides[idx] || { offsetY: 0, scaleX: 1, scaleY: 1 };
  }
  function setOvr(idx, patch) {
    setGlyphOverrides(prev => ({ ...prev, [idx]: { ...getOvr(idx), ...patch } }));
  }

  const mappedEntries = Object.entries(mappings);
  const sel = selected !== null
    ? { idx: +selected, char: mappings[selected], ovr: getOvr(+selected), glyph: glyphs[+selected] }
    : null;

  function drawGlyph(canvas, glyph, char, ovr, highlight) {
    if (!canvas || !glyph) return;
    const { offsetY = 0, scaleX = 1, scaleY = 1 } = ovr;
    const [bot, top] = band(char || 'A');
    const bandH = top - bot;
    const cw = canvas.width, ch = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = highlight ? '#1e293b' : '#0f172a';
    ctx.fillRect(0, 0, cw, ch);
    const baseY = ch * 0.75;
    const pxPerUnit = (ch * 0.65) / CAP;
    GUIDES.forEach(g => {
      ctx.strokeStyle = g.color + '88';
      ctx.lineWidth = g.y === 0 ? 1.5 : 1;
      ctx.setLineDash(g.y === 0 ? [] : [4, 4]);
      const py = baseY - g.y * pxPerUnit;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(cw, py); ctx.stroke();
    });
    ctx.setLineDash([]);
    if (glyph.canvas) {
      const gh = glyph.canvas.height, gw = glyph.canvas.width;
      const tgtH = bandH * pxPerUnit * scaleY;
      const tgtW = (gw / gh) * tgtH * scaleX;
      const dx = (cw - tgtW) / 2;
      const dy = baseY - (bot + bandH) * pxPerUnit * scaleY + offsetY;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(glyph.canvas, dx, dy, tgtW, tgtH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = highlight ? '#e0c97f' : '#94a3b8';
    ctx.font = `bold ${Math.round(cw * 0.18)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(char || '?', cw / 2, ch - 6);
  }

  function getThumbRef(key) {
    if (!thumbRefs.current[key]) thumbRefs.current[key] = React.createRef();
    return thumbRefs.current[key];
  }

  useEffect(() => {
    mappedEntries.forEach(([idxStr, char]) => {
      const ref = thumbRefs.current[idxStr];
      if (ref && ref.current) drawGlyph(ref.current, glyphs[+idxStr], char, getOvr(+idxStr), idxStr === selected);
    });
  });

  useEffect(() => {
    if (!sel || !previewRef.current) return;
    drawGlyph(previewRef.current, sel.glyph, sel.char, sel.ovr, true);
  }, [sel, selected, glyphOverrides]);

  function onPointerDown(e) {
    e.preventDefault();
    const startY = e.clientY ?? e.touches?.[0]?.clientY;
    dragRef.current = { startY, startOvr: sel ? sel.ovr.offsetY : 0 };
  }
  function onPointerMove(e) {
    if (!dragRef.current || !sel) return;
    const curY = e.clientY ?? e.touches?.[0]?.clientY;
    setOvr(sel.idx, { offsetY: dragRef.current.startOvr + (curY - dragRef.current.startY) });
  }
  function onPointerUp() { dragRef.current = null; }

  function resetAll() {
    setGlyphOverrides({});
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 4 }}>Align Studio</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.84rem' }}>
            Click a glyph to select it. Drag the large preview to shift it up/down. Use sliders to scale.
            Guide lines: <span style={{ color: '#6366f1' }}>Cap</span> · <span style={{ color: '#8b5cf6' }}>x-height</span> · <span style={{ color: '#e0c97f' }}>Baseline</span> · <span style={{ color: '#f87171' }}>Descender</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={resetAll} style={{ padding: '7px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.84rem', color: 'var(--text)' }}>Reset All</button>
          <button onClick={onNext} style={{ padding: '8px 20px', background: 'var(--accent2)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem' }}>Generate Font →</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 300px' : '1fr', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Zoom</span>
            <input type="range" min={0.5} max={2} step={0.1} value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 100 }} />
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{zoom.toFixed(1)}x</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {mappedEntries.map(([idxStr, char]) => {
              const tw = Math.round(60 * zoom), th = Math.round(80 * zoom);
              const isSel = idxStr === selected;
              const ref = getThumbRef(idxStr);
              return (
                <div key={idxStr} onClick={() => setSelected(isSel ? null : idxStr)}
                  style={{ cursor: 'pointer', border: '2px solid ' + (isSel ? 'var(--accent)' : 'var(--border)'), borderRadius: 8, overflow: 'hidden' }}>
                  <canvas ref={ref} width={tw} height={th} style={{ display: 'block' }} />
                </div>
              );
            })}
            {mappedEntries.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: 20 }}>No mapped glyphs yet. Go to Map Glyphs first.</p>
            )}
          </div>
        </div>

        {sel && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>
              Editing: <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '1.4rem' }}>{sel.char}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.78rem', marginLeft: 8 }}>glyph #{sel.idx + 1}</span>
            </h3>
            <div style={{ userSelect: 'none', cursor: 'ns-resize', touchAction: 'none', marginBottom: 8 }}
              onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
              onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}>
              <canvas ref={previewRef} width={264} height={220}
                style={{ display: 'block', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }} />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.74rem', textAlign: 'center', marginBottom: 14 }}>Hold and drag to move up/down</p>
            {[
              { label: 'Vertical offset', key: 'offsetY', min: -120, max: 120, step: 1,    fmt: v => (v > 0 ? '+' : '') + v + 'px', def: 0 },
              { label: 'Width scale',     key: 'scaleX',  min: 0.4,  max: 2.0, step: 0.02, fmt: v => (v * 100).toFixed(0) + '%',    def: 1 },
              { label: 'Height scale',    key: 'scaleY',  min: 0.4,  max: 2.0, step: 0.02, fmt: v => (v * 100).toFixed(0) + '%',    def: 1 },
            ].map(({ label, key, min, max, step, fmt, def }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.83rem' }}>
                <span style={{ color: 'var(--muted)', minWidth: 96 }}>{label}</span>
                <input type="range" min={min} max={max} step={step} value={sel.ovr[key] ?? def}
                  onChange={e => setOvr(sel.idx, { [key]: +e.target.value })} style={{ flex: 1 }} />
                <span style={{ fontFamily: 'monospace', minWidth: 44, textAlign: 'right', fontSize: '0.8rem' }}>{fmt(sel.ovr[key] ?? def)}</span>
              </label>
            ))}
            <button onClick={() => setOvr(sel.idx, { offsetY: 0, scaleX: 1, scaleY: 1 })}
              style={{ padding: '6px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.82rem', color: 'var(--muted)', width: '100%' }}>
              Reset this glyph
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
