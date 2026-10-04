// Generates simple but decent PWA icons (dark rounded square + knight glyph)
// without external deps: rasterizes a hand-drawn path via canvas-free math.
import { writeFileSync, mkdirSync } from 'fs';

// Very small PNG encoder (zlib via node:zlib)
import { deflateSync } from 'zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8) ^ (crc >>> 8 === crc >>> 8 ? 0 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Simpler correct crc32
function crc32b(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32b(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // raw: filter byte 0 per row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Knight glyph as a filled polygon (rough but recognizable), normalized 0..1
const KNIGHT = [
  [0.55, 0.08],[0.62, 0.10],[0.66, 0.16],[0.66, 0.22],[0.78, 0.34],[0.84, 0.44],[0.86, 0.56],
  [0.86, 0.66],[0.82, 0.72],[0.86, 0.78],[0.86, 0.86],[0.80, 0.90],[0.30, 0.90],[0.24, 0.86],
  [0.24, 0.78],[0.30, 0.72],[0.36, 0.64],[0.40, 0.56],[0.42, 0.48],[0.40, 0.40],[0.34, 0.36],
  [0.28, 0.38],[0.24, 0.34],[0.26, 0.28],[0.32, 0.24],[0.36, 0.20],[0.42, 0.12],[0.48, 0.08],
];

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-square background
      const cx = Math.max(r - x, x - (size - 1 - r), 0);
      const cy = Math.max(r - y, y - (size - 1 - r), 0);
      const d = Math.sqrt(cx * cx + cy * cy);
      const bg = maskable ? true : d <= r;
      if (!bg) { rgba[i + 3] = 0; continue; }
      rgba[i] = 15; rgba[i + 1] = 17; rgba[i + 2] = 22; rgba[i + 3] = 255;
      // glyph sampling 2x2
      let hit = false;
      for (const dx of [-0.25, 0.25]) {
        for (const dy of [-0.25, 0.25]) {
          const gx = (x + dx) / size;
          const gy = (y + dy) / size;
          // shift/scale for maskable safe zone
          const sx = maskable ? 0.5 + (gx - 0.5) * 0.72 : gx;
          const sy = maskable ? 0.5 + (gy - 0.5) * 0.72 : gy;
          if (pointInPoly(sx, sy, KNIGHT)) hit = true;
        }
      }
      if (hit) { rgba[i] = 232; rgba[i + 1] = 234; rgba[i + 2] = 240; }
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', makeIcon(192, false));
writeFileSync('public/icons/icon-512.png', makeIcon(512, false));
writeFileSync('public/icons/maskable-512.png', makeIcon(512, true));
console.log('icons generated');
