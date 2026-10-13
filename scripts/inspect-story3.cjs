// Crops story-3 text lines and renders them as ASCII art to inspect fonts visually.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const FILE = path.join(__dirname, '..', 'instagram-stories', 'story-3-policies.png');
const png = PNG.sync.read(fs.readFileSync(FILE));

// Light text (#fbf3f1) on dark oxblood gradient.
function ascii(y0, y1, x0, x1, sx, sy, label) {
  console.log('--- ' + label + ' (x ' + x0 + '-' + x1 + ', y ' + y0 + '-' + y1 + ') ---');
  for (let y = y0; y < y1; y += sy) {
    let row = '';
    for (let x = x0; x < x1; x += sx) {
      let max = 0;
      for (let dy = 0; dy < sy; dy++) {
        for (let dx = 0; dx < sx; dx++) {
          const i = ((png.width * (y + dy)) + (x + dx)) << 2;
          if (i >= png.data.length) continue;
          const v = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
          if (v > max) max = v;
        }
      }
      row += max > 190 ? '#' : max > 140 ? '+' : ' ';
    }
    console.log(row);
  }
}

function inkCount(y0, y1, x0, x1) {
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) << 2;
      const v = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
      if (v > 190) n++;
    }
  }
  return n;
}

// featureRow: y=610 -> title y+16, body y+64 and y+109, x starts 168
// Deposit row: line1 baseline 674, line2 baseline 719 (font 31 -> ink ~ y-24..y+8)
console.log('=== DEPOSIT row (y 610) ===');
ascii(646, 688, 168, 448, 2, 2, 'deposit line 1: "A P50 deposit reserves" (region around peso)');
ascii(646, 688, 448, 728, 2, 2, 'deposit line 1: "your slot. It is"');
ascii(691, 733, 168, 448, 2, 2, 'deposit line 2: "non-refundable and deduct"');
ascii(691, 733, 448, 728, 2, 2, 'deposit line 2: "ed from your final bill."');
console.log('ink line1 (x168-728):', inkCount(646, 688, 168, 728));
console.log('ink line2 (x168-728):', inkCount(691, 733, 168, 728));

// Late arrival row: y=1210 -> body baselines 1274, 1319
console.log('=== LATE ARRIVAL row (y 1210) ===');
ascii(1246, 1288, 168, 448, 2, 2, 'late line 1: "15+ minutes late adds a P50"');
ascii(1291, 1333, 168, 448, 2, 2, 'late line 2: "30+ minutes cancels the app"');
console.log('ink late1:', inkCount(1246, 1288, 168, 728));
console.log('ink late2:', inkCount(1291, 1333, 168, 728));
