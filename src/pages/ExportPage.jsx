import React, { useState, useEffect, useRef, useCallback } from 'react';
import { potrace, init as initPotrace } from 'esm-potrace-wasm';
import svgpath from 'svgpath';
import { placeGlyph, applyItalic, band } from '../lib/metrics.js';
import { buildTTF, fontFaceCSS } from '../lib/assemble.js';

// SVG icons
const IcoDownload = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoTrash    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IcoCheck    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoCopy     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const IcoFile     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
const IcoZap      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IcoBot      = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/></svg>;
const IcoRuler    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l4-4 4 4 4-4 4 4"/><line x1="3" y1="12" x2="21" y2="12"/></svg>;
const IcoEye      = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcoShield   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
const IcoChevron  = ({ open }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>;

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
  const [copiedPrompt, setCopiedPrompt]     = useState(false);
  const [showPrompt, setShowPrompt]         = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const fontFaceRef    = useRef({});
  const fontSeqRef     = useRef(0);
  const resultsRef      = useRef(null);
  const debounceRef     = useRef(null);
  const previewRef      = useRef(null);
  const lastSliderVals  = useRef({ wordSpace, lsb, rsb });
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
      g._cachedPath = d; // keep for canvas compat
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
    setGenDone(false);
    setBusy(true); setResults({});
    try {
      const out = {};
      for (const vId of selectedVariants) {
        const v = VARIANTS.find(x => x.id === vId);
        setStatus(`Building ${v.label}…`);
        const { ttfBytes, glyphs: builtGlyphs } = await buildVariant(v);
        out[vId] = { ttf: ttfBytes };
        // TTF only — no WOFF/WOFF2 conversion
        const fName = `cfprev-${fontName}-${vId}-${++fontSeqRef.current}`;
        await installFont(ttfBytes, fName, { weight: v.weight, style: v.style });
        fontFaceRef.current[vId] = fName;
      }
      setResults(out);
      setStatus('done: Your font is ready.');
      setGenDone(true); setTimeout(()=>setGenDone(false), 2500);
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
      saveHistory([...loadHistory(), entry]);
    } catch(e) { setStatus('err: '+e.message); }
    setBusy(false);
    setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
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
  // restoreFromHistory moved to HistoryPage
  async function handleImportFont(file) {
    if (!file) return; setImportStatus('Loading…');
    try {
      const buf=await file.arrayBuffer(); const fName=`cfimport-${Date.now()}`;
      const face=new FontFace(fName,buf); await face.load(); document.fonts.add(face);
      setImportedFamily(fName); setImportStatus(`ok: Loaded "${file.name}" — type below to preview`);
    } catch(e) { setImportStatus('err: '+e.message); }
  }
  // deleteEntry moved to HistoryPage

  function clearSession() {
    localStorage.removeItem(LS_KEY);
    setResults({});
    setStatus('done: Export data cleared.');
    setShowClearConfirm(false);
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
  const base = fontName.replace(/\s+/g,'-');
  const variantLabels = VARIANTS.filter(v=>selectedVariants.includes(v.id)).map(v=>v.label).join(', ');
  const variantFiles = VARIANTS.filter(v=>selectedVariants.includes(v.id))
    .map(v=>`${base}${v.id==='normal'?'':'-'+v.label.replace(' ','')}.ttf (${v.label})`).join('\n- ');
  const vibePrompt = [
    `I have a custom handmade font called "${fontName || 'MyFont'}" generated using customfont.vercel.app, exported as TTF format.`,
    ``,
    `Font file(s):`,
    `- ${variantFiles || base+'.ttf (Normal)'}`,
    ``,
    `== STEP 1: Host the font ==`,
    `Give me exact steps to upload the font file(s) to our project's GitHub repository (e.g. in /public/fonts/ or /assets/fonts/), unless I specify another hosting method.`,
    ``,
    `== STEP 2: CSS @font-face ==`,
    `Use this exact CSS to register the font in our project:`,
    ``,
    cssSnippet,
    ``,
    `== STEP 3: Where to use it ==`,
    `- First ask me about our project: what it is, the tech stack (React/Next/Vue/plain HTML etc.), and the key UI sections.`,
    `- Then suggest SPECIFICALLY where to use this font — e.g. hero heading, nav brand, section titles, buttons, body text, captions — not just "use it everywhere".`,
    `- For each placement suggest: font-size, font-weight (normal/bold), font-style (normal/italic), and letter-spacing.`,
    `- Available variants: ${variantLabels || 'Normal'}. Match each variant to the right UI element.`,
    `- Suggest a good fallback font stack after "${fontName || 'MyFont'}" (e.g. Georgia, serif).`,
    ``,
    `== STEP 4: Implementation ==`,
    `Ask me the framework/stack if unsure, then provide the actual CSS classes or component code to apply the font with the sizes and variants you recommended.`,
  ].join('\n');

  // Auto-rebuild when metrics sliders change (only after first generate)
  useEffect(() => {
    if (!Object.keys(results).length) return; // nothing built yet
    if (
      lastSliderVals.current.wordSpace === wordSpace &&
      lastSliderVals.current.lsb === lsb &&
      lastSliderVals.current.rsb === rsb
    ) return;
    lastSliderVals.current = { wordSpace, lsb, rsb };
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const out = {};
        for (const vId of selectedVariants) {
          const v = VARIANTS.find(x => x.id === vId);
          const { ttfBytes } = await buildVariant(v);
          out[vId] = { ttf: ttfBytes };
          const fName = `cfprev-${fontName}-${vId}-${++fontSeqRef.current}`;
          await installFont(ttfBytes, fName, { weight: v.weight, style: v.style });
          fontFaceRef.current[vId] = fName;
        }
        setResults(prev => ({ ...prev, ...out }));
        setPreviewKey(k => k + 1);
      } catch(e) { console.warn('Slider rebuild failed:', e); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [wordSpace, lsb, rsb]); // eslint-disable-line react-hooks/exhaustive-deps

  const sliders = [
    { label:'Word space (px)', val:wordSpace, set:setWordSpace, min:100, max:600 },
    { label:'Left bearing',    val:lsb,       set:setLsb,       min:0,   max:200 },
    { label:'Right bearing',   val:rsb,       set:setRsb,       min:0,   max:200 },
  ];

  return (<>
    <div>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:'1.4rem', marginBottom:4 }}>Export Font</h2>
        <p style={{ color:'var(--muted)', fontSize:'0.9rem' }}>{mappedEntries.length} characters mapped · set a font name above, then generate</p>
      </div>

      {/* Settings */}
      <div ref={resultsRef} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:16, marginBottom:20 }}>
        <div style={S.card}>
          <h3 style={{ fontSize:'0.95rem', marginBottom:14 }}>Font Variants</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {VARIANTS.map(v=>{
              const on = selectedVariants.includes(v.id);
              return (
                <label key={v.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px',
                  borderRadius:8, cursor:'pointer', transition:'background .15s, border-color .15s',
                  border: on ? '1.5px solid var(--accent2)' : '1.5px solid var(--border)',
                  background: on ? 'rgba(127,156,245,0.10)' : 'var(--surface2)' }}>
                  <input type="checkbox" checked={on}
                    onChange={e=>setSelectedVariants(prev=>e.target.checked?[...prev,v.id]:prev.filter(x=>x!==v.id))}
                    style={{ accentColor:'var(--accent2)', width:15, height:15, flexShrink:0 }} />
                  <span style={{ fontWeight:v.weight==='bold'?700:400, fontStyle:v.style, fontSize:'0.88rem',
                    color: on ? 'var(--text)' : 'var(--muted)' }}>{v.label}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div style={S.card}>
          <h3 style={{ fontSize:'0.95rem', marginBottom:12 }}>Output Format</h3>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ color:'var(--success)', display:'flex' }}><IcoCheck /></span>
            <span style={{ fontWeight:600 }}>TTF</span>
            <span style={{ color:'var(--muted)', fontSize:'0.82rem' }}>TrueType — works on Windows, Mac, Linux, Android, iOS & all browsers</span>
          </div>
        </div>
      </div>

      {/* Generate */}
      <div style={{ margin:'20px 0', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={generate}
          disabled={busy||selectedVariants.length===0||mappedEntries.length===0}
          className="btn-primary" style={{ padding:'12px 32px', fontSize:'1rem' }}>
          {busy ? <><span className="spinner" style={{marginRight:6}} />Generating…</> : genDone ? <><IcoCheck /><span style={{marginLeft:6}}>Generated!</span></> : <><IcoZap /><span style={{marginLeft:6}}>Generate Fonts</span></>}
        </button>
        {mappedEntries.length===0 && <span style={{ color:'var(--muted)', fontSize:'0.85rem' }}>Map some glyphs first</span>}
      </div>

      {status && (
        <div style={{ marginBottom:20, padding:'10px 16px', borderRadius:8,
          background: status.startsWith('done')?'rgba(74,222,128,0.08)':status.startsWith('err')?'rgba(248,113,113,0.08)':'var(--surface)',
          border:`1px solid ${status.startsWith('done')?'var(--success)':status.startsWith('err')?'var(--danger)':'var(--border)'}`,
          color: status.startsWith('done')?'var(--success)':status.startsWith('err')?'var(--danger)':'var(--text)', fontSize:'0.9rem' }}>
          {status.replace(/^(done|err): ?/, '')}
        </div>
      )}

      {/* Metrics & Spacing — moved after Generate */}
      <div style={{ ...S.card, marginTop:20 }}>
        <h3 style={{ fontSize:'0.95rem', marginBottom:14, display:'flex', alignItems:'center', gap:7 }}><IcoRuler /> Metrics &amp; Spacing</h3>
        {sliders.map(({label,val,set,min,max})=>(
          <div key={label} style={{ marginBottom:14 }}>
            <span style={S.label}>{label}</span>
            <div style={S.row}>
              <input type="range" min={min} max={max} value={val} onChange={e=>set(+e.target.value)} style={{ flex:1 }} />
              <span style={S.mono}>{val}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Variant selector — controls Live Font Preview */}
      {hasResults && Object.keys(results).length > 1 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
          <span style={{ fontSize:"0.8rem", color:"var(--muted)", alignSelf:"center", marginRight:4 }}>Preview variant:</span>
          {VARIANTS.filter(v=>selectedVariants.includes(v.id) && results[v.id]).map(v=>(
            <button key={v.id} onClick={()=>setPreviewVariant(v.id)}
              style={{ padding:"5px 12px", borderRadius:6, fontSize:"0.82rem",
                background: previewVariant===v.id ? "var(--accent2)" : "var(--surface2)",
                color: previewVariant===v.id ? "#fff" : "var(--muted)",
                border: previewVariant===v.id ? "1px solid var(--accent2)" : "1px solid var(--border)",
                fontStyle: v.style, fontWeight: v.weight==="bold" ? 700 : 400 }}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      {/* Live typing preview (post-generation) */}
      {hasResults && (
        <div style={{ ...S.card }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:10 }}>
              <div>
                <h3 style={{ fontSize:'1rem', marginBottom:2, display:'flex', alignItems:'center', gap:7 }}><IcoEye /> Live Font Preview</h3>
                <p style={{ color:'var(--muted)', fontSize:'0.8rem' }}>Type anything — rendered in your generated font in real time</p>
              </div>
              <label style={{ display:'flex', gap:8, alignItems:'center', color:'var(--muted)', fontSize:'0.82rem' }}>
                Size <input type="range" min={12} max={120} value={previewSize} onChange={e=>setPreviewSize(+e.target.value)} style={{ width:70 }} />
                <span style={S.mono}>{previewSize}px</span>
              </label>
            </div>
          </div>
          <textarea key={previewKey} ref={previewRef} value={previewText}
            onChange={e=>{ setPreviewText(e.target.value); }}
            onFocus={()=>{ previewRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }); }}
            onClick={()=>{ previewRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }); }}
            style={{ fontFamily:generatedFamily, fontSize:previewSize, lineHeight:1.45, width:'100%', minHeight:140,
              background:'#fff', color:'#111', border:'1px solid var(--border)', borderRadius:8, padding:14, resize:'vertical' }} />
          <p style={{ marginTop:6, color:'var(--muted)', fontSize:'0.75rem' }}>Characters not in your font fall back to system serif.</p>
          <input type="text" value={previewText.split('\n')[0]} onChange={e=>setPreviewText(e.target.value)} placeholder="Preview text…" style={{ marginTop:8, fontSize:'0.86rem', width:'100%' }} />
        </div>
      )}

      {/* Download */}
      {hasResults && (
        <div style={{ ...S.card }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
            <h3>Download Files</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={downloadAll} style={{ padding:'8px 18px', background:'var(--accent2)', color:'#fff', borderRadius:7, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                <IcoDownload /> Download All
              </button>
              <button onClick={() => setShowClearConfirm(true)}
                title="Free up localStorage space used by this session"
                style={{ padding:'8px 14px', background:'rgba(248,113,113,0.10)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:7, color:'var(--danger)', fontSize:'0.84rem', display:'flex', alignItems:'center', gap:6 }}>
                <IcoTrash /> Clear Data
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
                      style={{ padding:'5px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:5 }}><IcoDownload /> TTF</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(127,156,245,0.07)', border:'1px solid rgba(127,156,245,0.2)', borderRadius:8, fontSize:'0.8rem', color:'var(--muted)', lineHeight:1.6 }}>
            <strong style={{ color:'var(--accent2)', display:'inline-flex', alignItems:'center', gap:6 }}><IcoShield /> Storage &amp; Privacy</strong><br/>
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
            <>{copiedCSS ? <><IcoCheck /><span style={{marginLeft:5}}>Copied!</span></> : <><IcoCopy /><span style={{marginLeft:5}}>Copy CSS</span></>}</>
          </button>
        </div>
      )}


      {/* Vibe Coding Prompt */}
      {hasResults && (
        <div style={{ ...S.card }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8 }}>
            <div>
              <h3 style={{ fontSize:'1rem', marginBottom:2, display:'flex', alignItems:'center', gap:7 }}><IcoBot /> Vibe Coding Prompt</h3>
              <p style={{ color:'var(--muted)', fontSize:'0.8rem' }}>Copy this prompt and paste it to Claude, Gemini, ChatGPT or any AI coding agent, to implement your custom font <strong style={{color:'var(--accent)'}}>{fontName || 'MyFont'}</strong> in your website</p>
            </div>
            <button onClick={()=>setShowPrompt(p=>!p)}
              style={{ padding:'6px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.84rem', color:'var(--text)', cursor:'pointer' }}>
              {showPrompt ? 'Hide' : 'Show Prompt'}
            </button>
          </div>
          {showPrompt && (
            <>
              <pre style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', background:'var(--surface2)', padding:14, borderRadius:8, overflowX:'auto', lineHeight:1.6, color:'var(--text)', whiteSpace:'pre-wrap', maxHeight:320, overflowY:'auto' }}>{vibePrompt}</pre>
              <button onClick={()=>{ navigator.clipboard.writeText(vibePrompt); setCopiedPrompt(true); setTimeout(()=>setCopiedPrompt(false),2000); }}
                style={{ marginTop:8, padding:'6px 16px', background: copiedPrompt ? 'var(--success)' : 'var(--accent2)', color:'#fff', borderRadius:6, fontSize:'0.84rem', fontWeight:600, cursor:'pointer' }}>
                <>{copiedPrompt ? <><IcoCheck /><span style={{marginLeft:5}}>Copied!</span></> : <><IcoCopy /><span style={{marginLeft:5}}>Copy Prompt</span></>}</>
              </button>
            </>
          )}
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
          <IcoFile /> Choose font file
          <input type="file" accept=".ttf,.woff,.woff2,font/ttf,font/woff,font/woff2" hidden onChange={e=>handleImportFont(e.target.files[0])} />
        </label>
        {importStatus && <p style={{ marginTop:10, fontSize:'0.85rem', color:importStatus.startsWith('ok')?'var(--success)':importStatus.startsWith('err')?'var(--danger)':'var(--muted)' }}>{importStatus}</p>}
        {importedFamily && (
          <textarea defaultValue="Type here to preview the imported font…"
            style={{ marginTop:14, fontFamily:`${importedFamily}, serif`, fontSize:previewSize, lineHeight:1.45, width:'100%', minHeight:100, background:'#fff', color:'#111', border:'1px solid var(--border)', borderRadius:8, padding:12, resize:'vertical' }} />
        )}
      </div>
    </div>

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
              <span style={{ color:'var(--danger)' }}><IcoTrash /></span> Clear Export Data?
            </h3>
            <p style={{ color:'var(--muted)', fontSize:'0.88rem', lineHeight:1.6, marginBottom:20 }}>
              This frees localStorage space from the current export session. Your font history is not affected.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setShowClearConfirm(false)}
                style={{ padding:'8px 18px', background:'var(--surface2)', border:'1px solid var(--border)',
                  borderRadius:7, color:'var(--text)', fontSize:'0.88rem' }}>Cancel</button>
              <button onClick={clearSession}
                style={{ padding:'8px 18px', background:'var(--danger)',
                  borderRadius:7, color:'#fff', fontWeight:700, fontSize:'0.88rem' }}>Yes, Clear</button>
            </div>
          </div>
        </div>
      )}
  </>);
}
