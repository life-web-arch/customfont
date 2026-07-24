// Placed glyphs -> font binaries (MIT, draw-your-font) — extended for bold/italic variants
import svg2ttf from 'svg2ttf';
import ttf2woff from 'ttf2woff';
import { UPM, ASCENT, DESCENT, XH, CAP } from './metrics.js';

const esc = ch => '&#x' + ch.codePointAt(0).toString(16).toUpperCase() + ';';
const escAttr = s => s.replace(/[&<>"']/g, c => `&#x${c.codePointAt(0).toString(16).toUpperCase()};`);

export function buildTTF(name, glyphs, { wordSpace=300, weight='normal', style='normal' }={}) {
  const id = (name.replace(/[^A-Za-z0-9_-]+/g,'') || 'CustomFont') +
    (weight==='bold'?'Bold':'') + (style==='italic'?'Italic':'');
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg"><defs>`,
    `<font id="${id}" horiz-adv-x="${wordSpace}">`,
    `<font-face font-family="${escAttr(name)}" units-per-em="${UPM}" ascent="${ASCENT}" descent="${DESCENT}" x-height="${XH}" cap-height="${CAP}" font-weight="${weight==='bold'?'bold':'normal'}" font-style="${style}"/>`,
    `<missing-glyph horiz-adv-x="${Math.round(UPM/2)}"/>`,
    `<glyph glyph-name="space" unicode="${esc(' ')}" horiz-adv-x="${wordSpace}" d=""/>`,
  ];
  for (const g of glyphs) {
    if (g.char === ' ') continue;
    const gname = 'uni' + g.char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0');
    parts.push(`<glyph glyph-name="${gname}" unicode="${esc(g.char)}" horiz-adv-x="${g.advance}" d="${g.d}"/>`);
  }
  parts.push(`</font></defs></svg>`);
  const ttf = svg2ttf(parts.join('\n'), {
    description: `Made with Custom Font Studio`,
    url: 'https://customfont.vercel.app',
    copyright: 'Your font. 100% yours.'
  });
  return new Uint8Array(ttf.buffer);
}

export function toWoff(ttf) {
  const out = ttf2woff(new Uint8Array(ttf));
  return new Uint8Array(out.buffer || out);
}

export async function toWoff2(ttf) {
  const { compress } = await import('wawoff2');
  return new Uint8Array(await compress(ttf));
}

export function fontFaceCSS(name, baseName, variants) {
  // variants: array of {weight, style, filename}
  const faces = variants.map(v => [
    `@font-face {`,
    `  font-family: '${name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}';`,
    `  src: url('${v.filename}.woff2') format('woff2'),`,
    `       url('${v.filename}.woff') format('woff'),`,
    `       url('${v.filename}.ttf') format('truetype');`,
    `  font-weight: ${v.weight};`,
    `  font-style: ${v.style};`,
    `  font-display: swap;`,
    `}`,
  ].join('\n')).join('\n\n');
  return faces;
}
