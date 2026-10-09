"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import NextImage from "next/image";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { hashString } from "@/components/bjork-ui/_core/random";

export type MosaicPalette = "ember" | "ocean" | "mono" | [string, string, string, string];

export interface MosaicSettleProps {
  src: string;
  alt: string;
  caption?: ReactNode;
  pending?: boolean;
  aspectRatio?: number;
  rounded?: number;
  palette?: MosaicPalette;
  mechanic?: "organic" | "sweep";
  /** Sweep origin in frame space, 0 to 1. [0, 0] is the top-left corner. */
  origin?: [number, number];
  cellSize?: number;
  duration?: number;
  onSettled?: () => void;
  onError?: () => void;
  /** Images that `attract` cycles through. Falls back to `src`. */
  srcList?: string[];
  /** Posed frame: renders this settle progress (0 = churn at t 0, 1 = fully resolved) once, with no loop. */
  progress?: number;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

type Rgb = [number, number, number];

const PALETTES: Record<"ember" | "ocean" | "monoDark" | "monoLight", string[]> = {
  ember: ["#140904", "#5a1f08", "#ec5c13", "#ffb27a"],
  ocean: ["#04101a", "#0d3b5c", "#1f7fb0", "#9fd6f0"],
  monoDark: ["#0b0b0b", "#2a2a2a", "#6a6a6a", "#d8d8d8"],
  monoLight: ["#f7f5ef", "#e1d7c8", "#a49b8e", "#3a3a3a"],
};

// Attract timeline: churn for 1.8s, then release (settle, fade and hold) for 2.6s, then the next image.
const ATTRACT_CHURN_MS = 1800;
const ATTRACT_RELEASE_MS = 2600;
const ATTRACT_RESUME_MS = 4000;
const FADE_MS = 200;
const FALLBACK_FADE_MS = 400;
// Plan: DPR capped at 1.5.
const MAX_DPR = 1.5;
// Decoded plates kept as textures on the shared context, so Regenerate and attract never re-upload.
const TEXTURE_CACHE = 12;
// Grace period before the shared context is released, so a StrictMode or keyed remount reuses it.
const DISPOSE_DELAY_MS = 1000;

function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function resolvePalette(palette: MosaicPalette, tone: BjorkTone): string[] {
  if (Array.isArray(palette)) return palette;
  if (palette === "mono") return tone === "light" ? PALETTES.monoLight : PALETTES.monoDark;
  return PALETTES[palette];
}

// Module-level sources: compiled once, shared by every instance.
const VERT = /* glsl */ `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uSettle;
uniform float uTime;
uniform vec2 uCells;
uniform vec3 uPalette[4];
uniform float uMechanic;
uniform vec2 uOrigin;
uniform float uImageAspect;
uniform float uFrameAspect;
uniform float uSeed;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// Value noise in 0..1.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 paletteAt(float i) {
  if (i < 0.5) return uPalette[0];
  if (i < 1.5) return uPalette[1];
  if (i < 2.5) return uPalette[2];
  return uPalette[3];
}

// Cover fit: maps frame uv to image uv, the same crop as object-fit: cover.
vec2 coverUv(vec2 uv) {
  float r = uFrameAspect / uImageAspect;
  vec2 o = uv;
  if (r > 1.0) o.y = (uv.y - 0.5) / r + 0.5;
  else o.x = (uv.x - 0.5) * r + 0.5;
  return o;
}

float originDist(vec2 p) {
  return length((p - uOrigin) * vec2(uFrameAspect, 1.0));
}

float maxOriginDist() {
  return max(max(originDist(vec2(0.0, 0.0)), originDist(vec2(1.0, 0.0))),
             max(originDist(vec2(0.0, 1.0)), originDist(vec2(1.0, 1.0))));
}

void main() {
  vec2 cell = floor(vUv * uCells);
  vec2 cc = (cell + 0.5) / uCells;
  float h = hash(cell + uSeed);

  // Pending churn: quantised noise picks a palette index, plus a small brightness flicker.
  float n = vnoise(cell * 0.35 + vec2(uTime * 0.6 + uSeed, uSeed * 0.37));
  float idx = floor(clamp(n, 0.0, 0.999) * 4.0);
  vec3 pend = paletteAt(idx) + (h - 0.5) * 0.08;

  // Settle delay per cell.
  float delay;
  if (uMechanic < 0.5) {
    delay = 0.6 * h + 0.4 * vnoise(cell * 0.12 + uSeed);
  } else {
    delay = 0.85 * originDist(cc) / maxOriginDist() + 0.15 * h;
  }
  float local = smoothstep(delay, delay + 0.15, uSettle * 1.15);

  // Cells sample the image at their centre, then de-pixelate over the last 15 percent.
  float depix = smoothstep(0.85, 1.0, uSettle);
  vec2 suv = mix(cc, vUv, depix);
  vec3 texel = texture2D(uTex, coverUv(suv)).rgb;

  gl_FragColor = vec4(mix(pend, texel, local), 1.0);
}
`;

// One WebGL context and one compiled program for every MosaicSettle on the page. Each frame renders into a
// corner of the shared drawing buffer and copies it onto its own 2D canvas, so Replay and Regenerate never
// create a context or compile a shader. Contexts are a scarce browser resource (Chrome keeps about 16).
interface SharedGL {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  u: Record<
    | "uTex"
    | "uSettle"
    | "uTime"
    | "uCells"
    | "uPalette"
    | "uMechanic"
    | "uOrigin"
    | "uImageAspect"
    | "uFrameAspect"
    | "uSeed",
    WebGLUniformLocation | null
  >;
  placeholder: WebGLTexture;
  textures: Map<string, WebGLTexture>;
  width: number;
  height: number;
  lost: boolean;
}

let shared: SharedGL | null = null;
let sharedUnsupported = false;
let sharedUsers = 0;
let disposeTimer = 0;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function createShared(): SharedGL | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const placeholder = gl.createTexture();
  if (!vs || !fs || !program || !buffer || !placeholder) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(program);

  // One oversized triangle covers the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // A 1x1 placeholder keeps the sampler complete until the real image is uploaded.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, placeholder);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  const loc = (name: string) => gl.getUniformLocation(program, name);
  const state: SharedGL = {
    canvas,
    gl,
    program,
    buffer,
    u: {
      uTex: loc("uTex"),
      uSettle: loc("uSettle"),
      uTime: loc("uTime"),
      uCells: loc("uCells"),
      uPalette: loc("uPalette"),
      uMechanic: loc("uMechanic"),
      uOrigin: loc("uOrigin"),
      uImageAspect: loc("uImageAspect"),
      uFrameAspect: loc("uFrameAspect"),
      uSeed: loc("uSeed"),
    },
    placeholder,
    textures: new Map(),
    width: 1,
    height: 1,
    lost: false,
  };
  gl.uniform1i(state.u.uTex, 0);
  canvas.addEventListener("webglcontextlost", () => {
    // Recreated on the next draw. Nothing on the lost context is touched again.
    state.lost = true;
    if (shared === state) shared = null;
  });
  return state;
}

// The shared context, created on first use. Null when WebGL is unavailable (the CSS fallback takes over).
function getShared(): SharedGL | null {
  if (shared && !shared.lost) return shared;
  if (sharedUnsupported) return null;
  shared = createShared();
  if (!shared) sharedUnsupported = true;
  return shared;
}

function disposeShared() {
  const s = shared;
  shared = null;
  if (!s || s.lost) return;
  const { gl } = s;
  s.textures.forEach((tex) => gl.deleteTexture(tex));
  s.textures.clear();
  gl.deleteTexture(s.placeholder);
  gl.deleteBuffer(s.buffer);
  gl.deleteProgram(s.program);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

function retainShared() {
  sharedUsers++;
  window.clearTimeout(disposeTimer);
}

function releaseShared() {
  sharedUsers = Math.max(0, sharedUsers - 1);
  if (sharedUsers > 0) return;
  window.clearTimeout(disposeTimer);
  disposeTimer = window.setTimeout(() => {
    if (sharedUsers === 0) disposeShared();
  }, DISPOSE_DELAY_MS);
}

// Texture for a decoded image, uploaded once per source and kept in a small LRU shared by every frame.
function textureFor(s: SharedGL, img: HTMLImageElement): WebGLTexture {
  const { gl } = s;
  const key = img.src;
  const hit = s.textures.get(key);
  if (hit) {
    s.textures.delete(key);
    s.textures.set(key, hit);
    return hit;
  }
  const tex = gl.createTexture();
  if (!tex) return s.placeholder;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Throws a SecurityError for a cross-origin image without CORS; the caller falls back to the CSS surface.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  s.textures.set(key, tex);
  if (s.textures.size > TEXTURE_CACHE) {
    const [oldKey, oldTex] = s.textures.entries().next().value as [string, WebGLTexture];
    s.textures.delete(oldKey);
    gl.deleteTexture(oldTex);
  }
  return tex;
}

interface LiveState {
  pending: boolean;
  reduce: boolean;
  decoded: HTMLImageElement | null;
  duration: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  mechanic: "organic" | "sweep";
  ox: number;
  oy: number;
  pal: Float32Array;
  src: string;
  seed: number;
  progress: number | undefined;
}

const INITIAL_LIVE: LiveState = {
  pending: false,
  reduce: false,
  decoded: null,
  duration: 900,
  width: 0,
  height: 0,
  cols: 1,
  rows: 1,
  mechanic: "organic",
  ox: 0,
  oy: 0,
  pal: new Float32Array(12),
  src: "",
  seed: 0,
  progress: undefined,
};

// The visible surface of one frame: a 2D canvas the shared render is copied onto.
interface View {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dead: boolean;
}

// Renders one frame on the shared context and copies it to the view. Returns false when WebGL is gone.
function draw(view: View, s: LiveState, settle: number, time: number): boolean {
  const g = getShared();
  if (!g) return false;
  const { gl, u } = g;
  const pw = view.canvas.width;
  const ph = view.canvas.height;
  if (pw < 1 || ph < 1) return true;
  // The shared buffer only grows, so frames of different sizes never reallocate it per draw.
  if (pw > g.width || ph > g.height) {
    g.width = Math.max(g.width, pw);
    g.height = Math.max(g.height, ph);
    g.canvas.width = g.width;
    g.canvas.height = g.height;
  }
  gl.viewport(0, 0, pw, ph);
  gl.activeTexture(gl.TEXTURE0);
  if (s.decoded) gl.bindTexture(gl.TEXTURE_2D, textureFor(g, s.decoded));
  else gl.bindTexture(gl.TEXTURE_2D, g.placeholder);
  gl.uniform1f(u.uTime, time);
  gl.uniform1f(u.uSettle, settle);
  gl.uniform2f(u.uCells, s.cols, s.rows);
  gl.uniform1f(u.uFrameAspect, s.width / s.height);
  gl.uniform1f(u.uImageAspect, s.decoded ? s.decoded.naturalWidth / s.decoded.naturalHeight : 1);
  gl.uniform1f(u.uMechanic, s.mechanic === "sweep" ? 1 : 0);
  gl.uniform2f(u.uOrigin, s.ox, s.oy);
  gl.uniform3fv(u.uPalette, s.pal);
  gl.uniform1f(u.uSeed, s.seed);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  // The viewport sits at the bottom-left of the buffer, which is the bottom rows of the canvas image.
  view.ctx.drawImage(g.canvas, 0, g.height - ph, pw, ph, 0, 0, pw, ph);
  return true;
}

function subscribeNoop() {
  return () => {};
}
function getMounted() {
  return true;
}
function getServerMounted() {
  return false;
}

export function MosaicSettle({
  src,
  alt,
  caption,
  pending = false,
  aspectRatio = 4 / 3,
  rounded = 16,
  palette = "ember",
  mechanic = "organic",
  origin = [0, 0],
  cellSize = 14,
  duration = 900,
  onSettled,
  onError,
  srcList,
  progress,
  tone: toneProp,
  attract = false,
  className,
}: MosaicSettleProps) {
  const tone = useBjorkTone(toneProp);
  // Hydration-safe: the server and first client render assume no reduced motion.
  const reducedRaw = useReducedMotion();
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const reduce = mounted && reducedRaw === true;

  // Attract: cycle through srcList, churning, then releasing. Timers, not frames, so it stays cheap.
  const list = srcList && srcList.length > 0 ? srcList : [src];
  const attractOn = attract && !reduce;
  const [attractStep, setAttractStep] = useState<0 | 1>(0);
  const [attractIdx, setAttractIdx] = useState(0);
  const [attractPaused, setAttractPaused] = useState(false);
  const resumeTimer = useRef(0);

  const effSrc = attractOn ? list[attractIdx % list.length] : src;
  const effPending = pending || (attractOn && attractStep === 0);

  const [decoded, setDecoded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const [fadeOn, setFadeOn] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [prevPending, setPrevPending] = useState(effPending);

  // A rising edge of `pending` after the image has settled re-churns: clear the done latch.
  if (prevPending !== effPending) {
    setPrevPending(effPending);
    if (effPending) {
      setDoneFor(null);
      setFadeOn(false);
    }
  }

  const decodedImg = decoded && decoded.src === effSrc ? decoded.img : null;
  const isFailed = failed === effSrc;
  const settled = doneFor === effSrc;
  const fallbackMode = glFailed && !isFailed;
  const showCanvas = !glFailed && !isFailed && !settled;
  const fallbackDone = fallbackMode && decodedImg !== null && !effPending;
  const done = !isFailed && (fallbackMode ? fallbackDone : settled);
  const busy = !isFailed && !done;
  const imgShown = !isFailed && (fallbackMode ? fallbackDone : settled || fadeOn);

  const figureRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const phaseRef = useRef<"churn" | "settle">("churn");
  const phaseSrcRef = useRef("");
  const settleStartRef = useRef(0);
  const live = useRef<LiveState>(INITIAL_LIVE);
  const cbRef = useRef<{ onSettled?: () => void; onError?: () => void }>({});

  const size = useElementSize(frameRef);
  const colors = resolvePalette(palette, tone);
  const tokens = BJORK_PALETTE[tone];
  const cssVars = {
    "--bjork-border": tokens.border,
    "--bjork-text-muted": tokens.textMuted,
    "--bjork-text-soft": tokens.textSoft,
    "--bjork-accent": tokens.accent,
  } as CSSProperties;
  const gradient = `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 35%, ${colors[2]} 68%, ${colors[3]} 100%)`;

  // Effects run in declaration order. Keep the live snapshot first so later effects see fresh values.
  useEffect(() => {
    cbRef.current = { onSettled, onError };
    live.current = {
      pending: effPending,
      reduce,
      decoded: decodedImg,
      duration,
      width: size.width,
      height: size.height,
      cols: Math.max(1, Math.round(size.width / cellSize)),
      rows: Math.max(1, Math.round(size.height / cellSize)),
      mechanic,
      ox: origin[0],
      oy: 1 - origin[1],
      pal: new Float32Array(colors.flatMap(hexToRgb)),
      src: effSrc,
      // Per-image offset, so frames side by side never churn in lockstep.
      seed: (hashString(effSrc) % 997) / 7,
      progress,
    };
  });

  // Decode once per source. The texture is uploaded from this decoded image.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = effSrc;
    img.decode().then(
      () => {
        if (alive) setDecoded({ src: effSrc, img });
      },
      () => {
        if (alive) {
          setFailed(effSrc);
          cbRef.current.onError?.();
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [effSrc]);

  // Holds the shared WebGL context for as long as this frame is mounted; the last unmount releases it.
  useEffect(() => {
    retainShared();
    return releaseShared;
  }, []);

  // The 2D view canvas mounts while unsettled. The shared context is created (and the program compiled) on the
  // first mount only; later churns reuse it.
  useEffect(() => {
    if (!showCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = getShared() ? canvas.getContext("2d") : null;
    if (!ctx) {
      requestAnimationFrame(() => setGlFailed(true));
      return;
    }
    const view: View = { canvas, ctx, dead: false };
    viewRef.current = view;
    phaseRef.current = "churn";
    phaseSrcRef.current = "";
    return () => {
      // Mark dead first so a frame that is already queued never draws to an unmounted canvas.
      view.dead = true;
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [showCanvas]);

  // One frame function drives churn, settle and the static reduced-motion frame.
  const frame = (_dt: number, t: number): boolean => {
    const s = live.current;
    const view = viewRef.current;
    if (!view || view.dead) return false;
    if (!s.width || !s.height) return true;

    // Posed: one static frame at the given progress, then idle. Redrawn when the image decodes or progress changes.
    if (s.progress !== undefined) {
      try {
        if (!draw(view, s, Math.min(1, Math.max(0, s.progress)), 0)) setGlFailed(true);
      } catch {
        setGlFailed(true);
      }
      return false;
    }

    if (phaseSrcRef.current !== s.src) {
      phaseSrcRef.current = s.src;
      phaseRef.current = "churn";
    }
    if (s.pending && phaseRef.current === "settle") phaseRef.current = "churn";
    if (phaseRef.current === "churn" && s.decoded && !s.pending) {
      phaseRef.current = "settle";
      settleStartRef.current = t;
    }

    let settle = 0;
    let finished = false;
    if (phaseRef.current === "settle") {
      if (s.reduce) {
        settle = 1;
        finished = true;
      } else {
        const p = Math.min(1, (t - settleStartRef.current) / (s.duration / 1000));
        finished = p >= 1;
        // easeOutQuad: the cell flip spreads over most of the duration (ease.out front-loads it into ~250ms).
        settle = finished ? 1 : p * (2 - p);
      }
    }

    try {
      // Reduced motion draws one static frame: no churn time, no settle sweep.
      if (!draw(view, s, settle, s.reduce ? 0 : t)) {
        setGlFailed(true);
        return false;
      }
    } catch {
      // Texture upload can fail on cross-origin images without CORS. Fall back to the CSS surface.
      setGlFailed(true);
      return false;
    }

    if (finished) {
      const srcAtFinish = s.src;
      setFadeOn(true);
      window.setTimeout(() => {
        setFadeOn(false);
        if (!live.current.pending) setDoneFor(srcAtFinish);
      }, FADE_MS);
      return false;
    }
    if (phaseRef.current === "churn" && s.reduce) return false;
    return true;
  };

  // The loop is always subscribed. With no canvas the frame returns false at once, so data-loop reads idle.
  const { wake } = useVisibleLoop(figureRef, frame);

  // Sizes the view canvas (DPR capped at 1.5). Resizing clears it, so this also wakes a posed, idle frame.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.dead || !showCanvas || !size.width || !size.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const pw = Math.max(1, Math.round(size.width * dpr));
    const ph = Math.max(1, Math.round(size.height * dpr));
    if (view.canvas.width !== pw || view.canvas.height !== ph) {
      view.canvas.width = pw;
      view.canvas.height = ph;
    }
    wake();
  }, [size.width, size.height, showCanvas, wake]);

  useEffect(() => {
    wake();
  }, [wake, effPending, decodedImg, reduce, progress, showCanvas]);

  // Fires once per completed settle (canvas or fallback), including re-settles after a re-churn.
  useEffect(() => {
    if (done) cbRef.current.onSettled?.();
  }, [done]);

  // Attract timeline: each step is a timer, so nothing accumulates over time.
  useEffect(() => {
    if (!attractOn || attractPaused) return;
    const id = window.setTimeout(
      () => {
        if (attractStep === 0) {
          setAttractStep(1);
        } else {
          setAttractStep(0);
          setAttractIdx((i) => (i + 1) % list.length);
        }
      },
      attractStep === 0 ? ATTRACT_CHURN_MS : ATTRACT_RELEASE_MS,
    );
    return () => window.clearTimeout(id);
  }, [attractOn, attractPaused, attractStep, list.length]);

  const pauseAttract = () => {
    if (!attractOn) return;
    setAttractPaused(true);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setAttractPaused(false), ATTRACT_RESUME_MS);
  };

  return (
    <figure
      ref={figureRef}
      aria-busy={busy}
      onPointerMove={pauseAttract}
      onPointerDown={pauseAttract}
      onKeyDown={pauseAttract}
      className={cn("m-0 w-full min-w-0", className)}
      style={cssVars}
    >
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden border border-[color:var(--bjork-border)]"
        style={{ aspectRatio, borderRadius: rounded, background: colors[0] }}
      >
        {fallbackMode || isFailed ? (
          <div aria-hidden="true" className="absolute inset-0" style={{ background: gradient }} />
        ) : null}
        <NextImage
          src={effSrc}
          alt={alt}
          fill
          unoptimized
          loading="eager"
          sizes="(max-width: 768px) 100vw, 560px"
          draggable={false}
          className="object-cover"
          style={{
            opacity: imgShown ? 1 : 0,
            filter: fallbackMode && !imgShown && !reduce ? "blur(12px)" : "none",
            transition: fallbackMode
              ? `opacity ${reduce ? 200 : FALLBACK_FADE_MS}ms cubic-bezier(0.23,1,0.32,1), filter ${FALLBACK_FADE_MS}ms cubic-bezier(0.23,1,0.32,1)`
              : "none", // the canvas fades out over an opaque img, so the swap never dips
          }}
        />
        {showCanvas ? (
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
            style={{ opacity: fadeOn ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
          />
        ) : null}
        {isFailed ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <span className="font-bjork-alpha text-[12px] text-[color:var(--bjork-text-soft)]">
              Image unavailable
            </span>
          </div>
        ) : null}
      </div>
      {caption ? (
        <figcaption className="mt-2 font-bjork-alpha text-[12px] text-[color:var(--bjork-text-muted)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
