"use client";

// Liquid Text: type rendered as a viscous surface. The word is rasterised once into a signed
// distance field; a fragment shader unions it (smooth-min) with a short sprung trail of
// metaballs that follows the pointer, so dragging through a letter pulls a bead of ink off it.
// Let go and the trail sinks back into the nearest stroke with a little surface-tension wobble.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { defaultMaxDpr, sizeCanvas, useElementSize } from "../_core/canvas";
import { useVisibleLoop } from "../_core/loop";
import { useBjorkTone } from "../_core/tone";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";

export interface LiquidTextProps {
  text?: string;
  /** Ink colour. Defaults to the tone's text colour. */
  color?: string;
  /** Specular highlight colour. */
  highlight?: string;
  /** Optional tint where ink has been pulled away from the letters. Off by default. */
  accentColor?: string;
  /** 0 = runny, 1 = thick and slow. Default 0.55. */
  viscosity?: number;
  /** Radius of the leading blob in CSS px. Defaults to 13% of the font size. */
  blobRadius?: number;
  /** Number of sprung trail points, 2 to 10. Default 8. */
  trailLength?: number;
  tone?: BjorkTone;
  /** Upper bound for the font size in CSS px. The type shrinks to fit narrower containers. */
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** A slow drifting blob keeps the surface alive when nobody is pointing at it. Default true. */
  autoplay?: boolean;
  /** Render one representative frame (a bead mid-pull) and stop. Used for previews. */
  frozen?: boolean;
  ariaLabel?: string;
  className?: string;
}

const MAX_TRAIL = 10;

// ─── WebGL2 support (cached, client only) ────────────────────────────────────

let webgl2Support: boolean | null = null;
function getWebGL2Support(): boolean {
  if (webgl2Support === null) {
    try {
      const probe = document.createElement("canvas");
      const ctx = probe.getContext("webgl2");
      webgl2Support = !!ctx;
      ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl2Support = false;
    }
  }
  return webgl2Support;
}
// React StrictMode runs effect cleanups and re-runs them on the same canvas. Losing the context
// right away would hand the second run a dead context, so the release waits a tick and is
// cancelled if the canvas is picked up again.
const pendingRelease = new WeakMap<HTMLCanvasElement, number>();
function claimCanvas(canvas: HTMLCanvasElement) {
  const t = pendingRelease.get(canvas);
  if (t !== undefined) {
    window.clearTimeout(t);
    pendingRelease.delete(canvas);
  }
}
function releaseCanvas(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
  pendingRelease.set(
    canvas,
    window.setTimeout(() => {
      pendingRelease.delete(canvas);
      if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    }, 0),
  );
}
const subscribeNoop = () => () => {};
const getServerSupport = () => true;

// ─── Colour + layout helpers ─────────────────────────────────────────────────

let scratchCtx: CanvasRenderingContext2D | null = null;
function getScratch(): CanvasRenderingContext2D | null {
  if (!scratchCtx) scratchCtx = document.createElement("canvas").getContext("2d");
  return scratchCtx;
}

function parseColor(input: string, fallback: [number, number, number]): [number, number, number, number] {
  const ctx = getScratch();
  if (!ctx) return [...fallback, 1];
  ctx.fillStyle = "#000";
  ctx.fillStyle = input;
  const v = String(ctx.fillStyle);
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1, 7), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = v.match(/[\d.]+/g);
  if (!m || m.length < 3) return [...fallback, 1];
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255, m[3] !== undefined ? +m[3] : 1];
}

interface Layout {
  width: number;
  height: number;
  fontSize: number;
  font: string;
  tracking: number;
  baseline: number;
  textWidth: number;
  inkTop: number;
  inkBottom: number;
}

function computeLayout(width: number, text: string, family: string, weight: number, maxFont: number): Layout | null {
  const ctx = getScratch();
  if (!ctx || width < 8) return null;
  const setFont = (px: number) => {
    ctx.font = `${weight} ${px}px ${family}`;
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${-0.025 * px}px`;
  };
  setFont(100);
  const w100 = Math.max(1, ctx.measureText(text).width);
  const fontSize = Math.max(14, Math.min(maxFont, (width * 0.82 * 100) / w100));
  setFont(fontSize);
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || fontSize * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const height = Math.round(fontSize * 1.6);
  const baseline = height * 0.53 + (asc - desc) / 2;
  return {
    width,
    height,
    fontSize,
    font: `${weight} ${fontSize}px ${family}`,
    tracking: -0.025 * fontSize,
    baseline,
    textWidth: m.width,
    inkTop: baseline - asc,
    inkBottom: baseline + desc,
  };
}

// ─── Signed distance field (TinySDF style, anti-aliased seed) ────────────────

const INF = 1e20;

function edt1d(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Uint16Array | Uint32Array, z: Float64Array) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

function edt(grid: Float64Array, w: number, h: number, f: Float64Array, v: Uint32Array, z: Float64Array) {
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

interface Field {
  data: Float32Array; // signed distance in CSS px, positive outside
  packed: Float32Array; // RG: sharp distance, softened distance (for normals)
  w: number;
  h: number;
  scale: number; // texels per CSS px
}

function buildField(layout: Layout, text: string): Field | null {
  const scale = Math.min(1.25, 1800 / layout.width);
  const w = Math.max(2, Math.round(layout.width * scale));
  const h = Math.max(2, Math.round(layout.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.font = layout.font;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${layout.tracking}px`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, layout.width / 2, layout.baseline);
  const img = ctx.getImageData(0, 0, w, h).data;

  const n = w * h;
  const outer = new Float64Array(n);
  const inner = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = img[i * 4 + 3] / 255;
    if (a >= 1) {
      outer[i] = 0;
      inner[i] = INF;
    } else if (a <= 0) {
      outer[i] = INF;
      inner[i] = 0;
    } else {
      const d = 0.5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const v = new Uint32Array(len);
  const z = new Float64Array(len + 1);
  edt(outer, w, h, f, v, z);
  edt(inner, w, h, f, v, z);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / scale;
  // A softened copy rounds off the medial-axis ridges so the surface shades like a bead, not a bevel.
  const soft = Float32Array.from(data);
  const tmp = new Float32Array(n);
  const radius = Math.max(1, Math.round(layout.fontSize * 0.035 * scale));
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(soft, tmp, w, h, radius, 1, w);
    boxBlur(tmp, soft, h, w, radius, w, 1);
  }
  const packed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    packed[i * 2] = data[i];
    packed[i * 2 + 1] = soft[i];
  }
  return { data, packed, w, h, scale };
}

// One box blur pass along rows (step 1, lines of `len` with `stride` between lines) or columns.
function boxBlur(src: Float32Array, dst: Float32Array, len: number, lines: number, r: number, step: number, stride: number) {
  const span = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * stride;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(len - 1, Math.max(0, k)) * step];
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = acc / span;
      const out = Math.max(0, i - r);
      const inn = Math.min(len - 1, i + r + 1);
      acc += src[base + inn * step] - src[base + out * step];
    }
  }
}

function sampleField(field: Field, x: number, y: number): number {
  const fx = Math.min(field.w - 1, Math.max(0, Math.round(x * field.scale)));
  const fy = Math.min(field.h - 1, Math.max(0, Math.round(y * field.scale)));
  return field.data[fy * field.w + fx];
}

// Walks a point onto the letter surface (slightly inside) along the field gradient.
function nearestInside(field: Field, x: number, y: number, inset: number): [number, number] {
  let px = x;
  let py = y;
  for (let i = 0; i < 10; i++) {
    const d = sampleField(field, px, py) + inset;
    if (Math.abs(d) < 0.5) break;
    const e = 1.5;
    const gx = (sampleField(field, px + e, py) - sampleField(field, px - e, py)) / (2 * e);
    const gy = (sampleField(field, px, py + e) - sampleField(field, px, py - e)) / (2 * e);
    const gl = Math.hypot(gx, gy) || 1;
    px -= (gx / gl) * d;
    py -= (gy / gl) * d;
  }
  return [px, py];
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSdf;
uniform vec2 uSize;
uniform float uDpr;
uniform float uCanvasH;
uniform vec4 uBlob[${MAX_TRAIL}];
uniform vec2 uWarp[${MAX_TRAIL}];
uniform int uCount;
uniform float uSigma;
uniform float uBevel;
uniform vec3 uInk;
uniform vec3 uHi;
uniform vec4 uAccent;
uniform float uSpec;
uniform float uShade;
out vec4 outColor;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float glyph(vec2 p, float soft) {
  vec2 t = texture(uSdf, p / uSize).rg;
  return mix(t.r, t.g, soft);
}

float field(vec2 p, float soft, out float g0) {
  vec2 warp = vec2(0.0);
  float wsum = 0.0;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uCount) break;
    vec2 d = p - uBlob[i].xy;
    float g = exp(-dot(d, d) / (uSigma * uSigma));
    warp += uWarp[i] * g;
    wsum += g;
  }
  warp /= max(1.0, wsum);
  float f = glyph(p - warp, soft);
  g0 = f;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uCount) break;
    float r = uBlob[i].z;
    if (r < 0.05) continue;
    float b = length(p - uBlob[i].xy) - r;
    f = smin(f, b, r * 1.45);
  }
  return f;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uCanvasH - gl_FragCoord.y) / uDpr;
  float g0;
  float f = field(p, 0.0, g0);
  float fw = max(fwidth(f), 1e-4);
  float alpha = clamp(0.5 - f / fw, 0.0, 1.0);
  if (alpha <= 0.0) { outColor = vec4(0.0); return; }

  float e = 1.0;
  float tmp;
  vec2 grad = vec2(
    field(p + vec2(e, 0.0), 1.0, tmp) - field(p - vec2(e, 0.0), 1.0, tmp),
    field(p + vec2(0.0, e), 1.0, tmp) - field(p - vec2(0.0, e), 1.0, tmp)
  ) / (2.0 * e);
  float fs = field(p, 1.0, tmp);
  float gl = length(grad);
  vec2 n2 = gl > 1e-4 ? grad / gl : vec2(0.0);

  // Circular cross-section: steep at the rim, flat in the middle of thick strokes.
  float s = 1.0 - clamp(-min(fs, f + 0.5) / uBevel, 0.0, 1.0);
  s = pow(s, 1.6);
  vec3 N = normalize(vec3(n2 * s, sqrt(max(0.0, 1.0 - s * s))));
  vec3 L = normalize(vec3(-0.45, -0.7, 0.62));
  float diff = clamp(dot(N, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 48.0);

  vec3 col = uInk * mix(1.0 - uShade, 1.0, diff);
  float pulled = clamp((g0 - f) / (uBevel * 1.4), 0.0, 1.0);
  col = mix(col, uAccent.rgb, pulled * uAccent.a);
  col += uHi * spec * uSpec;
  outColor = vec4(col * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn("LiquidText shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// ─── Simulation ──────────────────────────────────────────────────────────────

interface Sim {
  n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  mass: number;
  massV: number;
  load: number;
  mode: "idle" | "pointer" | "release";
  tx: number;
  ty: number;
  homeX: number;
  homeY: number;
  releaseT: number;
  idleBlend: number;
  clock: number;
  seeded: boolean;
  // Where the neck of a pulled bead is still attached to a stroke, and how firmly (0 to 1).
  anchorX: number;
  anchorY: number;
  tether: number;
}

function createSim(): Sim {
  return {
    n: 8,
    x: new Float32Array(MAX_TRAIL),
    y: new Float32Array(MAX_TRAIL),
    vx: new Float32Array(MAX_TRAIL),
    vy: new Float32Array(MAX_TRAIL),
    mass: 0,
    massV: 0,
    load: 0.5,
    mode: "idle",
    tx: 0,
    ty: 0,
    homeX: 0,
    homeY: 0,
    releaseT: 0,
    idleBlend: 1,
    clock: 0,
    seeded: false,
    anchorX: 0,
    anchorY: 0,
    tether: 0,
  };
}

interface SimParams {
  viscosity: number;
  trail: number;
  autoplay: boolean;
}

function idlePoint(layout: Layout, t: number): [number, number] {
  const cx = layout.width / 2;
  const capH = layout.inkBottom - layout.inkTop;
  const ax = layout.textWidth * 0.44;
  // Rides the top line of the word, dipping into the letters and lifting beads off them.
  const y = layout.inkTop + capH * (0.04 + 0.2 * Math.sin(t * 0.53 + 1.1) + 0.08 * Math.sin(t * 1.27));
  return [cx + ax * Math.sin(t * 0.21), y];
}

function stepSim(sim: Sim, dt: number, layout: Layout, field: Field, params: SimParams) {
  const n = Math.max(2, Math.min(MAX_TRAIL, Math.round(params.trail)));
  sim.n = n;
  const visc = Math.min(1, Math.max(0, params.viscosity));
  if (!sim.seeded) {
    const [ix, iy] = idlePoint(layout, sim.clock);
    for (let i = 0; i < MAX_TRAIL; i++) {
      sim.x[i] = ix;
      sim.y[i] = iy;
    }
    sim.seeded = true;
  }

  let massTarget = 0;
  let gx = sim.tx;
  let gy = sim.ty;
  if (sim.mode === "pointer") {
    massTarget = 1;
  } else if (sim.mode === "release") {
    sim.releaseT += dt;
    gx = sim.homeX;
    gy = sim.homeY;
    if (sim.releaseT > 2.2 && params.autoplay) {
      sim.mode = "idle";
      sim.idleBlend = 0;
    }
  }
  if (sim.mode === "idle") {
    if (!params.autoplay) {
      gx = sim.homeX;
      gy = sim.homeY;
    } else {
      sim.clock += dt;
      sim.idleBlend = Math.min(1, sim.idleBlend + dt / 2.4);
      const b = sim.idleBlend * sim.idleBlend * (3 - 2 * sim.idleBlend);
      const [ix, iy] = idlePoint(layout, sim.clock);
      gx = sim.homeX + (ix - sim.homeX) * b;
      gy = sim.homeY + (iy - sim.homeY) * b;
      massTarget = 0.55 * b;
    }
  }

  const k = 330 - 270 * visc;
  const c = 2 * 0.62 * Math.sqrt(k);
  const kf = k * 1.25;
  const cf = 2 * 0.48 * Math.sqrt(kf);
  const km = 70;
  const cm = 2 * 0.3 * Math.sqrt(km);

  // Surface tension: a head that leaves a stroke stays tethered to it by the tail of the trail.
  // Stretch the neck past the break length and it snaps, leaving a free bead.
  const headD = sampleField(field, sim.x[0], sim.y[0]);
  if (sim.mode === "pointer" || (sim.mode === "idle" && params.autoplay)) {
    if (headD < 0) {
      sim.tether = Math.min(1, sim.tether + dt * 8);
      const [ax, ay] = nearestInside(field, sim.x[0], sim.y[0], layout.fontSize * 0.04);
      sim.anchorX = ax;
      sim.anchorY = ay;
    } else if (sim.tether > 0) {
      const stretch = Math.hypot(sim.x[0] - sim.anchorX, sim.y[0] - sim.anchorY);
      const breakLen = layout.fontSize * (0.42 + 0.4 * visc);
      if (stretch > breakLen) sim.tether = 0;
    }
  } else {
    sim.tether = Math.max(0, sim.tether - dt * 3);
  }

  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) {
      const tx = i === 0 ? gx : sim.x[i - 1];
      const ty = i === 0 ? gy : sim.y[i - 1];
      const kk = i === 0 ? k : kf;
      const cc = i === 0 ? c : cf;
      let fx = (tx - sim.x[i]) * kk;
      let fy = (ty - sim.y[i]) * kk;
      if (i > 0 && sim.tether > 0) {
        // Tail points lean toward the anchor, spreading the trail into a neck.
        const w = sim.tether * Math.pow(i / (n - 1), 1.3) * 1.6;
        fx += (sim.anchorX - sim.x[i]) * kk * w;
        fy += (sim.anchorY - sim.y[i]) * kk * w;
      }
      sim.vx[i] += (fx - sim.vx[i] * cc) * h;
      sim.vy[i] += (fy - sim.vy[i] * cc) * h;
      sim.x[i] += sim.vx[i] * h;
      sim.y[i] += sim.vy[i] * h;
    }
    sim.massV += ((massTarget - sim.mass) * km - sim.massV * cm) * h;
    sim.mass += sim.massV * h;
  }
  // Trail points beyond the active length sit on the tail so lengthening the trail is seamless.
  for (let i = n; i < MAX_TRAIL; i++) {
    sim.x[i] = sim.x[n - 1];
    sim.y[i] = sim.y[n - 1];
    sim.vx[i] = 0;
    sim.vy[i] = 0;
  }

  // Dragging through a letter loads the blob with ink; open air slowly thins it.
  const inside = sampleField(field, sim.x[0], sim.y[0]) < layout.fontSize * 0.02;
  sim.load = inside ? Math.min(1, sim.load + dt * 5) : Math.max(0.4, sim.load - dt * 0.35);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface GLState {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  buf: WebGLBuffer;
  tex: WebGLTexture;
  u: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = ["uSdf", "uSize", "uDpr", "uCanvasH", "uBlob", "uWarp", "uCount", "uSigma", "uBevel", "uInk", "uHi", "uAccent", "uSpec", "uShade"];

export function LiquidText({
  text = "Liquid",
  color,
  highlight,
  accentColor,
  viscosity = 0.55,
  blobRadius,
  trailLength = 8,
  tone,
  fontSize = 240,
  fontWeight = 700,
  fontFamily,
  autoplay = true,
  frozen = false,
  ariaLabel,
  className,
}: LiquidTextProps) {
  const resolvedTone = useBjorkTone(tone);
  const reducedMotion = useReducedMotion() ?? false;
  const supported = useSyncExternalStore(subscribeNoop, getWebGL2Support, getServerSupport);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width } = useElementSize(wrapRef);
  const [fontsReady, setFontsReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);

  const glRef = useRef<GLState | null>(null);
  const fieldRef = useRef<Field | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const dprRef = useRef(1);
  const simRef = useRef<Sim>(createSim());
  const blobBuf = useRef(new Float32Array(MAX_TRAIL * 4));
  const warpBuf = useRef(new Float32Array(MAX_TRAIL * 2));

  const palette = BJORK_PALETTE[resolvedTone];
  const look = useRef({
    ink: [0.93, 0.93, 0.93, 1] as number[],
    hi: [1, 1, 1, 1] as number[],
    accent: [0.93, 0.36, 0.07, 0.3] as number[],
    spec: 0.6,
    shade: 0.3,
    blobRadius: 0 as number | undefined,
    viscosity,
    trail: trailLength,
    autoplay,
  });

  const still = frozen || reducedMotion;

  useEffect(() => {
    let cancelled = false;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) {
      Promise.resolve().then(() => !cancelled && setFontsReady(true));
      return;
    }
    fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Draws one frame from the current sim state.
  const draw = useCallback(() => {
    const g = glRef.current;
    const lay = layoutRef.current;
    const canvas = canvasRef.current;
    if (!g || !lay || !canvas || g.gl.isContextLost()) return;
    const { gl, u } = g;
    const sim = simRef.current;
    const L = look.current;
    const R = L.blobRadius ?? lay.fontSize * 0.13;
    const n = sim.n;
    const visc = Math.min(1, Math.max(0, L.viscosity));
    const blob = blobBuf.current;
    const warp = warpBuf.current;
    const maxWarp = lay.fontSize * 0.05;
    const warpTime = 0.028 - visc * 0.01;
    const mass = Math.max(0, sim.mass);
    for (let i = 0; i < MAX_TRAIL; i++) {
      const taper = i === 0 ? 1 : 0.62 - 0.34 * (1 - 0.6 * sim.tether) * ((i - 1) / Math.max(1, n - 2));
      blob[i * 4] = sim.x[i];
      blob[i * 4 + 1] = sim.y[i];
      blob[i * 4 + 2] = i < n ? R * mass * (0.45 + 0.55 * sim.load) * taper : 0;
      blob[i * 4 + 3] = 0;
      let wx = sim.vx[i] * warpTime * Math.min(1, mass * 1.4);
      let wy = sim.vy[i] * warpTime * Math.min(1, mass * 1.4);
      const wl = Math.hypot(wx, wy);
      if (wl > maxWarp) {
        wx *= maxWarp / wl;
        wy *= maxWarp / wl;
      }
      warp[i * 2] = wx;
      warp[i * 2 + 1] = wy;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(g.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.uniform1i(u.uSdf, 0);
    gl.uniform2f(u.uSize, lay.width, lay.height);
    gl.uniform1f(u.uDpr, dprRef.current);
    gl.uniform1f(u.uCanvasH, canvas.height);
    gl.uniform4fv(u.uBlob, blob);
    gl.uniform2fv(u.uWarp, warp);
    gl.uniform1i(u.uCount, n);
    gl.uniform1f(u.uSigma, R * 1.8);
    gl.uniform1f(u.uBevel, Math.max(2, lay.fontSize * 0.085));
    gl.uniform3f(u.uInk, L.ink[0], L.ink[1], L.ink[2]);
    gl.uniform3f(u.uHi, L.hi[0], L.hi[1], L.hi[2]);
    gl.uniform4f(u.uAccent, L.accent[0], L.accent[1], L.accent[2], L.accent[3]);
    gl.uniform1f(u.uSpec, L.spec);
    gl.uniform1f(u.uShade, L.shade);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, []);

  // Look + tuning props live in a ref so the loop never re-subscribes.
  useEffect(() => {
    const dark = resolvedTone === "dark";
    const ink = parseColor(color ?? palette.text, dark ? [0.93, 0.93, 0.93] : [0.09, 0.09, 0.09]);
    const hi = parseColor(highlight ?? "#ffffff", [1, 1, 1]);
    const acc = accentColor ? parseColor(accentColor, [0.93, 0.36, 0.07]) : [0, 0, 0, 0];
    const L = look.current;
    L.ink = ink;
    L.hi = hi;
    L.accent = [acc[0], acc[1], acc[2], acc[3] * 0.35];
    L.spec = dark ? 0.55 : 0.75;
    L.shade = dark ? 0.32 : 0.0;
    L.blobRadius = blobRadius;
    L.viscosity = viscosity;
    L.trail = trailLength;
    L.autoplay = autoplay;
    simRef.current.n = Math.max(2, Math.min(MAX_TRAIL, Math.round(trailLength)));
    draw();
  }, [resolvedTone, color, highlight, accentColor, palette, blobRadius, viscosity, trailLength, autoplay, draw]);

  // GL setup / teardown. `epoch` bumps after a context restore.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !supported) return;
    claimCanvas(canvas);
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    const buf = gl.createBuffer();
    const tex = gl.createTexture();
    if (!vs || !fs || !prog || !buf || !tex) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u: GLState["u"] = {};
    for (const name of UNIFORMS) u[name] = gl.getUniformLocation(prog, name);
    glRef.current = { gl, prog, buf, tex, u };

    const onLost = (e: Event) => {
      e.preventDefault();
      glRef.current = null;
    };
    const onRestored = () => setEpoch((v) => v + 1);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      glRef.current = null;
      if (!gl.isContextLost()) {
        gl.deleteTexture(tex);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        releaseCanvas(canvas, gl);
      }
    };
  }, [supported, epoch]);

  // Layout, canvas size and the distance field. Re-runs on resize, text or font change.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !fontsReady || width < 8) return;
    let cancelled = false;
    const family = fontFamily ?? (getComputedStyle(wrap).fontFamily || "sans-serif");
    const fontSpec = `${fontWeight} 100px ${family}`;
    const run = () => {
      if (cancelled) return;
      const lay = computeLayout(width, text, family, fontWeight, fontSize);
      if (!lay) return;
      const field = buildField(lay, text);
      if (!field) return;
      layoutRef.current = lay;
      fieldRef.current = field;
      setLayout((prev) =>
        prev && prev.width === lay.width && prev.height === lay.height && prev.fontSize === lay.fontSize ? prev : lay,
      );
      dprRef.current = sizeCanvas(canvas, lay.width, lay.height, defaultMaxDpr());
      const g = glRef.current;
      if (g && !g.gl.isContextLost()) {
        const { gl } = g;
        gl.bindTexture(gl.TEXTURE_2D, g.tex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, field.w, field.h, 0, gl.RG, gl.FLOAT, field.packed);
      }

      // Park the trail on the text so the first frame never flies in from the corner.
      const sim = simRef.current;
      const [hx, hy] = nearestInside(field, lay.width / 2, (lay.inkTop + lay.inkBottom) / 2, lay.fontSize * 0.03);
      sim.homeX = hx;
      sim.homeY = hy;
      if (frozen) {
        primeFrozen(sim, lay, field, look.current);
      } else if (reducedMotion) {
        sim.mass = 0;
        sim.massV = 0;
      }
      draw();
    };
    // Make sure the exact weight is loaded before rasterising.
    document.fonts.load(fontSpec, text).then(run, run);
    return () => {
      cancelled = true;
    };
  }, [width, text, fontWeight, fontFamily, fontSize, fontsReady, frozen, reducedMotion, epoch, draw]);

  // Pointer input.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || still || !supported) return;
    const toLocal = (e: PointerEvent): [number, number] | null => {
      const lay = layoutRef.current;
      if (!lay) return null;
      const rect = wrap.getBoundingClientRect();
      const sx = rect.width > 0 ? lay.width / rect.width : 1;
      const sy = rect.height > 0 ? lay.height / rect.height : 1;
      return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
    };
    const onMove = (e: PointerEvent) => {
      const pt = toLocal(e);
      const lay = layoutRef.current;
      if (!pt || !lay) return;
      const sim = simRef.current;
      sim.mode = "pointer";
      // While dragging, the bead can be pulled to the edge of the surface but no further.
      const m = lay.fontSize * 0.1;
      sim.tx = Math.min(lay.width - m, Math.max(m, pt[0]));
      sim.ty = Math.min(lay.height - m, Math.max(m, pt[1]));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) {
        try {
          wrap.setPointerCapture(e.pointerId);
        } catch {
          /* capture is best-effort */
        }
      }
      onMove(e);
    };
    const onLeave = () => {
      const sim = simRef.current;
      const field = fieldRef.current;
      const lay = layoutRef.current;
      if (sim.mode !== "pointer" || !field || !lay) return;
      const [hx, hy] = nearestInside(field, sim.x[0], sim.y[0], lay.fontSize * 0.03);
      sim.homeX = hx;
      sim.homeY = hy;
      sim.mode = "release";
      sim.releaseT = 0;
    };
    const onUp = (e: PointerEvent) => {
      if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
      const rect = wrap.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
      if (e.pointerType !== "mouse" || outside) onLeave();
    };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("pointercancel", onLeave);
    wrap.addEventListener("pointerup", onUp);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("pointercancel", onLeave);
      wrap.removeEventListener("pointerup", onUp);
    };
  }, [still, supported]);

  const frame = useCallback(
    (dt: number) => {
      const lay = layoutRef.current;
      const field = fieldRef.current;
      if (!lay || !field || !glRef.current) return;
      const L = look.current;
      stepSim(simRef.current, dt, lay, field, { viscosity: L.viscosity, trail: L.trail, autoplay: L.autoplay });
      draw();
    },
    [draw],
  );
  useVisibleLoop(wrapRef, frame, { enabled: supported && !still });

  const label = ariaLabel ?? text;
  const showFallback = !supported;
  const style: CSSProperties = {
    height: layout ? layout.height : undefined,
    minHeight: layout ? undefined : "1.6em",
    touchAction: "pan-y",
  };

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={label}
      data-tone={resolvedTone}
      className={cn("relative w-full select-none", className)}
      style={{
        ...style,
        fontFamily: fontFamily ?? "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
        fontWeight,
      }}
    >
      {showFallback ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap leading-none"
          style={{
            color: color ?? palette.text,
            fontSize: layout ? layout.fontSize : "clamp(48px, 14vw, 160px)",
            letterSpacing: "-0.025em",
          }}
        >
          {text}
        </span>
      ) : (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute left-0 top-0 block" />
      )}
    </div>
  );
}

// Plays a scripted drag offline so the preview frame shows a bead mid-pull.
function primeFrozen(sim: Sim, lay: Layout, field: Field, L: { viscosity: number; trail: number; blobRadius?: number }) {
  const cx = lay.width / 2;
  const capH = lay.inkBottom - lay.inkTop;
  const R = L.blobRadius ?? lay.fontSize * 0.13;
  // Start at the top of the last letter and pull a bead up and away from it.
  const [sx, sy] = nearestInside(field, cx + lay.textWidth * 0.43, lay.inkTop + capH * 0.06, lay.fontSize * 0.04);
  const ex = sx + lay.fontSize * 0.12;
  const ey = Math.max(R * 1.4, lay.inkTop - R * 2.2);
  sim.mode = "pointer";
  sim.mass = 1;
  sim.massV = 0;
  sim.load = 1;
  sim.clock = 0;
  for (let i = 0; i < MAX_TRAIL; i++) {
    sim.x[i] = sx;
    sim.y[i] = sy;
    sim.vx[i] = 0;
    sim.vy[i] = 0;
  }
  sim.seeded = true;
  const params = { viscosity: L.viscosity, trail: L.trail, autoplay: false };
  const dt = 1 / 120;
  for (let t = 0; t < FROZEN_AT; t += dt) {
    const k = Math.min(1, t / FROZEN_PULL);
    const e = 1 - Math.pow(1 - k, 3);
    sim.tx = sx + (ex - sx) * e;
    sim.ty = sy + (ey - sy) * e;
    stepSim(sim, dt, lay, field, params);
    sim.load = 1;
  }
}

const FROZEN_PULL = 0.32;
const FROZEN_AT = 0.3;
