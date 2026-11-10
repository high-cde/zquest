/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PAL = {
  k: [22, 12, 32, 255],
  g: [242, 193, 74, 255],
  G: [255, 232, 160, 255],
  s: [156, 104, 28, 255],
  p: [109, 40, 217, 255],
  P: [196, 176, 255, 255],
  b: [196, 92, 72, 255],
  B: [122, 48, 40, 255],
  m: [232, 196, 176, 255],
  n: [20, 12, 32, 255],
  y: [255, 244, 194, 255],
  w: [246, 234, 210, 255],
};

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function blank(width, height) {
  return Buffer.alloc(width * height * 4);
}

function set(buf, width, x, y, color) {
  if (!color || x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
  buf[i + 3] = color[3];
}

function disc(buf, size, cx, cy, radius, fill) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      if (d > radius - 1.4) set(buf, size, x, y, PAL.k);
      else if (dx + dy < -radius * 0.25) set(buf, size, x, y, PAL.G);
      else if (dx - dy > radius * 0.35) set(buf, size, x, y, PAL.s);
      else set(buf, size, x, y, fill);
    }
  }
}

function zMark(buf, size, x0, y0, x1, y1, thick) {
  const paint = (x, y, color) => {
    for (let dy = 0; dy < thick; dy++) {
      for (let dx = 0; dx < thick; dx++) set(buf, size, x + dx, y + dy, color);
    }
  };
  for (let x = x0; x <= x1 - thick; x += 1) {
    paint(x, y0, PAL.P);
    paint(x, y1 - thick + 1, PAL.p);
  }
  const steps = y1 - y0;
  for (let i = 0; i <= steps; i++) {
    const y = y0 + i;
    const x = Math.round(x1 - thick - (i / steps) * (x1 - x0 - thick));
    paint(x, y, PAL.p);
  }
}

function coin(size = 32) {
  const buf = blank(size, size);
  disc(buf, size, size / 2, size / 2, size * 0.46, PAL.g);
  const margin = Math.round(size * 0.28);
  zMark(buf, size, margin, margin, size - margin, size - margin, Math.max(2, Math.round(size / 16)));
  return png(size, size, buf);
}

function brickTile(size = 16) {
  const buf = blank(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 8);
      const localX = (x + (row % 2) * 8) % 16;
      const mortar = y % 8 === 0 || localX === 0;
      const shade = y % 8 > 5;
      set(buf, size, x, y, mortar ? PAL.m : shade ? PAL.B : PAL.b);
    }
  }
  return png(size, size, buf);
}

function star(size = 32) {
  const buf = blank(size, size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - cx) / (size * 0.48);
      const dy = Math.abs(y - cy) / (size * 0.48);
      const diamond = dx + dy;
      const cross = Math.min(Math.abs(x - cx), Math.abs(y - cy));
      const arm = (Math.abs(x - cx) < size * 0.1 && Math.abs(y - cy) < size * 0.46) ||
        (Math.abs(y - cy) < size * 0.1 && Math.abs(x - cx) < size * 0.46);
      if (diamond < 0.42 || arm) {
        const edge = diamond > 0.34 && !arm;
        set(buf, size, x, y, edge || cross > size * 0.28 ? PAL.s : x + y < cx + cy ? PAL.y : PAL.g);
      }
    }
  }
  return png(size, size, buf);
}

function zillo() {
  const size = 32;
  const buf = blank(size, size);
  disc(buf, size, 16, 12, 11, PAL.g);
  zMark(buf, size, 10, 8, 22, 17, 2);
  for (let y = 22; y < 28; y++) {
    set(buf, size, 12, y, PAL.k);
    set(buf, size, 13, y, PAL.s);
    set(buf, size, 18, y, PAL.k);
    set(buf, size, 19, y, PAL.s);
  }
  for (let x = 10; x <= 15; x++) {
    set(buf, size, x, 28, PAL.b);
    set(buf, size, x, 29, PAL.B);
  }
  for (let x = 17; x <= 22; x++) {
    set(buf, size, x, 28, PAL.b);
    set(buf, size, x, 29, PAL.B);
  }
  return png(size, size, buf);
}

function background() {
  const size = 32;
  const buf = blank(size, size);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = PAL.n[0];
    buf[i + 1] = PAL.n[1];
    buf[i + 2] = PAL.n[2];
    buf[i + 3] = 255;
  }
  const dots = [
    [3, 4, PAL.p],
    [18, 7, PAL.g],
    [27, 14, PAL.P],
    [8, 20, PAL.y],
    [22, 26, PAL.g],
    [14, 15, PAL.b],
  ];
  for (const [x, y, color] of dots) set(buf, size, x, y, color);
  return png(size, size, buf);
}

const out = path.resolve("web/public/art");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "coin.png"), coin(32));
writeFileSync(path.join(out, "icon.png"), coin(32));
writeFileSync(path.join(out, "brick.png"), brickTile(16));
writeFileSync(path.join(out, "star.png"), star(32));
writeFileSync(path.join(out, "zillo.png"), zillo());
writeFileSync(path.join(out, "bg.png"), background());
console.log("sprite scritti in", out);
