import React, { useState } from 'react';

const SECTIONS = [
  {
    title: '🚀 Quick Start',
    content: `
**Step 1 — Write your characters**
- Use a dark ballpoint or felt-tip pen on plain white paper
- Write each character separately (don't let them touch each other)
- Large characters (2–5 cm) give the best vector tracing results
- You can write all characters on one sheet or across multiple photos

**Step 2 — Upload**
- Take a well-lit, straight-down photo (no angle) with good contrast
- Upload on the "Upload" tab
- Adjust the ink sensitivity slider if glyphs are missed or merged together

**Step 3 — Map Glyphs**
- Each detected ink blob appears as a card on the "Map Glyphs" tab
- Click a glyph card to select it, then click the target character in the picker
- Use Quick Fill buttons (A→Z, a→z, 0→9, Full Latin) for fast batch mapping
- Use the Zoom slider (starts at minimum) to resize the glyph grid
- You can map to ANY Unicode character — accents, Greek, emoji, CJK, symbols

**Step 4 — Export**
- Go to the "Export" tab
- Choose which variants to generate: Normal, Bold, Italic, Bold Italic
- Adjust Metrics & Spacing sliders (Word space, Left/Right bearing) as needed
- Click ⚡ Generate Fonts — output is TTF format (works on all platforms)
- Preview your font live in the "✍ Live Font Preview" textarea
- Download your TTF file(s) and save them somewhere safe immediately
`.trim()
  },
  {
    title: '📁 Installing Your Font',
    content: `
**On macOS**
Double-click the .ttf file → click "Install Font" in Font Book.

**On Windows**
Right-click the .ttf file → "Install" or "Install for all users".

**On Linux**
Copy .ttf to ~/.fonts/ or /usr/local/share/fonts/, then run:
\`\`\`
fc-cache -fv
\`\`\`

**On iOS / iPadOS**
Use a font installer app (e.g. AnyFont). Import the .ttf via the Files app.

**On Android**
Use a font manager app, or any app that supports loading custom TTF fonts directly.
`.trim()
  },
  {
    title: '🌐 Web Usage (CSS)',
    content: `
Place your TTF file on your server or CDN, then declare it with @font-face.
The Export tab generates the exact ready-to-use CSS snippet for your font — just copy it.

A typical snippet looks like:
\`\`\`css
@font-face {
  font-family: 'MyFont';
  src: url('/fonts/MyFont.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

/* Bold variant (if generated) */
@font-face {
  font-family: 'MyFont';
  src: url('/fonts/MyFont-Bold.ttf') format('truetype');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}

/* Use it */
h1 { font-family: 'MyFont', serif; }
strong { font-weight: bold; } /* picks up Bold variant automatically */
\`\`\`

Note: This tool exports TTF only. TTF works in all modern browsers, on desktop, Android, and iOS.
If you need WOFF2 for production web use, convert your TTF using a tool like Transfonter or Fonttools.
`.trim()
  },
  {
    title: '🤖 Vibe Coding Prompt',
    content: `
After generating your font, the Export tab shows a **"🤖 Vibe Coding Prompt"** card.

Click **"Show Prompt"** to expand it, then **"📋 Copy Prompt"** to copy a ready-made prompt you can paste directly into Claude, Gemini, ChatGPT, Cursor, or any AI coding agent.

The prompt includes:
- Your exact font file name(s) and variants
- Instructions for the AI to ask you for the font file if not attached
- Steps to upload the font to your GitHub repo
- The exact CSS @font-face snippet for your font
- Instructions for the AI to ask about your project before suggesting where to use the font
- Guidance on font sizes, weights, and variants per UI element
- A request for implementation code in your specific framework

This saves you from having to explain your font to the AI from scratch every time.
`.trim()
  },
  {
    title: '🕐 History Tab',
    content: `
The **History** tab stores your last 10 generated fonts in your browser's localStorage.

Each entry shows:
- Font name and generation date
- Which variants were generated (Normal, Bold, Italic, Bold Italic)
- Re-download buttons for each TTF file

**Important storage notes:**
- History is saved on this device only — it is never uploaded to any server
- Clearing your browser's site data or using Private/Incognito mode will erase it permanently
- Mobile browsers may clear localStorage under memory pressure without warning
- Always download and save your TTF files immediately after generating — don't rely on History alone
- Use "Clear Data" on the Export tab to free localStorage space when needed
`.trim()
  },
  {
    title: '⚙️ Advanced Tips',
    content: `
**Getting Bold without a separate drawing**
The Export page applies pixel dilation (morphological thickening) to your original drawing.
2px dilation creates a convincing bold variant automatically from any normal-weight drawing.

**Italic slant**
Italic is synthesized by applying a 12° shear transform to your glyph paths.
For a more authentic italic, draw separate italic glyphs and map them in a second session.

**Improving detection on lined paper**
Increase ink sensitivity (lower the delta) slightly. The algorithm uses local background
estimation so thin rules are usually suppressed — but very dark lines can confuse it.
Try placing a blank white sheet under your writing paper for a cleaner background.

**Multiple pages / photo sessions**
Upload each photo separately. Each upload adds newly detected glyphs to the session.
Continue mapping characters across uploads — all assigned glyphs accumulate until you export.

**Metrics explained**
- Em square: 1000 units (standard)
- Ascent: 800 units above baseline
- Descent: −200 units below baseline
- Cap height: 700 units (uppercase letters)
- x-height: 480 units (lowercase letters like a, e, o)
- Descenders (g, j, p, q, y): extend to −220 units

**Word space**: controls the width of the space character (default 300 units ≈ 30% of em).
**Side bearings** (lsb/rsb): whitespace added to the left/right of each glyph (default 50 units each).
`.trim()
  },
  {
    title: '🔒 Privacy & Data',
    content: `
Custom Font Studio runs entirely in your browser. No data is ever sent to a server.

- Your photos are processed locally using WebAssembly (Potrace)
- Generated font files are built in-browser using a pure JS TTF assembler
- Font history is stored in your browser's localStorage on this device only
- No account, no login, no tracking, no ads

The source code is open source: github.com/life-web-arch/customfont (MIT License)
`.trim()
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState(new Set([0]));
  const toggle = i => setOpen(prev => { const s=new Set(prev); s.has(i)?s.delete(i):s.add(i); return s; });

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ marginBottom: 8, fontSize: '1.3rem' }}>Help & Documentation</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>
        Everything you need to create, use, and integrate your custom handwritten font.
      </p>
      {SECTIONS.map((s,i) => (
        <div key={i} style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 10, overflow: 'hidden' }}>
          <button
            onClick={() => toggle(i)}
            style={{
              width: '100%', textAlign: 'left', padding: '14px 18px',
              background: open.has(i) ? 'var(--surface)' : 'var(--surface2)',
              color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            {s.title}
            <span style={{ color: 'var(--muted)', fontSize: '1.2rem', lineHeight: 1 }}>{open.has(i) ? '−' : '+'}</span>
          </button>
          {open.has(i) && (
            <div style={{ padding: '16px 18px', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <pre style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'system-ui, sans-serif',
                fontSize: '0.88rem',
                lineHeight: 1.75,
                color: 'var(--text)',
              }}>
                {s.content.split(/```(\w+)?\n([\s\S]*?)```/g).map((part, pi) => {
                  if (pi % 3 === 2) {
                    return (
                      <code key={pi} style={{ display: 'block', background: 'var(--surface2)', padding: '10px 14px', borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', margin: '8px 0', overflowX: 'auto' }}>
                        {part}
                      </code>
                    );
                  }
                  if (pi % 3 === 1) return null;
                  return (
                    <span key={pi} dangerouslySetInnerHTML={{ __html:
                      part
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/`(.+?)`/g, '<code style="background:rgba(127,156,245,0.15);padding:1px 5px;border-radius:4px;font-family:var(--font-mono);font-size:0.85em">$1</code>')
                    }} />
                  );
                })}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
