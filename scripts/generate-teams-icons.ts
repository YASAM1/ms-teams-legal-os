import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const off = y * (rowBytes + 1) + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// color.png: 192x192 solid #1E40AF with a white "LO" block in center
const ACCENT = { r: 0x1e, g: 0x40, b: 0xaf };

function colorPixel(x: number, y: number): [number, number, number, number] {
  // White rounded rectangle 56-136 with letter shapes
  const inLetterBox = x >= 56 && x < 136 && y >= 64 && y < 128;
  if (!inLetterBox) return [ACCENT.r, ACCENT.g, ACCENT.b, 255];

  // Letter L: columns 60-72, rows 64-124, plus bottom bar rows 116-124 cols 60-92
  const inLVertical = x >= 60 && x < 72 && y >= 64 && y < 124;
  const inLBottom = x >= 60 && x < 92 && y >= 116 && y < 124;
  // Letter O: ring at cols 100-132, rows 72-120
  const cx = 116, cy = 96;
  const r2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  const inORing = r2 >= 16 * 16 && r2 <= 22 * 22;

  if (inLVertical || inLBottom || inORing) return [255, 255, 255, 255];
  return [ACCENT.r, ACCENT.g, ACCENT.b, 255];
}

// outline.png: 32x32 transparent, white silhouette
function outlinePixel(x: number, y: number): [number, number, number, number] {
  // Simple white square outline (Teams requires transparent + white)
  const inBorder =
    (x === 4 || x === 27 || y === 4 || y === 27) && x >= 4 && x <= 27 && y >= 4 && y <= 27;
  const inLetter =
    (x >= 10 && x <= 12 && y >= 10 && y <= 20) || // L vertical
    (x >= 10 && x <= 17 && y >= 18 && y <= 20) || // L bottom
    (x >= 19 && x <= 22 && y >= 10 && y <= 20) || // O left
    (x >= 19 && x <= 22 && y >= 10 && y <= 12) || // O top
    (x >= 19 && x <= 22 && y >= 18 && y <= 20);   // O bottom
  if (inBorder || inLetter) return [255, 255, 255, 255];
  return [0, 0, 0, 0];
}

const teamsDir = resolve(process.cwd(), 'teams-app');
writeFileSync(resolve(teamsDir, 'color.png'), makePng(192, 192, colorPixel));
writeFileSync(resolve(teamsDir, 'outline.png'), makePng(32, 32, outlinePixel));
console.log('Wrote teams-app/color.png (192×192) and teams-app/outline.png (32×32)');
