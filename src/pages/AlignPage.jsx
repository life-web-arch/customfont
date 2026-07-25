import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { band, CAP, XH, DESC } from '../lib/metrics.js';

const GUIDES = [
  { y: CAP,  label: 'Cap',  color: '#6366f1', dash: [4,3] },
  { y: XH,   label: 'x',    color: '#8b5cf6', dash: [4,3] },
  { y: 0,    label: 'Base', color: '#e0c97f', dash: [] },
  { y: DESC, label: 'Desc', color: '#f87171', dash: [4,3] },
];

const CANVAS_H = 300;
const BASE_FAC = 0.68;
const CAP_FAC  = 0.55;

function extractInk(glyphCanvas) {
  const sw = glyphCanvas.width, sh = glyphCanvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(glyphCanvas, 0, 0);
  const id = ctx.getImageData(0, 0, sw, sh);
  for (let i = 0; i < id.data.length; i += 4) {
    const brightness = (id.data[i] + id.data[i+1] + id.data[i+2]) / 3;
    if (brightness > 180) {
      id.data[i+3] = 0;
    } else {
      id.data[i]   = 240;
      id.data[i+1] = 240;
      id.data[i+2] = 240;
      id.data[i+3] = Math.round((1 - brightness / 180) * 255);
    }
  }
  ctx.putImageData(id, 0, 0);
  return tmp;
}

export default function AlignPage({ glyphs, mappings, glyphOverrides, setGlyphOverrides, spacing, setSpacing, onNext }) {
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom]         = useState(1.0);

  // Keep all render-critical values in refs so the draw function
  // always reads the latest values without needing to be re-created
  const sharedRef     = useRef(null);
  const inkCache      = useRef({});
  const hitRects      = useRef([]);
  const dragRef       = useRef(null);

  // Mutable refs that mirror state — updated synchronously before draw
  const selectedRef      = useRef(null);
  const overridesRef     = useRef(glyphOverrides);
  const spacingRef       = useRef(spacing);
  const mappedEntriesRef = useRef([]);

  // Keep refs in sync
  overridesRef.current = glyphOverrides;
  spacingRef.current   = spacing || { lsb: 50, rsb: 50, wordSpace: 300 };
  mappedEntriesRef.current = Object.entries(mappings);

  function getOvr(idx) {
    return overridesRef.current[+idx] || { offsetY: 0, scaleX: 1, scaleY: 1 };
  }
  function setOvr(idx, patch) {
    const next = { ...overridesRef.current, [+idx]: { ...getOvr(+idx), ...patch } };
    overridesRef.current = next;
    setGlyphOverrides(next);  // triggers React re-render but draw is already done via ref
    draw();                   // draw immediately with ref values — no lag
  }
  function setSpacingKey(key, val) {
    const next = { ...spacingRef.current, [key]: val };
    spacingRef.current = next;
    setSpacing(next);
    draw();
  }

  function getInk(idxStr) {
    const g = glyphs[+idxStr];
    if (!g?.canvas) return null;
    if (!inkCache.current[idxStr]) inkCache.current[idxStr] = extractInk(g.canvas);
    return inkCache.current[idxStr];
  }
  useEffect(() => { inkCache.current = {}; }, [glyphs]);

  // ── Core draw function — reads only from refs, never from React state ────────
  function draw() {
    const canvas = sharedRef.current;
    const entries = mappedEntriesRef.current;
    if (!canvas || entries.length === 0) return;

    const { lsb = 50, rsb = 50 } = spacingRef.current;
    const pxPerUnit = (CANVAS_H * CAP_FAC) / CAP;
    const baseY     = CANVAS_H * BASE_FAC;
    const sel       = selectedRef.current;

    // Compute cell layout
    const cells = entries.map(([idxStr, char]) => {
      const ink = getInk(idxStr);
      const ovr = getOvr(+idxStr);
      const { scaleX = 1, scaleY = 1, offsetY = 0 } = ovr;
      const [bot, top] = band(char || 'A');
      const bandH = top - bot;
      const gh = ink ? ink.height : 60;
      const gw = ink ? ink.width  : 60;
      const tgtH  = bandH * pxPerUnit * scaleY;
      const tgtW  = (gw / gh) * tgtH * scaleX;
      const lsbPx = lsb * (pxPerUnit / CAP) * 2;
      const rsbPx = rsb * (pxPerUnit / CAP) * 2;
      return { idxStr, char, ink, tgtW, tgtH, lsbPx, rsbPx, bot, offsetY,
               advance: lsbPx + tgtW + rsbPx };
    });

    const totalW = Math.max(400, cells.reduce((s, c) => s + c.advance, 0) + 40);
    if (canvas.width !== totalW)  canvas.width  = totalW;
    if (canvas.height !== CANVAS_H) canvas.height = CANVAS_H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, totalW, CANVAS_H);
    ctx.fillStyle = '#0d1424';
    ctx.fillRect(0, 0, totalW, CANVAS_H);

    // Guide lines
    ctx.save();
    GUIDES.forEach(g => {
      const py = baseY - g.y * pxPerUnit;
      ctx.strokeStyle = g.color + (g.y === 0 ? 'dd' : '66');
      ctx.lineWidth   = g.y === 0 ? 1.5 : 1;
      ctx.setLineDash(g.dash);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(totalW, py); ctx.stroke();
      ctx.fillStyle = g.color + 'aa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.setLineDash([]);
      ctx.fillText(g.label, 3, py - 3);
    });
    ctx.restore();

    // Glyphs
    hitRects.current = [];
    let curX = 20;
    cells.forEach(({ idxStr, char, ink, tgtW, tgtH, lsbPx, rsbPx, bot, offsetY, advance }) => {
      const isSel = String(idxStr) === String(sel);

      // LSB/RSB shading
      ctx.fillStyle = '#ffffff09';
      ctx.fillRect(curX, 0, lsbPx, CANVAS_H);
      ctx.fillRect(curX + lsbPx + tgtW, 0, rsbPx, CANVAS_H);

      // Selection band
      if (isSel) {
        ctx.fillStyle = '#6366f11a';
        ctx.fillRect(curX + lsbPx, 0, tgtW, CANVAS_H);
        ctx.strokeStyle = '#6366f155';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(curX + lsbPx, 0, tgtW, CANVAS_H);
      }

      // Ink
      if (ink) {
        const dx = curX + lsbPx;
        const dy = baseY - (bot * pxPerUnit) - tgtH + offsetY;
        ctx.drawImage(ink, dx, dy, tgtW, tgtH);
      }

      // Baseline ticks
      const ty = baseY + 4;
      ctx.strokeStyle = '#ffffff25';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      [curX, curX + lsbPx, curX + lsbPx + tgtW, curX + advance].forEach(x => {
        ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x, ty + 5); ctx.stroke();
      });

      // Char label
      ctx.fillStyle = isSel ? '#e0c97f' : '#33415550';
      ctx.font = (isSel ? 'bold ' : '') + '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(char || '?', curX + advance / 2, CANVAS_H - 4);

      hitRects.current.push({ idxStr, x: curX, w: advance });
      curX += advance;
    });
  }

  // Draw on mount and whenever anything changes
  // useLayoutEffect fires synchronously after DOM mutations — before browser paint
  useLayoutEffect(() => { draw(); });

  // ── Pointer handling ─────────────────────────────────────────────────────────
  function clientPos(e) {
    return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                     : { x: e.clientX,             y: e.clientY };
  }
  function toCanvasX(e) {
    const r = sharedRef.current.getBoundingClientRect();
    return (clientPos(e).x - r.left) * (sharedRef.current.width / r.width);
  }
  function hitTest(cx) {
    for (const h of hitRects.current) if (cx >= h.x && cx <= h.x + h.w) return h.idxStr;
    return null;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const hit = hitTest(toCanvasX(e));
    const pos = clientPos(e);
    if (!hit) {
      selectedRef.current = null;
      setSelected(null);
      return;
    }
    selectedRef.current = hit;
    setSelected(hit);
    dragRef.current = {
      idxStr:      hit,
      startY:      pos.y,
      startOffset: getOvr(+hit).offsetY ?? 0,
      moved:       false,
    };
    draw(); // highlight immediately
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dy = clientPos(e).y - dragRef.current.startY;
    if (Math.abs(dy) > 2) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;
    // Update ref and draw immediately — no setState latency
    const next = {
      ...overridesRef.current,
      [+dragRef.current.idxStr]: {
        ...getOvr(+dragRef.current.idxStr),
        offsetY: dragRef.current.startOffset + dy,
      },
    };
    overridesRef.current = next;
    draw(); // instant — synchronous canvas update
    // Throttle the React state update to avoid re-render flood
    if (!dragRef.current.rafPending) {
      dragRef.current.rafPending = true;
      requestAnimationFrame(() => {
        if (dragRef.current) dragRef.current.rafPending = false;
        setGlyphOverrides({ ...overridesRef.current });
      });
    }
  }

  function onPointerUp() { dragRef.current = null; }

  // Sliders: update ref + draw synchronously, setState for React sync
  function onGlyphSlider(key, val) {
    if (selected === null) return;
    const next = {
      ...overridesRef.current,
      [+selected]: { ...getOvr(+selected), [key]: val },
    };
    overridesRef.current = next;
    draw();
    setGlyphOverrides({ ...next });
  }

  const sel    = selected !== null ? { idx: +selected, char: mappings[selected], ovr: getOvr(+selected) } : null;
  const { lsb = 50, rsb = 50, wordSpace = 300 } = spacingRef.current;

  const glyphSliders = [
    { label: 'Move up/down', key: 'offsetY', min: -150, max: 150, step: 1,    fmt: v => (v>0?'+':'')+Math.round(v)+'px', def: 0 },
    { label: 'Width',        key: 'scaleX',  min: 0.2,  max: 2.5, step: 0.01, fmt: v => (v*100).toFixed(0)+'%',          def: 1 },
    { label: 'Height',       key: 'scaleY',  min: 0.2,  max: 2.5, step: 0.01, fmt: v => (v*100).toFixed(0)+'%',          def: 1 },
  ];
  const spacingSliders = [
    { label: 'Left bearing',  key: 'lsb',      val: lsb,       min: 0,   max: 300, step: 1 },
    { label: 'Right bearing', key: 'rsb',       val: rsb,       min: 0,   max: 300, step: 1 },
    { label: 'Word space',    key: 'wordSpace', val: wordSpace, min: 100, max: 800, step: 5 },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 14px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: 3 }}>Align Studio</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.79rem', lineHeight: 1.5 }}>
            <span style={{ color: '#e0c97f' }}>Tap</span> to select ·{' '}
            <span style={{ color: '#e0c97f' }}>Drag ↕</span> to move on canvas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { overridesRef.current = {}; spacingRef.current = { lsb:50, rsb:50, wordSpace:300 }; setGlyphOverrides({}); setSpacing({ lsb:50, rsb:50, wordSpace:300 }); draw(); }}
            style={{ padding:'6px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:7, fontSize:'0.82rem', color:'var(--text)' }}>
            Reset All
          </button>
          <button onClick={onNext}
            style={{ padding:'7px 18px', background:'var(--accent2)', color:'#fff', borderRadius:8, fontWeight:700, fontSize:'0.88rem' }}>
            Generate Font →
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:12, marginBottom:10, flexWrap:'wrap' }}>
        {GUIDES.map(g => (
          <span key={g.label} style={{ fontSize:'0.73rem', color:g.color, display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ display:'inline-block', width:14, height:2, background:g.color, borderRadius:1 }} />{g.label}
          </span>
        ))}
        <span style={{ fontSize:'0.73rem', color:'#ffffff30', display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ display:'inline-block', width:14, height:8, background:'#ffffff10', border:'1px solid #ffffff20', borderRadius:2 }} />LSB/RSB
        </span>
      </div>

      {/* Zoom */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <span style={{ color:'var(--muted)', fontSize:'0.78rem' }}>Zoom</span>
        <input type="range" min={0.3} max={3} step={0.05} value={zoom}
          onChange={e => setZoom(+e.target.value)} style={{ width:100 }} />
        <span style={{ color:'var(--muted)', fontSize:'0.78rem', fontFamily:'monospace', minWidth:28 }}>{zoom.toFixed(1)}×</span>
        {sel && (
          <span style={{ marginLeft:6, color:'var(--accent)', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:'monospace', fontSize:'1.2rem', fontWeight:700 }}>{sel.char}</span>
            <button onClick={() => { selectedRef.current=null; setSelected(null); draw(); }}
              style={{ background:'none', border:'1px solid var(--border)', borderRadius:5, color:'var(--muted)', cursor:'pointer', fontSize:'0.72rem', padding:'1px 6px' }}>✕</button>
          </span>
        )}
      </div>

      {/* Canvas */}
      <div style={{ overflowX:'auto', overflowY:'hidden', border:'1px solid var(--border)', borderRadius:10, marginBottom:14, background:'#0d1424', WebkitOverflowScrolling:'touch' }}>
        <div style={{ transformOrigin:'top left', transform:`scale(${zoom})`, width:`${100/zoom}%`, height:CANVAS_H*zoom }}>
          <canvas ref={sharedRef}
            onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
            style={{ display:'block', touchAction:'pan-x', cursor:'pointer' }} />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:14 }}>

        {/* Spacing — always visible */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <h3 style={{ fontSize:'0.86rem', marginBottom:12, color:'var(--text)' }}>Spacing &amp; Metrics</h3>
          {spacingSliders.map(({ label, key, val, min, max, step }) => (
            <div key={key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <span style={{ color:'var(--muted)', fontSize:'0.79rem', minWidth:110 }}>{label}</span>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => setSpacingKey(key, +e.target.value)} style={{ flex:1 }} />
              <span style={{ fontFamily:'monospace', fontSize:'0.79rem', minWidth:36, textAlign:'right', color:'var(--text)' }}>{Math.round(val)}</span>
            </div>
          ))}
        </div>

        {/* Per-glyph */}
        {sel ? (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ fontSize:'0.86rem', margin:0 }}>
                Glyph <span style={{ fontFamily:'monospace', fontSize:'1.3rem', color:'var(--accent)' }}>{sel.char}</span>
                <span style={{ color:'var(--muted)', fontSize:'0.72rem', marginLeft:6 }}>#{sel.idx+1}</span>
              </h3>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => { overridesRef.current={...overridesRef.current,[sel.idx]:{offsetY:0,scaleX:1,scaleY:1}}; setGlyphOverrides({...overridesRef.current}); draw(); }}
                  style={{ padding:'3px 9px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.75rem', color:'var(--muted)', cursor:'pointer' }}>Reset</button>
                <button onClick={() => {
                  const entries = mappedEntriesRef.current;
                  const cur = entries.findIndex(([k]) => k === String(selected));
                  const nxt = entries[cur+1];
                  if (nxt) { selectedRef.current=nxt[0]; setSelected(nxt[0]); draw(); }
                }} style={{ padding:'3px 9px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.75rem', color:'var(--text)', cursor:'pointer' }}>Next →</button>
              </div>
            </div>
            {glyphSliders.map(({ label, key, min, max, step, fmt, def }) => (
              <div key={key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <span style={{ color:'var(--muted)', fontSize:'0.79rem', minWidth:80 }}>{label}</span>
                <input type="range" min={min} max={max} step={step}
                  value={sel.ovr[key] ?? def}
                  onChange={e => onGlyphSlider(key, +e.target.value)}
                  style={{ flex:1 }} />
                <span style={{ fontFamily:'monospace', fontSize:'0.79rem', minWidth:42, textAlign:'right', color:'var(--text)' }}>
                  {fmt(sel.ovr[key] ?? def)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background:'var(--surface)', border:'1px dashed var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <p style={{ color:'var(--muted)', fontSize:'0.82rem', textAlign:'center', lineHeight:1.6 }}>
              Tap any glyph on the canvas<br/>to adjust its position and scale
            </p>
          </div>
        )}
      </div>

      {mappedEntriesRef.current.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--muted)' }}>
          No mapped glyphs — go to <strong>Map Glyphs</strong> first.
        </div>
      )}
    </div>
  );
}
