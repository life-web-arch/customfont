// Placed glyphs -> font binaries (MIT, draw-your-font) — extended for bold/italic variants
import svg2ttf from 'svg2ttf';
// ttf2woff removed — using pure browser WOFF builder below
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

// Pure-browser WOFF 1.0 builder — no Node Buffer needed
export function toWoff(ttf) {
  const src = ttf instanceof Uint8Array ? ttf : new Uint8Array(ttf);
  const sfntSize = src.length;
  const numTables = (src[4] << 8) | src[5];

  // WOFF header = 44 bytes
  const woffSize = 44 + numTables * 20 + sfntSize;
  const out = new Uint8Array(woffSize);
  const dv = new DataView(out.buffer);
  const srcDv = new DataView(src.buffer, src.byteOffset, src.byteLength);

  let offset = 0;
  // signature 'wOFF'
  dv.setUint32(offset, 0x774F4646); offset += 4;
  // flavor (sfVersion)
  dv.setUint32(offset, srcDv.getUint32(0)); offset += 4;
  // length (placeholder — fill later)
  const lengthOffset = offset; dv.setUint32(offset, 0); offset += 4;
  // numTables
  dv.setUint16(offset, numTables); offset += 2;
  // reserved
  dv.setUint16(offset, 0); offset += 2;
  // totalSfntSize
  dv.setUint32(offset, sfntSize); offset += 4;
  // majorVersion, minorVersion
  dv.setUint16(offset, 1); offset += 2;
  dv.setUint16(offset, 0); offset += 2;
  // metaOffset, metaLength, metaOrigLength
  dv.setUint32(offset, 0); offset += 4;
  dv.setUint32(offset, 0); offset += 4;
  dv.setUint32(offset, 0); offset += 4;
  // privOffset, privLength
  dv.setUint32(offset, 0); offset += 4;
  dv.setUint32(offset, 0); offset += 4;

  // Copy table directory + table data uncompressed (compLength = origLength)
  const tableDirSrc = 12; // sfnt table dir starts at byte 12
  const tableDataStart = offset + numTables * 20;
  let dataWritePos = tableDataStart;

  for (let i = 0; i < numTables; i++) {
    const te = tableDirSrc + i * 16;
    const tag      = srcDv.getUint32(te);
    const checksum = srcDv.getUint32(te + 4);
    const sfntOff  = srcDv.getUint32(te + 8);
    const origLen  = srcDv.getUint32(te + 12);

    // Write WOFF table directory entry
    dv.setUint32(offset, tag);       offset += 4;
    dv.setUint32(offset, dataWritePos); offset += 4; // offset into WOFF file
    dv.setUint32(offset, origLen);   offset += 4; // compLength (uncompressed = same)
    dv.setUint32(offset, origLen);   offset += 4; // origLength
    dv.setUint32(offset, checksum);  offset += 4;

    // Copy table data
    out.set(src.subarray(sfntOff, sfntOff + origLen), dataWritePos);
    // Pad to 4-byte boundary
    const padded = (origLen + 3) & ~3;
    dataWritePos += padded;
  }

  // Fill total length
  dv.setUint32(lengthOffset, dataWritePos);

  return out.subarray(0, dataWritePos);
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
