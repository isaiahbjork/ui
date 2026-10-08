// Generates the six demo plates in public/images/plates/ (1600x1000 WebP).
// Every plate is drawn procedurally from a fixed seed, so output is deterministic and licence-clean.
// Needs `cwebp` on PATH (brew install webp). Run: node scripts/generate-demo-plates.mjs

import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1600;
const H = 1000;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "images", "plates");

// ---------- seeded helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lattice(seed, x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function noise2(seed, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const sx = x - xi;
  const sy = y - yi;
  const fx = sx * sx * (3 - 2 * sx);
  const fy = sy * sy * (3 - 2 * sy);
  const a = lattice(seed, xi, yi);
  const b = lattice(seed, xi + 1, yi);
  const c = lattice(seed, xi, yi + 1);
  const d = lattice(seed, xi + 1, yi + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

function fbm(seed, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(seed + o * 17, fx, fy);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

const clamp = (v, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------- raster ----------
function makeBuffer() {
  return new Float32Array(W * H * 3);
}

function paint(buf, fn) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = fn(x, y);
      const i = (y * W + x) * 3;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
    }
  }
}

function grain(buf, seed, amount) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = clamp(buf[i] + (rnd() - 0.5) * amount);
  }
}

function lerpColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

// ---------- plates ----------
function plate01() {
  // Dusk dune: warm sky gradient, horizon, layered dune ridges, grain.
  const buf = makeBuffer();
  const top = hex("#2e2236");
  const mid = hex("#c9703f");
  const low = hex("#f2c48a");
  const ground1 = hex("#4a2b1d");
  const ground2 = hex("#2a1710");
  const horizon = H * 0.62;
  paint(buf, (x, y) => {
    if (y < horizon) {
      const t = y / horizon;
      return t < 0.6 ? lerpColor(top, mid, t / 0.6) : lerpColor(mid, low, (t - 0.6) / 0.4);
    }
    // Dune ridges: stacked sinusoids with fbm offset, darker towards the foreground.
    const d = (y - horizon) / (H - horizon);
    const ridge = Math.sin(x * 0.0037 + fbm(3, x * 0.002, 1.3) * 3) * 26 + Math.sin(x * 0.0121 + 1.2) * 8;
    const duneEdge = horizon + 40 + ridge + d * 40;
    if (y < duneEdge) return lerpColor(hex("#e9a46a"), hex("#b8643c"), smoothstep(horizon, duneEdge, y));
    return lerpColor(ground1, ground2, clamp(d * 1.2, 0, 1));
  });
  // Soft glow near the sun.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W * 0.7) / W;
      const dy = (y - horizon) / H;
      const g = Math.exp(-(dx * dx * 14 + dy * dy * 40)) * 0.35;
      const i = (y * W + x) * 3;
      buf[i] = clamp(buf[i] + 255 * g * 0.6);
      buf[i + 1] = clamp(buf[i + 1] + 210 * g * 0.35);
      buf[i + 2] = clamp(buf[i + 2] + 120 * g * 0.1);
    }
  }
  grain(buf, 101, 12);
  return buf;
}

function plate02() {
  // Concrete: grey blocks with hard shadows.
  const buf = makeBuffer();
  const bg = hex("#7f7f7b");
  paint(buf, () => bg);
  const rnd = mulberry32(202);
  const shades = ["#9b9b96", "#b3b2ad", "#6c6c69", "#a6a59f", "#c4c2bc", "#8a8984"].map(hex);
  const blocks = [];
  let x = -40;
  while (x < W + 40) {
    const bw = 180 + rnd() * 240;
    let y = -40;
    while (y < H + 40) {
      const bh = 120 + rnd() * 200;
      blocks.push({
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(bw - 14),
        h: Math.round(bh - 14),
        c: shades[Math.floor(rnd() * shades.length)],
      });
      y += bh;
    }
    x += bw;
  }
  const shadowOff = 26;
  // Shadows first (hard, dark, offset down and right), then blocks on top.
  for (const b of blocks) {
    for (let yy = Math.max(0, b.y + shadowOff); yy < Math.min(H, b.y + b.h + shadowOff); yy++) {
      for (let xx = Math.max(0, b.x + shadowOff); xx < Math.min(W, b.x + b.w + shadowOff); xx++) {
        const i = (yy * W + xx) * 3;
        buf[i] *= 0.55;
        buf[i + 1] *= 0.55;
        buf[i + 2] *= 0.55;
      }
    }
  }
  for (const b of blocks) {
    for (let yy = Math.max(0, b.y); yy < Math.min(H, b.y + b.h); yy++) {
      for (let xx = Math.max(0, b.x); xx < Math.min(W, b.x + b.w); xx++) {
        const i = (yy * W + xx) * 3;
        const n = (fbm(77, xx * 0.02, yy * 0.02, 3) - 0.5) * 22;
        buf[i] = clamp(b.c[0] + n);
        buf[i + 1] = clamp(b.c[1] + n);
        buf[i + 2] = clamp(b.c[2] + n);
      }
    }
  }
  grain(buf, 203, 10);
  return buf;
}

function plate03() {
  // Ember: an orange ink bloom on black.
  const buf = makeBuffer();
  const cx = W * 0.5;
  const cy = H * 0.5;
  const black = [5, 5, 5];
  paint(buf, (x, y) => {
    const dx = (x - cx) / H;
    const dy = (y - cy) / H;
    const r = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const wobble = fbm(9, Math.cos(angle) * 1.4 + 3, Math.sin(angle) * 1.4 + 3, 4) * 0.22;
    const edge = 0.3 + wobble;
    const core = smoothstep(edge + 0.06, edge - 0.14, r);
    const glow = Math.exp(-r * r * 12) * 0.5;
    const t = clamp(core + glow * (1 - core), 0, 1);
    if (t < 0.7) return lerpColor(black, hex("#ec5c13"), Math.min(1, t / 0.7));
    return lerpColor(hex("#ec5c13"), hex("#fff2ea"), (t - 0.7) / 0.3 * 0.2);
  });
  grain(buf, 303, 8);
  return buf;
}

function plate04() {
  // Tide: blue-teal wave bands.
  const buf = makeBuffer();
  const deep = hex("#0a2630");
  const shallow = hex("#3fa3a6");
  const bands = 9;
  paint(buf, (x, y) => {
    let c = lerpColor(deep, hex("#124a57"), y / H);
    for (let k = 0; k < bands; k++) {
      const t = k / (bands - 1);
      const base = H * (0.25 + t * 0.7);
      const amp = 22 + 28 * t;
      const freq = 0.0028 + 0.0009 * k;
      const phase = k * 1.7 + fbm(40 + k, x * 0.001, k * 0.3) * 4;
      const edge = base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 0.6) * amp * 0.3;
      const inside = smoothstep(edge - 1.5, edge + 1.5, y);
      if (inside > 0) {
        const bandColor = lerpColor(shallow, hex("#d9f0ea"), t * 0.35);
        c = lerpColor(c, bandColor, inside * (0.35 + t * 0.5));
      }
    }
    return c;
  });
  grain(buf, 404, 6);
  return buf;
}

function plate05() {
  // Paper: cream ground with fibres and a huge black B.
  const buf = makeBuffer();
  const paper = hex("#f1e9d6");
  paint(buf, (x, y) => {
    const n = fbm(55, x * 0.012, y * 0.012, 4);
    return lerpColor(paper, hex("#e3d7bd"), n * 0.7);
  });
  // Huge B: stem plus two D-shaped bowls drawn as ring halves.
  const xs = W * 0.36;
  const stemL = xs - 230;
  const stemTop = H * 0.12;
  const stemBot = H * 0.88;
  const upper = { cx: xs, cy: H * 0.31, R: H * 0.2, r: H * 0.095 };
  const lower = { cx: xs, cy: H * 0.68, R: H * 0.22, r: H * 0.105 };
  const ink = hex("#111111");
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inStem = x >= stemL && x <= xs && y >= stemTop && y <= stemBot;
      const inBowl = (b) => {
        if (x < xs) return false;
        const d = Math.hypot(x - b.cx, y - b.cy);
        return d <= b.R && d >= b.r;
      };
      if (inStem || inBowl(upper) || inBowl(lower)) {
        const i = (y * W + x) * 3;
        const grainN = (fbm(66, x * 0.03, y * 0.03, 2) - 0.5) * 10;
        buf[i] = clamp(ink[0] + grainN);
        buf[i + 1] = clamp(ink[1] + grainN);
        buf[i + 2] = clamp(ink[2] + grainN);
      }
    }
  }
  grain(buf, 505, 6);
  return buf;
}

function plate06() {
  // Signal: green CRT grid with concentric circles, scanlines and vignette.
  const buf = makeBuffer();
  const bg = hex("#03110a");
  const line = hex("#1f7a46");
  const glow = hex("#3dff8a");
  const cx = W * 0.5;
  const cy = H * 0.5;
  paint(buf, (x, y) => {
    let c = bg;
    const gx = x % 40;
    const gy = y % 40;
    const onGrid = gx < 1.2 || gy < 1.2;
    if (onGrid) c = lerpColor(c, line, 0.45);
    const r = Math.hypot(x - cx, y - cy);
    for (const R of [120, 240, 360, 480]) {
      const d = Math.abs(r - R);
      if (d < 2.4) c = lerpColor(c, glow, 1 - d / 2.4);
      else if (d < 9) c = lerpColor(c, glow, 0.18 * (1 - d / 9));
    }
    if (Math.abs(x - cx) < 1.2 || Math.abs(y - cy) < 1.2) c = lerpColor(c, line, 0.7);
    if (y % 3 < 1) c = lerpColor(c, [0, 0, 0], 0.18);
    const vx = (x - cx) / W;
    const vy = (y - cy) / H;
    const vig = clamp(1 - (vx * vx + vy * vy) * 1.6, 0.25, 1);
    return [c[0] * vig, c[1] * vig, c[2] * vig];
  });
  grain(buf, 606, 5);
  return buf;
}

// ---------- encoding ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(buf) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W * 3; x++) {
      raw[y * (W * 3 + 1) + 1 + x] = clamp(Math.round(buf[y * W * 3 + x]));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- run ----------
const plates = [
  ["plate-01", plate01],
  ["plate-02", plate02],
  ["plate-03", plate03],
  ["plate-04", plate04],
  ["plate-05", plate05],
  ["plate-06", plate06],
];

mkdirSync(outDir, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "bjork-plates-"));
try {
  for (const [name, make] of plates) {
    const pngPath = join(scratch, `${name}.png`);
    writeFileSync(pngPath, encodePng(make()));
    execFileSync("cwebp", ["-quiet", "-q", "82", "-m", "6", pngPath, "-o", join(outDir, `${name}.webp`)]);
    console.log(`wrote ${name}.webp`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
