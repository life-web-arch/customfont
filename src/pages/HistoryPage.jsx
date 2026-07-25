import React, { useState } from 'react';

const LS_KEY = 'cfs_font_history';

function loadHistory() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveHistory(entries) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(-10))); } catch(e) { console.warn('localStorage quota exceeded'); }
}
function b64ToUint8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function triggerDownload(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const VARIANT_LABELS = { normal: 'Normal', bold: 'Bold', italic: 'Italic', boldItalic: 'Bold Italic' };
const VARIANT_STYLE  = { bold: { fontWeight: 700 }, italic: { fontStyle: 'italic' }, boldItalic: { fontWeight: 700, fontStyle: 'italic' } };
const FORMAT_MIME    = { ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2' };
const FORMAT_COLOR   = { ttf: 'var(--text)', woff: 'var(--accent2)', woff2: 'var(--accent)' };

// Normalise old (string) and new (object) history entries
function getFormatBytes(variantData, fmt) {
  if (!variantData) return null;
  if (typeof variantData === 'string') return fmt === 'ttf' ? variantData : null; // legacy
  return variantData[fmt] ?? null;
}

export default function HistoryPage() {
  const [history, setHistory] = useState(loadHistory);
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(null); // entry id

  function deleteEntry(id) {
    const updated = history.filter(e => e.id !== id);
    saveHistory(updated); setHistory(updated);
    if (expanded === id) setExpanded(null);
  }

  function clearAll() {
    if (!window.confirm('Clear all font history from localStorage? This cannot be undone.')) return;
    localStorage.removeItem(LS_KEY);
    setHistory([]);
    setExpanded(null);
    setStatus('🗑️ All history cleared.');
  }

  function downloadFmt(entry, vId, fmt) {
    const bytes = getFormatBytes(entry.variants[vId], fmt);
    if (!bytes) return;
    const base  = entry.name.replace(/\s+/g, '-');
    const suffix = vId === 'normal' ? '' : `-${VARIANT_LABELS[vId]?.replace(' ', '') ?? vId}`;
    triggerDownload(b64ToUint8(bytes), `${base}${suffix}.${fmt}`, FORMAT_MIME[fmt]);
  }

  function downloadAll(entry) {
    for (const [vId, vData] of Object.entries(entry.variants)) {
      const bytes = getFormatBytes(vData, 'ttf');
      if (!bytes) continue;
      const base   = entry.name.replace(/\s+/g, '-');
      const suffix = vId === 'normal' ? '' : `-${VARIANT_LABELS[vId]?.replace(' ', '') ?? vId}`;
      triggerDownload(b64ToUint8(bytes), `${base}${suffix}.ttf`, 'font/ttf');
    }
  }

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 },
    entryWrap: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
    entryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', gap: 8, flexWrap: 'wrap', cursor: 'pointer' },
    variantRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' },
    fmtBtn: (fmt) => ({
      padding: '4px 11px', background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, color: FORMAT_COLOR[fmt], fontSize: '0.8rem', fontWeight: 600,
    }),
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: 4 }}>🕓 Font History</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            {history.length} saved font{history.length !== 1 ? 's' : ''} — stored in browser localStorage on this device only.
          </p>
        </div>
        {history.length > 0 && (
          <button onClick={clearAll}
            style={{ padding: '7px 14px', background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, color: 'var(--danger)', fontSize: '0.85rem' }}>
            🗑️ Clear All
          </button>
        )}
      </div>

      {status && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '0.88rem' }}>
          {status}
        </div>
      )}

      {history.length === 0 ? (
        <div style={S.card}>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', textAlign: 'center', padding: '24px 0' }}>
            No history yet — generate a font on the Export tab first.
          </p>
        </div>
      ) : (
        <div>
          {[...history].reverse().map(entry => {
            const variantIds = Object.keys(entry.variants);
            const isOpen = expanded === entry.id;

            return (
              <div key={entry.id} style={S.entryWrap}>
                {/* Collapsed header row */}
                <div style={S.entryHeader} onClick={() => setExpanded(isOpen ? null : entry.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 3 }}>{entry.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                      {entry.date} · {variantIds.map(v => VARIANT_LABELS[v] ?? v).join(', ')} · {variantIds.length} variant{variantIds.length > 1 ? 's' : ''}
                    </div>
                    {/* Format badges */}
                    <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600 }}>
                        TTF
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); downloadAll(entry); }}
                      style={{ padding: '6px 12px', background: 'var(--accent2)', color: '#fff', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600 }}
                      title="Download all variants & formats">
                      ⬇ All
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteEntry(entry.id); }}
                      style={{ padding: '6px 10px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 6, color: 'var(--danger)', fontSize: '0.82rem' }}>
                      ✕
                    </button>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded: per-variant format buttons */}
                {isOpen && (
                  <div>
                    {variantIds.map(vId => {
                      const vData = entry.variants[vId];
                      const availFmts = getFormatBytes(vData, 'ttf') ? ['ttf'] : [];
                      if (availFmts.length === 0) return null;
                      return (
                        <div key={vId} style={S.variantRow}>
                          <span style={{ minWidth: 80, fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)', ...(VARIANT_STYLE[vId] ?? {}) }}>
                            {VARIANT_LABELS[vId] ?? vId}
                          </span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {availFmts.map(fmt => (
                              <button key={fmt} onClick={() => downloadFmt(entry, vId, fmt)} style={S.fmtBtn(fmt)}>
                                ⬇ {fmt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <p style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            ⚠ History is stored in browser localStorage on this device only. Max 10 entries kept. Clearing site data will erase all history permanently.
          </p>
        </div>
      )}
    </div>
  );
}
