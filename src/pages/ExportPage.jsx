import React, { useState, useEffect, useRef } from 'react';
import { potrace, init as initPotrace } from 'esm-potrace-wasm';
import svgpath from 'svgpath';
import { placeGlyph, applyItalic } from '../lib/metrics.js';
import { buildTTF, toWoff, toWoff2, fontFaceCSS } from '../lib/assemble.js';

const PAD = 10;

async function traceImageData(imageData) {
  const svg = await potrace(imageData, { turdsize:6, alphamax:1.05, opticurve:1, opttolerance:0.2, extractcolors:false });
  const m = /d="([^"]+)"/.exec(svg);
  if (!m) return '';
  return svgpath(m[1]).scale(0.1,-0.1).translate(0,imageData.height).round(1).toString();
}

const VARIANTS = [
  { id:'normal', label:'Normal', weight:'normal', style:'normal' },
  { id:'bold', label:'Bold', weight:'bold', style:'normal', weightPx:2 },
  { id:'italic', label:'Italic', weight:'normal', style:'italic', italicDeg:12 },
  { id:'boldItalic', label:'Bold Italic', weight:'bold', style:'italic', weightPx:2, italicDeg:12 },
];

const FORMATS = ['TTF','WOFF','WOFF2'];

export default function ExportPage({ glyphs, mappings, fontName }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState({});
  const [selectedVariants, setSelectedVariants] = useState(['normal']);
  const [selectedFormats, setSelectedFormats] = useState(['TTF','WOFF2']);
  const [previewText, setPreviewText] = useState('The quick brown fox jumps over the lazy dog\n0123456789 !@#$%^&*()');
  const [previewSize, setPreviewSize] = useState(32);
  const [wordSpace, setWordSpace] = useState(300);
  const [lsb, setLsb] = useState(50);
  const [rsb, setRsb] = useState(50);
  const [smooth, setSmooth] = useState(1);
  const fontFaceRef = useRef({});
  const fontSeqRef = useRef(0);

  const mappedEntries = Object.entries(mappings); // [[glyphIdx, char], ...]

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

  async function buildVariant(variant) {
    await initPotrace();
    const builtGlyphs = [];
    for (const [idxStr, char] of mappedEntries) {
      const g = glyphs[+idxStr];
      let imgData = g.imageData;
      if (variant.weightPx) imgData = await dilateImageData(imgData, variant.weightPx);
      const d = await traceImageData(imgData);
      if (!d) continue;
      let placed = placeGlyph(d, { width: g.canvas.width, height: g.canvas.height }, PAD, char, { lsb, rsb });
      if (variant.italicDeg) placed = { ...placed, d: applyItalic(placed.d, variant.italicDeg) };
      builtGlyphs.push({ char, ...placed });
    }
    return buildTTF(fontName, builtGlyphs, { wordSpace, weight: variant.weight, style: variant.style });
  }

  async function generate() {
    setBusy(true);
    setResults({});
    try {
      const out = {};
      for (const vId of selectedVariants) {
        const v = VARIANTS.find(x => x.id === vId);
        setStatus(`Building ${v.label}…`);
        const ttf = await buildVariant(v);
        out[vId] = { ttf };
        if (selectedFormats.includes('WOFF')) {
          setStatus(`Converting ${v.label} → WOFF…`);
          out[vId].woff = await toWoff(ttf);
        }
        if (selectedFormats.includes('WOFF2')) {
          setStatus(`Converting ${v.label} → WOFF2…`);
          out[vId].woff2 = await toWoff2(ttf);
        }
        // Install preview font
        const fName = `preview-${fontName}-${vId}-${++fontSeqRef.current}`;
        const face = new FontFace(fName, ttf.buffer ? ttf.buffer : ttf, {
          weight: v.weight, style: v.style
        });
        await face.load();
        document.fonts.add(face);
        fontFaceRef.current[vId] = fName;
      }
      setResults(out);
      setStatus('✅ Done! Download your fonts below.');
    } catch(e) {
      setStatus('❌ Error: ' + e.message);
    }
    setBusy(false);
  }

  function download(data, filename, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function downloadAll() {
    const base = fontName.replace(/\s+/g,'-');
    for (const [vId, files] of Object.entries(results)) {
      const v = VARIANTS.find(x => x.id === vId);
      const suffix = vId === 'normal' ? '' : `-${v.label.replace(' ','')}`;
      if (selectedFormats.includes('TTF') && files.ttf) download(files.ttf, `${base}${suffix}.ttf`, 'font/ttf');
      if (selectedFormats.includes('WOFF') && files.woff) download(files.woff, `${base}${suffix}.woff`, 'font/woff');
      if (selectedFormats.includes('WOFF2') && files.woff2) download(files.woff2, `${base}${suffix}.woff2`, 'font/woff2');
    }
  }

  const cssSnippet = fontFaceCSS(
    fontName,
    fontName.replace(/\s+/g,'-'),
    VARIANTS.filter(v => selectedVariants.includes(v.id)).map(v => ({
      weight: v.weight, style: v.style,
      filename: `${fontName.replace(/\s+/g,'-')}${v.id==='normal'?'':`-${v.label.replace(' ','')}` }`,
    }))
  );

  const hasResults = Object.keys(results).length > 0;
  const previewFontFamily = hasResults ? Object.values(fontFaceRef.current).join(', ') + ', serif' : 'serif';

  return (
    <div>
      <h2 style={{ marginBottom: 8, fontSize: '1.3rem' }}>Export Font</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
        {mappedEntries.length} characters ready to export.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 20, marginBottom: 24 }}>
        {/* Variants */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Font Variants</h3>
          {VARIANTS.map(v => (
            <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedVariants.includes(v.id)}
                onChange={e => setSelectedVariants(prev => e.target.checked ? [...prev, v.id] : prev.filter(x=>x!==v.id))}
              />
              <span style={{ fontWeight: v.weight==='bold'?700:400, fontStyle: v.style }}>{v.label}</span>
            </label>
          ))}
        </div>

        {/* Formats */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Output Formats</h3>
          {FORMATS.map(f => (
            <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedFormats.includes(f)}
                onChange={e => setSelectedFormats(prev => e.target.checked ? [...prev, f] : prev.filter(x=>x!==f))}
              />
              <span>{f}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                {f==='TTF'?'— desktop, universal':''}
                {f==='WOFF'?'— legacy web support':''}
                {f==='WOFF2'?'— modern web (recommended)':''}
              </span>
            </label>
          ))}
        </div>

        {/* Metrics */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Metrics & Style</h3>
          {[
            { label:'Word space (px)', val:wordSpace, set:setWordSpace, min:100, max:600 },
            { label:'Left bearing', val:lsb, set:setLsb, min:0, max:200 },
            { label:'Right bearing', val:rsb, set:setRsb, min:0, max:200 },
          ].map(({ label, val, set, min, max }) => (
            <label key={label} style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 }}>
              <span style={{ fontSize:'0.8rem', color:'var(--muted)' }}>{label}</span>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="range" min={min} max={max} value={val} onChange={e=>set(+e.target.value)} style={{ flex:1 }} />
                <span style={{ fontFamily:'var(--font-mono)', minWidth:36, fontSize:'0.85rem' }}>{val}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Generate */}
      <button
        onClick={generate}
        disabled={busy || selectedVariants.length===0 || selectedFormats.length===0}
        style={{ padding:'12px 32px', background:'var(--accent)', color:'#1a1a2e', borderRadius:8, fontWeight:700, fontSize:'1rem', marginBottom:16 }}
      >
        {busy ? '⏳ Building…' : '⚡ Generate Fonts'}
      </button>

      {status && (
        <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, background:'var(--surface)', border:'1px solid var(--border)', color: status.startsWith('✅')?'var(--success)':status.startsWith('❌')?'var(--danger)':'var(--text)', fontSize:'0.9rem' }}>
          {status}
        </div>
      )}

      {/* Preview */}
      {hasResults && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <h3 style={{ fontSize:'1rem' }}>Live Preview</h3>
            <label style={{ display:'flex', gap:8, alignItems:'center', color:'var(--muted)', fontSize:'0.85rem' }}>
              Size: <input type="range" min={12} max={120} value={previewSize} onChange={e=>setPreviewSize(+e.target.value)} style={{ width:80 }} /> {previewSize}px
            </label>
          </div>
          <textarea
            value={previewText}
            onChange={e => setPreviewText(e.target.value)}
            style={{
              fontFamily: previewFontFamily,
              fontSize: previewSize,
              lineHeight: 1.4,
              width: '100%',
              minHeight: 120,
              background: '#fff',
              color: '#111',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              resize: 'vertical',
            }}
          />
        </div>
      )}

      {/* Download */}
      {hasResults && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3>Download</h3>
            <button onClick={downloadAll} style={{ padding:'8px 20px', background:'var(--accent2)', color:'#fff', borderRadius:7, fontWeight:600 }}>
              ⬇ Download All
            </button>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {VARIANTS.filter(v=>selectedVariants.includes(v.id)).map(v => {
              const files = results[v.id]; if (!files) return null;
              const base = fontName.replace(/\s+/g,'-');
              const suffix = v.id==='normal'?'':`-${v.label.replace(' ','')}`;
              return (
                <div key={v.id} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontWeight:700, marginBottom:8, fontWeight:v.weight==='bold'?700:400, fontStyle:v.style }}>{v.label}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {selectedFormats.includes('TTF')&&files.ttf&&<button onClick={()=>download(files.ttf,`${base}${suffix}.ttf`,'font/ttf')} style={{ padding:'5px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.82rem' }}>TTF</button>}
                    {selectedFormats.includes('WOFF')&&files.woff&&<button onClick={()=>download(files.woff,`${base}${suffix}.woff`,'font/woff')} style={{ padding:'5px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.82rem' }}>WOFF</button>}
                    {selectedFormats.includes('WOFF2')&&files.woff2&&<button onClick={()=>download(files.woff2,`${base}${suffix}.woff2`,'font/woff2')} style={{ padding:'5px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.82rem' }}>WOFF2</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CSS Snippet */}
      {hasResults && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:20, marginBottom:20 }}>
          <h3 style={{ marginBottom:10 }}>CSS @font-face Snippet</h3>
          <pre style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', background:'var(--surface2)', padding:14, borderRadius:8, overflowX:'auto', lineHeight:1.6, color:'var(--text)' }}>{cssSnippet}</pre>
          <button onClick={()=>navigator.clipboard.writeText(cssSnippet)} style={{ marginTop:8, padding:'6px 14px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)', fontSize:'0.85rem' }}>
            Copy CSS
          </button>
        </div>
      )}
    </div>
  );
}
