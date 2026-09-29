#!/usr/bin/env node
/**
 * Scans images/gallery/*.jpg|jpeg|png|webp (sorted by filename) and regenerates
 * the "Recent sets" section between the <!-- GALLERY:START --> and
 * <!-- GALLERY:END --> markers in Nails by Bevs2.html.
 *
 * Usage:  npm run gallery   (or:  node update-gallery.mjs)
 *
 * Workflow: drop/rename/delete photos in images/gallery, then run this script.
 * Captions come from the filename: "01-oxblood-chrome.jpg" -> "Oxblood chrome".
 */
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = 'Nails by Bevs2.html';
const galleryDir = 'images/gallery';
const exts = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const START = '<!-- GALLERY:START -->';
const END = '<!-- GALLERY:END -->';

const files = fs
  .readdirSync(galleryDir)
  .filter((f) => exts.has(path.extname(f).toLowerCase()) && fs.statSync(path.join(galleryDir, f)).isFile())
  .sort();

if (files.length === 0) {
  console.error(`No images found in ${galleryDir}/. Nothing to do.`);
  process.exit(1);
}

const captionize = (name) => {
  const base = path.basename(name, path.extname(name));
  // Camera/phone dump names (IMG_1234, image_123650291, DSC-001, photo 12) get no caption
  if (/^(img|image|dsc|dscn|photo|screenshot|pxl|mvimg|p)[-_ ]?\d+.*$/i.test(base)) return '';
  const words = base
    .replace(/^\d+[-_.]*/, '') // strip leading sort number
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(' ') || '';
};

const encodeSrc = (file) => `${galleryDir}/${encodeURIComponent(file)}`;

const figures = files
  .map((file) => {
    const caption = captionize(file);
    const alt = caption || 'Recent nail set';
    const lines = [
      '      <figure class="photo">',
      `        <img src="${encodeSrc(file)}" alt="${alt}" loading="lazy">`,
    ];
    if (caption) lines.push(`        <figcaption>${caption}</figcaption>`);
    lines.push('      </figure>');
    return lines.join('\r\n');
  })
  .join('\r\n');

const html = fs.readFileSync(htmlPath, 'utf8');
const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END);

if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  console.error(`Could not find ${START} / ${END} markers in ${htmlPath}.`);
  process.exit(1);
}

const updated =
  html.slice(0, startIdx + START.length) + '\r\n' + figures + '\r\n      ' + html.slice(endIdx);

fs.writeFileSync(htmlPath, updated);

console.log(`Gallery updated: ${files.length} photo${files.length === 1 ? '' : 's'}`);
files.forEach((f) => {
  const cap = captionize(f);
  console.log(`  - ${f}${cap ? ` -> "${cap}"` : ' (no caption — rename for one, e.g. 01-oxblood-chrome.jpg)'}`);
});
