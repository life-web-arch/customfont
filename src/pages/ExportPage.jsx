import React, { useState, useEffect, useRef, useCallback } from 'react';
import { potrace, init as initPotrace } from 'esm-potrace-wasm';
import svgpath from 'svgpath';
import { placeGlyph, applyItalic, band } from '../lib/metrics.js';
import { buildTTF, fontFaceCSS } from '../lib/assemble.js';

const PAD = 10;
const LS_KEY = 'cfs_font_history';

async function traceImageData(imageData) {
  const svg = await potrace(imageData, { turdsize:6, alphamax:1.05, opticurve:1, opttolerance:0.2, extractcolors:false });
  const m = /d="([^"]+)"/.exec(svg);
  if (!m) return '';
  return svgpath(m[1]).scale(0.1,-0.1).translate(0,imageData.height).round(1).toString();
}

async function dilateImageData(imageData, px) {
  if (!px) return imageData;
  const {width,height,data}=imageData;
  const gray=new Uint8Array(width*height);
  for(let i=0,p=0;i<gray.length;i++,p+=4) gray[i]=data[p]<128?1:0;
  let ink=gray;
  for(let it=0;it<px;it++){
    const next=new Uint8Array(ink);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++){
      const p2=y*width+x;
      if(!ink[p2]&&((x>0&&ink[p2-1])||(x<width-1&&ink[p2+1])||(y>0&&ink[p2-width])||(y<height-1&&ink[p2+width])))next[p2]=1;
    }
    ink=next;
  }
  const out=new ImageData(width,height);
  for(let i=0,p=0;i<ink.length;i++,p+=4){
    const v=ink[i]?0:255;
    out.data[p]=out.data[p+1]=out.data[p+2]=v;out.data[p+3]=255;
  }
  return out;
}

async function installFont(bytes, familyName, { weight='normal', style='normal' }={}) {
  const face = new FontFace(familyName, bytes instanceof Uint8Array ? bytes.buffer : bytes, { weight, style });
  await face.load();
  document.fonts.add(face);
  return familyName;
}

function GlyphPreviewCanvas({ glyphs, mappings, wordSpace, lsb, rsb, text, size=64 }) {
  const canvasRef = useRef();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const H = size * 1.6;
    canvas.height = H;
    const charMap = {};
    for (const [idxStr, char] of Object.entries(mappings)) {
      const g = glyphs[+idxStr];
      if (!g || !g._cachedPath) continue;
      charMap[char] = placeGlyph(g._cachedPath, { width: g.canvas.width, height: g.canvas.height }, PAD, char, { lsb, rsb });
    }
    const scale = size / 800;
    const chars = [...text];
    let totalW = 0;
    for (const c of chars) totalW += c === ' ' ? wordSpace * scale : ((charMap[c]?.advance ?? wordSpace/2) * scale);
    canvas.width = Math.max(totalW + 16, 200);
    ctx.clearRect(0, 0, canvas.width, H);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, H);
    const baseline = size * 1.1;
    ctx.strokeStyle = 'rgba(224,201,127,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, baseline); ctx.lineTo(canvas.width, baseline); ctx.stroke();
    let x = 8;
    ctx.fillStyle = '#e8e6f0';
    for (const c of chars) {
      if (c === ' ') { x += wordSpace * scale; continue; }
      const g = charMap[c];
      if (!g) { x += (wordSpace/2)*scale; continue; }
      const p = new Path2D(g.d);
      ctx.save();
      ctx.translate(x, baseline);
      ctx.scale(scale, -scale);
      ctx.fill(p);
      ctx.restore();
      x += g.advance * scale;
    }
  }, [glyphs, mappings, wordSpace, lsb, rsb, text, size]);
  return <canvas ref={canvasRef} style={{ display:'block', maxWidth:'100%', borderRadius:8, background:'#111', minHeight:size*1.6 }} />;
}

function loadHistory() {
  try { const r=localStorage.getItem(LS_KEY); return r?JSON.parse(r):[]; } catch { return []; }
}
function saveHistory(entries) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(-10))); } catch(e) { console.warn('localStorage quota exceeded'); }
}
function uint8ToB64(u8) {
  let bin=''; for(let i=0;i<u8.length;i++) bin+=String.fromCharCode(u8[i]); return btoa(bin);
}
function b64ToUint8(b64) {
  const bin=atob(b64); const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return u8;
}

const VARIANTS = [
  { id:'normal',    label:'Normal',      weight:'normal', style:'normal' },
  { id:'bold',      label:'Bold',        weight:'bold',   style:'normal',  weightPx:2 },
  { id:'italic',    label:'Italic',      weight:'normal', style:'italic',  italicDeg:12 },
  { id:'boldItalic',label:'Bold Italic', weight:'bold',   style:'italic',  weightPx:2, italicDeg:12 },
];
// FORMATS removed — TTF only

export default function ExportPage({ glyphs, mappings, fontName, setFontName, fontNameInputRef }) {
  const [busy, setBusy]                     = useState(false);
  const [status, setStatus]                 = useState('');
  const [results, setResults]               = useState({});
  const [selectedVariants, setSelectedVariants] = useState(['normal']);
  // Formats: TTF only (WOFF2 WASM hangs on mobile; TTF works everywhere)
  const [previewText, setPreviewText]       = useState('Hello World\nThe quick brown fox\n0123456789');
  const [previewSize, setPreviewSize]       = useState(48);
  const [previewVariant, setPreviewVariant]  = useState('normal');
  const [wordSpace, setWordSpace]           = useState(300);
  const [lsb, setLsb]                       = useState(50);
  const [rsb, setRsb]                       = useState(50);
  // history state moved to HistoryPage
  // showHistory removed — History is now its own tab
  const [importedFamily, setImportedFamily] = useState(null);
  const [importStatus, setImportStatus]     = useState('');
  const [showPrivacy, setShowPrivacy]       = useState(false);
  const [copiedCSS, setCopiedCSS]           = useState(false);
  const fontFaceRef = useRef({});
  const fontSeqRef  = useRef(0);
  const mappedEntries = Object.entries(mappings);

  async function buildVariant(variant) {
    await initPotrace();
    const builtGlyphs = [];
    for (const [idxStr, char] of mappedEntries) {
      const g = glyphs[+idxStr];
      let imgData = g.imageData;
      if (variant.weightPx) imgData = await dilateImageData(imgData, variant.weightPx);
      const d = await traceImageData(imgData);
      if (!d) continue;
      g._cachedPath = d;
      let placed = placeGlyph(d, { width: g.canvas.width, height: g.canvas.height }, PAD, char, { lsb, rsb });
      if (variant.italicDeg) placed = { ...placed, d: applyItalic(placed.d, variant.italicDeg) };
      builtGlyphs.push({ char, ...placed });
    }
    return { ttfBytes: buildTTF(fontName, builtGlyphs, { wordSpace, weight: variant.weight, style: variant.style }), glyphs: builtGlyphs };
  }

  function requestFontName() {
    if (!fontNameInputRef?.current) return;
    const el = fontNameInputRef.current;
    // Scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight with a flash border + focus
    el.focus();
    el.select();
    el.style.transition = 'box-shadow 0.15s, border-color 0.15s';
    el.style.borderColor = 'var(--accent)';
    el.style.boxShadow = '0 0 0 3px rgba(224,201,127,0.45)';
    setTimeout(() => {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }, 2000);
  }

  async function generate() {
    if (!fontName.trim()) { requestFontName(); return; }
    setBusy(true); setResults({});
    try {
      const out = {};
      for (const vId of selectedVariants) {
        const v = VARIANTS.find(x => x.id === vId);
        setStatus(`Building ${v.label}…`);
        const { ttfBytes } = await buildVariant(v);
        out[vId] = { ttf: ttfBytes };
        // TTF only — no WOFF/WOFF2 conversion
        const fName = `cfprev-${fontName}-${vId}-${++fontSeqRef.current}`;
        await installFont(ttfBytes, fName, { weight: v.weight, style: v.style });
        fontFaceRef.current[vId] = fName;
      }
      setResults(out);
      setStatus('✅ Done! Your font is ready.');
      const entry = {
        id: Date.now(),
        name: fontName,
        date: new Date().toLocaleString(),
        formats: ['TTF'],
        variants: Object.fromEntries(
          Object.entries(out).map(([id, f]) => [id, {
            ttf: f.ttf ? uint8ToB64(f.ttf) : null,
          }])
        )
      };
      const updated = [...loadHistory(), entry];
      saveHistory(updated); setHistory(updated);
    } catch(e) { setStatus('❌ Error: '+e.message); }
    setBusy(false);
  }

  function download(data, filename, mime) {
    const blob=new Blob([data],{type:mime}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function downloadAll() {
    const base=fontName.replace(/\s+/g,'-');
    for (const [vId,files] of Object.entries(results)) {
      const v=VARIANTS.find(x=>x.id===vId); const suf=vId==='normal'?'':`-${v.label.replace(' ','')}`;
      if(files.ttf) download(files.ttf, `${base}${suf}.ttf`, 'font/ttf');
    }
  }
  async function restoreFromHistory(entry) {
    try {
      const seq=++fontSeqRef.current; const newFaceRef={};
      for (const [vId,b64] of Object.entries(entry.variants)) {
        const bytes=b64ToUint8(b64); const v=VARIANTS.find(x=>x.id===vId);
        const fName=`cfhist-${entry.id}-${vId}-${seq}`;
        await installFont(bytes,fName,{weight:v?.weight??'normal',style:v?.style??'normal'});
        newFaceRef[vId]=fName;
      }
      fontFaceRef.current=newFaceRef;
      setResults(Object.fromEntries(Object.entries(entry.variants).map(([id,b64])=>[id,{ttf:b64ToUint8(b64)}])));
      setStatus(`✅ Restored "${entry.name}" from history.`); setShowHistory(false);
    } catch(e) { setStatus('❌ Restore failed: '+e.message); }
  }
  async function handleImportFont(file) {
    if (!file) return; setImportStatus('Loading…');
    try {
      const buf=await file.arrayBuffer(); const fName=`cfimport-${Date.now()}`;
      const face=new FontFace(fName,buf); await face.load(); document.fonts.add(face);
      setImportedFamily(fName); setImportStatus(`✅ Loaded "${file.name}" — type below to preview`);
    } catch(e) { setImportStatus('❌ Failed: '+e.message); }
  }
  function deleteEntry(id) {
    const updated=history.filter(e=>e.id!==id); saveHistory(updated); setHistory(updated);
  }

  function clearSession() {
    if (!window.confirm('Clear all font data (history, glyphs cache) from localStorage? This frees storage space.')) return;
    localStorage.removeItem(LS_KEY);
    setHistory([]);
    setResults({});
    setStatus('🗑️ Session data cleared from localStorage.');
  }

  const hasResults = Object.keys(results).length > 0;
  const generatedFamily = hasResults && fontFaceRef.current[previewVariant]
    ? fontFaceRef.current[previewVariant] + ', serif'
    : hasResults ? Object.values(fontFaceRef.current)[0] + ', serif' : null;
  const S = {
    card:  { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:20, marginBottom:20 },
    label: { fontSize:'0.82rem', color:'var(--muted)', display:'block', marginBottom:4 },
    row:   { display:'flex', gap:8, alignItems:'center' },
    mono:  { fontFamily:'var(--font-mono)', minWidth:36, fontSize:'0.85rem' },
  };
  const cssSnippet = fontFaceCSS(fontName, fontName.replace(/\s+/g,'-'),
    VARIANTS.filter(v=>selectedVariants.includes(v.id)).map(v=>({
      weight:v.weight, style:v.style,
      filename:fontName.replace(/\s+/g,'-')+(v.id==='normal'?'':'-'+v.label.replace(' ',''))
    })));
  const sliders = [
    { label:'Word space (px)', val:wordSpace, set:setWordSpace, min:100, max:600 },
    { label:'Left bearing',    val:lsb,       set:setLsb,       min:0,   max:200 },
    { label:'Right bearing',   val:rsb,       set:setRsb,       min:0,   max:200 },
  ];

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:'1.4rem', marginBottom:4 }}>Export Font</h2>
        <p style={{ color:'var(--muted)', fontSize:'0.9rem' }}>{mappedEntries.length} characters mapped · set a font name above, then generate</p>
      </div>

      {/* Settings */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:16, marginBottom:20 }}>
        <div style={S.card}>
          <h3 style={{ fontSize:'0.95rem', marginBottom:12 }}>Font Variants</h3>
          {VARIANTS.map(v=>(
            <label key={v.id} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9, cursor:'pointer' }}>
              <input type="checkbox" checked={selectedVariants.includes(v.id)}
                onChange={e=>setSelectedVariants(prev=>e.target.checked?[...prev,v.id]:prev.filter(x=>x!==v.id))} />
              <span style={{ fontWeight:v.weight==='bold'?700:400, fontStyle:v.style }}>{v.label}</span>
            </label>
          ))}
        </div>
        <div style={S.card}>
          <h3 style={{ fontSize:'0.95rem', marginBottom:12 }}>Output Format</h3>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:'1.1rem' }}>✅</span>
            <span style={{ fontWeight:600 }}>TTF</span>
            <span style={{ color:'var(--muted)', fontSize:'0.82rem' }}>TrueType — works on Windows, Mac, Linux, Android, iOS & all browsers</span>
          </div>
        </div>
      </div>

      {/* Live metrics canvas preview */}
      <div style={{ ...S.card }}>
        {!hasResults && (
          <div style={{ marginBottom:10, padding:'8px 14px', background:'rgba(224,201,127,0.08)', border:'1px solid rgba(224,201,127,0.25)', borderRadius:8, fontSize:'0.83rem', color:'var(--accent)', display:'flex', alignItems:'center', gap:8 }}>
            ⚡ Hit <strong>Generate Fonts</strong> below first — the canvas preview updates live after that.
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div>
            <h3 style={{ fontSize:'1rem', marginBottom:2 }}>Live Metrics Preview</h3>
            <p style={{ color:'var(--muted)', fontSize:'0.8rem' }}>Canvas render — updates instantly as you drag sliders (requires at least one prior generation)</p>
          </div>
          <div style={S.row}>
            <span style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Size</span>
            <input type="range" min={24} max={96} value={previewSize} onChange={e=>setPreviewSize(+e.target.value)} style={{ width:70 }} />
            <span style={S.mono}>{previewSize}px</span>
          </div>
        </div>
        <div style={{ overflowX:'auto', marginBottom:10 }}>
          <GlyphPreviewCanvas glyphs={glyphs} mappings={mappings}
            wordSpace={wordSpace} lsb={lsb} rsb={rsb}
            text={previewText.split('\n')[0]||'Hello'} size={previewSize} />
        </div>
        <input type="text" value={previewText.split('\n')[0]}
          onChange={e=>setPreviewText(e.target.value)} placeholder="Preview text…"
          style={{ fontSize:'0.86rem' }} />
      </div>

      {/* Generate */}
      <div style={{ margin:'20px 0', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={generate}
          disabled={busy||selectedVariants.length===0||mappedEntries.length===0}
          className="btn-primary" style={{ padding:'12px 32px', fontSize:'1rem' }}>
          {busy ? <><span className="spinner" /> Building…</> : '⚡ Generate Fonts'}
        </button>
        {mappedEntries.length===0 && <span style={{ color:'var(--muted)', fontSize:'0.85rem' }}>Map some glyphs first</span>}
      </div>

      {status && (
        <div style={{ marginBottom:20, padding:'10px 16px', borderRadius:8,
          background: status.startsWith('✅')?'rgba(74,222,128,0.08)':status.startsWith('❌')?'rgba(248,113,113,0.08)':'var(--surface)',
          border:`1px solid ${status.startsWith('✅')?'var(--success)':status.startsWith('❌')?'var(--danger)':'var(--border)'}`,
          color: status.startsWith('✅')?'var(--success)':status.startsWith('❌')?'var(--danger)':'var(--text)', fontSize:'0.9rem' }}>
          {status}
        </div>
      )}

      {/* Metrics & Spacing — moved after Generate */}
      <div style={{ ...S.card, marginTop:20 }}>
        <h3 style={{ fontSize:'0.95rem', marginBottom:14 }}>📐 Metrics & Spacing</h3>
        {sliders.map(({label,val,set,min,max})=>(
          <div key={label} style={{ marginBottom:14 }}>
            <span style={S.label}>{label}</span>
            <div style={S.row}>
              <input type="range" min={min} max={max} value={val} onChange={e=>set(+e.target.value)} style={{ flex:1 }} />
              <span style={S.mono}>{val}</span>
            </div>
          </div>
        ))}
        {!hasResults && (
          <p style={{ marginTop:4, fontSize:'0.8rem', color:'var(--accent)', background:'rgba(224,201,127,0.07)', border:'1px solid rgba(224,201,127,0.2)', borderRadius:6, padding:'6px 10px' }}>
            ⚡ Generate fonts first — then drag sliders to see live canvas updates below.
          </p>
        )}
      </div>

      {/* Live metrics canvas preview */}
      <div style={{ ...S.card }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div>
            <h3 style={{ fontSize:'1rem', marginBottom:2 }}>Live Metrics Preview</h3>
            <p style={{ color:'var(--muted)', fontSize:'0.8rem' }}>Canvas — updates instantly as you drag sliders above (requires at least one generation)</p>
          </div>
          <div style={S.row}>
            <span style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Size</span>
            <input type="range" min={24} max={96} value={previewSize} onChange={e=>setPreviewSize(+e.target.value)} style={{ width:70 }} />
            <span style={S.mono}>{previewSize}px</span>
          </div>
        </div>
        <div style={{ overflowX:'auto', marginBottom:10 }}>
          <GlyphPreviewCanvas glyphs={glyphs} mappings={mappings}
            wordSpace={wordSpace} lsb={lsb} rsb={rsb}
            text={previewText.split('\n')[0]||'Hello'} size={previewSize} />
        </div>
        <input type="text" value={previewText.split('\n')[0]}
          onChange={e=>setPreviewText(e.target.value)} placeholder="Preview text…"
          style={{ fontSize:'0.86rem' }} />
      </div>

      {/* Live typing preview (post-generation) */}
      {hasResults && (
        <div style={{ ...S.card }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:10 }}>
              <div>
                <h3 style={{ fontSize:'1rem', marginBottom:2 }}>✍ Live Font Preview</h3>
                <p style={{ color:'var(--muted)', fontSize:'0.8rem' }}>Type anything — rendered in your generated font in real time</p>
              </div>
              <label style={{ display:'flex', gap:8, alignItems:'center', color:'var(--muted)', fontSize:'0.82rem' }}>
                Size <input type="range" min={12} max={120} value={previewSize} onChange={e=>setPreviewSize(+e.target.value)} style={{ width:70 }} />
                <span style={S.mono}>{previewSize}px</span>
              </label>
            </div>
            {/* Variant selector */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {VARIANTS.filter(v=>selectedVariants.includes(v.id) && results[v.id]).map(v=>(
                <button key={v.id} onClick={()=>setPreviewVariant(v.id)}
                  style={{ padding:'5px 12px', borderRadius:6, fontSize:'0.82rem', fontWeight:600,
                    background: previewVariant===v.id ? 'var(--accent2)' : 'var(--surface2)',
                    color: previewVariant===v.id ? '#fff' : 'var(--muted)',
                    border: previewVariant===v.id ? '1px solid var(--accent2)' : '1px solid var(--border)',
                    fontStyle: v.style, fontWeight: v.weight==='bold' ? 700 : 400 }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <textarea value={previewText} onChange={e=>setPreviewText(e.target.value)}
            style={{ fontFamily:generatedFamily, fontSize:previewSize, lineHeight:1.45, width:'100%', minHeight:140,
              background:'#fff', color:'#111', border:'1px solid var(--border)', borderRadius:8, padding:14, resize:'vertical' }} />
          <p style={{ marginTop:6, color:'var(--muted)', fontSize:'0.75rem' }}>
            Characters not in your font fall back to system serif.
          </p>
        </div>
      )}

      {/* Download */}
      {hasResults && (
        <div style={{ ...S.card }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
            <h3>Download Files</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={downloadAll} style={{ padding:'8px 18px', background:'var(--accent2)', color:'#fff', borderRadius:7, fontWeight:600 }}>
                ⬇ Download All
              </button>
              <button onClick={clearSession}
                title="Free up localStorage space used by this session"
                style={{ padding:'8px 14px', background:'rgba(248,113,113,0.10)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:7, color:'var(--danger)', fontSize:'0.84rem' }}>
                🗑️ Clear Data
              </button>
            </div>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            {VARIANTS.filter(v=>selectedVariants.includes(v.id)).map(v=>{
              const files=results[v.id]; if(!files) return null;
              const base=fontName.replace(/\s+/g,'-'); const suf=v.id==='normal'?'':`-${v.label.replace(' ','')}`;
              return (
                <div key={v.id} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ marginBottom:8, fontWeight:v.weight==='bold'?700:400, fontStyle:v.style }}>{v.label}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {files.ttf && <button onClick={()=>download(files.ttf, `${base}${suf}.ttf`, 'font/ttf')}
                      style={{ padding:'5px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.8rem' }}>⬇ TTF</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(127,156,245,0.07)', border:'1px solid rgba(127,156,245,0.2)', borderRadius:8, fontSize:'0.8rem', color:'var(--muted)', lineHeight:1.6 }}>
            <strong style={{ color:'var(--accent2)' }}>💾 Storage & Privacy</strong><br/>
            Generated fonts are saved to <strong>browser localStorage on this device only</strong> — never uploaded to any server.
            Clearing site data or using Private/Incognito mode will erase them permanently.
            <strong style={{ color:'var(--accent)' }}> Download your fonts now to keep them safe.</strong>{' '}
            <button onClick={()=>setShowPrivacy(v=>!v)} style={{ background:'none', border:'none', color:'var(--accent2)', padding:0, fontSize:'0.8rem', cursor:'pointer', textDecoration:'underline' }}>
              {showPrivacy?'Less':'More info'}
            </button>
            {showPrivacy && (
              <div style={{ marginTop:8 }}>
                <p>• Data stays on <em>customfont.vercel.app</em> origin only — no cloud sync.</p>
                <p>• Mobile browsers may clear storage under memory pressure without warning.</p>
                <p>• We recommend saving TTF to Google Drive, iCloud, or Dropbox immediately.</p>
                <p>• History keeps your last 10 generated fonts; older ones are automatically removed.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS snippet */}
      {hasResults && (
        <div style={{ ...S.card }}>
          <h3 style={{ marginBottom:10 }}>CSS @font-face Snippet</h3>
          <pre style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', background:'var(--surface2)', padding:14, borderRadius:8, overflowX:'auto', lineHeight:1.6, color:'var(--text)', whiteSpace:'pre-wrap' }}>{cssSnippet}</pre>
          <button onClick={()=>{navigator.clipboard.writeText(cssSnippet);setCopiedCSS(true);setTimeout(()=>setCopiedCSS(false),2000);}}
            style={{ marginTop:8, padding:'6px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.84rem' }}>
            {copiedCSS?'✅ Copied!':'📋 Copy CSS'}
          </button>
        </div>
      )}


      {/* Import & preview any font */}
      <div style={{ ...S.card }}>
        <h3 style={{ fontSize:'1rem', marginBottom:4 }}>Import & Preview a Font File</h3>
        <p style={{ color:'var(--muted)', fontSize:'0.82rem', marginBottom:12 }}>
          Load any .ttf / .woff / .woff2 from your device — useful if your generated fonts were deleted or you want to check an existing font.
        </p>
        <label style={{ display:'inline-flex', alignItems:'center', gap:10, cursor:'pointer',
          padding:'8px 16px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, fontSize:'0.86rem' }}>
          📂 Choose font file
          <input type="file" accept=".ttf,.woff,.woff2,font/ttf,font/woff,font/woff2" hidden onChange={e=>handleImportFont(e.target.files[0])} />
        </label>
        {importStatus && <p style={{ marginTop:10, fontSize:'0.85rem', color:importStatus.startsWith('✅')?'var(--success)':importStatus.startsWith('❌')?'var(--danger)':'var(--muted)' }}>{importStatus}</p>}
        {importedFamily && (
          <textarea defaultValue="Type here to preview the imported font…"
            style={{ marginTop:14, fontFamily:`${importedFamily}, serif`, fontSize:previewSize, lineHeight:1.45, width:'100%', minHeight:100, background:'#fff', color:'#111', border:'1px solid var(--border)', borderRadius:8, padding:12, resize:'vertical' }} />
        )}
      </div>
    </div>
  );
}
