// Decisive diagnostics:
// 1. Isolated leak test: compare ONLY the tail glyph run (BBBB), window sized to it.
// 2. Exact deposit line (same font-size everywhere) vs pure-font candidates.
// 3. Which fonts actually render the PESO SIGN (fallback / missing glyph probes).
// 4. TTF name table (fixed offsets).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { PNG } = require('pngjs');

const FONTS_DIR = 'C:/Users/zklmo/.codebuff-tmp-qr/fonts';
const OUT = path.join(__dirname, 'tmp-render');
fs.mkdirSync(OUT, { recursive: true });
const fontFiles = fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith('.ttf')).map((f) => path.join(FONTS_DIR, f));

function render(name, textAttrs, inner) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="140">' +
    '<rect width="100%" height="100%" fill="#ffffff"/>' +
    '<text x="40" y="90" fill="#000000" ' + textAttrs + '>' + inner + '</text></svg>';
  const r = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' } });
  const png = r.render().asPng();
  fs.writeFileSync(path.join(OUT, name), png);
}

function colInk(file) {
  const png = PNG.sync.read(fs.readFileSync(path.join(OUT, file)));
  const cols = [];
  for (let x = 0; x < png.width; x++) {
    let n = 0;
    for (let y = 0; y < png.height; y++) {
      const i = (png.width * y + x) << 2;
      if (png.data[i] < 128) n++;
    }
    cols.push(n);
  }
  return cols;
}

function inkSpan(cols) {
  let l = 0, r = cols.length - 1;
  while (l <= r && cols[l] === 0) l++;
  while (r >= l && cols[r] === 0) r--;
  return { l, r };
}

function rightProfile(cols, maxLen) {
  const { r } = inkSpan(cols);
  return cols.slice(Math.max(0, r - maxLen + 1), r + 1);
}

function diff(a, b) {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.abs(a[i] - b[i]);
  return d + Math.abs(a.length - b.length);
}

const BARS = ' .:-=+*#%@';
function ascii(a, b, c) {
  const n = Math.max(a.length, b.length, c.length);
  const line = (p, i) => { const v = p[i] || 0; return BARS[Math.min(9, Math.floor(v / 4))]; };
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(line(a, i) + line(b, i) + line(c, i));
  return rows.join('');
}

// ================= 1. LEAK TEST (tail isolated) =================
const J40 = 'font-family="Jost" font-weight="400" font-size="40"';
render('bbbb.png', J40, 'BBBB');
const bc = colInk('bbbb.png'), bs = inkSpan(bc);
const wb = bs.r - bs.l + 1;
console.log('== leak test (BBBB width = ' + wb + ', window = ' + (wb + 6) + ' cols) ==');
render('leak-noto.png', J40, 'AAAA<tspan font-family="Noto Sans" font-weight="400" font-size="40">WWW</tspan>BBBB');
render('leak-dejavu.png', J40, 'AAAA<tspan font-family="DejaVu Sans" font-weight="400" font-size="40">WWW</tspan>BBBB');
render('leak-plain.png', J40, 'AAAAWWWBBBB');
const W = wb + 6;
const pPlain = rightProfile(colInk('leak-plain.png'), W);
const pNoto = rightProfile(colInk('leak-noto.png'), W);
const pDeja = rightProfile(colInk('leak-dejavu.png'), W);
console.log('  plain vs noto-tspan :', diff(pPlain, pNoto));
console.log('  plain vs dejav-tspan:', diff(pPlain, pDeja));
console.log('  noto vs dejav tspan :', diff(pNoto, pDeja));
console.log('  ascii (plain | noto | dejavu), one char per column:');
console.log('  ' + ascii(pPlain, pNoto, pDeja));

// ================= 2. EXACT LINE (same size) vs candidates =================
console.log('== deposit line tail (window 170 cols, right-anchored) ==');
const a31 = 'font-family="Jost" font-weight="400" font-size="31"';
const n31 = 'font-family="Noto Sans" font-weight="400" font-size="31"';
const d31 = 'font-family="DejaVu Sans" font-weight="400" font-size="31"';
render('e-exact.png', a31, 'A <tspan font-family="Noto Sans" font-weight="400" font-size="31">₱</tspan>50 deposit reserves your slot. It is');
render('e-jost.png', a31, 'A P50 deposit reserves your slot. It is');
render('e-noto.png', n31, 'A ₱50 deposit reserves your slot. It is');
render('e-deja.png', d31, 'A ₱50 deposit reserves your slot. It is');
render('e-exact-304.png', a31, 'A <tspan font-family="Noto Sans" font-weight="400" font-size="30.4">₱</tspan>50 deposit reserves your slot. It is');
const pE = rightProfile(colInk('e-exact.png'), 170);
console.log('  exact vs jost :', diff(pE, rightProfile(colInk('e-jost.png'), 170)));
console.log('  exact vs noto :', diff(pE, rightProfile(colInk('e-noto.png'), 170)));
console.log('  exact vs dejavu:', diff(pE, rightProfile(colInk('e-deja.png'), 170)));
const pE304 = rightProfile(colInk('e-exact-304.png'), 170);
console.log('  exact(30.4) vs jost :', diff(pE304, rightProfile(colInk('e-jost.png'), 170)));
console.log('  ascii (exact | noto | dejavu):');
console.log('  ' + ascii(pE, rightProfile(colInk('e-noto.png'), 170), rightProfile(colInk('e-deja.png'), 170)));

// ================= 3. PESO GLYPH PROBES =================
console.log('== peso glyph probes (size 60) ==');
const probes = [
  ['peso-jost.png', 'font-family="Jost" font-weight="400" font-size="60"'],
  ['peso-noto.png', 'font-family="Noto Sans" font-weight="400" font-size="60"'],
  ['peso-deja.png', 'font-family="DejaVu Sans" font-weight="400" font-size="60"'],
  ['peso-corm.png', 'font-family="Cormorant Garamond" font-weight="500" font-size="60"'],
  ['peso-fallback.png', 'font-family="NoSuchFont" font-size="60"'],
  ['peso-box.png', 'font-family="Jost" font-size="60">X</text><text x="40" y="90" font-family="Jost" font-size="60" fill="#000"'] // control
];
const sig = {};
for (const [f, attrs] of probes) {
  const inner = f === 'peso-box.png' ? '' : '₱';
  render(f, attrs, inner);
  const c = colInk(f), s = inkSpan(c);
  let ink = 0;
  for (const v of c) ink += v;
  sig[f] = rightProfile(c, 60);
  console.log('  ' + f.padEnd(20), 'span=' + s.l + '..' + s.r, 'ink=' + ink);
}
console.log('  jost vs dejavu:', diff(sig['peso-jost.png'], sig['peso-deja.png']));
console.log('  jost vs noto  :', diff(sig['peso-jost.png'], sig['peso-noto.png']));
console.log('  jost vs corm  :', diff(sig['peso-jost.png'], sig['peso-corm.png']));
console.log('  jost vs fallback(dejavu):', diff(sig['peso-jost.png'], sig['peso-fallback.png']));

// ================= 4. TTF name table (fixed offsets) =================
function dumpNames(file) {
  const buf = fs.readFileSync(file);
  const num = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < num; i++) {
    const o = 12 + i * 16;
    tables[buf.toString('latin1', o, o + 4)] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) };
  }
  let weight = '?';
  if (tables['OS/2']) weight = buf.readUInt16BE(tables['OS/2'].off + 4);
  const found = [];
  if (tables.name) {
    const o = tables.name.off;
    const count = buf.readUInt16BE(o + 2), strOff = buf.readUInt16BE(o + 4);
    for (let i = 0; i < count; i++) {
      const r = o + 6 + i * 12;
      const nid = buf.readUInt16BE(r + 6), len = buf.readUInt16BE(r + 8), off = buf.readUInt16BE(r + 10);
      if (nid !== 1 && nid !== 2) continue;
      let s = '';
      const pid = buf.readUInt16BE(r);
      if (pid === 3) for (let k = 0; k < len; k += 2) s += String.fromCharCode(buf.readUInt16BE(o + strOff + off + k));
      else for (let k = 0; k < len; k++) s += String.fromCharCode(buf[o + strOff + off + k]);
      found.push(nid + ':' + s);
    }
  }
  console.log('  ' + path.basename(file).padEnd(28), 'weight=' + weight, found.join(' | '));
}
console.log('== TTF names ==');
fontFiles.forEach(dumpNames);
