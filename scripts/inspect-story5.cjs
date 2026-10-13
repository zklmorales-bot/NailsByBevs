// Layout probe for story-5-promo.png: ink extents per band + ASCII previews.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const FILE = path.join(__dirname, '..', 'instagram-stories', 'story-5-halloween-promo.png');
const png = PNG.sync.read(fs.readFileSync(FILE));

function val(x, y) {
  const i = (png.width * y + x) << 2;
  return (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
}

// Ink bounding box within a band; ignores the outer frame (x<60 or x>1020).
function band(name, y0, y1, x0 = 60, x1 = 1020) {
  let l = -1, r = -1, t = -1, b = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (val(x, y) > 190) {
        if (l < 0 || x < l) l = x;
        if (r < x) r = x;
        if (t < 0) t = y;
        b = y;
      }
    }
  }
  const overflow = (l >= 0 && (l < 46 || r > 1034)) ? '  <-- OVERFLOW!' : '';
  console.log(name.padEnd(28), l < 0 ? 'EMPTY' : 'x ' + l + '..' + r + '  y ' + t + '..' + b + overflow);
}

function ascii(y0, y1, x0, x1, sx, sy, label) {
  console.log('--- ' + label + ' ---');
  for (let y = y0; y < y1; y += sy) {
    let row = '';
    for (let x = x0; x < x1; x += sx) {
      let max = 0;
      for (let dy = 0; dy < sy; dy++) {
        for (let dx = 0; dx < sx; dx++) {
          const v = val(x + dx, y + dy);
          if (v > max) max = v;
        }
      }
      row += max > 190 ? '#' : max > 140 ? '+' : ' ';
    }
    console.log(row);
  }
}

console.log('== bands (ink extents, frame ignored) ==');
band('kicker NAIL PROMO', 330, 380);
band('hero price', 400, 670);
band('pill', 700, 800);
band('gap pill->body', 805, 862, 150, 930);
band('body L1', 870, 912);
band('body L2', 915, 957);
band('body L3', 960, 1002);
band('body L4', 1005, 1047);
band('body L5', 1050, 1092);
band('gap body->appt', 1100, 1158, 150, 930);
band('appt label', 1204, 1246);
band('appt message', 1256, 1308);
band('gap appt->fine', 1312, 1368, 150, 930);
band('fine L1', 1370, 1412);
band('fine L2', 1406, 1448);
band('fine L3', 1442, 1484);
band('footer', 1655, 1705);

console.log('\n== hero price preview ==');
ascii(400, 670, 120, 960, 12, 10, 'P550 (12x10 downsample)');

console.log('\n== pill preview ==');
ascii(700, 800, 200, 880, 8, 4, 'FOR ANY NAIL DESIGN pill');
