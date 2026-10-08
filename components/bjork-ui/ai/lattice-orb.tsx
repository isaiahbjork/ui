"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { isCoarsePointer, useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { defaultMaxDpr, sizeCanvas } from "@/components/bjork-ui/_core/canvas";
import { hashString, mulberry32 } from "@/components/bjork-ui/_core/random";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { springAt } from "@/components/bjork-ui/_core/spring";
import { cubicBezier, springs } from "@/components/bjork-ui/_core/motion";

export type OrbState = "idle" | "searching" | "connecting" | "composing" | "error";

export interface LatticeOrbHit {
  lat: number;
  lon: number;
}

export interface LatticeOrbProps {
  state: OrbState;
  hits?: LatticeOrbHit[];
  dots?: number;
  size?: number;
  tilt?: number;
  speed?: number;
  sweepSpeed?: number;
  morphMs?: number;
  stagger?: number;
  seed?: string;
  label?: string;
  showCaption?: boolean;
  /** Freezes the orb at this time with no loop. Used for posed previews. */
  time?: number;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const FRONT_HALF_WIDTH = 6 * DEG;
const IDLE_SPIN = 0.15;
const SEARCH_SPIN = 0.5;
const CONNECT_SPIN = 0.2;
const MERIDIAN_RATE = 1.2;
const PULSE_S = 0.6;
const ERROR_JITTER_S = 0.3;
const ERROR_SETTLED_S = 10; // age used for static error poses, long past the spring
const ANCHOR_COUNT = 7;
const ANCHOR_SCALE = 2.2;
const ANCHOR_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [1, 4],
];
const EDGE_STEP_S = 0.4;
const EDGE_CYCLE_S = 4;
const BAND_COUNT = 5;
const MERIDIAN_SEGMENTS = 72;
const STRIDE = 6; // x, y, z, brightness, colour code (0 text, 1 accent, 2 error), size scale
const COLOR_TEXT = 0;
const COLOR_ACCENT = 1;
const COLOR_ERROR = 2;
const BUCKETS = 8;
const FRAME_SAMPLES = 120;
const EASE = cubicBezier(0.23, 1, 0.32, 1);

const ATTRACT_STEP_S = 3.5;
const ATTRACT_ERROR_S = 1.2;
const ATTRACT_HIT_S = 0.8;
const ATTRACT_HIT_CAP = 6;
const ATTRACT_IDLE_PAUSE_S = 4;
const ATTRACT_CYCLE_S = 4 * ATTRACT_STEP_S;
const ATTRACT_PERIOD_S = 4 * ATTRACT_CYCLE_S + ATTRACT_ERROR_S;

const STATE_LABEL: Record<OrbState, string> = {
  idle: "Idle",
  searching: "Searching",
  connecting: "Connecting",
  composing: "Composing",
  error: "Error",
};

const EMPTY_HITS: LatticeOrbHit[] = [];

interface Geo {
  n: number;
  base: Float32Array; // unit sphere, x y z per dot
  rank: Float32Array; // 0 at the top, 1 at the bottom
  band: Uint8Array; // latitude band 0 to 4
  noise: Float32Array; // seeded -1..1, three per dot
  anchor: Int16Array; // anchor slot 0..6, or -1
  anchorIds: Int32Array; // dot index for each anchor slot
}

function buildGeo(n: number, seed: string): Geo {
  const base = new Float32Array(n * 3);
  const rank = new Float32Array(n);
  const band = new Uint8Array(n);
  const noise = new Float32Array(n * 3);
  const anchor = new Int16Array(n).fill(-1);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    base[i * 3] = Math.cos(th) * r;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = Math.sin(th) * r;
    rank[i] = n > 1 ? i / (n - 1) : 0;
    band[i] = Math.min(BAND_COUNT - 1, Math.floor(((y + 1) / 2) * BAND_COUNT));
  }

  const nrnd = mulberry32(hashString(`${seed}:noise`));
  for (let i = 0; i < n * 3; i++) noise[i] = nrnd() * 2 - 1;

  const arnd = mulberry32(hashString(seed));
  const anchorIds = new Int32Array(ANCHOR_COUNT);
  for (let s = 0; s < ANCHOR_COUNT; s++) {
    let idx = Math.floor(arnd() * n);
    while (anchor[idx] >= 0) idx = (idx + 1) % n;
    anchor[idx] = s;
    anchorIds[s] = idx;
  }

  return { n, base, rank, band, noise, anchor, anchorIds };
}

function wrapPi(d: number): number {
  return d - TAU * Math.round(d / TAU);
}

function hitKey(h: LatticeOrbHit): string {
  return `${h.lat.toFixed(5)}:${h.lon.toFixed(5)}`;
}

// Dot whose spun position faces the hit most directly. Used when a meridian passes a hit.
function nearestDot(g: Geo, hit: LatticeOrbHit, tau: number): number {
  const ang = SEARCH_SPIN * tau;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const cl = Math.cos(hit.lat);
  const hx = cl * Math.cos(hit.lon);
  const hy = Math.sin(hit.lat);
  const hz = cl * Math.sin(hit.lon);
  let best = -2;
  let pick = 0;
  for (let i = 0; i < g.n; i++) {
    const k = i * 3;
    const x0 = g.base[k];
    const z0 = g.base[k + 2];
    const x = x0 * c + z0 * s;
    const y = g.base[k + 1];
    const z = -x0 * s + z0 * c;
    const d = x * hx + y * hy + z * hz;
    if (d > best) {
      best = d;
      pick = i;
    }
  }
  return pick;
}

interface FrameEnv {
  R: number;
  sweepSpeed: number;
  errAge: number;
  latched: Uint8Array | null;
}

// Pure target frame for a state at time tau. Writes x, y, z (unit sphere, before tilt), brightness, colour and size.
function fillTarget(state: OrbState, tau: number, g: Geo, out: Float32Array, env: FrameEnv): void {
  const { n, base, band, noise, anchor } = g;
  const phi = tau * MERIDIAN_RATE * env.sweepSpeed;
  let spin = IDLE_SPIN * tau;
  let radius = 1;
  if (state === "idle") radius = 1 + 0.02 * Math.sin((TAU * tau) / 4);
  else if (state === "searching") spin = SEARCH_SPIN * tau;
  else if (state === "connecting") spin = CONNECT_SPIN * tau;
  else if (state === "error") radius = springAt(env.errAge, springs.settle, 1, 0.9);

  // One pixel in unit-sphere space, applied only during the first 300ms of an error.
  const jitter = state === "error" && env.errAge < ERROR_JITTER_S ? 1 / env.R : 0;

  const bandAngle = [0, 0, 0, 0, 0];
  if (state === "composing") {
    for (let j = 0; j < BAND_COUNT; j++) bandAngle[j] = (0.2 + 0.25 * j) * (j % 2 ? -1 : 1) * tau;
  }

  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const ang = state === "composing" ? bandAngle[band[i]] : spin;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const x0 = base[k];
    const y0 = base[k + 1];
    const z0 = base[k + 2];
    let x = x0 * c + z0 * s;
    let y = y0;
    const z = -x0 * s + z0 * c;
    if (jitter) {
      x += noise[k] * jitter;
      y += noise[k + 1] * jitter;
    }

    let b = 0.55;
    let col = COLOR_TEXT;
    let sz = 1;
    if (state === "searching") {
      const d = wrapPi(Math.atan2(z, x) - phi);
      b = Math.abs(d) < FRONT_HALF_WIDTH ? 1 : 0.45;
    } else if (state === "composing") {
      b = band[i] === 2 ? 1 : 0.6;
    } else if (state === "connecting") {
      if (anchor[i] >= 0) {
        b = 1;
        sz = ANCHOR_SCALE;
      }
    } else if (state === "error") {
      b = 0.8;
      col = COLOR_ERROR;
    }

    if (env.latched && env.latched[i] && col !== COLOR_ERROR) {
      col = COLOR_ACCENT;
      b = 1;
    }

    const o = i * STRIDE;
    out[o] = x * radius;
    out[o + 1] = y * radius;
    out[o + 2] = z * radius;
    out[o + 3] = b;
    out[o + 4] = col;
    out[o + 5] = sz;
  }
}

interface EngineConfig {
  n: number;
  size: number;
  tilt: number;
  speed: number;
  sweepSpeed: number;
  morphMs: number;
  stagger: number;
  seed: string;
  state: OrbState;
  hits: LatticeOrbHit[];
  tone: BjorkTone;
  attract: boolean;
  reduce: boolean;
}

interface Pulse {
  dot: number;
  t0: number;
}

interface HitRecord {
  key: string;
  lat: number;
  lon: number;
}

interface AttractSlot {
  state: OrbState;
  cycle: number;
  count: number;
}

// Deterministic attract schedule for a clock value. idle, searching, connecting, composing; error after every 4th cycle.
function attractAt(clock: number): AttractSlot {
  const period = clock % ATTRACT_PERIOD_S;
  const base = Math.floor(clock / ATTRACT_PERIOD_S) * 4;
  let start = 0;
  for (let j = 0; j < 4; j++) {
    const hasError = j === 3;
    const len = ATTRACT_CYCLE_S + (hasError ? ATTRACT_ERROR_S : 0);
    if (period < start + len) {
      const u = period - start;
      const cycle = base + j;
      if (u < ATTRACT_STEP_S) return { state: "idle", cycle, count: 0 };
      if (u < 2 * ATTRACT_STEP_S) {
        const count = Math.min(ATTRACT_HIT_CAP, Math.floor((u - ATTRACT_STEP_S) / ATTRACT_HIT_S));
        return { state: "searching", cycle, count };
      }
      if (u < 3 * ATTRACT_STEP_S) return { state: "connecting", cycle, count: 0 };
      if (u < 4 * ATTRACT_STEP_S) return { state: "composing", cycle, count: 0 };
      return { state: "error", cycle, count: 0 };
    }
    start += len;
  }
  return { state: "idle", cycle: base, count: 0 };
}

function attractHitPool(cycle: number): LatticeOrbHit[] {
  const rnd = mulberry32(hashString(`attract:${cycle}`));
  const pool: LatticeOrbHit[] = [];
  for (let j = 0; j < ATTRACT_HIT_CAP; j++) {
    pool.push({ lat: (rnd() - 0.5) * 1.0, lon: rnd() * TAU });
  }
  return pool;
}

// The engine owns every mutable buffer, the morph, latches and the attract clock. React only pushes config into it.
class LatticeEngine {
  cfg: EngineConfig = {
    n: 0, size: 240, tilt: 18, speed: 1, sweepSpeed: 1, morphMs: 520, stagger: 0.35, seed: "bjork",
    state: "idle", hits: EMPTY_HITS, tone: "dark", attract: false, reduce: false,
  };
  private onShown: ((s: OrbState) => void) | null = null;

  private geo: Geo | null = null;
  private geoKey = "";
  private target = new Float32Array(0);
  private drawn = new Float32Array(0);
  private from = new Float32Array(0);
  private staticMask = new Uint8Array(0);
  private mask = new Uint8Array(0);
  private hitsRef: LatticeOrbHit[] | null = null;
  private hitList: HitRecord[] = [];
  private latch = new Map<string, number>();
  private pulses: Pulse[] = [];
  private lastPhi: number | null = null;
  private curState: OrbState | null = null;
  private hasDrawn = false;
  private morphing = false;
  private morphStart = 0;
  private errStart = 0;
  private t = 0;
  private lastInput = Number.NEGATIVE_INFINITY;
  private attractClock = 0;
  private attractShown: OrbState | null = null;
  private attractCache: { key: string; hits: LatticeOrbHit[] } = { key: "", hits: EMPTY_HITS };
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private root: HTMLElement | null = null;
  private cssSize = 0;
  private dpr = 1;
  private frameMs: number[] = [];
  private projX = new Float32Array(0);
  private projY = new Float32Array(0);
  private projD = new Float32Array(0);
  private projA = new Float32Array(0);
  private projR = new Float32Array(0);
  private projC = new Uint8Array(0);
  private bucketOf = new Uint8Array(0);
  private order = new Int32Array(0);
  private latchedCount = 0;

  attach(canvas: HTMLCanvasElement | null, root: HTMLElement | null) {
    this.root = root;
    if (canvas !== this.canvas) {
      this.canvas = canvas;
      this.cssSize = 0;
      this.ctx = null;
    }
  }

  private ensureCanvas(size: number) {
    if (!this.canvas) return;
    if (this.cssSize === size && this.ctx) return;
    this.dpr = sizeCanvas(this.canvas, size, size, defaultMaxDpr());
    this.ctx = this.canvas.getContext("2d");
    this.cssSize = size;
  }

  configure(next: EngineConfig) {
    const key = `${next.n}|${next.seed}`;
    if (key !== this.geoKey || !this.geo) {
      this.geoKey = key;
      this.geo = buildGeo(next.n, next.seed);
      const len = next.n * STRIDE;
      this.target = new Float32Array(len);
      this.drawn = new Float32Array(len);
      this.from = new Float32Array(len);
      this.staticMask = new Uint8Array(next.n);
      this.mask = new Uint8Array(next.n);
      this.projX = new Float32Array(next.n);
      this.projY = new Float32Array(next.n);
      this.projD = new Float32Array(next.n);
      this.projA = new Float32Array(next.n);
      this.projR = new Float32Array(next.n);
      this.projC = new Uint8Array(next.n);
      this.bucketOf = new Uint8Array(next.n);
      this.order = new Int32Array(next.n);
      this.hasDrawn = false;
      this.morphing = false;
      this.lastPhi = null;
      this.latch.clear();
      this.pulses = [];
      this.hitsRef = null;
      this.hitList = [];
      this.mask.fill(0);
    }
    this.cfg = next;
    this.ensureCanvas(next.size);
  }

  noteInput() {
    this.lastInput = this.t;
  }

  // Receives the attract state whenever it changes, so React can update the caption.
  listen(callback: ((s: OrbState) => void) | null) {
    this.onShown = callback;
  }

  private syncHits(hits: LatticeOrbHit[]) {
    if (hits === this.hitsRef) return;
    this.hitsRef = hits;
    const list: HitRecord[] = hits.map((h) => ({ key: hitKey(h), lat: h.lat, lon: h.lon }));
    const keys = new Set(list.map((h) => h.key));
    for (const key of Array.from(this.latch.keys())) {
      if (!keys.has(key)) this.latch.delete(key);
    }
    this.hitList = list;
    this.rebuildMask();
  }

  private rebuildMask() {
    this.mask.fill(0);
    for (const dot of this.latch.values()) this.mask[dot] = 1;
    this.latchedCount = this.latch.size;
  }

  private startMorph(t: number) {
    if (!this.hasDrawn || !this.geo) {
      this.morphing = false;
      return;
    }
    this.from.set(this.drawn);
    this.morphStart = t;
    this.morphing = true;
  }

  private checkCrossings(prev: number, now: number, tau: number, t: number) {
    const g = this.geo;
    if (!g) return;
    for (const h of this.hitList) {
      if (this.latch.has(h.key)) continue;
      const kPrev = Math.floor((prev - h.lon) / TAU);
      const kNow = Math.floor((now - h.lon) / TAU);
      if (kNow > kPrev) {
        const dot = nearestDot(g, h, tau);
        this.latch.set(h.key, dot);
        this.mask[dot] = 1;
        this.pulses.push({ dot, t0: t });
      }
    }
    this.latchedCount = this.latch.size;
  }

  private advanceBuffers(t: number) {
    const g = this.geo;
    if (!g) return;
    const { n, rank, noise } = g;
    const { target, drawn, from } = this;
    const { morphMs, stagger } = this.cfg;

    if (!this.morphing) {
      drawn.set(target);
      return;
    }

    const elapsedMs = (t - this.morphStart) * 1000;
    const total = morphMs * (1 + stagger);
    for (let i = 0; i < n; i++) {
      const delay = stagger * morphMs * rank[i];
      const raw = (elapsedMs - delay) / morphMs;
      const m = EASE(Math.min(1, Math.max(0, raw)));
      const scramble = 0.08 * Math.sin(Math.PI * m);
      const o = i * STRIDE;
      for (let c = 0; c < 3; c++) {
        drawn[o + c] = from[o + c] + (target[o + c] - from[o + c]) * m + noise[i * 3 + c] * scramble;
      }
      drawn[o + 3] = from[o + 3] + (target[o + 3] - from[o + 3]) * m;
      drawn[o + 4] = target[o + 4];
      drawn[o + 5] = from[o + 5] + (target[o + 5] - from[o + 5]) * m;
    }
    if (elapsedMs >= total) {
      this.morphing = false;
      this.setMorphAttr(false);
    }
  }

  private setMorphAttr(value: boolean) {
    if (this.root) this.root.dataset.morphing = value ? "true" : "false";
  }

  private projectAndDraw(tau: number, state: OrbState, t: number) {
    const ctx = this.ctx;
    const g = this.geo;
    const { size, tilt, tone } = this.cfg;
    if (!ctx || !g) return;

    const pal = BJORK_PALETTE[tone];
    const R = size * 0.42;
    // Blur test (alpha-weighted ink centroid, all five states): the tilted lattice already sits at 0.500 of
    // the canvas height, so there is no vertical nudge. The +1% drop the plan suggested left it 1% low.
    const cx = size / 2;
    const cy = size / 2;
    const base = size / 120;
    const cT = Math.cos(tilt * DEG);
    const sT = Math.sin(tilt * DEG);
    const n = g.n;
    const { drawn, projX, projY, projD, projA, projR, projC, bucketOf, order } = this;

    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const x = drawn[o];
      const y0 = drawn[o + 1];
      const z0 = drawn[o + 2];
      const y = y0 * cT - z0 * sT;
      const z = y0 * sT + z0 * cT;
      const d = Math.min(1, Math.max(0, (z + 1) / 2));
      projX[i] = cx + x * R;
      projY[i] = cy - y * R;
      projD[i] = z;
      projA[i] = (0.25 + 0.75 * d) * drawn[o + 3];
      projR[i] = base * (0.55 + 0.45 * d) * drawn[o + 5];
      projC[i] = drawn[o + 4];
      bucketOf[i] = Math.min(BUCKETS - 1, Math.floor(d * BUCKETS));
    }

    // Counting sort into 8 depth buckets, back to front. No full sort.
    const counts = new Int32Array(BUCKETS + 1);
    for (let i = 0; i < n; i++) counts[bucketOf[i] + 1]++;
    for (let b = 0; b < BUCKETS; b++) counts[b + 1] += counts[b];
    for (let i = 0; i < n; i++) order[counts[bucketOf[i]]++] = i;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Connecting edges sit under the dots.
    if (state === "connecting" && g.anchorIds.length) {
      const phase = tau % EDGE_CYCLE_S;
      ctx.strokeStyle = pal.accentInk;
      ctx.lineWidth = 1;
      for (let k = 0; k < ANCHOR_PAIRS.length; k++) {
        if (phase < k * EDGE_STEP_S) continue;
        const [pa, pb] = ANCHOR_PAIRS[k];
        const a = g.anchorIds[pa];
        const b = g.anchorIds[pb];
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(projX[a], projY[a]);
        ctx.lineTo(projX[b], projY[b]);
        ctx.stroke();
      }
    }

    let lastColor = -1;
    for (let j = 0; j < n; j++) {
      const i = order[j];
      if (projC[i] !== lastColor) {
        lastColor = projC[i];
        ctx.fillStyle = lastColor === COLOR_ACCENT ? pal.accent : lastColor === COLOR_ERROR ? pal.error : pal.text;
      }
      ctx.globalAlpha = projA[i];
      const r = projR[i];
      const px = projX[i];
      const py = projY[i];
      if (r < 1.6) {
        ctx.fillRect(px - r, py - r, 2 * r, 2 * r);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
      }
    }

    // Meridian: front hemisphere only.
    if (state === "searching") {
      const phi = tau * MERIDIAN_RATE * this.cfg.sweepSpeed;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      ctx.strokeStyle = pal.accentInk;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      let pen = false;
      for (let s = 0; s <= MERIDIAN_SEGMENTS; s++) {
        const lat = -Math.PI / 2 + (Math.PI * s) / MERIDIAN_SEGMENTS;
        const cl = Math.cos(lat);
        const x = cl * cp;
        const y0 = Math.sin(lat);
        const z0 = cl * sp;
        const y = y0 * cT - z0 * sT;
        const z = y0 * sT + z0 * cT;
        if (z > 0) {
          const px = cx + x * R;
          const py = cy - y * R;
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
        } else {
          pen = false;
        }
      }
      ctx.stroke();
    }

    // Search pulses on newly latched hits.
    if (this.pulses.length) {
      const alive: Pulse[] = [];
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1;
      for (const p of this.pulses) {
        const prog = (t - p.t0) / PULSE_S;
        if (prog >= 1) continue;
        alive.push(p);
        ctx.globalAlpha = 0.6 * (1 - prog);
        ctx.beginPath();
        ctx.arc(projX[p.dot], projY[p.dot], 2 + 8 * prog, 0, TAU);
        ctx.stroke();
      }
      this.pulses = alive;
    }

    ctx.globalAlpha = 1;
    if (this.root) {
      this.root.dataset.latched = String(this.latchedCount);
      this.root.dataset.drawn = String(n);
    }
  }

  private recordFrame(ms: number) {
    if (process.env.NODE_ENV === "production") return;
    this.frameMs.push(ms);
    if (this.frameMs.length > FRAME_SAMPLES) this.frameMs.shift();
    if (this.frameMs.length % 30 === 0 && this.root) {
      const sorted = [...this.frameMs].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      this.root.dataset.frameMs = p95.toFixed(2);
    }
  }

  // Draws one static pose at `t`. Every hit is latched, and there is no morph.
  drawStatic(t: number) {
    const g = this.geo;
    if (!g || !this.canvas) return;
    this.ensureCanvas(this.cfg.size);
    const state = this.cfg.state;
    const tau = t * this.cfg.speed;
    const hits = this.cfg.hits;
    this.staticMask.fill(0);
    for (const h of hits) this.staticMask[nearestDot(g, h, tau)] = 1;
    this.target.fill(0);
    fillTarget(state, tau, g, this.target, {
      R: this.cfg.size * 0.42,
      sweepSpeed: this.cfg.sweepSpeed,
      errAge: ERROR_SETTLED_S,
      latched: this.staticMask,
    });
    this.drawn.set(this.target);
    this.morphing = false;
    this.hasDrawn = true;
    this.curState = state;
    this.lastPhi = null;
    this.pulses = [];
    this.latchedCount = new Set(hits.map(hitKey)).size;
    this.setMorphAttr(false);
    this.projectAndDraw(tau, state, t);
    this.noteShown(state);
  }

  private noteShown(state: OrbState) {
    if (this.cfg.attract && this.attractShown !== state) {
      this.attractShown = state;
      this.onShown?.(state);
    }
  }

  // Called by useVisibleLoop each frame. Returns false to go idle (reduced motion).
  tick(dt: number, t: number): boolean {
    if (this.cfg.reduce) {
      this.t = t;
      this.drawStatic(0);
      return false;
    }
    const start = typeof performance !== "undefined" ? performance.now() : 0;
    this.t = t;
    if (!this.geo || !this.canvas) return true;

    let state: OrbState = this.cfg.state;
    let hits = this.cfg.hits;

    if (this.cfg.attract) {
      const paused = t - this.lastInput < ATTRACT_IDLE_PAUSE_S;
      if (!paused) this.attractClock += dt;
      const slot = attractAt(this.attractClock);
      state = slot.state;
      const key = `${slot.cycle}|${slot.count}`;
      if (this.attractCache.key !== key) {
        this.attractCache = {
          key,
          hits: slot.count > 0 ? attractHitPool(slot.cycle).slice(0, slot.count) : EMPTY_HITS,
        };
      }
      hits = this.attractCache.hits;
      this.noteShown(state);
    }

    this.syncHits(hits);

    if (state !== this.curState) {
      this.startMorph(t);
      this.curState = state;
      if (state === "error") this.errStart = t;
      if (this.morphing) this.setMorphAttr(true);
    }

    const tau = t * this.cfg.speed;
    const { sweepSpeed, size } = this.cfg;
    if (state === "searching") {
      const phi = tau * MERIDIAN_RATE * sweepSpeed;
      if (this.lastPhi !== null) this.checkCrossings(this.lastPhi, phi, tau, t);
      this.lastPhi = phi;
    } else {
      this.lastPhi = null;
    }

    fillTarget(state, tau, this.geo, this.target, {
      R: size * 0.42,
      sweepSpeed,
      errAge: t - this.errStart,
      latched: this.mask,
    });
    this.advanceBuffers(t);
    this.hasDrawn = true;
    this.projectAndDraw(tau, state, t);
    this.recordFrame(typeof performance !== "undefined" ? performance.now() - start : 0);
    return true;
  }
}

const subscribeNone = () => () => {};
const mountedClient = () => true;
const mountedServer = () => false;

function subscribeCoarse(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function LatticeOrb({
  state,
  hits,
  dots,
  size = 240,
  tilt = 18,
  speed = 1,
  sweepSpeed = 1,
  morphMs = 520,
  stagger = 0.35,
  seed = "bjork",
  label,
  showCaption = true,
  time,
  tone: toneProp,
  attract = false,
  className,
}: LatticeOrbProps) {
  const tone = useBjorkTone(toneProp);
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarsePointer, () => false);
  // Reduced motion is read only after mount, so the server render and first client render match.
  const mounted = useSyncExternalStore(subscribeNone, mountedClient, mountedServer);
  const prefersReduced = useReducedMotion();
  const reduce = mounted && !!prefersReduced;

  const n = dots ?? (coarse ? 360 : 600);
  const attractOn = attract && !reduce;
  const isStatic = time !== undefined;
  const hitList = hits ?? EMPTY_HITS;

  const [engine] = useState(() => new LatticeEngine());
  const [attractShown, setAttractShown] = useState<OrbState>("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const shown: OrbState = attractOn ? attractShown : state;
  const caption = label ?? STATE_LABEL[shown];

  useEffect(() => {
    engine.listen(setAttractShown);
    return () => engine.listen(null);
  }, [engine]);

  useEffect(() => {
    engine.attach(canvasRef.current, rootRef.current);
    engine.configure({
      n,
      size,
      tilt,
      speed,
      sweepSpeed,
      morphMs,
      stagger,
      seed,
      state,
      hits: hitList,
      tone,
      attract: attractOn,
      reduce,
    });
    if (reduce || isStatic) engine.drawStatic(time ?? 0);
  }, [engine, n, size, tilt, speed, sweepSpeed, morphMs, stagger, seed, state, hitList, tone, attractOn, reduce, isStatic, time]);

  useVisibleLoop(rootRef, (dt, t) => engine.tick(dt, t), {
    enabled: !isStatic,
    fpsCap: coarse ? 30 : 0,
  });

  return (
    <div
      ref={rootRef}
      data-state={shown}
      onPointerEnter={() => engine.noteInput()}
      onPointerMove={() => engine.noteInput()}
      onPointerDown={() => engine.noteInput()}
      onKeyDown={() => engine.noteInput()}
      className={cn("relative flex w-full select-none flex-col items-center", className)}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Agent status: ${caption}`}
        className="block"
        style={{ width: size, height: size }}
      />
      {showCaption && (
        <span
          aria-hidden="true"
          /* The caption follows the resolved tone, so an explicit light or dark tile reads on any page theme. */
          style={{ color: BJORK_PALETTE[tone].textMuted }}
          className="mt-3 block font-mono text-[11px] uppercase leading-none tabular-nums tracking-[0.1em]"
        >
          {caption}
        </span>
      )}
      {/* Attract is decorative: announce the real state only, never the demo cycle. */}
      <LiveRegion message={attractOn ? (label ?? STATE_LABEL[state]) : caption} />
    </div>
  );
}
