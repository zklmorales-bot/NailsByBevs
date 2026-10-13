// Crops regions from story PNGs to verify peso-sign font matching.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const DIR = path.join(__dirname, '..', 'instagram-stories');
const OUT = path.join(__dirname, 'tmp-render');

function crop(file, x0, y0, w, h, out) {
  const src = PNG.sync.read(fs.readFileSync(path.join(DIR, file)));
  const dst = new PNG({ width: w, height: h });
  PNG.bitblt(src, dst, x0, y0, w, h, 0, 0);
  fs.writeFileSync(path.join(OUT, out), PNG.sync.write(dst));
  console.log('wrote', out, w + 'x' + h);
}

// Story 5: moon price ₱550 (moon spans x 270..810, price baseline y=905, size 230)
crop('story-5-halloween-promo.png', 250, 640, 580, 300, 'check-promo-price.png');
// Story 1: top price rows incl. ₱400/₱300
crop('story-1-price-list.png', 60, 470, 960, 180, 'check-menu-prices.png');
// Story 3: deposit line with ₱50 in body text
crop('story-3-policies.png', 100, 620, 900, 110, 'check-body-peso.png');
// Story 5: revised body copy, booking line, and fine print
crop('story-5-halloween-promo.png', 40, 1230, 1000, 420, 'check-promo-text.png');
