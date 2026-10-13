// Finds fonts that contain the peso sign (U+20B1) among on-theme candidates,
// then renders ₱550 samples so we can eyeball the match.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const TMP = 'C:/Users/zklmo/.codebuff-tmp-qr';
const CAND_DIR = path.join(TMP, 'fonts-cand');
const OUT = path.join(__dirname, 'tmp-render');
fs.mkdirSync(CAND_DIR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

// [family, weight] candidates: current brand fonts + halloween/display + elegant serifs
const CANDS = [
  ['Creepster', 400],
  ['Cormorant Garamond', 600],
  ['Jost', 400],
  // Halloween / display
  ['Eater', 400],
  ['Nosifer', 400],
  ['Butcherman', 400],
  ['Griffy', 400],
  ['Metal Mania', 400],
  ['Pirata One', 400],
  ['Rye', 400],
  ['Metamorphous', 400],
  ['Grenze Gotisch', 600],
  ['UnifrakturMaguntia', 400],
  ['Frijole', 400],
  ['Bigshot One', 400],
  ['Rubik Wet Paint', 400],
  ['Shrikhand', 400],
  ['Eczar', 600],
  // Elegant serifs (brand-adjacent)
  ['Playfair Display', 600],
  ['EB Garamond', 600],
  ['Bodoni Moda', 600],
  ['Prata', 400],
  ['Cinzel', 600],
  ['Gloock', 400],
  ['Spectral', 600],
  ['Lora', 600],
  ['Libre Caslon Display', 400],
  ['Marcellus', 400],
  // Geometric sans (Jost stand-in for body text)
  ['Montserrat', 500],
  ['Poppins', 400],
  ['DM Sans', 400]
];

async function downloadTo(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed ' + res.status + ' ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
}

async function ensureFont(fam, weight) {
  const file = path.join(CAND_DIR, fam.replace(/\s+/g, '') + '-' + weight + '.ttf');
  if (fs.existsSync(file)) return file;
  const cssUrl = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fam) + ':wght@' + weight + '&display=swap';
  const css = await (await fetch(cssUrl, { headers: { 'User-Agent': 'curl/8.0' } })).text();
  const url = /url\((https:[^)]+?\.ttf)\)/.exec(css);
  if (!url) throw new Error('no ttf for ' + fam + ' ' + weight + ' :: ' + css.slice(0, 200));
  await downloadTo(url[1], file);
  return file;
}

// --- cmap peso check (same logic as make-stories.cjs) ---
function readTables(buf) {
  const num = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < num; i++) {
    const o = 12 + i * 16;
    tables[buf.toString('latin1', o, o + 4)] = { off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) };
  }
  return tables;
}

function cmapLookup(buf, cmapOff) {
  const n = buf.readUInt16BE(cmapOff + 2);
  let sub = null, score = -1;
  for (let i = 0; i < n; i++) {
    const r = cmapOff + 4 + i * 8;
    const pid = buf.readUInt16BE(r), eid = buf.readUInt16BE(r + 2), off = cmapOff + buf.readUInt32BE(r + 4);
    let s = -1;
    if (pid === 3 && eid === 10) s = 4;
    else if (pid === 0 && (eid === 4 || eid === 6)) s = 3;
    else if (pid === 3 && eid === 1) s = 2;
    else if (pid === 0) s = 1;
    else if (pid === 3 && eid === 0) s = 0;
    if (s > score) { score = s; sub = off; }
  }
  if (sub === null) return () => false;
  const fmt = buf.readUInt16BE(sub);
  if (fmt === 4) {
    const segX2 = buf.readUInt16BE(sub + 6), seg = segX2 / 2;
    const endOff = sub + 14, startOff = endOff + segX2 + 2, deltaOff = startOff + segX2, rangeOff = deltaOff + segX2;
    return (cp) => {
      for (let i = 0; i < seg; i++) {
        const end = buf.readUInt16BE(endOff + i * 2);
        if (cp > end) continue;
        const start = buf.readUInt16BE(startOff + i * 2);
        if (cp < start) return false;
        const ro = buf.readUInt16BE(rangeOff + i * 2);
        if (ro === 0) return ((cp + buf.readInt16BE(deltaOff + i * 2)) & 0xFFFF) !== 0;
        const addr = rangeOff + i * 2 + ro + (cp - start) * 2;
        if (addr + 1 >= buf.length) return false;
        return buf.readUInt16BE(addr) !== 0;
      }
      return false;
    };
  }
  if (fmt === 12) {
    const nGroups = buf.readUInt32BE(sub + 12);
    return (cp) => {
      for (let i = 0; i < nGroups; i++) {
        const g = sub + 16 + i * 12;
        const s = buf.readUInt32BE(g), e = buf.readUInt32BE(g + 4);
        if (cp >= s && cp <= e) return true;
        if (cp < s) return false;
      }
      return false;
    };
  }
  return () => false;
}

function hasPeso(file) {
  const buf = fs.readFileSync(file);
  const t = readTables(buf);
  return t.cmap ? cmapLookup(buf, t.cmap.off)(0x20B1) : false;
}

(async function run() {
  const results = [];
  for (const [fam, weight] of CANDS) {
    try {
      const file = await ensureFont(fam, weight);
      const peso = hasPeso(file);
      results.push({ fam, weight, file, peso });
      console.log((peso ? 'YES' : 'no ') + '  ' + fam.padEnd(24) + 'w' + weight);
    } catch (e) {
      console.log('ERR ' + fam.padEnd(24) + e.message);
    }
  }

  const withPeso = results.filter((r) => r.peso);
  console.log('\n== fonts WITH peso sign: ' + withPeso.length + ' ==');

  // Render a contact sheet: each row = one font's "₱550" (moon colors) on its own line
  const ROW = 150;
  const rows = results.map((r, i) => {
    const y = i * ROW + 110;
    return '<text x="40" y="' + y + '" font-family="' + r.fam + '" font-weight="' + r.weight + '" font-size="110" fill="#1d0a1e">₱550</text>' +
      '<text x="560" y="' + (y - 40) + '" font-family="DejaVu Sans" font-size="26" fill="' + (r.peso ? '#0a7d2c' : '#a01b1b') + '">' +
      (r.peso ? 'HAS PESO' : 'no peso') + '</text>' +
      '<text x="560" y="' + (y - 4) + '" font-family="DejaVu Sans" font-size="30" fill="#333">' + r.fam + ' ' + r.weight + '</text>' +
      '<line x1="0" y1="' + (y + 25) + '" x2="900" y2="' + (y + 25) + '" stroke="#ddd"/>';
  }).join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="' + (results.length * ROW + 40) + '">' +
    '<rect width="100%" height="100%" fill="#ffeec2"/>' + rows + '</svg>';
  const fontFiles = results.map((r) => r.file).concat([path.join(CAND_DIR, '..', 'fonts', 'DejaVuSans.ttf')]);
  const r = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' } });
  fs.writeFileSync(path.join(OUT, 'peso-candidates.png'), r.render().asPng());
  console.log('wrote scripts/tmp-render/peso-candidates.png');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
