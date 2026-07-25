


# Custom Font Studio

**Create real TTF/WOFF/WOFF2 fonts from your handwriting — with full Unicode support, bold, italic, bold italic, and live preview. No server, no uploads, 100% in-browser.**

## Features
- 📷 Upload a photo of your handwriting (any paper, any lighting)
- 🔍 Auto-detects glyphs with adjustable ink sensitivity
- 🗺️ Visual glyph mapper — assign any Unicode character (A-Z, 0-9, accents, Greek, emoji, CJK…)
- ✏️ Live font preview before downloading
- 📦 Export TTF, WOFF, WOFF2 in Normal / Bold / Italic / Bold Italic variants
- 📋 Auto-generated CSS @font-face snippet + coding agent instructions

## Usage

### Web (just visit the site)
No install needed. Everything runs in the browser.

### Local development
```bash
git clone https://github.com/YOUR_USERNAME/customfont
cd customfont
npm install
npm run dev
```

## Using your exported fonts

### Web
```css
@font-face {
  font-family: 'My Font';
  src: url('/fonts/MyFont.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}
```

### Python (reportlab)
```python
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
pdfmetrics.registerFont(TTFont('MyFont', 'MyFont.ttf'))
```

### Node.js (pdfkit)
```js
doc.registerFont('MyFont', './MyFont.ttf');
doc.font('MyFont').text('Hello world');
```

## License
MIT. Your font is 100% yours.
