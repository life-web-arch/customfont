import React, { useState, useRef, useEffect, useCallback } from 'react';
import { band, CAP, XH, DESC, ASC } from '../lib/metrics.js';

const GUIDES = [
  { y: CAP,  label: 'Cap',  color: '#6366f1', dash: [4,3] },
  { y: XH,   label: 'x',    color: '#8b5cf6', dash: [4,3] },
  { y: 0,    label: 'Base', color: '#e0c97f', dash: [] },
  { y: DESC, label: 'Desc', color: '#f87171', dash: [4,3] },
];

const CELL_W   = 80;   // px per glyph slot
const CANVAS_H = 320;  // px total canvas height
const BASE_FAC = 0.70; // baseline at 70% down
const CAP_FAC  = 0.58; // CAP fills 58% of canvas height

// Extract ink as transparent-bg canvas, ink recolored to chosen color
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
      id.data[i+3] = 0;           // white/near-white → fully transparent
    } else {
      id.data[i]   = ir;
      id.data[i+1] = ig;
      id.data[i+2] = ib;
      id.data[i+3] = Math.round((1 - brightness / 180) * 255); // soft edges
    }
  }
  ctx.putImageData(id, 0, 0);
  return tmp;
}

export default function AlignPage({ glyphs, mappings, glyphOverrides, setGlyphOverrides, onNext }) {
  const [selected, setSelected]   = useState(null);
  const [zoom, setZoom]           = useState(1.0);
  const [dragging, setDragging]   = useState(false);
  const sharedRef   = useRef(null);
  const wrapRef     = useRef(null);
  const dragRef     = useRef(null);
  const inkCache    = useRef({});
  const hitRects    = useRef([]);

  const mappedEntries = Object.entries(mappings);

  function getOvr(idx) {
    return glyphOverrides[+idx] || { offsetY: 0, scaleX: 1, scaleY: 1 };
  }
  function setOvr(idx, patch) {
    setGlyphOverrides(prev => ({ ...prev, [+idx]: { ...getOvr(+idx), ...patch } }));
  }

  // Get or build ink-only canvas for a glyph
  function getInk(idxStr) {
    const g = glyphs[+idxStr];
    if (!g?.canvas) return null;
    if (!inkCache.current[idxStr]) {
      inkCache.current[idxStr] = extractInk(g.canvas);
    }
    return inkCache.current[idxStr];
  }

  // Invalidate ink cache when glyphs change
  useEffect(() => { inkCache.current = {}; }, [glyphs]);

  // ── Draw the shared canvas ──────────────────────────────────────────────────
  const drawShared = useCallback(() => {
    const canvas = sharedRef.current;
    if (!canvas || mappedEntries.length === 0) return;

    const totalW = Math.max(400, mappedEntries.length * CELL_W + 40);
    canvas.width  = totalW;
    canvas.height = CANVAS_H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, totalW, CANVAS_H);

    // Dark background
    ctx.fillStyle = '#0d1424';
    ctx.fillRect(0, 0, totalW, CANVAS_H);

    const baseY     = CANVAS_H * BASE_FAC;
    const pxPerUnit = (CANVAS_H * CAP_FAC) / CAP;

    // Guide lines
    GUIDES.forEach(g => {
      const py = baseY - g.y * pxPerUnit;
      ctx.save();
      ctx.strokeStyle = g.color + (g.y === 0 ? 'dd' : '77');
      ctx.lineWidth   = g.y === 0 ? 1.5 : 1;
      ctx.setLineDash(g.dash);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(totalW, py); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = g.color + 'aa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(g.label, 3, py - 3);
    });

    // Reset hit rects
    hitRects.current = [];

    // Draw each glyph
    mappedEntries.forEach(([idxStr, char], col) => {
      const ink = getInk(idxStr);
      if (!ink) return;
      const ovr = getOvr(+idxStr);
      const { offsetY = 0, scaleX = 1, scaleY = 1 } = ovr;
      const [bot, top] = band(char || 'A');
      const bandH = top - bot;
      const isSelected = String(idxStr) === String(selected);

      const cellX = 20 + col * CELL_W;
      const cellW = CELL_W - 4;

      // Store hit rect
      hitRects.current.push({ idxStr, x: cellX, w: cellW });

      // Selection highlight — subtle vertical band
      if (isSelected) {
        ctx.fillStyle = '#6366f118';
        ctx.fillRect(cellX, 0, cellW, CANVAS_H);
        ctx.strokeStyle = '#6366f155';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(cellX, 0, cellW, CANVAS_H);
      }

      // Scale glyph to fit its typographic band
      const gh = ink.height, gw = ink.width;
      const tgtH = bandH * pxPerUnit * scaleY;
      const tgtW = (gw / gh) * tgtH * scaleX;
      const dx = cellX + (cellW - tgtW) / 2;
      // bottom of the glyph's band sits on baseline + bot offset
      const dy = baseY - (bot * pxPerUnit) - tgtH + offsetY;

      ctx.drawImage(ink, dx, dy, tgtW, tgtH);

      // Char label at bottom of cell
      ctx.fillStyle = isSelected ? '#e0c97f' : '#334155';
      ctx.font = `${isSelected ? 'bold ' : ''}10px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(char || '?', cellX + cellW / 2, CANVAS_H - 5);
    });
  }, [glyphs, mappings, glyphOverrides, selected]);

  useEffect(() => { drawShared(); }, [drawShared]);

  // ── Canvas interaction ──────────────────────────────────────────────────────
  function canvasCoordX(e) {
    const rect = sharedRef.current.getBoundingClientRect();
    const ratio = sharedRef.current.width / rect.width;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) * ratio;
  }
  function canvasCoordY(e) {
    const rect = sharedRef.current.getBoundingClientRect();
    const ratio = sharedRef.current.height / rect.height;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return (clientY - rect.top) * ratio;
  }
  function hitTest(cx) {
    for (const h of hitRects.current) {
      if (cx >= h.x && cx <= h.x + h.w) return h.idxStr;
    }
    return null;
  }

  function onCanvasPointerDown(e) {
    e.preventDefault();
    const cx = canvasCoordX(e);
    const cy = canvasCoordY(e);
    const hit = hitTest(cx);
    if (!hit) { setSelected(null); return; }
    setSelected(hit);
    const curOvr = getOvr(+hit);
    dragRef.current = {
      idxStr: hit,
      startClientY: e.touches ? e.touches[0].clientY : e.clientY,
      startOffsetY: curOvr.offsetY,
      moved: false,
    };
  }

  function onCanvasPointerMove(e) {
    if (!dragRef.current) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = clientY - dragRef.current.startClientY;
    if (Math.abs(dy) > 3) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      setDragging(true);
      setOvr(+dragRef.current.idxStr, { offsetY: dragRef.current.startOffsetY + dy });
    }
  }

  function onCanvasPointerUp(e) {
    if (dragRef.current && !dragRef.current.moved) {
      // It was a tap, not a drag — selection already set in pointerdown
    }
    dragRef.current = null;
    setDragging(false);
  }

  const sel = selected !== null
    ? { idx: +selected, char: mappings[selected], ovr: getOvr(+selected) }
    : null;

  const sliderCfg = [
    { label: 'Vertical offset', key: 'offsetY', min: -150, max: 150, step: 1,    fmt: v => (v>0?'+':'')+v+'px', def: 0 },
    { label: 'Width %',         key: 'scaleX',  min: 0.2,  max: 2.5, step: 0.01, fmt: v => (v*100).toFixed(0)+'%', def: 1 },
    { label: 'Height %',        key: 'scaleY',  min: 0.2,  max: 2.5, step: 0.01, fmt: v => (v*100).toFixed(0)+'%', def: 1 },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 14px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 3 }}>Align Studio</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
            All glyphs on a shared baseline.{' '}
            <strong style={{ color: '#e0c97f', fontWeight: 400 }}>Tap</strong> to select ·{' '}
            <strong style={{ color: '#e0c97f', fontWeight: 400 }}>Drag up/down</strong> to move directly on canvas.
            Then fine-tune with sliders below.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setGlyphOverrides({})}
            style={{ padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, fontSize: '0.82rem', color: 'var(--text)' }}>
            Reset All
          </button>
          <button onClick={onNext}
            style={{ padding: '7px 18px', background: 'var(--accent2)', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem' }}>
            Generate Font →
          </button>
        </div>
      </div>

      {/* Guide legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        {GUIDES.map(g => (
          <span key={g.label} style={{ fontSize: '0.75rem', color: g.color, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 18, height: 2, background: g.color, borderRadius: 1 }} />
            {g.label}
          </span>
        ))}
      </div>

      {/* Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Zoom</span>
        <input type="range" min={0.3} max={3} step={0.05} value={zoom}
          onChange={e => setZoom(+e.target.value)} style={{ width: 110 }} />
        <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontFamily: 'monospace', minWidth: 30 }}>{zoom.toFixed(1)}×</span>
        {sel && (
          <span style={{ marginLeft: 10, color: 'var(--accent)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700 }}>{sel.char}</span>
            selected
            <button onClick={() => setSelected(null)}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '1px 6px' }}>✕</button>
          </span>
        )}
      </div>

      {/* Shared canvas — horizontally scrollable, zoomable */}
      <div ref={wrapRef} style={{
        overflowX: 'auto', overflowY: 'hidden',
        border: '1px solid var(--border)', borderRadius: 10,
        marginBottom: 16, background: '#0d1424',
        cursor: dragging ? 'ns-resize' : 'pointer',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ transformOrigin: 'top left', transform: `scale(${zoom})`,
          width: `${100/zoom}%`,
          height: CANVAS_H * zoom,
          minWidth: mappedEntries.length * CELL_W + 40,
        }}>
          <canvas ref={sharedRef}
            onMouseDown={onCanvasPointerDown}
            onMouseMove={onCanvasPointerMove}
            onMouseUp={onCanvasPointerUp}
            onMouseLeave={onCanvasPointerUp}
            onTouchStart={onCanvasPointerDown}
            onTouchMove={onCanvasPointerMove}
            onTouchEnd={onCanvasPointerUp}
            style={{ display: 'block', touchAction: 'pan-x' }}
          />
        </div>
      </div>

      {/* Slider panel — only shows when a glyph is selected */}
      {sel && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.9rem' }}>
              Fine-tune <span style={{ fontFamily: 'monospace', fontSize: '1.3rem', color: 'var(--accent)' }}>{sel.char}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem', marginLeft: 6 }}>glyph #{sel.idx + 1}</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setOvr(sel.idx, { offsetY: 0, scaleX: 1, scaleY: 1 })}
                style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer' }}>
                Reset
              </button>
              <button onClick={() => {
                const cur = mappedEntries.findIndex(([k]) => k === String(selected));
                const next = mappedEntries[cur + 1];
                if (next) setSelected(next[0]);
              }} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--text)', cursor: 'pointer' }}>
                Next →
              </button>
            </div>
          </div>
          {sliderCfg.map(({ label, key, min, max, step, fmt, def }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem', minWidth: 100 }}>{label}</span>
              <input type="range" min={min} max={max} step={step}
                value={sel.ovr[key] ?? def}
                onChange={e => setOvr(sel.idx, { [key]: +e.target.value })}
                style={{ flex: 1 }} />
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: 42, textAlign: 'right', color: 'var(--text)' }}>
                {fmt(sel.ovr[key] ?? def)}
              </span>
            </div>
          ))}
        </div>
      )}

      {mappedEntries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
          No mapped glyphs — go to <strong>Map Glyphs</strong> first.
        </div>
      )}
    </div>
  );
}
