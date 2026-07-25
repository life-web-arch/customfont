import React, { useState, useRef, useEffect, useCallback } from 'react';
import { band, CAP, XH, DESC, ASC } from '../lib/metrics.js';

const GUIDES = [
  { y: ASC,  label: 'Asc',  color: '#475569', dash: [3,4] },
  { y: CAP,  label: 'Cap',  color: '#6366f1', dash: [4,3] },
  { y: XH,   label: 'x',    color: '#8b5cf6', dash: [4,3] },
  { y: 0,    label: 'Base', color: '#e0c97f', dash: [] },
  { y: DESC, label: 'Desc', color: '#f87171', dash: [4,3] },
];

const GLYPH_W = 90;   // px per glyph cell on shared canvas
const CELL_PAD = 12;  // px horizontal padding inside cell
const CANVAS_H = 280; // px height of shared canvas

export default function AlignPage({ glyphs, mappings, glyphOverrides, setGlyphOverrides, onNext }) {
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const sharedRef = useRef(null);
  const dragRef = useRef(null);
  const entriesRef = useRef([]);

  const mappedEntries = Object.entries(mappings);
  entriesRef.current = mappedEntries;

  function getOvr(idx) {
    return glyphOverrides[idx] || { offsetY: 0, scaleX: 1, scaleY: 1 };
  }
  function setOvr(idx, patch) {
    setGlyphOverrides(prev => ({ ...prev, [idx]: { ...getOvr(idx), ...patch } }));
  }

  const sel = selected !== null
    ? { idx: +selected, char: mappings[selected], ovr: getOvr(+selected), glyph: glyphs[+selected] }
    : null;

  // ── Draw the shared multi-glyph canvas ──────────────────────────────────────
  const drawShared = useCallback(() => {
    const canvas = sharedRef.current;
    if (!canvas) return;
    const entries = entriesRef.current;
    const totalW = Math.max(600, entries.length * GLYPH_W + CELL_PAD * 2);
    canvas.width  = totalW;
    canvas.height = CANVAS_H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, totalW, CANVAS_H);

    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, totalW, CANVAS_H);

    // Coordinate system:
    // baseline sits at 72% down the canvas
    const baseY      = CANVAS_H * 0.72;
    const pxPerUnit  = (CANVAS_H * 0.60) / CAP;  // CAP fills 60% of canvas height

    // Guide lines across full width
    GUIDES.forEach(g => {
      const py = baseY - g.y * pxPerUnit;
      ctx.save();
      ctx.strokeStyle = g.color + (g.y === 0 ? 'cc' : '66');
      ctx.lineWidth   = g.y === 0 ? 1.5 : 1;
      ctx.setLineDash(g.dash);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(totalW, py); ctx.stroke();
      ctx.restore();
      // Label on left
      ctx.fillStyle = g.color + 'aa';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(g.label, 4, py - 3);
    });

    // Draw each glyph
    entries.forEach(([idxStr, char], colIdx) => {
      const glyph = glyphs[+idxStr];
      if (!glyph?.canvas) return;
      const ovr = glyphOverrides[+idxStr] || { offsetY: 0, scaleX: 1, scaleY: 1 };
      const { offsetY = 0, scaleX = 1, scaleY = 1 } = ovr;
      const [bot, top] = band(char || 'A');
      const bandH = top - bot;
      const isSelected = idxStr === String(selected);

      const cellX = CELL_PAD + colIdx * GLYPH_W;
      const cellW = GLYPH_W - CELL_PAD;

      // Cell highlight for selected
      if (isSelected) {
        ctx.fillStyle = '#6366f120';
        ctx.fillRect(cellX - 4, 0, cellW + 8, CANVAS_H);
        ctx.strokeStyle = '#6366f166';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(cellX - 4, 0, cellW + 8, CANVAS_H);
      }

      // Draw glyph image
      const gh = glyph.canvas.height, gw = glyph.canvas.width;
      const tgtH = bandH * pxPerUnit * scaleY;
      const tgtW = (gw / gh) * tgtH * scaleX;
      const dx = cellX + (cellW - tgtW) / 2;
      const dy = baseY - (bot + bandH) * pxPerUnit * scaleY + offsetY;

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(glyph.canvas, dx, dy, tgtW, tgtH);
      ctx.restore();

      // Char label below
      ctx.fillStyle = isSelected ? '#e0c97f' : '#475569';
      ctx.font = `${isSelected ? 'bold ' : ''}11px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(char || '?', cellX + cellW / 2, CANVAS_H - 6);

      // Store hit rect for click detection
      glyph._hitX = cellX - 4;
      glyph._hitW = cellW + 8;
    });
  }, [glyphs, mappings, glyphOverrides, selected]);

  // Redraw whenever anything changes
  useEffect(() => { drawShared(); }, [drawShared]);

  // Click on shared canvas → select that glyph
  function onCanvasClick(e) {
    const rect = sharedRef.current.getBoundingClientRect();
    const scaleRatio = sharedRef.current.width / rect.width;
    const cx = (e.clientX - rect.left) * scaleRatio;
    const entries = entriesRef.current;
    for (let i = 0; i < entries.length; i++) {
      const [idxStr, char] = entries[i];
      const g = glyphs[+idxStr];
      if (!g) continue;
      if (cx >= g._hitX && cx <= g._hitX + g._hitW) {
        setSelected(prev => prev === idxStr ? null : idxStr);
        return;
      }
    }
    setSelected(null);
  }

  // Drag on the SIDE PANEL preview to move selected glyph vertically
  const sideRef = useRef(null);
  useEffect(() => {
    if (!sel || !sideRef.current) return;
    drawSidePreview(sideRef.current, sel.glyph, sel.char, sel.ovr);
  }, [sel, selected, glyphOverrides]);

  function drawSidePreview(canvas, glyph, char, ovr) {
    if (!canvas || !glyph?.canvas) return;
    const { offsetY = 0, scaleX = 1, scaleY = 1 } = ovr;
    const [bot, top] = band(char || 'A');
    const bandH = top - bot;
    const cw = canvas.width, ch = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cw, ch);
    const baseY = ch * 0.72;
    const pxPerUnit = (ch * 0.60) / CAP;
    GUIDES.forEach(g => {
      ctx.strokeStyle = g.color + (g.y === 0 ? 'cc' : '66');
      ctx.lineWidth = g.y === 0 ? 1.5 : 1;
      ctx.setLineDash(g.dash);
      const py = baseY - g.y * pxPerUnit;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(cw, py); ctx.stroke();
      ctx.fillStyle = g.color + '99';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(g.label, 3, py - 2);
    });
    ctx.setLineDash([]);
    const gh = glyph.canvas.height, gw = glyph.canvas.width;
    const tgtH = bandH * pxPerUnit * scaleY;
    const tgtW = (gw / gh) * tgtH * scaleX;
    const dx = (cw - tgtW) / 2;
    const dy = baseY - (bot + bandH) * pxPerUnit * scaleY + offsetY;
    ctx.globalAlpha = 0.93;
    ctx.drawImage(glyph.canvas, dx, dy, tgtW, tgtH);
    ctx.globalAlpha = 1;
  }

  // Drag to move on side preview
  function onSideDown(e) {
    e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = { startY: y, startOvr: sel?.ovr?.offsetY ?? 0 };
  }
  function onSideMove(e) {
    if (!dragRef.current || !sel) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    setOvr(sel.idx, { offsetY: dragRef.current.startOvr + (y - dragRef.current.startY) });
  }
  function onSideUp() { dragRef.current = null; }

  const sliderCfg = [
    { label: 'Move up/down', key: 'offsetY', min: -120, max: 120, step: 1,    fmt: v => (v > 0 ? '+' : '') + v + 'px', def: 0 },
    { label: 'Width',        key: 'scaleX',  min: 0.3,  max: 2.2, step: 0.01, fmt: v => (v*100).toFixed(0) + '%',       def: 1 },
    { label: 'Height',       key: 'scaleY',  min: 0.3,  max: 2.2, step: 0.01, fmt: v => (v*100).toFixed(0) + '%',       def: 1 },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 4 }}>Align Studio</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
            All glyphs on a shared baseline — click any glyph to select and adjust it.
            <span style={{ marginLeft: 8 }}>
              <span style={{ color: '#6366f1' }}>■</span> Cap &nbsp;
              <span style={{ color: '#8b5cf6' }}>■</span> x-height &nbsp;
              <span style={{ color: '#e0c97f' }}>■</span> Baseline &nbsp;
              <span style={{ color: '#f87171' }}>■</span> Descender
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setGlyphOverrides({})}
            style={{ padding: '6px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.83rem', color: 'var(--text)' }}>
            Reset All
          </button>
          <button onClick={onNext}
            style={{ padding: '8px 20px', background: 'var(--accent2)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem' }}>
            Generate Font →
          </button>
        </div>
      </div>

      {/* Zoom control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Zoom</span>
        <input type="range" min={0.4} max={2.5} step={0.05} value={zoom}
          onChange={e => setZoom(+e.target.value)} style={{ width: 120 }} />
        <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontFamily: 'monospace', minWidth: 32 }}>{zoom.toFixed(1)}×</span>
        {selected !== null && (
          <span style={{ marginLeft: 16, color: 'var(--accent)', fontSize: '0.82rem' }}>
            Selected: <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem' }}>{mappings[selected]}</strong>
            <button onClick={() => setSelected(null)}
              style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 4px' }}>✕ deselect</button>
          </span>
        )}
      </div>

      {/* Main layout: shared canvas + side panel */}
      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 288px' : '1fr', gap: 20, alignItems: 'start' }}>

        {/* Shared baseline canvas — scrollable */}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: '#0b1120' }}>
          <div style={{ transformOrigin: 'top left', transform: `scale(${zoom})`,
            width: `${100/zoom}%`, height: CANVAS_H * zoom }}>
            <canvas ref={sharedRef}
              onClick={onCanvasClick}
              style={{ display: 'block', cursor: 'pointer', imageRendering: 'pixelated' }} />
          </div>
        </div>

        {/* Side panel for selected glyph */}
        {sel && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, position: 'sticky', top: 80 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '0.95rem', margin: 0 }}>
                <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '1.5rem' }}>{sel.char}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 6 }}>glyph #{sel.idx + 1}</span>
              </h3>
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
            </div>

            {/* Side preview — drag to shift vertically */}
            <div style={{ userSelect: 'none', cursor: 'ns-resize', touchAction: 'none', marginBottom: 6 }}
              onMouseDown={onSideDown} onMouseMove={onSideMove} onMouseUp={onSideUp} onMouseLeave={onSideUp}
              onTouchStart={onSideDown} onTouchMove={onSideMove} onTouchEnd={onSideUp}>
              <canvas ref={sideRef} width={256} height={180}
                style={{ display: 'block', width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.72rem', textAlign: 'center', marginBottom: 14 }}>
              ↕ Drag to move · changes reflect on shared canvas
            </p>

            {sliderCfg.map(({ label, key, min, max, step, fmt, def }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)' }}>
                    {fmt(sel.ovr[key] ?? def)}
                  </span>
                </div>
                <input type="range" min={min} max={max} step={step}
                  value={sel.ovr[key] ?? def}
                  onChange={e => setOvr(sel.idx, { [key]: +e.target.value })}
                  style={{ width: '100%' }} />
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setOvr(sel.idx, { offsetY: 0, scaleX: 1, scaleY: 1 })}
                style={{ flex: 1, padding: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.8rem', color: 'var(--muted)', cursor: 'pointer' }}>
                Reset glyph
              </button>
              <button
                onClick={() => {
                  const entries = entriesRef.current;
                  const cur = entries.findIndex(([k]) => k === String(selected));
                  const next = entries[cur + 1];
                  if (next) setSelected(next[0]);
                }}
                style={{ flex: 1, padding: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer' }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {mappedEntries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          No mapped glyphs yet — go to <strong>Map Glyphs</strong> first.
        </div>
      )}

      <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 14 }}>
        Tip: type a full word in the preview text on the Export page to check spacing after generating.
      </p>
    </div>
  );
}
