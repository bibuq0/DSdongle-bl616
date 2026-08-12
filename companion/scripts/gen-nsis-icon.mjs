import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NSIS (makensis) requires BMP-format icons, not PNG-in-ICO. Build a
// classic BMP DIB multi-size ICO from the app SVG.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(__dirname, '..', 'assets', 'icons');
const svg = readFileSync(path.join(assets, 'icon-4-v11.svg'), 'utf8');

const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map((s) => {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: s } }).render();
  return { s, w: r.width, h: r.height, px: r.pixels };
});

function dibFor(img) {
  const { s, px } = img;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(s, 4); // biWidth
  header.writeInt32LE(s * 2, 8); // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression
  header.writeUInt32LE(s * s * 4, 20); // biSizeImage
  // bottom-up BGRA rows
  const row = Buffer.alloc(s * 4);
  const out = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    const srcRow = (s - 1 - y) * s * 4;
    for (let x = 0; x < s; x++) {
      const o = srcRow + x * 4;
      const d = y * s * 4 + x * 4;
      out[d] = px[o + 2]; // B
      out[d + 1] = px[o + 1]; // G
      out[d + 2] = px[o]; // R
      out[d + 3] = px[o + 3]; // A
    }
  }
  return Buffer.concat([header, out]);
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

const entries = [];
const datas = [];
let offset = 6 + images.length * 16;
for (const img of images) {
  const data = dibFor(img);
  const e = Buffer.alloc(16);
  e[0] = img.s === 256 ? 0 : img.s;
  e[1] = img.s === 256 ? 0 : img.s;
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bitcount
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  datas.push(data);
  offset += data.length;
}

writeFileSync(
  path.join(assets, 'ds5dongle.ico'),
  Buffer.concat([header, ...entries, ...datas])
);
console.log('[icon] BMP-format ICO written:', path.join(assets, 'ds5dongle.ico'));
