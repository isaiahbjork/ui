"use client";

// Glyph Morph: words that melt into one another by shape, not by opacity.
// Each word is rasterised once with the page font and turned into a signed distance
// field (exact Euclidean transform with an anti-aliased seed). A WebGL2 fragment shader
// interpolates the two fields along a left-to-right sweep, softens them with a few taps
// so neighbouring strokes bridge, drifts them with low-frequency noise and a little
// gravity, then thresholds with derivative-based anti-aliasing. Mid-morph the ink
// thickens slightly (surface tension) and only the moving edge picks up an orange rim.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { defaultMaxDpr, sizeCanvas, useElementSize } from "../_core/canvas";
import { useVisibleLoop } from "../_core/loop";
import { useBjorkTone } from "../_core/tone";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";

export type GlyphMorphEasing = "inOutCubic" | "inOutQuint" | "inOutSine" | "inOutExpo" | "linear";

export interface GlyphMorphProps {
  /** Words to cycle through. Two or more for a morph; one renders statically. */
  words?: string[];
  /** How long each word holds before morphing, in ms. Default 1600. */
  interval?: number;
  /** Length of one morph, in ms. Default 1500. */
  duration?: number;
  /** Easing applied per pixel along the sweep. Default "inOutCubic". */
  easing?: GlyphMorphEasing;
  /** 0 = the whole word morphs at once, 1 = a slow left-to-right sweep. Default 0.4. */
  stagger?: number;
  /** 0 to 1. How much the ink thickens and bridges at the middle of a morph. Default 0.6. */
  tension?: number;
  /** Ink colour. Defaults to the tone's text colour. */
  color?: string;
  /** Rim colour on the moving edge. Pass "transparent" to turn it off. */
  accentColor?: string;
  tone?: BjorkTone;
  /** Upper bound for the font size in CSS px. Type shrinks so the longest word fits. Default 168. */
  fontSize?: number;
  /** Geist is variable, so any weight from 100 to 900 works. Default 640. */
  fontWeight?: number;
  /** Defaults to the page font. */
  fontFamily?: string;
  /** Cycle through `words` on its own. Default true. Ignored when `index` is set. */
  autoplay?: boolean;
  /** Controlled mode: morph to this index whenever it changes. */
  index?: number;
  /** Word shown first. Default 0. */
  startIndex?: number;
  /** Freeze on one frame of the morph from `startIndex` to the next word (0 to 1). For previews. */
  progress?: number;
  /** Announce each new word politely to screen readers. Default false. */
  announce?: boolean;
  ariaLabel?: string;
  className?: string;
  onWordChange?: (index: number, word: string) => void;
}

const DEFAULT_WORDS = ["Shape", "Shift", "Form", "Flow"];
const EASE_INDEX: Record<GlyphMorphEasing, number> = { inOutCubic: 0, inOutQuint: 1, inOutSine: 2, inOutExpo: 3, linear: 4 };
const TRACKING_EM = -0.035;
const LINE_HEIGHT = 1.42;

// ─── WebGL2 support, cached ──────────────────────────────────────────────────

let webgl2Support: boolean | null = null;
function hasWebGL2(): boolean {
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
const subscribeNoop = () => () => {};
const getServerSupport = () => true;

// ─── Colour + layout ─────────────────────────────────────────────────────────

let scratch: CanvasRenderingContext2D | null = null;
function scratchCtx(): CanvasRenderingContext2D | null {
  if (!scratch && typeof document !== "undefined") scratch = document.createElement("canvas").getContext("2d");
  return scratch;
}

function rgba(input: string): [number, number, number, number] {
  const ctx = scratchCtx();
  if (!ctx) return [1, 1, 1, 1];
  ctx.fillStyle = "#000";
  ctx.fillStyle = input;
  const v = String(ctx.fillStyle);
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1, 7), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const m = v.match(/[\d.]+/g);
  if (!m || m.length < 3) return [1, 1, 1, 1];
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255, m[3] !== undefined ? +m[3] : 1];
}

type TrackedCtx = CanvasRenderingContext2D & { letterSpacing?: string };

function setType(ctx: CanvasRenderingContext2D, weight: number, px: number, family: string) {
  ctx.font = `${weight} ${px}px ${family}`;
  const t = ctx as TrackedCtx;
  if ("letterSpacing" in t) t.letterSpacing = `${TRACKING_EM * px}px`;
}

interface Layout {
  width: number;
  height: number;
  fontSize: number;
  baseline: number;
  family: string;
  weight: number;
  key: string;
}

function computeLayout(width: number, words: string[], family: string, weight: number, maxFont: number): Layout | null {
  const ctx = scratchCtx();
  if (!ctx || width < 8 || !words.length) return null;
  setType(ctx, weight, 100, family);
  let widest = 1;
  for (const w of words) widest = Math.max(widest, ctx.measureText(w).width);
  const fontSize = Math.max(12, Math.min(maxFont, (width * 0.9 * 100) / widest));
  setType(ctx, weight, fontSize, family);
  const cap = ctx.measureText("H").actualBoundingBoxAscent || fontSize * 0.7;
  const height = Math.round(fontSize * LINE_HEIGHT);
  // Centre the cap height, nudged up a touch so descenders have room to drip.
  const baseline = height * 0.47 + cap / 2;
  return {
    width,
    height,
    fontSize,
    baseline,
    family,
    weight,
    key: `${width}|${height}|${fontSize.toFixed(2)}|${weight}|${family}`,
  };
}

// ─── Signed distance field ───────────────────────────────────────────────────
// Felzenszwalb & Huttenlocher's lower-envelope transform, run once for the
// distance to ink and once for the distance to paper. Edge pixels seed with
// their coverage so the zero crossing lands between pixels.

const BIG = 1e20;

function envelope(grid: Float32Array, start: number, step: number, n: number, f: Float32Array, v: Int32Array, z: Float32Array) {
  for (let i = 0; i < n; i++) f[i] = grid[start + i * step];
  let k = 0;
  v[0] = 0;
  z[0] = -BIG;
  z[1] = BIG;
  for (let q = 1; q < n; q++) {
    const fq = f[q] + q * q;
    let r = v[k];
    let s = (fq - (f[r] + r * r)) / (2 * (q - r));
    while (s <= z[k] && k > 0) {
      k--;
      r = v[k];
      s = (fq - (f[r] + r * r)) / (2 * (q - r));
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    grid[start + q * step] = f[v[k]] + d * d;
  }
}

function transform(grid: Float32Array, w: number, h: number, f: Float32Array, v: Int32Array, z: Float32Array) {
  for (let x = 0; x < w; x++) envelope(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) envelope(grid, y * w, 1, w, f, v, z);
}

interface Field {
  data: Float32Array; // signed distance in em, positive outside the ink
  w: number;
  h: number;
  cov: Uint8Array; // ink coverage, mipmapped on the GPU into the goo blur
  texEm: number; // field texels per em
  inkWidth: number; // advance width in CSS px, for the sweep
}

function buildField(word: string, lay: Layout, dpr: number): Field | null {
  // Aim for a field font around 150 texels: plenty for display sizes, cheap to transform.
  const target = Math.min(lay.fontSize * dpr, 156);
  const s = Math.max(0.35, Math.min(2, target / lay.fontSize));
  const w = Math.max(2, Math.round(lay.width * s));
  const h = Math.max(2, Math.round(lay.height * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const px = lay.fontSize * s;
  setType(ctx, lay.weight, px, lay.family);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  // letterSpacing adds trailing space after the last glyph; shift back by half of it.
  const trail = "letterSpacing" in (ctx as TrackedCtx) ? TRACKING_EM * px : 0;
  ctx.fillText(word, w / 2 - trail / 2, lay.baseline * s);
  const inkWidth = ctx.measureText(word).width / s;
  const img = ctx.getImageData(0, 0, w, h).data;

  const n = w * h;
  const cov = new Uint8Array(n);
  for (let i = 0; i < n; i++) cov[i] = img[i * 4 + 3];
  const toInk = new Float32Array(n);
  const toPaper = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = img[i * 4 + 3] / 255;
    if (a >= 0.999) {
      toInk[i] = 0;
      toPaper[i] = BIG;
    } else if (a <= 0.001) {
      toInk[i] = BIG;
      toPaper[i] = 0;
    } else {
      const o = Math.max(0, 0.5 - a);
      const iIn = Math.max(0, a - 0.5);
      toInk[i] = o * o;
      toPaper[i] = iIn * iIn;
    }
  }
  const m = Math.max(w, h);
  const f = new Float32Array(m);
  const v = new Int32Array(m);
  const z = new Float32Array(m + 1);
  transform(toInk, w, h, f, v, z);
  transform(toPaper, w, h, f, v, z);
  const data = new Float32Array(n);
  const inv = 1 / px;
  for (let i = 0; i < n; i++) data[i] = (Math.sqrt(toInk[i]) - Math.sqrt(toPaper[i])) * inv;
  return { data, cov, w, h, texEm: px, inkWidth };
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uA;     // signed distance, em
uniform sampler2D uB;
uniform sampler2D uGA;    // ink coverage, mipmapped: the mip chain is our blur
uniform sampler2D uGB;
uniform float uT;
uniform float uStagger;
uniform int uEase;
uniform float uTime;
uniform float uTension;
uniform vec2 uEm;         // one em in uv units (x, y)
uniform vec2 uSpan;       // sweep span in uv x: start, end
uniform vec2 uTexel;      // one field texel in uv
uniform float uTexEm;     // field texels per em
uniform float uBaseY;     // baseline-ish centre in uv y
uniform vec3 uInk;
uniform float uInkA;
uniform vec4 uAccent;
uniform float uMode;      // 0 morph, 1 plain crossfade
uniform float uSeed;
uniform float uRimPx;

const float PI = 3.14159265;

float ease(float t) {
  if (uEase == 0) return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
  if (uEase == 1) return t < 0.5 ? 16.0 * pow(t, 5.0) : 1.0 - pow(-2.0 * t + 2.0, 5.0) * 0.5;
  if (uEase == 2) return 0.5 - 0.5 * cos(PI * t);
  if (uEase == 3) {
    if (t <= 0.0) return 0.0;
    if (t >= 1.0) return 1.0;
    return t < 0.5 ? pow(2.0, 20.0 * t - 10.0) * 0.5 : (2.0 - pow(2.0, -20.0 * t + 10.0)) * 0.5;
  }
  return t;
}

float hash(vec2 p) {
  p = fract(p * vec2(127.13, 311.71));
  p += dot(p, p + 34.17);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Blurred coverage: a trilinear mip lookup softened by a rotated ring of taps so the
// box-filtered mip levels never show their grid.
float goo(sampler2D s, vec2 uv, float lod, float rad) {
  float c = textureLod(s, uv, lod).r * 2.0;
  for (int i = 0; i < 6; i++) {
    float an = float(i) * 1.0471976 + 0.3;
    c += textureLod(s, uv + vec2(cos(an), sin(an)) * rad * uTexel, lod).r;
  }
  return c / 8.0;
}

void main() {
  vec2 uv = vUv;
  // Position along the word, leaning a little so the front travels like a wave.
  float xn = clamp((uv.x - uSpan.x) / max(1e-4, uSpan.y - uSpan.x), 0.0, 1.0);
  xn = clamp(xn + (uv.y - 0.5) * 0.1, 0.0, 1.0);
  float lt = clamp(uT * (1.0 + uStagger) - uStagger * xn, 0.0, 1.0);
  float e = ease(lt);
  float b = sin(PI * lt);                 // 0 at rest, 1 mid-morph
  b *= b;

  if (uMode > 0.5) {
    float dA = texture(uA, uv).r;
    float dB = texture(uB, uv).r;
    float aA = clamp(0.5 - dA / max(fwidth(dA), 1e-5), 0.0, 1.0);
    float aB = clamp(0.5 - dB / max(fwidth(dB), 1e-5), 0.0, 1.0);
    float a = mix(aA, aB, e) * uInkA;
    outColor = vec4(uInk * a, a);
    return;
  }

  // Melt: mid-morph the ink slumps toward its centre line and drifts on slow flow noise.
  vec2 p = (uv / uEm) * 0.55 + uSeed;
  vec2 flow = vec2(vnoise(p + vec2(0.0, uTime * 0.5)), vnoise(p + vec2(5.2, -uTime * 0.4))) - 0.5;
  vec2 q = uv;
  q.y = uBaseY + (q.y - uBaseY) * (1.0 + 0.1 * b);
  q += flow * 0.07 * b * uEm;
  vec2 qA = q + vec2(0.0, -0.035 * b * e) * uEm;          // the outgoing word sags
  vec2 qB = q + vec2(0.0, 0.035 * b * (1.0 - e)) * uEm;   // the incoming one settles

  // Crisp: blend the two distance fields.
  float dA = texture(uA, qA).r;
  float dB = texture(uB, qB).r;
  float dS = mix(dA, dB, e);

  // Goo: blur both words (mip chain) and threshold their mixed coverage, the way an
  // SVG blur + alpha matrix fuses shapes, but in one pass and with both words at once.
  float sigma = (0.02 + 0.085 * b) * uTexEm;               // blur radius in texels
  float lod = log2(max(1.0, sigma));
  float cov = mix(goo(uGA, qA, lod, sigma * 0.7), goo(uGB, qB, lod, sigma * 0.7), e);
  float thr = 0.5 - 0.05 * uTension * b;                  // surface tension: swell, bridge
  float dG = (thr - cov) * (0.05 + 0.2 * b);             // coverage to em-ish distance

  float w = smoothstep(0.0, 0.3, b);
  float d = mix(dS, dG, w) - uTension * b * 0.012;

  float fw = max(fwidth(d), 1e-5);
  float alpha = clamp(0.5 - d / fw, 0.0, 1.0);

  // Rim only where the two words disagree, i.e. the edge that is actually travelling.
  float moving = smoothstep(0.03, 0.2, abs(dA - dB)) * smoothstep(0.1, 0.6, b);
  float px = -d / fw;                     // depth inside the ink, in device pixels
  float band = 1.0 - smoothstep(uRimPx * 0.45, uRimPx, px);
  float rim = band * moving * uAccent.a * 0.9;
  vec3 col = mix(uInk, uAccent.rgb, rim);

  float a = alpha * uInkA;
  outColor = vec4(col * a, a);
}`;

interface FieldTextures {
  sdf: WebGLTexture;
  cov: WebGLTexture;
}

interface Renderer {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  u: Record<string, WebGLUniformLocation | null>;
  textures: Map<string, FieldTextures>;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn("GlyphMorph shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createRenderer(gl: WebGL2RenderingContext): Renderer | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  if (!vao || !buf) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const names = ["uA", "uB", "uGA", "uGB", "uTexel", "uTexEm", "uBaseY", "uT", "uStagger", "uEase", "uTime", "uTension", "uEm", "uSpan", "uInk", "uInkA", "uAccent", "uMode", "uSeed", "uRimPx"];
  const u: Renderer["u"] = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return { gl, prog, vao, buf, u, textures: new Map() };
}

function uploadField(r: Renderer, key: string, field: Field): FieldTextures | null {
  const cached = r.textures.get(key);
  if (cached) return cached;
  const { gl } = r;
  const sdf = gl.createTexture();
  const cov = gl.createTexture();
  if (!sdf || !cov) return null;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.bindTexture(gl.TEXTURE_2D, sdf);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, field.w, field.h, 0, gl.RED, gl.FLOAT, field.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, cov);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, field.w, field.h, 0, gl.RED, gl.UNSIGNED_BYTE, field.cov);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const pair = { sdf, cov };
  r.textures.set(key, pair);
  return pair;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Frame {
  a: number;
  b: number;
  t: number;
}

export function GlyphMorph({
  words: wordsProp = DEFAULT_WORDS,
  interval = 1600,
  duration = 1500,
  easing = "inOutCubic",
  stagger = 0.4,
  tension = 0.6,
  color,
  accentColor,
  tone: toneProp,
  fontSize = 168,
  fontWeight = 640,
  fontFamily,
  autoplay = true,
  index,
  startIndex = 0,
  progress,
  announce = false,
  ariaLabel,
  className,
  onWordChange,
}: GlyphMorphProps) {
  const tone = useBjorkTone(toneProp);
  const reducedMotion = useReducedMotion() ?? false;
  const gl2 = useSyncExternalStore(subscribeNoop, hasWebGL2, getServerSupport);

  const wordsKey = wordsProp.join("\u0000");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const words = useMemo(() => (wordsProp.length ? wordsProp.slice() : [""]), [wordsKey]);
  const count = words.length;
  const first = ((startIndex % count) + count) % count;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const srRef = useRef<HTMLSpanElement>(null);
  const { width } = useElementSize(wrapRef);

  const [fontsReady, setFontsReady] = useState(false);
  const [family, setFamily] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let alive = true;
    const el = wrapRef.current;
    if (el) setFamily(fontFamily ?? getComputedStyle(el).fontFamily ?? "sans-serif");
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) {
      setFontsReady(true);
      return;
    }
    fonts.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, [fontFamily]);

  // Make sure the exact weight is loaded before we rasterise with it.
  const [weightReady, setWeightReady] = useState<string>("");
  useEffect(() => {
    if (!fontsReady || !family) return;
    let alive = true;
    const spec = `${fontWeight} 64px ${family}`;
    const done = () => alive && setWeightReady(spec);
    document.fonts.load(spec, words.join(" ")).then(done, done);
    return () => {
      alive = false;
    };
  }, [fontsReady, family, fontWeight, words]);

  const layout = useMemo(() => {
    if (!weightReady || !family || width < 8) return null;
    return computeLayout(width, words, family, fontWeight, fontSize);
  }, [weightReady, family, width, words, fontWeight, fontSize]);

  // Colours
  const palette = BJORK_PALETTE[tone];
  const ink = useMemo(() => rgba(color ?? palette.text), [color, palette.text]);
  const accent = useMemo(() => rgba(accentColor ?? (tone === "light" ? "#e2560f" : "#ec5c13")), [accentColor, tone]);

  // Mutable engine state
  const fieldsRef = useRef(new Map<string, Field>());
  const rendererRef = useRef<Renderer | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const dprRef = useRef(1);
  const dirtyRef = useRef(true);
  const [seed] = useState(() => Math.random() * 40);
  const seedRef = useRef(seed);
  const stateRef = useRef({ idx: first, next: first, morphing: false, elapsed: 0, holdUntil: 0, time: 0 });
  const timerRef = useRef<number | null>(null);

  const propsRef = useRef({ interval, duration, easing, stagger, tension, ink, accent, autoplay, index, progress, reducedMotion, onWordChange, announce });
  useEffect(() => {
    propsRef.current = { interval, duration, easing, stagger, tension, ink, accent, autoplay, index, progress, reducedMotion, onWordChange, announce };
    dirtyRef.current = true;
  });

  const getField = useCallback(
    (i: number): Field | null => {
      if (!layout) return null;
      const word = words[i] ?? "";
      const key = `${word}|${layout.key}|${dprRef.current}`;
      let f = fieldsRef.current.get(key) ?? null;
      if (!f) {
        f = buildField(word, layout, dprRef.current);
        if (!f) return null;
        if (fieldsRef.current.size > 16) {
          const oldest = fieldsRef.current.keys().next().value;
          if (oldest !== undefined) fieldsRef.current.delete(oldest);
        }
        fieldsRef.current.set(key, f);
      }
      return f;
    },
    [layout, words],
  );

  const fieldKey = useCallback(
    (i: number) => (layout ? `${words[i] ?? ""}|${layout.key}|${dprRef.current}` : ""),
    [layout, words],
  );

  // Draw one frame: morph from word a to word b at linear progress t.
  const draw = useCallback(
    (fr: Frame) => {
      const canvas = canvasRef.current;
      if (!canvas || !layout) return;
      const p = propsRef.current;
      const fa = getField(fr.a);
      const fb = fr.b === fr.a ? fa : getField(fr.b);
      if (!fa || !fb) return;
      const r = rendererRef.current;
      if (r) {
        const { gl, u } = r;
        if (gl.isContextLost()) return;
        // Evict textures whose layout is stale.
        if (r.textures.size > 8) {
          const keep = new Set([fieldKey(fr.a), fieldKey(fr.b)]);
          for (const [k, tex] of r.textures) {
            if (!keep.has(k)) {
              gl.deleteTexture(tex.sdf);
              gl.deleteTexture(tex.cov);
              r.textures.delete(k);
            }
          }
        }
        const ta = uploadField(r, fieldKey(fr.a), fa);
        const tb = uploadField(r, fieldKey(fr.b), fb);
        if (!ta || !tb) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(r.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ta.sdf);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tb.sdf);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, ta.cov);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, tb.cov);
        gl.uniform1i(u.uA, 0);
        gl.uniform1i(u.uB, 1);
        gl.uniform1i(u.uGA, 2);
        gl.uniform1i(u.uGB, 3);
        gl.uniform2f(u.uTexel, 1 / fa.w, 1 / fa.h);
        gl.uniform1f(u.uTexEm, fa.texEm);
        gl.uniform1f(u.uBaseY, (layout.baseline - layout.fontSize * 0.36) / layout.height);
        gl.uniform1f(u.uT, fr.t);
        gl.uniform1f(u.uStagger, Math.max(0, Math.min(1.5, p.stagger)));
        gl.uniform1i(u.uEase, EASE_INDEX[p.easing] ?? 0);
        gl.uniform1f(u.uTime, stateRef.current.time);
        gl.uniform1f(u.uTension, Math.max(0, Math.min(1.5, p.tension)));
        gl.uniform2f(u.uEm, layout.fontSize / layout.width, layout.fontSize / layout.height);
        const span = Math.max(fa.inkWidth, fb.inkWidth) / layout.width;
        gl.uniform2f(u.uSpan, 0.5 - span / 2, 0.5 + span / 2);
        gl.uniform3f(u.uInk, p.ink[0], p.ink[1], p.ink[2]);
        gl.uniform1f(u.uInkA, p.ink[3]);
        gl.uniform4f(u.uAccent, p.accent[0], p.accent[1], p.accent[2], p.accent[3]);
        gl.uniform1f(u.uMode, p.reducedMotion ? 1 : 0);
        gl.uniform1f(u.uSeed, seedRef.current);
        gl.uniform1f(u.uRimPx, Math.max(1.5, Math.min(5, layout.fontSize * dprRef.current * 0.018)));
        gl.bindVertexArray(r.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        return;
      }
      // Canvas2D fallback: a soft blurred crossfade.
      const ctx = ctx2dRef.current;
      if (!ctx) return;
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.width, layout.height);
      setType(ctx, layout.weight, layout.fontSize, layout.family);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const [cr, cg, cb, ca] = p.ink;
      ctx.fillStyle = `rgba(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)},${ca})`;
      const t = fr.t * fr.t * (3 - 2 * fr.t);
      const bump = 4 * t * (1 - t);
      const blur = p.reducedMotion ? 0 : bump * layout.fontSize * 0.06;
      const trail = TRACKING_EM * layout.fontSize;
      const pass = (word: string, alpha: number) => {
        if (alpha <= 0.002) return;
        ctx.globalAlpha = alpha;
        ctx.filter = blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : "none";
        ctx.fillText(word, layout.width / 2 - trail / 2, layout.baseline);
      };
      pass(words[fr.a] ?? "", 1 - t);
      if (fr.b !== fr.a) pass(words[fr.b] ?? "", t);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
    },
    [layout, words, getField, fieldKey],
  );

  // Context setup. The canvas is created here rather than in JSX so a remount (StrictMode,
  // fast refresh) never inherits a context we already lost on cleanup.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "pointer-events-none absolute left-0 top-0 block";
    wrap.prepend(canvas);
    canvasRef.current = canvas;
    const detach = () => {
      canvas.remove();
      if (canvasRef.current === canvas) canvasRef.current = null;
    };
    if (gl2) {
      const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) {
        setFailed(true);
        return detach;
      }
      const init = () => {
        rendererRef.current = createRenderer(gl);
        if (!rendererRef.current && !gl.isContextLost()) setFailed(true);
        dirtyRef.current = true;
        setEpoch((n) => n + 1);
      };
      const onLost = (e: Event) => {
        e.preventDefault();
        rendererRef.current = null;
      };
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", init);
      init();
      return () => {
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", init);
        const r = rendererRef.current;
        if (r && !gl.isContextLost()) {
          for (const tex of r.textures.values()) {
            gl.deleteTexture(tex.sdf);
            gl.deleteTexture(tex.cov);
          }
          gl.deleteBuffer(r.buf);
          gl.deleteVertexArray(r.vao);
          gl.deleteProgram(r.prog);
        }
        rendererRef.current = null;
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        detach();
      };
    }
    const init2d = () => {
      ctx2dRef.current = canvas.getContext("2d");
      if (!ctx2dRef.current) setFailed(true);
      setEpoch((n) => n + 1);
    };
    init2d();
    return () => {
      ctx2dRef.current = null;
      detach();
    };
  }, [gl2]);

  // Size the canvas when the layout changes; fields rebuild lazily.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    dprRef.current = sizeCanvas(canvas, layout.width, layout.height, defaultMaxDpr());
    // Drop fields from older layouts.
    for (const k of fieldsRef.current.keys()) if (!k.includes(`|${layout.key}|`)) fieldsRef.current.delete(k);
    dirtyRef.current = true;
  }, [layout, epoch]);

  const announceWord = useCallback(
    (i: number) => {
      const node = srRef.current?.lastChild;
      if (node && node.nodeType === Node.TEXT_NODE) node.nodeValue = words[i] ?? "";
      propsRef.current.onWordChange?.(i, words[i] ?? "");
    },
    [words],
  );

  // Reset the sequence when the word list changes.
  useEffect(() => {
    const st = stateRef.current;
    st.idx = st.next = first;
    st.morphing = false;
    st.elapsed = 0;
    st.holdUntil = 0;
    dirtyRef.current = true;
  }, [words, first]);

  const loopRef = useRef<{ wake: () => void }>({ wake: () => {} });

  const frame = useCallback(
    (dt: number) => {
      if (!layout) return false;
      const p = propsRef.current;
      const st = stateRef.current;

      if (p.progress !== undefined && count > 1) {
        st.time = 1.7; // a fixed, pleasant noise phase for the frozen frame
        const t = Math.max(0, Math.min(1, p.progress));
        draw({ a: st.idx, b: (st.idx + 1) % count, t });
        dirtyRef.current = false;
        return false;
      }

      const now = performance.now();
      if (!st.morphing) {
        let target: number | null = null;
        if (p.index !== undefined) {
          const want = ((p.index % count) + count) % count;
          if (want !== st.idx) target = want;
        } else if (p.autoplay && count > 1) {
          if (!st.holdUntil) st.holdUntil = now + p.interval;
          if (now >= st.holdUntil) target = (st.idx + 1) % count;
        }
        if (target === null) {
          if (dirtyRef.current) {
            draw({ a: st.idx, b: st.idx, t: 0 });
            dirtyRef.current = false;
          }
          // Warm the next field while idle so the morph starts without a hitch.
          if (count > 1) getField((st.idx + 1) % count);
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = null;
          if (p.index === undefined && p.autoplay && count > 1) {
            timerRef.current = window.setTimeout(() => loopRef.current.wake(), Math.max(16, st.holdUntil - now));
          }
          return false;
        }
        st.morphing = true;
        st.next = target;
        st.elapsed = 0;
      }

      const dur = p.reducedMotion ? Math.min(450, p.duration) : p.duration;
      st.elapsed += dt * 1000;
      st.time += dt;
      const t = Math.min(1, st.elapsed / Math.max(1, dur));
      draw({ a: st.idx, b: st.next, t });
      if (t >= 1) {
        st.idx = st.next;
        st.morphing = false;
        st.holdUntil = now + p.interval;
        dirtyRef.current = true;
        announceWord(st.idx);
      }
      return true;
    },
    [layout, count, draw, getField, announceWord],
  );

  const loop = useVisibleLoop(wrapRef, frame, { enabled: !failed });
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  // Wake the loop whenever something visible changes.
  useEffect(() => {
    dirtyRef.current = true;
    loop.wake();
  }, [loop, layout, epoch, ink, accent, index, progress, autoplay, reducedMotion, words, easing, stagger, tension]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const height = layout ? layout.height : Math.round(Math.min(fontSize, 120) * LINE_HEIGHT);

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full select-none", className)}
      style={{ height, color: color ?? palette.text }}
      data-glyph-morph=""
    >
      <span
        ref={srRef}
        className={failed ? "absolute inset-0 flex items-center justify-center text-[clamp(2rem,8vw,6rem)] font-semibold tracking-tight" : "sr-only"}
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? "true" : undefined}
      >
        {ariaLabel ? <span className="sr-only">{`${ariaLabel}: `}</span> : null}
        {words[first]}
      </span>
    </div>
  );
}

export default GlyphMorph;
