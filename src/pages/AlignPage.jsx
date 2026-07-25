import React, { useState, useRef, useEffect, useCallback } from 'react';
import { band, CAP, XH, DESC, ASC } from '../lib/metrics.js';

const GUIDES = [
  { y: CAP,  label: 'Cap',  color: '#6366f1', dash: [4,3] },
  { y: XH,   label: 'x',    color: '#8b5cf6', dash: [4,3] },
  { y: 0,    label: 'Base', color: '#e0c97f', dash: [] },
  { y: DESC, label: 'Desc', color: '#f87171', dash: [4,3] },
];

const CANVAS_H = 300;
const BASE_FAC = 0.68;
const CAP_FAC  = 0.55;

function extractInk(glyphCanvas, inkColor = [240, 240, 240]) {
  const sw = glyphCanvas.width, sh = glyphCanvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(glyphCanvas, 0, 0);
  const id = ctx.getImageData(0, 0, sw, sh);
  const [ir, ig, ib] = inkColor;
  for (let i = 0; i < id.data.length; i += 4) {
    const brightness = (id.data[i] + id.data[i+1] + id.data[i+2]) / 3;
    if (brightness > 180) {
      id.data[i+3] = 0;
    } else {
      id.data[i]   = ir;
      id.data[i+1] = ig;
      id.data[i+2] = ib;
      id.data[i+3] = Math.round((1 - brightness / 180) * 255);
    }
  }
  ctx.putImageData(id, 0, 0);
  return tmp;
}

export default function AlignPage({ glyphs, mappings, glyphOverrides, setGlyphOverrides, spacing, setSpacing, onNext }) {
  const [selected, setSelected]   = useState(null);
  const [zoom, setZoom]           = useState(1.0);
  const [dragging, setDragging]   = useState(false);
  const sharedRef  = useRef(null);
  const wrapRef    = useRef(null);
  const dragRef    = useRef(null);
  const inkCache   = useRef({});
  const hitRects   = useRef([]);

  // spacing defaults
  const lsb       = spacing?.lsb       ?? 50;
  const rsb       = spacing?.rsb       ?? 50;
  const wordSpace = spacing?.wordSpace  ?? 300;

  function setSpacingKey(key, val) {
    setSpacing(prev => ({ ...(prev || {}), [key]: val }));
  }

  const mappedEntries = Object.entries(mappings);

  function getOvr(idx) {
    return glyphOverrides[+idx] || { offsetY: 0, scaleX: 1, scaleY: 1 };
  }
  function setOvr(idx, patch) {
    setGlyphOverrides(prev => ({ ...prev, [+idx]: { ...getOvr(+idx), ...patch } }));
  }

  function getInk(idxStr) {
    const g = glyphs[+idxStr];
    if (!g?.canvas) return null;
    if (!inkCache.current[idxStr]) {
      inkCache.current[idxStr] = extractInk(g.canvas);
    }
    return inkCache.current[idxStr];
  }
  useEffect(() => { inkCache.current = {}; }, [glyphs]);

  // ── Draw shared canvas ──────────────────────────────────────────────────────
  const drawShared = useCallback(() => {
    const canvas = sharedRef.current;
    if (!canvas || mappedEntries.length === 0) return;

    const pxPerUnit = (CANVAS_H * CAP_FAC) / CAP;
    const baseY     = CANVAS_H * BASE_FAC;

    // Compute each glyph's natural ink width → advance width
    // advance = lsb + inkW + rsb  (mirroring placeGlyph logic)
    const cells = mappedEntries.map(([idxStr, char]) => {
      const g    = glyphs[+idxStr];
      const ink  = getInk(idxStr);
      const ovr  = getOvr(+idxStr);
      const { scaleX = 1, scaleY = 1 } = ovr;
      const [bot, top] = band(char || 'A');
      const bandH = top - bot;
      const gh = ink ? ink.height : 60;
      const gw = ink ? ink.width  : 60;
      const tgtH = bandH * pxPerUnit * scaleY;
      const tgtW = (gw / gh) * tgtH * scaleX;
      const lsbPx = lsb  * pxPerUnit / CAP * 2;
      const rsbPx = rsb  * pxPerUnit / CAP * 2;
      const advance = lsbPx + tgtW + rsbPx;
      return { idxStr, char, ink, ovr, tgtW, tgtH, lsbPx, rsbPx, advance, bot, top, bandH };
    });

    const totalW = Math.max(400, cells.reduce((s, c) => s + c.advance, 0) + 40);
    canvas.width  = totalW;
    canvas.height = CANVAS_H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, totalW, CANVAS_H);
    ctx.fillStyle = '#0d1424';
    ctx.fillRect(0, 0, totalW, CANVAS_H);

    // Guide lines
    GUIDES.forEach(g => {
      const py = baseY - g.y * pxPerUnit;
      ctx.save();
      ctx.strokeStyle = g.color + (g.y === 0 ? 'dd' : '66');
      ctx.lineWidth   = g.y === 0 ? 1.5 : 1;
      ctx.setLineDash(g.dash);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(totalW, py); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = g.color + 'aa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(g.label, 3, py - 3);
    });

    hitRects.current = [];
    let curX = 20;

    cells.forEach(({ idxStr, char, ink, ovr, tgtW, tgtH, lsbPx, rsbPx, advance, bot, bandH }) => {
      const { offsetY = 0 } = ovr;
      const isSelected = String(idxStr) === String(selected);

      // LSB gap indicator
      ctx.fillStyle = '#ffffff08';
      ctx.fillRect(curX, 0, lsbPx, CANVAS_H);

      // Glyph area highlight if selected
      if (isSelected) {
        ctx.fillStyle = '#6366f11a';
        ctx.fillRect(curX + lsbPx, 0, tgtW, CANVAS_H);
        ctx.strokeStyle = '#6366f166';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(curX + lsbPx, 0, tgtW, CANVAS_H);
      }

      // RSB gap indicator
      ctx.fillStyle = '#ffffff08';
      ctx.fillRect(curX + lsbPx + tgtW, 0, rsbPx, CANVAS_H);

      // Draw ink
      if (ink) {
        const dx = curX + lsbPx;
        const dy = baseY - (bot * pxPerUnit) - tgtH + offsetY;
        ctx.drawImage(ink, dx, dy, tgtW, tgtH);
      }

      // Spacing tick marks at baseline — tiny vertical ticks at LSB/RSB edges
      const tickY  = baseY + 4;
      const tickH  = 6;
      ctx.strokeStyle = '#ffffff33';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      // left edge tick
      ctx.beginPath(); ctx.moveTo(curX, tickY); ctx.lineTo(curX, tickY + tickH); ctx.stroke();
      // ink left edge
      ctx.beginPath(); ctx.moveTo(curX + lsbPx, tickY); ctx.lineTo(curX + lsbPx, tickY + tickH); ctx.stroke();
      // ink right edge
      ctx.beginPath(); ctx.moveTo(curX + lsbPx + tgtW, tickY); ctx.lineTo(curX + lsbPx + tgtW, tickY + tickH); ctx.stroke();
      // right edge tick
      ctx.beginPath(); ctx.moveTo(curX + advance, tickY); ctx.lineTo(curX + advance, tickY + tickH); ctx.stroke();

      // Char label
      ctx.fillStyle = isSelected ? '#e0c97f' : '#33415560';
      ctx.font = `${isSelected ? 'bold ' : ''}10px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(char || '?', curX + advance / 2, CANVAS_H - 4);

      // Hit rect = full advance width
      hitRects.current.push({ idxStr, x: curX, w: advance });
      curX += advance;
    });
  }, [glyphs, mappings, glyphOverrides, selected, lsb, rsb]);

  useEffect(() => { drawShared(); }, [drawShared]);

  // ── Canvas interaction ──────────────────────────────────────────────────────
  function getClientPos(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }
  function canvasX(e) {
    const rect = sharedRef.current.getBoundingClientRect();
    return (getClientPos(e).x - rect.left) * (sharedRef.current.width / rect.width);
  }
  function hitTest(cx) {
    for (const h of hitRects.current) if (cx >= h.x && cx <= h.x + h.w) return h.idxStr;
    return null;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const cx = canvasX(e);
    const hit = hitTest(cx);
    if (!hit) { setSelected(null); return; }
    setSelected(hit);
    const pos = getClientPos(e);
    dragRef.current = { idxStr: hit, startY: pos.y, startOffsetY: getOvr(+hit).offsetY ?? 0, moved: false };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const pos = getClientPos(e);
    const dy = pos.y - dragRef.current.startY;
    if (Math.abs(dy) > 3) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      setDragging(true);
      setOvr(+dragRef.current.idxStr, { offsetY: dragRef.current.startOffsetY + dy });
    }
  }
  function onPointerUp() { dragRef.current = null; setDragging(false); }

  const sel = selected !== null
    ? { idx: +selected, char: mappings[selected], ovr: getOvr(+selected) }
    : null;

  const glyphSliders = [
    { label: 'Move up/down', key: 'offsetY', min: -150, max: 150, step: 1,    fmt: v => (v>0?'+':'')+Math.round(v)+'px', def: 0 },
    { label: 'Width',        key: 'scaleX',  min: 0.2,  max: 2.5, step: 0.01, fmt: v => (v*100).toFixed(0)+'%',           def: 1 },
    { label: 'Height',       key: 'scaleY',  min: 0.2,  max: 2.5, step: 0.01, fmt: v => (v*100).toFixed(0)+'%',           def: 1 },
  ];

  const spacingSliders = [
    { label: 'Left bearing (LSB)',  key: 'lsb',       val: lsb,       min: 0,   max: 300, step: 1,  fmt: v => Math.round(v) },
    { label: 'Right bearing (RSB)', key: 'rsb',       val: rsb,       min: 0,   max: 300, step: 1,  fmt: v => Math.round(v) },
    { label: 'Word space',          key: 'wordSpace',  val: wordSpace, min: 100, max: 800, step: 5,  fmt: v => Math.round(v) },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 3 }}>Align Studio</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.79rem', lineHeight: 1.5 }}>
            <span style={{ color: '#e0c97f' }}>Tap</span> to select ·{' '}
            <span style={{ color: '#e0c97f' }}>Drag ↕</span> to move on canvas ·{' '}
            spacing gaps shown between glyphs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setGlyphOverrides({}); setSpacing({ lsb: 50, rsb: 50, wordSpace: 300 }); }}
            style={{ padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.82rem', color: 'var(--text)' }}>
            Reset All
          </button>
          <button onClick={onNext}
            style={{ padding: '7px 18px', background: 'var(--accent2)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem' }}>
            Generate Font →
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        {GUIDES.map(g => (
          <span key={g.label} style={{ fontSize: '0.74rem', color: g.color, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 16, height: 2, background: g.color, borderRadius: 1 }} />
            {g.label}
          </span>
        ))}
        <span style={{ fontSize: '0.74rem', color: '#ffffff30', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 16, height: 8, background: '#ffffff10', border: '1px solid #ffffff20', borderRadius: 2 }} />
          LSB/RSB
        </span>
      </div>

      {/* Zoom + selected badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Zoom</span>
        <input type="range" min={0.3} max={3} step={0.05} value={zoom}
          onChange={e => setZoom(+e.target.value)} style={{ width: 100 }} />
        <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'monospace', minWidth: 28 }}>{zoom.toFixed(1)}×</span>
        {sel && (
          <span style={{ marginLeft: 6, color: 'var(--accent)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700 }}>{sel.char}</span>
            <button onClick={() => setSelected(null)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: '0.72rem', padding: '1px 6px' }}>✕</button>
          </span>
        )}
      </div>

      {/* Shared canvas */}
      <div ref={wrapRef} style={{
        overflowX: 'auto', overflowY: 'hidden',
        border: '1px solid var(--border)', borderRadius: 10,
        marginBottom: 14, background: '#0d1424',
        cursor: dragging ? 'ns-resize' : 'pointer',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{
          transformOrigin: 'top left',
          transform: `scale(${zoom})`,
          width: `${100/zoom}%`,
          height: CANVAS_H * zoom,
        }}>
          <canvas ref={sharedRef}
            onMouseDown={onPointerDown} onMouseMove={onPointerMove}
            onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
            style={{ display: 'block', touchAction: 'pan-x' }}
          />
        </div>
      </div>

      {/* Two-column control panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>

        {/* Spacing controls — always visible */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
          <h3 style={{ fontSize: '0.88rem', marginBottom: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ffffff20', display: 'inline-block' }} />
            Spacing &amp; Metrics
            <span style={{ color: 'var(--muted)', fontSize: '0.72rem', fontWeight: 400, marginLeft: 4 }}>applies to all glyphs</span>
          </h3>
          {spacingSliders.map(({ label, key, val, min, max, step, fmt }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.79rem', minWidth: 130 }}>{label}</span>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => setSpacingKey(key, +e.target.value)} style={{ flex: 1 }} />
              <span style={{ fontFamily: 'monospace', fontSize: '0.79rem', minWidth: 36, textAlign: 'right', color: 'var(--text)' }}>
                {fmt(val)}
              </span>
            </div>
          ))}
        </div>

        {/* Per-glyph controls — only when selected */}
        {sel ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '0.88rem', margin: 0 }}>
                Glyph{' '}
                <span style={{ fontFamily: 'monospace', fontSize: '1.3rem', color: 'var(--accent)' }}>{sel.char}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.72rem', marginLeft: 6 }}>#{sel.idx + 1}</span>
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setOvr(sel.idx, { offsetY: 0, scaleX: 1, scaleY: 1 })}
                  style={{ padding: '3px 9px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer' }}>
                  Reset
                </button>
                <button onClick={() => {
                  const cur = mappedEntries.findIndex(([k]) => k === String(selected));
                  const next = mappedEntries[cur + 1];
                  if (next) setSelected(next[0]);
                }} style={{ padding: '3px 9px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text)', cursor: 'pointer' }}>
                  Next →
                </button>
              </div>
            </div>
            {glyphSliders.map(({ label, key, min, max, step, fmt, def }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.79rem', minWidth: 80 }}>{label}</span>
                <input type="range" min={min} max={max} step={step}
                  value={sel.ovr[key] ?? def}
                  onChange={e => setOvr(sel.idx, { [key]: +e.target.value })}
                  style={{ flex: 1 }} />
                <span style={{ fontFamily: 'monospace', fontSize: '0.79rem', minWidth: 42, textAlign: 'right', color: 'var(--text)' }}>
                  {fmt(sel.ovr[key] ?? def)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', textAlign: 'center', lineHeight: 1.6 }}>
              Tap any glyph on the canvas<br />to adjust its position and scale
            </p>
          </div>
        )}
      </div>

      {mappedEntries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          No mapped glyphs — go to <strong>Map Glyphs</strong> first.
        </div>
      )}
    </div>
  );
}
