import React, { useRef, useState, useCallback } from 'react';
import { segmentFromImageData } from '../lib/segmenter.js';

const PRESETS = [
  { label: 'Latin Full', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?\'"-()@#&+/$%' },
  { label: 'Uppercase Only', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { label: 'Lowercase Only', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { label: 'Numbers & Symbols', chars: '0123456789.,;:!?\'"-()@#&+/$%=<>*^~_[]{}\\|/' },
  { label: 'Custom…', chars: '' },
];

export default function UploadPage({ onGlyphs }) {
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState(40);
  const [chars, setChars] = useState(PRESETS[0].chars);
  const [preset, setPreset] = useState(0);
  const [preview, setPreview] = useState(null);
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
      setPreview(canvas.toDataURL('image/jpeg', 0.7));
      setStatus('Detecting glyphs…');
      const imgData = ctx.getImageData(0, 0, w, h);
      const result = await segmentFromImageData(imgData, { delta });
      if (result.length === 0) {
        setStatus('No glyphs detected. Try adjusting ink sensitivity or use a darker pen on white paper.');
        setBusy(false);
        return;
      }
      setStatus(`✅ Found ${result.length} glyph${result.length !== 1 ? 's' : ''} — proceed to Map Glyphs`);
      onGlyphs(result);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
    setBusy(false);
  }, [delta, onGlyphs]);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  return (
    <div>
      <h2 style={{ marginBottom: 8, fontSize: '1.4rem' }}>Upload Your Handwriting</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24, maxWidth: 600 }}>
        Write all your characters on paper with a <strong>dark pen</strong> (not pencil) on <strong>white paper</strong>. Letters should not touch each other. Take a clear photo from directly above and upload it here.
      </p>

      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'rgba(224,201,127,0.05)' : 'var(--surface)',
          transition: 'border-color .2s, background .2s',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>📷</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop photo here or click to browse</div>
        <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>JPG, PNG, WEBP, HEIC — up to 50MB</div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files[0])} />
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ marginBottom: 24 }}>
          <img src={preview} alt="Uploaded" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid var(--border)' }} />
        </div>
      )}

      {/* Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Ink Sensitivity (lower = pick up faint ink)</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="range" min={10} max={90} value={delta} onChange={e => setDelta(+e.target.value)} style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', minWidth: 28 }}>{delta}</span>
          </div>
        </label>
      </div>

      {status && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: status.startsWith('✅') ? 'rgba(74,222,128,0.1)' : status.startsWith('Error') ? 'rgba(248,113,113,0.1)' : 'var(--surface)',
          border: `1px solid ${status.startsWith('✅') ? 'var(--success)' : status.startsWith('Error') ? 'var(--danger)' : 'var(--border)'}`,
          color: status.startsWith('✅') ? 'var(--success)' : status.startsWith('Error') ? 'var(--danger)' : 'var(--text)',
          fontSize: '0.9rem',
        }}>
          {busy && '⏳ '}{status}
        </div>
      )}

      {/* Tips */}
      <details style={{ marginTop: 32 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--accent2)', fontSize: '0.9rem', userSelect: 'none' }}>📋 Tips for best results</summary>
        <div style={{ marginTop: 12, padding: 16, background: 'var(--surface)', borderRadius: 8, fontSize: '0.88rem', lineHeight: 1.7 }}>
          <p>• Use a <strong>black or dark blue ballpoint or felt-tip pen</strong> — not pencil, not light grey.</p>
          <p>• Write on <strong>plain white paper</strong>. Avoid lined paper if possible (lines can confuse detection).</p>
          <p>• <strong>Leave gaps</strong> between letters — touching letters will be detected as one glyph.</p>
          <p>• Shoot from <strong>directly above</strong>, no angle. Good lighting, no shadows over the writing.</p>
          <p>• Write <strong>large</strong> — at least 2cm tall letters work best.</p>
          <p>• You can write on <strong>multiple pages</strong> — upload each page separately and add to the same font.</p>
        </div>
      </details>
    </div>
  );
}
