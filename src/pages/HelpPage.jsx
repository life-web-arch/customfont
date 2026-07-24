import React, { useState } from 'react';

const SECTIONS = [
  {
    title: '🚀 Quick Start',
    content: `
**Step 1 — Write your characters**
- Use a dark ballpoint or felt-tip pen on plain white paper
- Write each character separately (don't let them touch)
- Large characters (2–5cm) give the best vector results
- You can spread characters across multiple photo sessions

**Step 2 — Upload**
- Take a well-lit photo directly above the paper (no angle)
- Upload on the "Upload" tab
- Adjust the ink sensitivity slider if glyphs are missed or merged

**Step 3 — Map Glyphs**
- Each detected blob appears as a card on the "Map Glyphs" tab
- Click a glyph card to select it, then click the target character in the picker
- Use Quick Fill buttons (A→Z etc.) for batch mapping in writing order
- You can map to ANY Unicode character — accents, Greek, Cyrillic, emoji, CJK

**Step 4 — Export**
- Choose which variants to generate (Normal, Bold, Italic, Bold Italic)
- Select output formats (TTF for desktop, WOFF2 for web)
- Click Generate, preview live, then download
`.trim()
  },
  {
    title: '📁 Using Your Font Files',
    content: `
**On macOS**
Double-click the .ttf file → "Install Font" in Font Book.

**On Windows**
Right-click the .ttf file → "Install" or "Install for all users".

**On Linux**
Copy .ttf to ~/.fonts/ or /usr/local/share/fonts/, then run:
\`\`\`
fc-cache -fv
\`\`\`

**On iOS / iPadOS**
Use a font installer app (e.g. AnyFont). Import the .ttf via Files app.

**On Android**
Use a font manager app (root) or apps that support custom fonts.
`.trim()
  },
  {
    title: '🌐 Web Usage (CSS)',
    content: `
After exporting, place your font files on your server (or CDN) and add:

\`\`\`css
@font-face {
  font-family: 'My Custom Font';
  src: url('/fonts/MyCustomFont.woff2') format('woff2'),
       url('/fonts/MyCustomFont.woff') format('woff'),
       url('/fonts/MyCustomFont.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

/* Bold variant */
@font-face {
  font-family: 'My Custom Font';
  src: url('/fonts/MyCustomFont-Bold.woff2') format('woff2');
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}

/* Use it */
h1 { font-family: 'My Custom Font', serif; }
strong { font-weight: bold; } /* uses Bold variant automatically */
\`\`\`

The exported CSS snippet (on the Export tab) contains the exact \`@font-face\` rules
for all your selected variants — just copy and paste.
`.trim()
  },
  {
    title: '🤖 Coding Agent Instructions',
    content: `
If you're giving these font files to a coding agent (Claude, GPT-4, Copilot, Cursor, etc.),
paste this as context:

---

**CUSTOM FONT SPECIFICATION**

Font family name: \`[YOUR_FONT_NAME]\`

Files available:
- \`[fontname].ttf\` — TrueType, for desktop/electron apps
- \`[fontname].woff\` — WOFF, for legacy browser support
- \`[fontname].woff2\` — WOFF2, for modern browsers (preferred)
- \`[fontname]-Bold.ttf/woff/woff2\` — Bold variant (if exported)
- \`[fontname]-Italic.ttf/woff/woff2\` — Italic variant (if exported)
- \`[fontname]-BoldItalic.ttf/woff/woff2\` — Bold Italic variant (if exported)

To use in a web project:
1. Copy font files to your \`/public/fonts/\` or \`/static/fonts/\` directory
2. Add the \`@font-face\` CSS (see the snippet in the Export tab)
3. Apply: \`font-family: '[YOUR_FONT_NAME]', serif;\`

To use in a React/Next.js project:
\`\`\`js
// next.config.js (Next.js Font Optimization)
// OR simply import the CSS file containing @font-face declarations

// In your global CSS:
// @font-face { ... } (paste your exported snippet)
// Then in Tailwind: fontFamily: { custom: ['"My Custom Font"', 'serif'] }
\`\`\`

To use in a Node.js PDF generation (pdfkit, puppeteer):
\`\`\`js
// pdfkit
doc.registerFont('MyFont', './fonts/[fontname].ttf');
doc.font('MyFont').text('Hello in my font!');

// puppeteer: load the CSS with @font-face in your HTML template
\`\`\`

To use in Python (reportlab / fpdf2):
\`\`\`python
# reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('MyFont', '[fontname].ttf'))
canvas.setFont('MyFont', 12)

# fpdf2
from fpdf import FPDF
pdf = FPDF()
pdf.add_font('MyFont', '', '[fontname].ttf', uni=True)
pdf.set_font('MyFont', size=12)
\`\`\`

Character coverage:
[LIST YOUR MAPPED CHARACTERS HERE — visible in the Map Glyphs tab]

The font was created with Custom Font Studio (MIT). Your handwriting, 100% yours.

---
`.trim()
  },
  {
    title: '⚙️ Advanced Tips',
    content: `
**Getting Bold without a separate drawing**
The Export page applies pixel dilation (morphological thickening) to your original drawing.
A value of 2px dilation creates a convincing bold variant from any normal-weight drawing.

**Italic slant**
Italic is synthesized by applying a 12° shear transform to your glyph paths.
For a more authentic italic, draw separate italic glyphs and import as a second session.

**Improving detection on lined paper**
Increase the ink sensitivity (lower delta) slightly. The algorithm uses local background
estimation so thin rules are usually suppressed, but very dark lines can confuse it.
Try placing a blank white sheet under your writing paper.

**Multiple pages / photo sessions**
Currently: upload each page separately and use the mapping editor to assign characters.
The font accumulates all assigned glyphs from the current session.

**Metrics explained**
- Em square: 1000 units (standard)
- Ascent: 800 units above baseline
- Descent: −200 units below baseline
- Cap height: 700 units (uppercase letters)
- x-height: 480 units (lowercase letters like a, e, o)
- Descenders (g, j, p, q, y): extend to −220 units

**Word space**: controls the width of the space character (default 300 units ≈ 30% of em).
**Side bearings** (lsb/rsb): whitespace to the left/right of each glyph (default 50 units each).

**Format guide**
| Format | Best for | File size |
|--------|----------|-----------|
| TTF | Desktop install, Electron, PDFs | Largest |
| WOFF | All browsers (IE11+) | Medium |
| WOFF2 | Modern browsers (Chrome, Firefox, Safari) | Smallest (~30% of TTF) |
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
        Everything you need to create, use, and integrate your custom font.
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
                  if (pi % 3 === 1) return null; // language tag
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
