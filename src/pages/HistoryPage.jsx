import React, { useState } from 'react';

const LS_KEY = 'cfs_font_history';

function loadHistory() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveHistory(entries) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(-10))); } catch(e) { console.warn('localStorage quota exceeded'); }
}
function b64ToUint8(b64) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8;
}
function download(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function HistoryPage() {
  const [history, setHistory] = useState(loadHistory);
  const [status, setStatus] = useState('');

  function deleteEntry(id) {
    const updated = history.filter(e => e.id !== id);
    saveHistory(updated); setHistory(updated);
  }

  function clearAll() {
    if (!window.confirm('Clear all font history from localStorage? This cannot be undone.')) return;
    localStorage.removeItem(LS_KEY);
    setHistory([]);
    setStatus('🗑️ History cleared.');
  }

  function downloadTTF(entry) {
    const vId = Object.keys(entry.variants)[0];
    const bytes = b64ToUint8(entry.variants[vId]);
    download(bytes, `${entry.name.replace(/\s+/g, '-')}.ttf`, 'font/ttf');
  }

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: 4 }}>🕓 Font History</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Last {history.length} generated fonts — stored in browser localStorage on this device only.
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
          {[...history].reverse().map(entry => (
            <div key={entry.id} style={S.row}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>{entry.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
                  {entry.date} · {Object.keys(entry.variants).join(', ')} ·{' '}
                  {Object.keys(entry.variants).length} variant{Object.keys(entry.variants).length > 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => downloadTTF(entry)}
                  style={{ padding: '5px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: '0.82rem' }}>
                  ⬇ TTF
                </button>
                <button onClick={() => deleteEntry(entry.id)}
                  style={{ padding: '5px 10px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 6, color: 'var(--danger)', fontSize: '0.82rem' }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <p style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            ⚠ History is stored in browser localStorage on this device only. Max 10 entries kept. Clearing site data will erase all history permanently.
          </p>
        </div>
      )}
    </div>
  );
}
