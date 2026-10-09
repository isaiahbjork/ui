"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { stepSpring, type SpringConfig, type SpringState } from "@/components/bjork-ui/_core/spring";
import { valueNoise1D } from "@/components/bjork-ui/_core/random";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";

export type BeamPhase = "idle" | "listening" | "thinking" | "speaking";
export type BeamLevel = number | (() => number | [number, number, number]);

export interface HandoffBeamProps {
  phase: BeamPhase;
  level?: BeamLevel;
  analyser?: AnalyserNode | null;
  children?: ReactNode;
  radius?: number; // 32
  reach?: number; // 120
  intensity?: number; // 1
  palette?: "ember" | "mono" | string[]; // "ember"
  gatherOffset?: number; // 0.5
  heldLevel?: number; // 0.45
  attack?: number; // 40 ms
  release?: number; // 220 ms
  threshold?: number; // 0.06
  sensitivity?: number; // 1.4
  phaseLabels?: Partial<Record<BeamPhase, string>>;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const DEFAULT_LABELS: Record<BeamPhase, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

// Lobe x-fractions, base widths and the band each lobe reads (0 low, 1 mid, 2 high).
const LOBE_X = [0.5, 0.34, 0.66, 0.18, 0.82];
const LOBE_W = [0.3, 0.22, 0.22, 0.18, 0.18];
const LOBE_BAND = [0, 1, 1, 2, 2];

const GATHER_SPRING: SpringConfig = { stiffness: 120, damping: 20, mass: 1 };
const SPRITE_SIZE = 128;
const SWEEP_SPAN = 0.12;
const SWEEP_PERIOD = 1.6; // seconds
const IDLE_BREATH_HZ = 0.25;
const RESUME_IDLE_S = 4;
const DPR_CAP = 1.5;

// Attract schedule: listening 3s, thinking 2s, speaking 3s, idle 1.5s.
const ATTRACT_SEGMENTS: Array<{ phase: BeamPhase; until: number }> = [
  { phase: "listening", until: 3 },
  { phase: "thinking", until: 5 },
  { phase: "speaking", until: 8 },
  { phase: "idle", until: 9.5 },
];
const ATTRACT_PERIOD = 9.5;
const STATIC_RAW: [number, number, number] = [0.6, 0.45, 0.3];

const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep01(u: number): number {
  return u * u * (3 - 2 * u);
}

function bandHeight(v: number): number {
  return 0.08 + 0.9 * v;
}

function gatedHeight(v: number): number {
  return clamp01(v * 8) * bandHeight(v);
}

interface PaletteSpec {
  colors: string[]; // one per lobe
  composite: GlobalCompositeOperation;
  alpha: number;
}

function resolvePalette(palette: HandoffBeamProps["palette"], tone: BjorkTone): PaletteSpec {
  const dark = tone === "dark";
  const tokens = BJORK_PALETTE[tone];
  if (Array.isArray(palette)) {
    const colors = [0, 1, 2, 3, 4].map((i) => palette[Math.min(i, palette.length - 1)] ?? tokens.accent);
    return { colors, composite: dark ? "lighter" : "source-over", alpha: dark ? 0.9 : 0.55 };
  }
  if (palette === "mono") {
    return {
      colors: [tokens.text, tokens.text, tokens.text, tokens.text, tokens.text],
      composite: dark ? "lighter" : "source-over",
      alpha: dark ? 0.7 : 0.5,
    };
  }
  if (dark) {
    return {
      colors: [tokens.accent, "#ff8a3d", "#ff8a3d", "#ff5ea8", "#ffd1a1"],
      composite: "lighter",
      alpha: 0.9,
    };
  }
  return {
    colors: ["#d4541a", "#ef7a2e", "#ef7a2e", "#e2488e", "#f2a65c"],
    // Light surfaces wash a soft glow out; full-strength multiply keeps it ember (acceptance 6: saturation 0.38).
    composite: "multiply",
    alpha: 1,
  };
}

// Pre-rendered radial bloom: white, alpha 1 to 0 on a smoothstep falloff.
function makeBaseSprite(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const half = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  const stops = 10;
  for (let k = 0; k <= stops; k++) {
    const u = k / stops;
    gradient.addColorStop(u, `rgba(255,255,255,${(1 - smoothstep01(u)).toFixed(4)})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

function makeTintedSprite(base: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

interface Engine {
  gather: SpringState;
  spread: SpringState;
  env: [number, number, number];
  raw: [number, number, number];
  out: [number, number, number];
  bands: [number, number, number];
  now: number; // loop clock, seconds
  inputAt: number; // loop clock of the last pointer or key input, -Infinity if none
  attractT: number;
  sweepT: number; // seconds spent thinking, so the sweep starts centred on gather
  lastPhase: BeamPhase | null;
  heights: Float32Array; // lobe heights, reused every frame
  voiceListen: () => [number, number, number];
  voiceSpeak: () => [number, number, number];
  analyserNode: AnalyserNode | null;
  buf: Uint8Array | null;
  bins: Int32Array; // [lowLo, lowHi, midLo, midHi, highLo, highHi]
  spriteBase: HTMLCanvasElement | null;
  spriteColors: string[];
  tints: HTMLCanvasElement[];
}

interface Latest {
  phase: BeamPhase;
  level: BeamLevel | undefined;
  analyser: AnalyserNode | null;
  attract: boolean;
  reduce: boolean;
  palette: PaletteSpec;
  intensity: number;
  gatherOffset: number;
  heldLevel: number;
  attack: number;
  release: number;
  threshold: number;
  sensitivity: number;
  cssW: number;
  cssH: number;
}

function createEngine(phase: BeamPhase): Engine {
  const settled = phase === "idle" ? 0 : 1;
  return {
    gather: { x: phase === "thinking" ? 1 : 0, v: 0 },
    spread: { x: settled, v: 0 },
    env: [0, 0, 0],
    raw: [0, 0, 0],
    out: [0, 0, 0],
    bands: [0, 0, 0],
    now: 0,
    inputAt: Number.NEGATIVE_INFINITY,
    attractT: 0,
    sweepT: 0,
    lastPhase: null,
    heights: new Float32Array(5),
    voiceListen: createSimulatedVoice(11),
    voiceSpeak: createSimulatedVoice(29),
    analyserNode: null,
    buf: null,
    bins: new Int32Array(6),
    spriteBase: null,
    spriteColors: [],
    tints: [],
  };
}

// Fills engine.raw from a level source. Array getters are read without copying.
function readLevel(e: Engine, level: BeamLevel | undefined) {
  const s = level === undefined ? 0 : typeof level === "function" ? level() : level;
  if (Array.isArray(s)) {
    e.raw[0] = s[0] ?? 0;
    e.raw[1] = s[1] ?? 0;
    e.raw[2] = s[2] ?? 0;
  } else {
    e.raw[0] = s;
    e.raw[1] = s * 0.8;
    e.raw[2] = s * 0.6;
  }
}

function readAnalyser(e: Engine, node: AnalyserNode) {
  if (e.analyserNode !== node) {
    e.analyserNode = node;
    e.buf = new Uint8Array(node.frequencyBinCount);
    const binHz = node.context.sampleRate / node.fftSize;
    const maxBin = node.frequencyBinCount - 1;
    const range = (lo: number, hi: number) => {
      const a = Math.min(maxBin, Math.max(1, Math.ceil(lo / binHz)));
      const b = Math.min(maxBin + 1, Math.max(a + 1, Math.floor(hi / binHz)));
      return [a, b];
    };
    const [l0, l1] = range(80, 300);
    const [m0, m1] = range(300, 2000);
    const [h0, h1] = range(2000, 6000);
    e.bins.set([l0, l1, m0, m1, h0, h1]);
  }
  const buf = e.buf;
  if (!buf) return;
  node.getByteFrequencyData(buf);
  for (let b = 0; b < 3; b++) {
    const lo = e.bins[b * 2];
    const hi = e.bins[b * 2 + 1];
    let sum = 0;
    for (let k = lo; k < hi; k++) sum += buf[k];
    e.raw[b] = hi > lo ? sum / (hi - lo) / 255 : 0;
  }
}

function ensureSprites(e: Engine, colors: string[]) {
  const same =
    e.tints.length === colors.length && colors.every((c, i) => e.spriteColors[i] === c);
  if (same) return;
  if (!e.spriteBase) e.spriteBase = makeBaseSprite();
  const base = e.spriteBase;
  const cache = new Map<string, HTMLCanvasElement>();
  e.tints = colors.map((c) => {
    let tinted = cache.get(c);
    if (!tinted) {
      tinted = makeTintedSprite(base, c);
      cache.set(c, tinted);
    }
    return tinted;
  });
  e.spriteColors = colors.slice();
}

/**
 * Wraps a host (a composer, an input, a card) and draws one light along its bottom edge.
 * The light listens, gathers into a single thought, then speaks. It never swaps or blinks.
 * Canvas 2D only. The beam is drawn in the host's own bounds and clipped by `radius`.
 */
export function HandoffBeam({
  phase,
  level,
  analyser = null,
  children,
  radius = 32,
  reach = 120,
  intensity = 1,
  palette = "ember",
  gatherOffset = 0.5,
  heldLevel = 0.45,
  attack = 40,
  release = 220,
  threshold = 0.06,
  sensitivity = 1.4,
  phaseLabels,
  tone,
  attract = false,
  className,
}: HandoffBeamProps) {
  const resolvedTone = useBjorkTone(tone);
  const reducedPref = useReducedMotion();
  // Server and first client render both read "not reduced", so hydration matches.
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const reduce = mounted && reducedPref === true;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(rootRef);
  const engineRef = useRef<Engine | null>(null);

  const reachEff = size.height > 0 ? Math.min(reach, size.height) : reach;
  const paletteSpec = resolvePalette(palette, resolvedTone);
  const labels = { ...DEFAULT_LABELS, ...phaseLabels };

  // The engine holds mutable simulation state, so it lives in a ref. It is created on first use, in the loop or on input.
  const getEngine = (): Engine => {
    if (!engineRef.current) engineRef.current = createEngine(latest.current?.phase ?? phase);
    return engineRef.current;
  };

  // Everything the loop reads. Written in an effect so the render stays pure.
  const latest = useRef<Latest | null>(null);
  useEffect(() => {
    latest.current = {
      phase,
      level,
      analyser,
      attract,
      reduce,
      palette: paletteSpec,
      intensity,
      gatherOffset,
      heldLevel,
      attack,
      release,
      threshold,
      sensitivity,
      cssW: size.width,
      cssH: reachEff,
    };
  });

  const frame = (dt: number, t: number) => {
    const L = latest.current;
    const canvas = canvasRef.current;
    if (!L || !canvas) return;
    const e = getEngine();
    e.now = t;

    const cssW = L.cssW;
    const cssH = L.cssH;
    if (cssW <= 0 || cssH <= 0) return;

    // Attract drives the phase and level, unless the user is interacting.
    const inputActive = t >= e.inputAt && t - e.inputAt < RESUME_IDLE_S;
    let phaseNow: BeamPhase = L.phase;
    let levelSource: BeamLevel | undefined = L.level;
    let analyserNode: AnalyserNode | null = L.analyser;
    let staticFrame = false;
    if (L.attract) {
      if (L.reduce) {
        phaseNow = "listening";
        staticFrame = true;
        analyserNode = null;
      } else if (!inputActive) {
        e.attractT = (e.attractT + dt) % ATTRACT_PERIOD;
        let seg = ATTRACT_SEGMENTS[0];
        for (let k = 0; k < ATTRACT_SEGMENTS.length; k++) {
          if (e.attractT < ATTRACT_SEGMENTS[k].until) { seg = ATTRACT_SEGMENTS[k]; break; }
        }
        phaseNow = seg.phase;
        analyserNode = null;
        levelSource = seg.phase === "speaking" ? e.voiceSpeak : e.voiceListen;
      }
    }
    // Each thought starts centred: the sweep restarts when thinking begins.
    if (phaseNow === "thinking" && e.lastPhase !== "thinking") e.sweepT = 0;
    e.lastPhase = phaseNow;

    // Levels: raw input, then the envelope (or a direct copy under reduced motion).
    if (staticFrame) {
      e.raw[0] = STATIC_RAW[0];
      e.raw[1] = STATIC_RAW[1];
      e.raw[2] = STATIC_RAW[2];
    } else if (analyserNode) {
      readAnalyser(e, analyserNode);
    } else {
      readLevel(e, levelSource);
    }
    for (let b = 0; b < 3; b++) {
      const r = e.raw[b] < L.threshold ? 0 : e.raw[b];
      if (L.reduce) {
        e.env[b] = r;
      } else {
        const tau = Math.max(1, r > e.env[b] ? L.attack : L.release);
        e.env[b] += (r - e.env[b]) * (1 - Math.exp(-(dt * 1000) / tau));
      }
      e.out[b] = clamp01(e.env[b] * L.sensitivity);
    }

    // Gather and spread glide with springs, so phase changes are continuous.
    const gatherTarget = phaseNow === "thinking" ? 1 : 0;
    const spreadTarget = phaseNow === "idle" ? 0 : 1;
    if (L.reduce) {
      e.gather.x = gatherTarget;
      e.spread.x = spreadTarget;
      e.gather.v = 0;
      e.spread.v = 0;
    } else {
      stepSpring(e.gather, gatherTarget, GATHER_SPRING, dt);
      stepSpring(e.spread, spreadTarget, GATHER_SPRING, dt);
    }
    const g = clamp01(e.gather.x);
    const s = clamp01(e.spread.x);

    // Thinking holds every band at heldLevel. The blend follows gather, so entry and exit are continuous.
    for (let b = 0; b < 3; b++) e.bands[b] = e.out[b] * (1 - g) + L.heldLevel * g;

    // Lobe heights. Lobe 0 breathes while idle, and the other lobes sit at 0 until spread lifts them.
    const breath = L.reduce ? 0.12 : 0.12 + 0.04 * Math.sin(2 * Math.PI * IDLE_BREATH_HZ * t);
    // Silence gates a lobe to 0, so a quiet listening state never out-glows idle (acceptance 2).
    const heights = e.heights;
    heights[0] = s * gatedHeight(e.bands[0]) + (1 - s) * breath;
    for (let i = 1; i < 5; i++) heights[i] = s * gatedHeight(e.bands[LOBE_BAND[i]]);

    // Pixel buffer at half the CSS height, scaled up. The glow is soft, so this costs nothing visible.
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, DPR_CAP);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr * 0.5));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ensureSprites(e, L.palette.colors);
    ctx.setTransform(bw / cssW, 0, 0, bh / cssH, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const widthScale = 1 - 0.75 * g;
    ctx.globalCompositeOperation = L.palette.composite;
    ctx.globalAlpha = L.palette.alpha * L.intensity;
    for (let i = 0; i < 5; i++) {
      const h = heights[i];
      if (h <= 0.002) continue;
      const x = L.gatherOffset + (0.5 + (LOBE_X[i] - 0.5) * s - L.gatherOffset) * (1 - g);
      const w = LOBE_W[i] * cssW * widthScale;
      const height = h * cssH;
      const tint = e.tints[i];
      if (tint) ctx.drawImage(tint, x * cssW - w / 2, cssH - height, w, height);
    }

    // Sweep: a narrower highlight that travels across the gathered lobe. Only while thinking, never under reduced motion.
    if (phaseNow === "thinking" && !L.reduce) e.sweepT += dt;
    if (!L.reduce && g > 0.01 && e.tints[0]) {
      const sx = L.gatherOffset + SWEEP_SPAN * Math.sin((2 * Math.PI * e.sweepT) / SWEEP_PERIOD);
      const sw = 0.1 * cssW;
      const sh = bandHeight(L.heldLevel) * cssH;
      ctx.globalAlpha = 0.5 * g * L.palette.alpha * L.intensity;
      ctx.drawImage(e.tints[0], sx * cssW - sw / 2, cssH - sh, sw, sh);
    }

    // Edge line: 1px along the bottom, its span and alpha follow the energy.
    const energy = clamp01((e.bands[0] + e.bands[1] + e.bands[2]) / 3);
    const span = (0.2 + 0.6 * energy) * cssW;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = (0.35 + 0.65 * energy) * L.intensity;
    ctx.fillStyle = L.palette.colors[0];
    ctx.fillRect((cssW - span) / 2, cssH - 1, span, 1);
  };

  useVisibleLoop(rootRef, frame, {
    fpsCap: reduce ? 10 : !attract && phase === "idle" ? 30 : 0,
  });

  // Pointer or key input inside the beam pauses attract for RESUME_IDLE_S seconds.
  const noteInput = () => {
    const e = getEngine();
    e.inputAt = e.now;
  };

  return (
    <div
      ref={rootRef}
      data-phase={phase}
      onPointerDown={noteInput}
      onPointerMove={noteInput}
      onKeyDown={noteInput}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ borderRadius: radius }}
    >
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 block"
        style={{ width: "100%", height: reachEff }}
      />
      <LiveRegion message={labels[phase]} />
    </div>
  );
}

/**
 * A syllable-like level source for demos and attract. Returns the same [low, mid, high] array every call.
 * The phrase carrier is a seeded value noise, so each seed has its own rhythm.
 */
export function createSimulatedVoice(seed: number): () => [number, number, number] {
  const phrase = valueNoise1D(seed);
  const pitch = valueNoise1D(seed + 53);
  const out: [number, number, number] = [0, 0, 0];
  let t0 = -1;
  return () => {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (t0 < 0) t0 = now;
    const x = (now - t0) / 1000;
    const carrier = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.1 * x + 1.7 * pitch(x * 0.6));
    const speaking = clamp01(phrase(x * 0.7) * 2);
    const env = clamp01(carrier * carrier * speaking);
    out[0] = clamp01(env * (0.9 + 0.1 * pitch(x * 1.9)));
    out[1] = clamp01(env * (0.7 + 0.2 * pitch(x * 2.6)));
    out[2] = clamp01(env * (0.45 + 0.2 * pitch(x * 3.4)));
    return out;
  };
}
