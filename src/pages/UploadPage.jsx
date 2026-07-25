import React, { useRef, useState, useCallback } from 'react';
import { segmentFromImageData } from '../lib/segmenter.js';

// SVG icons
const IcoCamera  = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:.5}}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const IcoChevron = ({ open }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>;
const IcoCheck   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

export default function UploadPage({ onGlyphs, initialPreview }) {
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus]     = useState('');
  const [busy, setBusy]         = useState(false);
  const [delta, setDelta]       = useState(40);
  const [preview, setPreview]   = useState(initialPreview ?? null);
  const [tipsOpen, setTipsOpen] = useState(false);
  const fileRef = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setStatus('Please upload an image file (JPG, PNG, WEBP, etc.)');
      return;
    }
    setBusy(true);
    setStatus('Loading image…');
    try {
      const bmp = await createImageBitmap(file);
      const MAX = 3000;
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      setPreview(dataUrl);
      setStatus('Detecting glyphs…');
      const imgData = ctx.getImageData(0, 0, w, h);
      const result = await segmentFromImageData(imgData, { delta });
      if (result.length === 0) {
        setStatus('No glyphs detected. Try adjusting ink sensitivity or use a darker pen on white paper.');
        setBusy(false);
        return;
      }
      setStatus(`Found ${result.length} glyph${result.length !== 1 ? 's' : ''} — proceed to Map Glyphs`);
      onGlyphs(result, dataUrl);
    } catch (e) { setStatus('Error: ' + e.message); }
    setBusy(false);
  }, [delta, onGlyphs]);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const isOk  = status.startsWith('Found');
  const isErr = status.startsWith('Error') || status.startsWith('No glyph') || status.startsWith('Please');

  return (
    <div>
      <h2 style={{ marginBottom:8, fontSize:'1.4rem' }}>Upload Your Handwriting</h2>
      <p style={{ color:'var(--muted)', marginBottom:24, maxWidth:600 }}>
        Write all your characters on paper with a <strong>dark pen</strong> (not pencil) on <strong>white paper</strong>. Letters should not touch each other. Take a clear photo from directly above and upload it here.
      </p>

      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current.click()}
        style={{
          border:`2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius:'var(--radius)', padding:'48px 24px', textAlign:'center',
          cursor:'pointer',
          background: dragOver ? 'rgba(224,201,127,0.05)' : 'var(--surface)',
          transition:'border-color .2s, background .2s', marginBottom:24,
        }}
      >
        <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}><IcoCamera /></div>
        <div style={{ fontWeight:600, marginBottom:6 }}>Drop photo here or click to browse</div>
        <div style={{ color:'var(--muted)', fontSize:'0.88rem' }}>JPG, PNG, WEBP, HEIC — up to 50MB</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ marginBottom:24 }}>
          <img src={preview} alt="Uploaded" style={{ maxWidth:'100%', maxHeight:300, borderRadius:8, border:'1px solid var(--border)' }} />
        </div>
      )}

      {/* Ink sensitivity */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:16, marginBottom:24 }}>
        <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <span style={{ fontSize:'0.85rem', color:'var(--muted)' }}>Ink Sensitivity (lower = pick up faint ink)</span>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <input type="range" min={10} max={90} value={delta} onChange={e => setDelta(+e.target.value)} style={{ flex:1 }} />
            <span style={{ fontFamily:'var(--font-mono)', minWidth:28 }}>{delta}</span>
          </div>
        </label>
      </div>

      {/* Status */}
      {status && (
        <div style={{
          padding:'12px 16px', borderRadius:8, fontSize:'0.9rem', display:'flex', alignItems:'center', gap:8,
          background: isOk ? 'rgba(74,222,128,0.1)' : isErr ? 'rgba(248,113,113,0.1)' : 'var(--surface)',
          border:`1px solid ${isOk ? 'var(--success)' : isErr ? 'var(--danger)' : 'var(--border)'}`,
          color: isOk ? 'var(--success)' : isErr ? 'var(--danger)' : 'var(--text)',
        }}>
          {isOk && <IcoCheck />}
          {busy && <span className="spinner" />}
          {status}
        </div>
      )}

      {/* Tips — custom toggle, no <details> */}
      <div style={{ marginTop:32 }}>
        <button
          onClick={() => setTipsOpen(o => !o)}
          style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none',
            color:'var(--accent2)', fontSize:'0.9rem', padding:0, cursor:'pointer' }}
        >
          <IcoChevron open={tipsOpen} />
          Tips for best results
        </button>
        {tipsOpen && (
          <div style={{ marginTop:10, padding:16, background:'var(--surface)', borderRadius:8,
            fontSize:'0.88rem', lineHeight:1.7, animation:'fadeInUp .2s var(--ease) both' }}>
            <p>Use a <strong>black or dark blue ballpoint or felt-tip pen</strong> — not pencil, not light grey.</p>
            <p>Write on <strong>plain white paper</strong>. Avoid lined paper if possible.</p>
            <p><strong>Leave gaps</strong> between letters — touching letters will be detected as one glyph.</p>
            <p>Shoot from <strong>directly above</strong>, no angle. Good lighting, no shadows.</p>
            <p>Write <strong>large</strong> — at least 2cm tall letters work best.</p>
            <p>You can write on <strong>multiple pages</strong> — upload each separately.</p>
          </div>
        )}
      </div>
    </div>
  );
}
