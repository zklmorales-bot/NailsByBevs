// Generates Instagram Story images (1080x1920) for Nails by Bevs.
// Usage: NODE_PATH="C:/Users/zklmo/.codebuff-tmp-qr/node_modules" node scripts/make-stories.cjs
// Fonts are downloaded once into C:/Users/zklmo/.codebuff-tmp-qr/fonts.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const TMP = 'C:/Users/zklmo/.codebuff-tmp-qr';
const FONTS_DIR = path.join(TMP, 'fonts');
const PROJECT = 'C:/Users/zklmo/OneDrive/Desktop/Nails by Bevs';
const OUT_DIR = path.join(PROJECT, 'instagram-stories');
const QR_PATH = path.join(PROJECT, 'qr', 'booking-qr-logo.png');

const BLUSH = '#fbf3f1';
const MUTED = '#eec9cf';
const LINE = 'rgba(251,243,241,0.30)';
const FAINT = 'rgba(251,243,241,0.07)';
const OXBLOOD = '#7a1626';
const PUMPKIN = '#e08a4c'; // Halloween accent, sits between blush and oxblood
const BAT_INK = '#1d0a0e'; // bat silhouettes against the moon glow

// --- Uniform font roles (used on every story) --------------------------------
// logo script  : Parisienne 400 (site hero lockup)
// logo caps    : Cormorant Garamond 500, letter-spacing 6 (site hero lockup)
// kicker       : Jost 300 25px, ls 7, uppercase
// title        : Cormorant Garamond 600 84-92px
// section label: Jost 500 23px, ls 5, uppercase
// sub-head     : Jost 400 19px, ls 4, uppercase
// body         : Jost 400 31px, lh 45
// menu name    : Cormorant Garamond 500 33px
// menu price   : Cormorant Garamond 600 33px
// closing note : Cormorant Garamond 500 40px
// footer       : Jost 300 25px, ls 5

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600' +
  '&family=Parisienne&family=Jost:wght@300;400;500&family=Noto+Sans&family=Creepster' +
  '&family=Grenze+Gotisch:wght@600&display=swap'; // gothic display with a native peso sign
const DEJAVU_URLS = [
  'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf',
  'https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf'
];

const FAMILY_FILES = {
  'Cormorant Garamond': ['CormorantGaramond-500.ttf', 'CormorantGaramond-600.ttf'],
  'Parisienne': ['Parisienne-400.ttf'],
  'Jost': ['Jost-300.ttf', 'Jost-400.ttf', 'Jost-500.ttf'],
  'Noto Sans': ['NotoSans-400.ttf'],
  'Creepster': ['Creepster-400.ttf'],
  'Grenze Gotisch': ['GrenzeGotisch-600.ttf'], // spooky display face that carries ₱ natively
  'DejaVu Sans': ['DejaVuSans.ttf']
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function downloadTo(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed ' + res.status + ' ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  console.log('font:', path.basename(file), Math.round(buf.length / 1024) + 'KB');
}

async function ensureFonts() {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  const css = await (await fetch(FONT_CSS, { headers: { 'User-Agent': 'curl/8.0' } })).text();
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((m) => m[1]);
  const wanted = new Map();
  for (const face of faces) {
    const fam = /font-family:\s*'([^']+)'/.exec(face);
    const weight = /font-weight:\s*(\d+)/.exec(face);
    const url = /url\((https:[^)]+?\.ttf)\)/.exec(face);
    if (!fam || !weight || !url) continue;
    const file = path.join(FONTS_DIR, fam[1].replace(/\s+/g, '') + '-' + weight[1] + '.ttf');
    if (!wanted.has(file)) wanted.set(file, url[1]);
  }
  if (wanted.size === 0) throw new Error('no TTF urls found; Google served another format');
  for (const [file, url] of wanted) {
    if (!fs.existsSync(file)) await downloadTo(url, file);
  }
  const dejavu = path.join(FONTS_DIR, 'DejaVuSans.ttf'); // guaranteed peso-sign fallback
  if (!fs.existsSync(dejavu)) {
    let ok = false;
    for (const url of DEJAVU_URLS) {
      try { await downloadTo(url, dejavu); ok = true; break; } catch (e) { /* try next mirror */ }
    }
    if (!ok) throw new Error('could not download DejaVu Sans (needed for the peso sign)');
  }
  return fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith('.ttf')).map((f) => path.join(FONTS_DIR, f));
}

// --- Minimal TTF inspection: cap height + peso-sign coverage ------------------
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
  let sub = null;
  let score = -1;
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
    const segX2 = buf.readUInt16BE(sub + 6);
    const seg = segX2 / 2;
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

function fontMeta(file) {
  const buf = fs.readFileSync(file);
  const t = readTables(buf);
  let cap = 0.70;
  if (t['OS/2'] && t['OS/2'].len >= 90 && t.head) {
    const o = t['OS/2'].off;
    const v = buf.readUInt16BE(o);
    const upm = buf.readUInt16BE(t.head.off + 18) || 1000;
    if (v >= 2) {
      const sc = buf.readInt16BE(o + 88);
      if (sc > 0) cap = sc / upm;
    }
  }
  const hasPeso = t.cmap ? cmapLookup(buf, t.cmap.off)(0x20B1) : false;
  return { cap, hasPeso };
}

let META = {}; // family -> { cap, hasPeso }
const PESO_CP = 0x20B1;

function pickPesoFont(order) {
  for (const fam of order) {
    if (META[fam] && META[fam].hasPeso) return fam;
  }
  return 'DejaVu Sans';
}

let DISPLAY_PESO = 'DejaVu Sans'; // peso font used inside Cormorant prices
let BODY_PESO = 'DejaVu Sans';    // peso font used inside Jost body text
let PROMO_PESO = 'DejaVu Sans';   // peso font used inside the promo's Grenze Gotisch price

function pesoFontSize(brandSize, brandFam, pesoFam) {
  // Match cap heights: pesoCap * pesoSize = brandCap * brandSize
  return Math.round(brandSize * (META[brandFam].cap / META[pesoFam].cap) * 10) / 10;
}

// Renders text with any ₱ swapped to the best-matching peso font, cap-aligned.
function brandText(text, size, fam, weight, pesoFam) {
  text = String(text);
  if (!text.includes('₱')) return esc(text);
  if (META[fam] && META[fam].hasPeso) return esc(text); // brand font carries ₱ natively
  const ps = pesoFontSize(size, fam, pesoFam);
  const parts = text.split('₱');
  const peso = '<tspan font-family="' + pesoFam + '" font-weight="400" font-size="' + ps + '">₱</tspan>';
  return parts.map(esc).join(peso);
}

// --- Decorations --------------------------------------------------------------
function sparkle(x, y, s, color = MUTED, op = 1) {
  return '<path transform="translate(' + x + ' ' + y + ') scale(' + (s / 10).toFixed(3) + ')" fill="' + color +
    '" opacity="' + op + '" d="M0 -10 C1.3 -3.4 3.4 -1.3 10 0 C3.4 1.3 1.3 3.4 0 10 C-1.3 3.4 -3.4 1.3 -10 0 C-3.4 -1.3 -1.3 -3.4 0 -10 Z"/>';
}

function bg() {
  return '<defs><radialGradient id="bg" cx="50%" cy="16%" r="100%">' +
    '<stop offset="0%" stop-color="#8c1b2d"/><stop offset="52%" stop-color="#671320"/><stop offset="100%" stop-color="#430c14"/>' +
    '</radialGradient></defs>' +
    '<rect width="1080" height="1920" fill="url(#bg)"/>' +
    '<rect x="40" y="40" width="1000" height="1840" rx="28" fill="none" stroke="' + FAINT + '" stroke-width="1.5"/>' +
    sparkle(112, 262, 10, MUTED, 0.65) +
    sparkle(958, 318, 14, MUTED, 0.5) +
    sparkle(92, 1470, 8, MUTED, 0.45) +
    sparkle(972, 1408, 11, MUTED, 0.55);
}

// Exact lockup from the site hero: sparkle + "NAILS BY" caps + "bevs" script.
function logo(scale, topY) {
  return '<g transform="translate(' + (540 - 230 * scale).toFixed(1) + ' ' + topY + ') scale(' + scale + ')">' +
    '<path d="M230 8 L232.5 14.5 L239 17 L232.5 19.5 L230 26 L227.5 19.5 L221 17 L227.5 14.5 Z" fill="#f4d9dd"/>' +
    '<text x="230" y="74" text-anchor="middle" fill="#ffffff">' +
    '<tspan font-family="Cormorant Garamond" font-weight="500" font-size="40" letter-spacing="6">NAILS BY </tspan>' +
    '<tspan font-family="Parisienne" font-weight="400" font-size="68">bevs</tspan></text>' +
    '</g>';
}

function header(kicker, title, compact = false) {
  const s = compact ? 1.32 : 1.55;
  const logoY = compact ? 152 : 150;
  const kickY = compact ? 330 : 362;
  const titleSize = compact ? 84 : 92;
  const titleY = compact ? 444 : 478;
  return logo(s, logoY) +
    '<text x="540" y="' + kickY + '" text-anchor="middle" font-family="Jost" font-weight="300" font-size="25" letter-spacing="7" fill="' + MUTED + '">' + esc(kicker.toUpperCase()) + '</text>' +
    '<text x="540" y="' + titleY + '" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="' + titleSize + '" fill="' + BLUSH + '">' + esc(title) + '</text>';
}

function footer() {
  return '<line x1="360" y1="1638" x2="720" y2="1638" stroke="' + LINE + '" stroke-width="1"/>' +
    '<text x="540" y="1688" text-anchor="middle" font-family="Jost" font-weight="300" font-size="25" letter-spacing="5" fill="' + MUTED + '">BEVS.VERCEL.APP</text>';
}

// Sparkle bullet + body lines (shared by policies and studio notes)
function featureRow(y, title, lines, divider) {
  const rule = divider ? '<line x1="110" y1="' + (y - 34) + '" x2="970" y2="' + (y - 34) + '" stroke="' + LINE + '" stroke-width="1"/>' : '';
  const body = lines.map((t, i) =>
    '<text x="168" y="' + (y + 64 + i * 45) + '" font-family="Jost" font-weight="400" font-size="31" fill="' + BLUSH + '">' + brandText(t, 31, 'Jost', 400, BODY_PESO) + '</text>'
  ).join('');
  return rule + sparkle(126, y + 6, 12, MUTED) +
    '<text x="170" y="' + (y + 16) + '" font-family="Jost" font-weight="500" font-size="23" letter-spacing="5" fill="' + MUTED + '">' + esc(title.toUpperCase()) + '</text>' +
    body;
}

// --- Story 1: full price list --------------------------------------------------
function sectionLabel(y, text) {
  return '<text x="110" y="' + y + '" font-family="Jost" font-weight="500" font-size="23" letter-spacing="5" fill="' + MUTED + '">' + esc(text.toUpperCase()) + '</text>';
}

function subLabel(y, text) {
  return '<text x="110" y="' + y + '" font-family="Jost" font-weight="400" font-size="19" letter-spacing="4" fill="' + MUTED + '">' + esc(text.toUpperCase()) + '</text>';
}

function menuRow(y, name, priceText) {
  return '<text x="110" y="' + y + '" font-family="Cormorant Garamond" font-weight="500" font-size="33" fill="' + BLUSH + '">' +
      brandText(name, 33, 'Cormorant Garamond', 500, DISPLAY_PESO) + '</text>' +
    '<text x="970" y="' + y + '" text-anchor="end" font-family="Cormorant Garamond" font-weight="600" font-size="33" fill="' + MUTED + '">' +
      brandText(priceText, 33, 'Cormorant Garamond', 600, DISPLAY_PESO) + '</text>' +
    '<line x1="110" y1="' + (y + 20) + '" x2="970" y2="' + (y + 20) + '" stroke="' + LINE + '" stroke-width="1"/>';
}

function storyPriceList() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">' +
    bg() + header('Homebased Nail Studio', 'Price List', true) +
    // Base
    sectionLabel(505, 'Base') +
    menuRow(558, 'Soft Gel Nail Extensions', '₱400') +
    menuRow(610, 'Gel Polish', '₱300') +
    // Add-ons
    sectionLabel(700, 'Add-ons') +
    menuRow(753, 'French Tip', '+₱15 per nail') +
    menuRow(805, '3D Design / Embossed', '+₱15 per nail') +
    menuRow(857, 'Nail Art', '+₱15 per nail') +
    menuRow(909, 'Charms / Stones / Pearl', '+₱10 per nail') +
    menuRow(961, 'Chrome / Cat Eye / Glitter', '+₱10 per nail') +
    menuRow(1013, 'Aura / Ombre', '+₱10 per nail') +
    // Removal
    sectionLabel(1103, 'Removal') +
    subLabel(1153, 'My work') +
    menuRow(1203, 'Soft Gel', '₱100') +
    menuRow(1255, 'Gel', '₱80') +
    subLabel(1335, 'Not my work') +
    menuRow(1385, 'Soft Gel', '₱150') +
    menuRow(1437, 'Gel', '₱100') +
    // Deposit note
    '<line x1="300" y1="1495" x2="780" y2="1495" stroke="' + LINE + '" stroke-width="1"/>' +
    '<text x="540" y="1547" text-anchor="middle" font-family="Jost" font-weight="400" font-size="26" fill="' + BLUSH + '">' + brandText('A ₱50 deposit reserves your slot and is', 26, 'Jost', 400, BODY_PESO) + '</text>' +
    '<text x="540" y="1585" text-anchor="middle" font-family="Jost" font-weight="400" font-size="26" fill="' + BLUSH + '">deducted from your final bill</text>' +
    footer() + '</svg>';
}

// --- Story 2: how to book (star bullets) ---------------------------------------
function step(y, lines) {
  const rows = lines.map((t, i) =>
    '<text x="168" y="' + (y + i * 45) + '" font-family="Jost" font-weight="400" font-size="31" fill="' + BLUSH + '">' + brandText(t, 31, 'Jost', 400, BODY_PESO) + '</text>'
  ).join('');
  return sparkle(126, y - 9, 11, MUTED) + rows;
}

function storyHowToBook(qr) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">' +
    bg() + header('Booking Made Easy', 'How to Book') +
    step(585, ['Browse the gallery and save your peg']) +
    step(672, ['Open the booking form (link below)']) +
    step(759, ['Pick your date, time, and services']) +
    step(846, ['Send the request and watch for the', 'confirmation message']) +
    step(960, ['Settle the ₱50 deposit to lock your slot']) +
    '<rect x="330" y="1060" width="420" height="470" rx="24" fill="' + BLUSH + '"/>' +
    qr.tag +
    '<text x="540" y="1488" text-anchor="middle" font-family="Jost" font-weight="500" font-size="27" letter-spacing="4" fill="' + OXBLOOD + '">SCAN TO BOOK</text>' +
    footer() + '</svg>';
}

// --- Story 3: policies ----------------------------------------------------------
function storyPolicies() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">' +
    bg() + header('Before You Book', 'Studio Policies') +
    featureRow(610, 'Deposit', ['A ₱50 deposit reserves your slot. It is', 'non-refundable and deducted from your final bill.'], false) +
    featureRow(810, 'Cancellations', ['Once you cancel, the deposit is forfeited.', 'Please book a date you are sure about.'], true) +
    featureRow(1010, 'Payment', ['Settle the remaining balance in cash', 'or via online bank transfer.'], true) +
    featureRow(1210, 'Late arrival', ['15+ minutes late adds a ₱50 fee.', '30+ minutes cancels the appointment.'], true) +
    '<text x="540" y="1445" text-anchor="middle" font-family="Cormorant Garamond" font-weight="500" font-size="40" fill="' + MUTED + '">The full policies live in the booking form.</text>' +
    footer() + '</svg>';
}

// --- Story 4: studio notes --------------------------------------------------------
function storyInfo() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">' +
    bg() + header('Good to Know', 'Studio Notes') +
    featureRow(610, 'Homebased studio', ['A cozy home setup, not a full salon.'], false) +
    featureRow(750, 'One at a time', ['Your appointment is one-on-one and unhurried.'], false) +
    featureRow(890, 'Time to spare', ['A full set takes 2 to 3 hours.', 'Please use the bathroom before we start.'], false) +
    featureRow(1090, 'Come solo', ['Guests cannot join the appointment.'], false) +
    '<line x1="300" y1="1260" x2="780" y2="1260" stroke="' + LINE + '" stroke-width="1"/>' +
    '<text x="540" y="1350" text-anchor="middle" font-family="Cormorant Garamond" font-weight="500" font-size="40" fill="' + BLUSH + '">One-on-one and unhurried, so every set</text>' +
    '<text x="540" y="1410" text-anchor="middle" font-family="Cormorant Garamond" font-weight="500" font-size="40" fill="' + BLUSH + '">comes out just how you want it.</text>' +
    footer() + '</svg>';
}

// --- Story 5: Halloween promo (full night scene) --------------------------------
const SIL = '#0a0510';      // silhouette black
const LAV = '#cdb4f6';      // body copy on the night sky
const LAV_DIM = '#a68cc8';  // fine print
const MOON_PALE = '#ffeec2';
const MOON_DIM = '#f3ddad';
const JACK_GLOW = '#ffb347';

// Deep purple night sky with scattered stars, plus glows behind moon and title.
function nightSky() {
  const stars = [
    [90, 300, 2, 0.8], [160, 420, 1.6, 0.6], [250, 250, 2.2, 0.9], [330, 160, 1.5, 0.55],
    [430, 250, 1.8, 0.7], [600, 200, 1.6, 0.6], [700, 300, 2, 0.75], [800, 180, 1.5, 0.5],
    [870, 330, 2.2, 0.85], [960, 260, 1.6, 0.6], [1010, 400, 1.8, 0.7], [70, 520, 1.6, 0.6],
    [140, 640, 2, 0.75], [950, 560, 1.6, 0.6], [1010, 700, 2, 0.7], [60, 860, 1.6, 0.55],
    [130, 980, 2, 0.7], [980, 1020, 1.8, 0.6], [80, 1180, 1.6, 0.55], [1000, 1240, 2, 0.65],
    [150, 1330, 1.6, 0.55], [930, 1360, 1.7, 0.6]
  ];
  return '<defs><linearGradient id="night" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#2a1245"/><stop offset="55%" stop-color="#170926"/>' +
    '<stop offset="100%" stop-color="#0b0413"/></linearGradient>' +
    '<radialGradient id="moonglow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ffd98e" stop-opacity="0.35"/>' +
    '<stop offset="60%" stop-color="#ffd98e" stop-opacity="0.12"/>' +
    '<stop offset="100%" stop-color="#ffd98e" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="titleglow" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ff9d3c" stop-opacity="0.16"/>' +
    '<stop offset="100%" stop-color="#ff9d3c" stop-opacity="0"/></radialGradient></defs>' +
    '<rect width="1080" height="1920" fill="url(#night)"/>' +
    '<circle cx="540" cy="850" r="440" fill="url(#moonglow)"/>' +
    '<circle cx="540" cy="460" r="360" fill="url(#titleglow)"/>' +
    stars.map((s) => '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="' + s[2] + '" fill="#ffffff" opacity="' + s[3] + '"/>').join('');
}

// Big glowing full moon with soft craters.
function fullMoon() {
  return '<circle cx="540" cy="850" r="270" fill="' + MOON_PALE + '"/>' +
    '<circle cx="462" cy="780" r="30" fill="' + MOON_DIM + '" opacity="0.55"/>' +
    '<circle cx="604" cy="884" r="22" fill="' + MOON_DIM + '" opacity="0.5"/>' +
    '<circle cx="518" cy="928" r="15" fill="' + MOON_DIM + '" opacity="0.45"/>' +
    '<circle cx="634" cy="794" r="13" fill="' + MOON_DIM + '" opacity="0.45"/>';
}

// Small bat silhouette: two scalloped wings, round body, tiny ears.
function bat(x, y, s, rot) {
  return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ') scale(' + s + ')" fill="' + BAT_INK + '">' +
    '<path d="M0 0 C -5 -7 -12 -9 -20 -5 L -16 0 L -20 5 C -12 9 -5 7 0 2 C 5 7 12 9 20 5 L 16 0 L 20 -5 C 12 -9 5 -7 0 0 Z"/>' +
    '<circle cx="0" cy="-0.5" r="2.8"/>' +
    '<path d="M-2.2 -2.6 L -3.4 -6.6 L -0.4 -3.8 Z"/>' +
    '<path d="M2.2 -2.6 L 3.4 -6.6 L 0.4 -3.8 Z"/>' +
    '</g>';
}

// Spiderweb anchored to the top-left screen corner (mirror it for the right).
function webH() {
  const R = 200;
  const spokes = [0, 30, 60, 90].map((a) => {
    const rad = (a * Math.PI) / 180;
    return '<line x1="0" y1="0" x2="' + (R * Math.cos(rad)).toFixed(1) + '" y2="' + (R * Math.sin(rad)).toFixed(1) + '"/>';
  }).join('');
  const arcs = [65, 120, 175].map((r) =>
    '<path d="M ' + r + ' 0 A ' + r + ' ' + r + ' 0 0 1 0 ' + r + '"/>').join('');
  return '<g stroke="#cdb4f6" stroke-opacity="0.45" stroke-width="1.4" fill="none">' + spokes + arcs + '</g>';
}

// Spider dangling from its thread at (x, threadTop + drop).
function spider(x, threadTop, drop) {
  const y = threadTop + drop;
  const legs = [
    'M ' + (x - 5) + ' ' + (y - 2) + ' q -7 -2 -11 -6',
    'M ' + (x - 5.5) + ' ' + (y + 1.5) + ' q -7.5 2 -12 0.5',
    'M ' + (x - 5) + ' ' + (y + 5) + ' q -6 4 -10 9',
    'M ' + (x + 5) + ' ' + (y - 2) + ' q 7 -2 11 -6',
    'M ' + (x + 5.5) + ' ' + (y + 1.5) + ' q 7.5 2 12 0.5',
    'M ' + (x + 5) + ' ' + (y + 5) + ' q 6 4 10 9'
  ].map((d) => '<path d="' + d + '"/>').join('');
  return '<line x1="' + x + '" y1="' + threadTop + '" x2="' + x + '" y2="' + (y - 8) + '" stroke="#cdb4f6" stroke-opacity="0.5" stroke-width="1.2"/>' +
    '<g stroke="#cdb4f6" stroke-width="1.6" fill="none" opacity="0.9">' + legs + '</g>' +
    '<g fill="#cdb4f6" opacity="0.9"><circle cx="' + x + '" cy="' + (y - 8) + '" r="3.6"/><circle cx="' + x + '" cy="' + y + '" r="6.4"/></g>';
}

function promoBodyLine(y, text) {
  return '<text x="540" y="' + y + '" text-anchor="middle" font-family="Jost" font-weight="400" font-size="31" fill="' + LAV + '">' + esc(text) + '</text>';
}

function promoFinePrint(y, text) {
  return '<text x="540" y="' + y + '" text-anchor="middle" font-family="Jost" font-weight="300" font-size="21" letter-spacing="1" fill="' + LAV_DIM + '">' + esc(text) + '</text>';
}

// Eerie dusk glow along the horizon so the bottom silhouettes read against the sky.
function horizonGlow() {
  return '<defs><radialGradient id="horizon" cx="50%" cy="50%" r="50%">' +
    '<stop offset="0%" stop-color="#ff9d3c" stop-opacity="0.22"/>' +
    '<stop offset="55%" stop-color="#b388d9" stop-opacity="0.10"/>' +
    '<stop offset="100%" stop-color="#b388d9" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="540" cy="1810" rx="720" ry="300" fill="url(#horizon)"/>';
}

// Wavy black hill across the bottom.
function hill() {
  return '<path d="M0 1800 C 150 1758, 300 1812, 470 1786 C 640 1760, 780 1812, 940 1780 C 990 1770, 1040 1776, 1080 1768 L1080 1920 L0 1920 Z" fill="' + SIL + '"/>';
}

// Bare spooky tree (stroked, tapering branches), rooted at (x, baseY).
function bareTree(x, baseY) {
  const s = 'stroke="' + SIL + '" stroke-linecap="round" fill="none"';
  return '<g ' + s + '>' +
    '<path d="M' + x + ' ' + baseY + ' C ' + (x - 4) + ' ' + (baseY - 120) + ', ' + (x + 2) + ' ' + (baseY - 160) + ', ' + (x - 6) + ' ' + (baseY - 200) + '" stroke-width="15"/>' +
    '<path d="M' + (x - 4) + ' ' + (baseY - 110) + ' C ' + (x - 32) + ' ' + (baseY - 150) + ', ' + (x - 52) + ' ' + (baseY - 168) + ', ' + (x - 74) + ' ' + (baseY - 196) + '" stroke-width="8"/>' +
    '<path d="M' + (x - 2) + ' ' + (baseY - 88) + ' C ' + (x + 24) + ' ' + (baseY - 124) + ', ' + (x + 40) + ' ' + (baseY - 146) + ', ' + (x + 56) + ' ' + (baseY - 170) + '" stroke-width="8"/>' +
    '<path d="M' + (x - 6) + ' ' + (baseY - 200) + ' L ' + (x - 34) + ' ' + (baseY - 258) + '" stroke-width="6"/>' +
    '<path d="M' + (x - 6) + ' ' + (baseY - 200) + ' L ' + (x + 24) + ' ' + (baseY - 228) + '" stroke-width="6"/>' +
    '<path d="M' + (x - 74) + ' ' + (baseY - 196) + ' L ' + (x - 88) + ' ' + (baseY - 216) + '" stroke-width="4"/>' +
    '<path d="M' + (x + 56) + ' ' + (baseY - 170) + ' L ' + (x + 66) + ' ' + (baseY - 190) + '" stroke-width="4"/>' +
    '</g>';
}

// Rounded gravestone with an engraved cross, slightly tilted.
function gravestone(x, baseY) {
  return '<g transform="rotate(-5 ' + x + ' ' + (baseY - 45) + ')">' +
    '<path d="M' + (x - 30) + ' ' + baseY + ' L ' + (x - 30) + ' ' + (baseY - 78) + ' A 30 30 0 0 1 ' + (x + 30) + ' ' + (baseY - 78) + ' L ' + (x + 30) + ' ' + baseY + ' Z" fill="' + SIL + '"/>' +
    '<path d="M' + x + ' ' + (baseY - 66) + ' L ' + x + ' ' + (baseY - 30) + ' M ' + (x - 14) + ' ' + (baseY - 54) + ' L ' + (x + 14) + ' ' + (baseY - 54) + '" stroke="#241236" stroke-width="5"/>' +
    '</g>';
}

// Jack-o'-lantern silhouette with a glowing triangle-eyed face.
function jackOLantern(cx, baseY, rx, ry) {
  const top = baseY - 2 * ry;
  const faceY = baseY - ry * 0.9;
  const eye = (ex) => '<path d="M ' + (ex - rx * 0.30).toFixed(1) + ' ' + (faceY + 4).toFixed(1) + ' L ' + ex + ' ' + (faceY - ry * 0.42).toFixed(1) + ' L ' + (ex + rx * 0.30).toFixed(1) + ' ' + (faceY + 4).toFixed(1) + ' Z"/>';
  const mouth = '<path d="M ' + (cx - rx * 0.62).toFixed(1) + ' ' + (faceY + ry * 0.42).toFixed(1) +
    ' L ' + (cx - rx * 0.40).toFixed(1) + ' ' + (faceY + ry * 0.26).toFixed(1) +
    ' L ' + (cx - rx * 0.18).toFixed(1) + ' ' + (faceY + ry * 0.44).toFixed(1) +
    ' L ' + (cx + rx * 0.06).toFixed(1) + ' ' + (faceY + ry * 0.26).toFixed(1) +
    ' L ' + (cx + rx * 0.30).toFixed(1) + ' ' + (faceY + ry * 0.44).toFixed(1) +
    ' L ' + (cx + rx * 0.52).toFixed(1) + ' ' + (faceY + ry * 0.28).toFixed(1) +
    ' L ' + (cx + rx * 0.66).toFixed(1) + ' ' + (faceY + ry * 0.42).toFixed(1) +
    ' L ' + (cx + rx * 0.40).toFixed(1) + ' ' + (faceY + ry * 0.72).toFixed(1) +
    ' L ' + (cx - rx * 0.38).toFixed(1) + ' ' + (faceY + ry * 0.72).toFixed(1) + ' Z"/>';
  return '<circle cx="' + cx + '" cy="' + (baseY - ry) + '" r="' + (rx * 1.3).toFixed(1) + '" fill="#ff9d3c" opacity="0.10"/>' +
    '<ellipse cx="' + cx + '" cy="' + (baseY - ry) + '" rx="' + rx + '" ry="' + ry + '" fill="' + SIL + '"/>' +
    '<path d="M ' + cx + ' ' + (top - 2) + ' C ' + (cx - 8) + ' ' + (top - 16) + ', ' + (cx + 10) + ' ' + (top - 18) + ', ' + (cx + 6) + ' ' + (top + 2) + '" stroke="' + SIL + '" stroke-width="7" fill="none"/>' +
    '<g fill="' + JACK_GLOW + '">' + eye(cx - rx * 0.34) + eye(cx + rx * 0.34) + mouth + '</g>';
}

function storyPromo() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">' +
    nightSky() +
    webH() + '<g transform="translate(1080 0) scale(-1 1)">' + webH() + '</g>' +
    spider(120, 150, 118) +
    fullMoon() +
    bat(250, 640, 1.6, -10) + bat(838, 618, 1.4, 9) + bat(718, 700, 1.0, -6) + bat(330, 710, 0.9, 12) +
    '<text x="540" y="150" text-anchor="middle" font-family="Jost" font-weight="500" font-size="27" letter-spacing="9" fill="#ff9d3c">NAILS BY BEVS</text>' +
    '<text x="540" y="460" text-anchor="middle" font-family="Creepster" font-size="150" fill="#ff9d3c">HALLOWEEN</text>' +
    '<text x="540" y="548" text-anchor="middle" font-family="Creepster" font-size="84" fill="' + LAV + '">PROMO</text>' +
    // Price on the moon: Grenze Gotisch carries ₱ natively, so sign and digits share one spooky face
    '<text x="540" y="905" text-anchor="middle" font-family="Grenze Gotisch" font-weight="600" font-size="230" fill="' + SIL + '">' + brandText('\u20B1550', 230, 'Grenze Gotisch', 600, PROMO_PESO) + '</text>' +
    '<text x="540" y="1185" text-anchor="middle" font-family="Creepster" font-size="72" fill="#ff9d3c">ANY NAIL DESIGN!</text>' +
    promoBodyLine(1268, 'Trick or treat yourself! Spooky season is the') +
    promoBodyLine(1313, 'perfect excuse for a fresh set, from subtle') +
    promoBodyLine(1358, 'accent details to full nail art.') +
    '<text x="540" y="1436" text-anchor="middle" font-family="Jost" font-weight="500" font-size="23" letter-spacing="5" fill="#ff9d3c">STRICTLY BY APPOINTMENT ONLY</text>' +
    '<text x="540" y="1490" text-anchor="middle" font-family="Jost" font-weight="500" font-size="33" fill="#ffe9d6">Book your appointment on the website!</text>' +
    promoFinePrint(1560, 'Promo price valid from October 19 to November 8, 2026 only.') +
    promoFinePrint(1596, 'Cannot be used with other offers or discounts. Simple & minimal') +
    promoFinePrint(1632, 'designs may choose to book under regular pricing.') +
    horizonGlow() + hill() + bareTree(120, 1830) + gravestone(940, 1802) +
    jackOLantern(430, 1806, 82, 62) + jackOLantern(596, 1816, 60, 46) + jackOLantern(520, 1742, 44, 34) +
    '<text x="540" y="1892" text-anchor="middle" font-family="Jost" font-weight="300" font-size="25" letter-spacing="6" fill="#ff9d3c">BEVS.VERCEL.APP</text>' +
    '</svg>';
}

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

(async function run() {
  try {
    const fontFiles = await ensureFonts();

    // Inspect fonts: cap heights + peso coverage
    META = {};
    for (const [fam, files] of Object.entries(FAMILY_FILES)) {
      const file = files.map((f) => path.join(FONTS_DIR, f)).find((p) => fs.existsSync(p));
      if (file) META[fam] = fontMeta(file);
    }
    DISPLAY_PESO = pickPesoFont(['Cormorant Garamond', 'Noto Sans', 'DejaVu Sans']);
    BODY_PESO = pickPesoFont(['Jost', 'Noto Sans', 'DejaVu Sans']);
    PROMO_PESO = pickPesoFont(['Grenze Gotisch', 'Noto Sans', 'DejaVu Sans']);
    for (const [fam, m] of Object.entries(META)) {
      console.log('meta:', fam.padEnd(20), 'cap=' + m.cap.toFixed(3), 'peso=' + m.hasPeso);
    }
    console.log('peso font for prices :', DISPLAY_PESO);
    console.log('peso font for body   :', BODY_PESO);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Booking QR, fitted into a fixed box and embedded as a data URI
    const qrBuf = fs.readFileSync(QR_PATH);
    const { w: qw, h: qh } = pngSize(qrBuf);
    const box = 350;
    const scale = Math.min(box / qw, box / qh);
    const dispW = Math.round(qw * scale);
    const dispH = Math.round(qh * scale);
    const qrTag = '<image x="' + (540 - dispW / 2) + '" y="' + (1100 + (box - dispH) / 2) +
      '" width="' + dispW + '" height="' + dispH + '" href="data:image/png;base64,' + qrBuf.toString('base64') + '"/>';

    const stories = [
      ['story-1-price-list.png', storyPriceList()],
      ['story-2-how-to-book.png', storyHowToBook({ tag: qrTag })],
      ['story-3-policies.png', storyPolicies()],
      ['story-4-studio-notes.png', storyInfo()],
      ['story-5-halloween-promo.png', storyPromo()]
    ];
    for (const [name, svg] of stories) {
      const out = path.join(OUT_DIR, name);
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'original' },
        font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' }
      });
      const png = resvg.render().asPng();
      fs.writeFileSync(out, png);
      const { w, h } = pngSize(png);
      console.log('wrote', name, Math.round(png.length / 1024) + 'KB', w + 'x' + h);
    }
    console.log('done');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
})();
