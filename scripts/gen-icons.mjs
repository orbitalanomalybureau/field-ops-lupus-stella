#!/usr/bin/env node
/**
 * Generate the PWA icon set.
 *
 * The repo shipped 70-byte 1x1-pixel placeholders, which meant the game could
 * not actually be installed with a recognisable identity. These are drawn from
 * the same palette as the in-game terminal (styles.css) so the installed app,
 * the browser tab, and the HUD read as one product.
 *
 * Pure Node — a PNG is just zlib-compressed scanlines wrapped in three chunks,
 * so this needs no image dependency.
 *
 * Usage:  node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT_DIR = "public/icons";

const PALETTE = {
  void: [5, 6, 10],
  bg: [10, 12, 18],
  ring: [61, 158, 143], // --color-accent
  amber: [196, 92, 42], // --color-primary
  fern: [61, 255, 200], // --color-fern
  dim: [42, 51, 64], // --color-border
};

function crc32(buf) {
  let c;
  const table = crc32.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * The mark: a survey reticle over an amber horizon — the planet's sky line
 * bisected by the scan ring, with a fern-green pulse at the centre.
 * `safe` insets the artwork for maskable icons, whose outer 10% gets cropped.
 */
function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const inset = maskable ? 0.78 : 1;
  const put = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const prev = [px[i], px[i + 1], px[i + 2]];
    px[i] = Math.round(prev[0] * (1 - a) + r * a);
    px[i + 1] = Math.round(prev[1] * (1 - a) + g * a);
    px[i + 2] = Math.round(prev[2] * (1 - a) + b * a);
    px[i + 3] = 255;
  };

  const horizon = c + size * 0.06 * inset;
  const rOuter = size * 0.36 * inset;
  const rInner = size * 0.27 * inset;
  const rCore = size * 0.055 * inset;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sky gradient above the horizon, ground below.
      const t = y / size;
      if (y < horizon) {
        const k = Math.max(0, 1 - (horizon - y) / (size * 0.55));
        put(x, y, [
          Math.round(PALETTE.bg[0] + (PALETTE.amber[0] - PALETTE.bg[0]) * k * 0.55),
          Math.round(PALETTE.bg[1] + (PALETTE.amber[1] - PALETTE.bg[1]) * k * 0.35),
          Math.round(PALETTE.bg[2] + (PALETTE.amber[2] - PALETTE.bg[2]) * k * 0.2),
        ]);
      } else {
        put(x, y, [
          Math.round(PALETTE.void[0] + 10 * (1 - t)),
          Math.round(PALETTE.void[1] + 9 * (1 - t)),
          Math.round(PALETTE.void[2] + 6 * (1 - t)),
        ]);
      }
    }
  }

  // Scan reticle: two rings plus cardinal ticks.
  const stroke = Math.max(2, size * 0.018);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c + 0.5, y - c + 0.5);
      for (const [radius, colour, alpha] of [
        [rOuter, PALETTE.ring, 0.95],
        [rInner, PALETTE.ring, 0.4],
      ]) {
        const edge = Math.abs(d - radius);
        if (edge < stroke) put(x, y, colour, alpha * (1 - edge / stroke));
      }
      if (d < rCore) put(x, y, PALETTE.fern, 0.9 * (1 - d / rCore) + 0.1);
    }
  }

  const tick = size * 0.055 * inset;
  for (let i = 0; i < tick; i++) {
    for (let w = 0; w < stroke; w++) {
      const o = Math.round(w - stroke / 2);
      put(Math.round(c + o), Math.round(c - rOuter - i), PALETTE.ring, 0.9);
      put(Math.round(c + o), Math.round(c + rOuter + i), PALETTE.ring, 0.9);
      put(Math.round(c - rOuter - i), Math.round(c + o), PALETTE.ring, 0.9);
      put(Math.round(c + rOuter + i), Math.round(c + o), PALETTE.ring, 0.9);
    }
  }

  return encodePng(size, size, px);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-512.png", 512, { maskable: true }],
  ["favicon-64.png", 64, {}],
];

for (const [name, size, opts] of targets) {
  const png = drawIcon(size, opts);
  writeFileSync(`${OUT_DIR}/${name}`, png);
  console.log(`[icons] ${OUT_DIR}/${name} — ${size}x${size}, ${(png.length / 1024).toFixed(1)} KB`);
}
