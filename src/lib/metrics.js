// Em-square glyph placement (MIT, draw-your-font) — extended with more symbols
import svgpath from 'svgpath';
import { fixWinding } from './winding.js';

export const UPM = 1000;
export const ASCENT = 800;
export const DESCENT = -200;
export const CAP = 700;
export const XH = 480;
export const DESC = -220;
export const ASC = 720;

const BANDS = new Map();
const set = (chars, band) => [...chars].forEach(c => BANDS.set(c, band));

set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', [0, CAP]);
set('ÑÁÉÍÓÚÜ', [0, ASCENT]);
set('bdfhkl', [0, ASC]);
set('t', [0, 640]);
set('acemnorsuvwxz', [0, XH]);
set('ñáéíóúü', [0, ASC]);
set('i', [0, 660]);
set('j', [DESC, 660]);
set('gpqy', [DESC, XH]);
set('.·', [0, 110]);
set(',', [-140, 110]);
set(':', [0, XH]);
set(';', [-140, XH]);
set('!?', [0, CAP]);
set("''\u2018\u2019", [480, CAP]);
set('"\u201c\u201d\u201e', [480, CAP]);
set('-\u2013\u2014', [250, 350]);
set('_', [-120, -40]);
set('()[]{}', [-160, ASC]);
set('@', [-50, 650]);
set('#&%', [0, CAP]);
set('+', [110, 550]);
set('=', [180, 480]);
set('*\u2022', [420, CAP]);
set('$\u20ac\u00a3\u00a5', [-40, 730]);
set('/\\|', [-100, ASC]);
set('<>', [110, 550]);
set('~', [220, 420]);
set('^', [450, CAP]);
set('\u00bf\u00a1', [DESC, XH]);
set('\u00ae\u00a9\u2122', [0, CAP]);
set('\u2026', [0, 110]);
// Greek letters
set('ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ', [0, CAP]);
set('αβγδεζηθικλμνξοπρστυφχψω', [0, XH]);
// Cyrillic basics
set('АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', [0, CAP]);
set('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', [0, XH]);

export function band(char) { return BANDS.get(char) || [0, CAP]; }

export function placeGlyph(d, cropSize, pad, char, { lsb=50, rsb=50 }={}) {
  const inkW = cropSize.width - 2*pad;
  const inkH = cropSize.height - 2*pad;
  const [bot, top] = band(char);
  const s = (top - bot) / inkH;
  const placed = svgpath(d)
    .translate(-pad, -pad)
    .scale(s, -s)
    .translate(lsb, top)
    .round(1)
    .toString();
  return { d: fixWinding(placed), advance: Math.round(lsb + inkW*s + rsb) };
}

// Apply italic slant to an already-placed glyph path
export function applyItalic(d, slantDeg = 12) {
  const shear = Math.tan((slantDeg * Math.PI) / 180);
  // Shear transform: x' = x + y*shear (skew x based on y offset from baseline)
  return svgpath(d)
    .matrix([1, 0, shear, 1, 0, 0])
    .round(1)
    .toString();
}
