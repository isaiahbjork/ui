"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { cubicBezier, ease } from "@/components/bjork-ui/_core/motion";
import { sizeCanvas } from "@/components/bjork-ui/_core/canvas";

export type FlapCharset = "digits" | "alpha" | "alnum" | string | string[];

export interface FlapColumn {
  key: string;
  header: string;
  /** Width in character cells. An enum column is one word flap of this width. */
  width: number;
  charset: FlapCharset;
  align?: "left" | "right";
}

export type FlapRow = Record<string, string>;
export type FlapStatus = "ok" | "warn" | "off";

export interface FlapLedgerProps {
  columns: FlapColumn[];
  rows: FlapRow[];
  size?: "sm" | "md" | "lg";
  /** Duration of one flip (the top half plus the bottom half), in ms. */
  flapMs?: number;
  /** Delay per column away from the cascade origin, in ms. */
  stagger?: number;
  cascadeFrom?: "changed" | "left" | "right";
  /** Optional LED left of each row. */
  status?: (row: FlapRow) => FlapStatus;
  /** Announces changed rows to screen readers. */
  announceChanges?: boolean;
  ariaLabel?: string;
  tone?: BjorkTone;
  /** Cycles three built-in departure sets every 5s. Pauses on pointer input and offscreen. */
  attract?: boolean;
  className?: string;
}

const CHARSET_PRESETS: Record<"digits" | "alpha" | "alnum", string> = {
  digits: " 0123456789",
  alpha: " ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  alnum: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
};

const MAX_STEPS = 12;
const MAX_FLIPPING = 160;
const ROW_DELAY_MS = 40;
const LAND_MS = 120;
const LAND_DEG = -6;
const EDGE_FADE_PX = 24;
const ATTRACT_MS = 5000;
const ATTRACT_RESUME_MS = 4000;

// Geist Mono 500 glyphs are centred on the split line by cap height. Canvas
// metrics: ascent 1.01em, descent 0.29em, cap height 0.71em. A line-height 1 box
// puts the baseline at 0.5 + (1.01 - 0.29) / 2 = 0.86em, so the cap centre sits at
// 0.86 - 0.355 = 0.505em, 0.005em (0.1px at 20px) below the box centre. A pixel
// probe of a rendered H put the ink centre 0.13 scaled px above the cell centre.
// Nudge up by 0.005em, which is within measurement noise.
const CAP_NUDGE_EM = -0.005;
// Enum words carry letter-spacing 0.06em after the last letter. Shift right by
// half of it so the visible word stays centred.
const WORD_TRAIL_EM = 0.03;

const SIZE_SCALE = { sm: 0.72, md: 1, lg: 1.36 } as const;

interface Material {
  board: string;
  topFace: readonly [string, string];
  bottomFace: readonly [string, string];
  split: string;
  splitHighlight: string;
}

const MATERIAL: Record<BjorkTone, Material> = {
  dark: {
    board: "#0b0b0b",
    topFace: ["#1a1a1a", "#151515"],
    bottomFace: ["#131313", "#101010"],
    split: "#050505",
    splitHighlight: "rgba(255,255,255,0.04)",
  },
  light: {
    board: "#efe9dd",
    topFace: ["#fffcf6", "#f8f2e7"],
    bottomFace: ["#f5efe3", "#efe7d8"],
    split: "#e1d7c8",
    splitHighlight: "rgba(255,255,255,0.7)",
  },
};

interface Metrics {
  cellW: number;
  cellH: number;
  cellGap: number;
  radius: number;
  charFs: number;
  wordFs: number;
  headerFs: number;
  headerGap: number;
  led: number;
  ledGap: number;
  colGap: number;
  rowGap: number;
  pad: number;
  boardRadius: number;
  perspective: number;
}

function buildMetrics(size: "sm" | "md" | "lg"): Metrics {
  const k = SIZE_SCALE[size];
  return {
    cellW: 22 * k,
    cellH: 32 * k,
    cellGap: 2 * k,
    radius: 3 * k,
    charFs: 20 * k,
    wordFs: 15 * k,
    headerFs: 10 * k,
    headerGap: 8 * k,
    led: 6 * k,
    ledGap: 8 * k,
    colGap: 8 * k,
    rowGap: 6 * k,
    pad: 16 * k,
    boardRadius: 14 * k,
    perspective: 220 * k,
  };
}

/** Pixel width of a column of `width` character cells, including the gaps between them. */
function columnPx(width: number, m: Metrics): number {
  return width * (m.cellW + m.cellGap) - m.cellGap;
}

/** Cycle of states a cell flips through, in order. Blank comes first. */
function buildCycle(col: FlapColumn): string[] {
  if (Array.isArray(col.charset)) {
    const words = col.charset.map((v) => v.toUpperCase().trim().slice(0, col.width));
    return Array.from(new Set(["", ...words]));
  }
  const preset = col.charset in CHARSET_PRESETS
    ? CHARSET_PRESETS[col.charset as keyof typeof CHARSET_PRESETS]
    : col.charset;
  const chars = Array.from(new Set(Array.from(preset)));
  if (!chars.includes(" ")) chars.unshift(" ");
  return chars;
}

/** Target cell values for one row, after normalising. Missing rows are blank. */
function cellTargets(col: FlapColumn, cycle: string[], row: FlapRow | undefined): string[] {
  const raw = row?.[col.key] ?? "";
  if (Array.isArray(col.charset)) {
    const word = raw.toUpperCase().trim().slice(0, col.width);
    return [cycle.includes(word) ? word : ""];
  }
  let chars = Array.from(raw.toUpperCase()).map((ch) => (cycle.includes(ch) ? ch : " "));
  chars = chars.slice(0, col.width);
  const fill = Array.from({ length: col.width - chars.length }, () => " ");
  return col.align === "right" ? [...fill, ...chars] : [...chars, ...fill];
}

/** Forward distance through the cycle, wrapping. */
function distance(cycle: string[], from: string, to: string): number {
  const j = cycle.indexOf(to);
  if (j < 0) return 0;
  const i = Math.max(0, cycle.indexOf(from));
  return (j - i + cycle.length) % cycle.length;
}

interface FlipStep {
  from: string;
  to: string;
  last: boolean;
}

function planFlips(cycle: string[], from: string, to: string): { jump: string | null; steps: FlipStep[] } {
  const len = cycle.length;
  let i = Math.max(0, cycle.indexOf(from));
  const j = cycle.indexOf(to);
  if (j < 0) return { jump: null, steps: [] };
  let d = (j - i + len) % len;
  if (d === 0) return { jump: null, steps: [] };
  let jump: string | null = null;
  if (d > MAX_STEPS) {
    i = (j - MAX_STEPS + len) % len;
    d = MAX_STEPS;
    jump = cycle[i];
  }
  const steps: FlipStep[] = [];
  for (let k = 0; k < d; k++) {
    steps.push({ from: cycle[(i + k) % len], to: cycle[(i + k + 1) % len], last: k === d - 1 });
  }
  return { jump, steps };
}

// --- Canvas engine -----------------------------------------------------------
// The whole board is painted into one <canvas>, driven by one board-level rAF.
// This deliberately departs from the plan's "WAAPI per flap layer". A full
// board is 135 cells with two 3D-rotated halves each; as DOM layers that meant
// creating about 315 Animation objects per 70ms step and, even when the
// transforms were set directly from one rAF, re-layerizing ~270 composited
// layers every frame (under 15fps at a 4x CPU throttle). Here every active cell
// derives its step and phase from wall-clock time, only dirty cells are
// repainted, and the loop goes idle when nothing is moving. The DOM keeps the
// layout boxes (so nothing shifts) and the hidden table for assistive tech.

interface CellState {
  key: string;
  c: number;
  /** Device-pixel rect inside the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  value: string;
  target: string | null;
  // What is drawn right now.
  top: string;
  bottom: string;
  fallText: string;
  riseText: string;
  fallDeg: number; // 0 (flat) to -90 (edge-on)
  riseDeg: number; // 90 (edge-on) to 0 (flat), LAND_DEG while landing
  shade: number;
  alpha: number;
  // Active motion, valid while `mode` is not "idle".
  mode: "idle" | "flip" | "fade";
  started: boolean;
  startMs: number;
  jump: string | null;
  steps: FlipStep[];
  k: number;
  done: Promise<void>;
  resolve: (() => void) | null;
}

type CellMode = "flip" | "crossfade" | "instant";

interface Atlas {
  canvas: HTMLCanvasElement;
  /** Source x offset (device px) of each value. Width and height match the cell. */
  index: Map<string, number>;
}

interface Look {
  dpr: number;
  board: string;
  split: string;
  splitHighlight: string;
  perspective: number; // device px
}

const fallEase = cubicBezier(0.55, 0, 1, 0.45); // gravity: the top half drops
const riseEase = cubicBezier(0, 0.55, 0.45, 1); // the bottom half lifts into place
const landEase = cubicBezier(ease.out[0], ease.out[1], ease.out[2], ease.out[3]);
const FADE_MS = 120;
const STRIPS = 6;
const DEG = Math.PI / 180;

class BoardEngine {
  ctx: CanvasRenderingContext2D;
  cells = new Map<string, CellState>();
  active = new Set<CellState>();
  dirty = new Set<CellState>();
  atlases: Atlas[] = [];
  shadeSprite: HTMLCanvasElement | null = null;
  look: Look = { dpr: 1, board: "#000", split: "#000", splitHighlight: "#000", perspective: 220 };
  flapMs = 70;

  constructor(public canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("FlapLedger needs a 2D canvas context");
    this.ctx = ctx;
  }

  /** Repaints every cell, e.g. after a resize or a new atlas. */
  invalidate() {
    for (const cell of this.cells.values()) this.dirty.add(cell);
  }

  settle(cell: CellState) {
    if (cell.mode === "idle") return;
    cell.mode = "idle";
    this.active.delete(cell);
    const last = cell.steps[cell.steps.length - 1];
    if (last) cell.value = last.to;
    this.rest(cell, cell.value);
    cell.steps = [];
    cell.resolve?.();
    cell.resolve = null;
  }

  rest(cell: CellState, value: string) {
    cell.value = value;
    cell.top = value;
    cell.bottom = value;
    cell.fallDeg = -90;
    cell.riseDeg = 90;
    cell.shade = 0;
    cell.alpha = 1;
    this.dirty.add(cell);
  }

  start(cell: CellState, cycle: string[], target: string, mode: CellMode, startMs: number): boolean {
    this.settle(cell);
    cell.done = Promise.resolve();
    if (cell.value === target) return false;
    if (mode === "instant" || this.active.size >= MAX_FLIPPING) {
      this.rest(cell, target);
      return false;
    }
    cell.done = new Promise<void>((resolve) => {
      cell.resolve = resolve;
    });
    cell.started = false;
    cell.startMs = startMs;
    if (mode === "crossfade") {
      cell.mode = "fade";
      cell.steps = [{ from: cell.value, to: target, last: true }];
      this.rest(cell, target);
      cell.alpha = 0.35;
      this.active.add(cell);
      return true;
    }
    const plan = planFlips(cycle, cell.value, target);
    if (plan.steps.length === 0) {
      cell.resolve?.();
      this.rest(cell, target);
      return false;
    }
    cell.mode = "flip";
    cell.jump = plan.jump;
    cell.steps = plan.steps;
    cell.k = -1;
    this.active.add(cell);
    return true;
  }

  /** Advances one cell to `now`. */
  tick(cell: CellState, now: number) {
    const e = now - cell.startMs;
    if (e < 0) return;
    if (cell.mode === "fade") {
      const q = e / FADE_MS;
      if (q >= 1) this.settle(cell);
      else {
        cell.alpha = 0.35 + 0.65 * landEase(q);
        this.dirty.add(cell);
      }
      return;
    }
    if (!cell.started) {
      cell.started = true;
      if (cell.jump !== null) cell.value = cell.jump;
    }
    const ms = this.flapMs;
    const total = cell.steps.length * ms;
    this.dirty.add(cell);
    if (e < total) {
      const k = Math.floor(e / ms);
      const p = (e - k * ms) / ms;
      if (k !== cell.k) {
        cell.k = k;
        const step = cell.steps[k];
        cell.value = step.from;
        cell.top = step.to;
        cell.bottom = step.from;
        cell.fallText = step.from;
        cell.riseText = step.to;
      }
      // Both halves share one phase: the top drops for the first half, the
      // bottom stays edge-on until then and lifts during the second half.
      cell.fallDeg = p < 0.5 ? -90 * fallEase(p * 2) : -90;
      cell.riseDeg = p < 0.5 ? 90 : 90 * (1 - riseEase(p * 2 - 1));
      cell.shade = 1 - Math.abs(2 * p - 1);
      return;
    }
    const q = (e - total) / LAND_MS;
    if (q < 1) {
      const last = cell.steps[cell.steps.length - 1];
      cell.value = last.to;
      cell.top = last.to;
      cell.bottom = last.to;
      cell.riseText = last.to;
      cell.fallDeg = -90;
      cell.shade = 0;
      // 0deg -> LAND_DEG at 40% -> 0deg, ease-out on both legs.
      cell.riseDeg = q < 0.4 ? LAND_DEG * landEase(q / 0.4) : LAND_DEG * (1 - landEase((q - 0.4) / 0.6));
      return;
    }
    this.settle(cell);
  }

  /** Advances every active cell and repaints what changed. Returns true while anything moves. */
  frame(now: number): boolean {
    for (const cell of this.active) this.tick(cell, now);
    this.draw();
    return this.active.size > 0;
  }

  draw() {
    if (this.dirty.size === 0 || this.atlases.length === 0) return;
    const { ctx, look } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const cell of this.dirty) this.drawCell(ctx, cell, look);
    ctx.globalAlpha = 1;
    this.dirty.clear();
  }

  drawCell(ctx: CanvasRenderingContext2D, cell: CellState, look: Look) {
    const atlas = this.atlases[cell.c];
    if (!atlas) return;
    const { x, y, w, h } = cell;
    const half = h / 2;
    const mid = y + half;
    ctx.globalAlpha = 1;
    ctx.fillStyle = look.board;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = cell.alpha;
    const src = (value: string) => atlas.index.get(value) ?? atlas.index.get(value === "" ? " " : "") ?? 0;
    ctx.drawImage(atlas.canvas, src(cell.top), 0, w, half, x, y, w, half);
    ctx.drawImage(atlas.canvas, src(cell.bottom), half, w, half, x, mid, w, half);
    if (cell.shade > 0.001 && this.shadeSprite) {
      ctx.globalAlpha = cell.alpha * cell.shade;
      ctx.drawImage(this.shadeSprite, x, mid, w, half);
      ctx.globalAlpha = cell.alpha;
    }
    const px = Math.max(1, Math.round(look.dpr));
    ctx.fillStyle = look.split;
    ctx.fillRect(x, mid - px, w, px);
    ctx.fillStyle = look.splitHighlight;
    ctx.fillRect(x, mid, w, px);

    const fallOn = cell.fallDeg > -89.9;
    const riseOn = cell.riseDeg < 89.9;
    if (!fallOn && !riseOn) return;
    // Flaps lean toward the viewer and grow slightly wider; the cell clips them,
    // as `contain: paint` did on the DOM cell.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (fallOn) this.drawFlap(ctx, atlas.canvas, src(cell.fallText), cell, cell.fallDeg, true);
    if (riseOn) this.drawFlap(ctx, atlas.canvas, src(cell.riseText), cell, cell.riseDeg, false);
    ctx.restore();
  }

  /**
   * Draws one half rotating about the split line, as CSS `perspective(P) rotateX(deg)`
   * with the origin on the split. 2D canvas has no projective transform, so the
   * half is drawn in horizontal strips, each scaled by its projected depth.
   */
  drawFlap(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, sx: number, cell: CellState, deg: number, upper: boolean) {
    const { x, y, w, h } = cell;
    const half = h / 2;
    const mid = y + half;
    const P = this.look.perspective;
    const cos = Math.cos(deg * DEG);
    // Depth toward the viewer per unit of distance from the axis.
    const sin = upper ? Math.sin(-deg * DEG) : Math.sin(deg * DEG);
    if (Math.abs(deg) < 0.05) {
      ctx.drawImage(img, sx, upper ? 0 : half, w, half, x, upper ? y : mid, w, half);
      return;
    }
    for (let i = 0; i < STRIPS; i++) {
      const d0 = (half * i) / STRIPS;
      const d1 = (half * (i + 1)) / STRIPS;
      const y0 = (d0 * cos * P) / (P - d0 * sin);
      const y1 = (d1 * cos * P) / (P - d1 * sin);
      const dh = y1 - y0;
      if (dh < 0.05) continue;
      const s = P / (P - ((d0 + d1) / 2) * sin);
      const dw = w * s;
      const dx = x + (w - dw) / 2;
      const pad = i < STRIPS - 1 ? 0.5 : 0; // overlap strips so no seam shows
      if (upper) ctx.drawImage(img, sx, half - d1, w, d1 - d0, dx, mid - y1, dw, dh + pad);
      else ctx.drawImage(img, sx, half + d0, w, d1 - d0, dx, mid + y0 - pad, dw, dh + pad);
    }
  }
}

interface AtlasSpec {
  values: string[];
  kind: "char" | "word";
  w: number; // device px
  h: number; // device px
}

function buildAtlas(spec: AtlasSpec, m: Metrics, dpr: number, family: string, ink: string, material: Material): Atlas {
  const { w, h, kind } = spec;
  const half = h / 2;
  const gap = Math.ceil(2 * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, spec.values.length * (w + gap));
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  const index = new Map<string, number>();
  if (!ctx) return { canvas, index };
  const fs = (kind === "word" ? m.wordFs : m.charFs) * dpr;
  const r = m.radius * dpr;
  ctx.font = `500 ${fs}px ${family}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const metrics = ctx.measureText("H");
  const asc = metrics.fontBoundingBoxAscent ?? fs * 1.01;
  const desc = metrics.fontBoundingBoxDescent ?? fs * 0.29;
  // Same box as the DOM glyph: a line-height 1 line centred in the cell, plus the cap nudge.
  const baseline = half + (asc - desc) / 2 + CAP_NUDGE_EM * fs;
  const spacing = kind === "word" ? 0.06 * fs : 0;
  const trail = kind === "word" ? WORD_TRAIL_EM * fs : 0;
  const topGrad = ctx.createLinearGradient(0, 0, 0, half);
  topGrad.addColorStop(0, material.topFace[0]);
  topGrad.addColorStop(1, material.topFace[1]);
  const bottomGrad = ctx.createLinearGradient(0, half, 0, h);
  bottomGrad.addColorStop(0, material.bottomFace[0]);
  bottomGrad.addColorStop(1, material.bottomFace[1]);

  spec.values.forEach((value, n) => {
    const ox = n * (w + gap);
    index.set(value, ox);
    ctx.save();
    ctx.translate(ox, 0);
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, half, [r, r, 0, 0]);
    ctx.fill();
    ctx.fillStyle = bottomGrad;
    ctx.beginPath();
    ctx.roundRect(0, half, w, half, [0, 0, r, r]);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.fillStyle = ink;
    const chars = Array.from(value);
    const advances = chars.map((ch) => ctx.measureText(ch).width + spacing);
    const total = advances.reduce((a, b) => a + b, 0);
    let pen = (w - total) / 2 + trail;
    chars.forEach((ch, j) => {
      if (ch !== " ") ctx.fillText(ch, pen, baseline);
      pen += advances[j];
    });
    ctx.restore();
  });
  return { canvas, index };
}

function makeShadeSprite(h: number): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = 1;
  sprite.height = Math.max(1, Math.round(h));
  const ctx = sprite.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, sprite.height);
    grad.addColorStop(0, "rgba(0,0,0,0.35)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, sprite.height);
  }
  return sprite;
}

// --- Rendering ------------------------------------------------------------

function Led({ state, m, colours }: { state: FlapStatus; m: Metrics; colours: Record<FlapStatus, string> }) {
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0"
      style={{ width: m.led, height: m.led, marginRight: m.ledGap }}
    >
      {(["ok", "warn", "off"] as const).map((key) => (
        <span
          key={key}
          className="absolute inset-0 rounded-full transition-opacity duration-200 ease-out"
          style={{ background: colours[key], opacity: state === key ? 1 : 0 }}
        />
      ))}
    </span>
  );
}

/** Built-in idle sets for `attract`. Keys match the demo columns. */
export const FLAP_LEDGER_SAMPLE_ROWS: FlapRow[][] = [
  [
    { time: "08:15", flight: "BJ204", destination: "LONDON", gate: "A12", status: "ON TIME" },
    { time: "08:40", flight: "BJ317", destination: "TOKYO", gate: "B4", status: "BOARDING" },
    { time: "09:05", flight: "BJ82", destination: "BERLIN", gate: "C7", status: "DELAYED" },
    { time: "09:30", flight: "BJ551", destination: "OSLO", gate: "D2", status: "GATE CLOSED" },
    { time: "10:10", flight: "BJ19", destination: "NEW YORK", gate: "E9", status: "DEPARTED" },
  ],
  [
    { time: "08:15", flight: "BJ204", destination: "LONDON", gate: "A12", status: "DEPARTED" },
    { time: "08:40", flight: "BJ317", destination: "TOKYO", gate: "B4", status: "BOARDING" },
    { time: "09:05", flight: "BJ82", destination: "BERLIN", gate: "C7", status: "ON TIME" },
    { time: "09:30", flight: "BJ551", destination: "OSLO", gate: "D2", status: "DELAYED" },
    { time: "10:10", flight: "BJ19", destination: "NEW YORK", gate: "E9", status: "ON TIME" },
  ],
  [
    { time: "08:15", flight: "BJ204", destination: "LONDON", gate: "A12", status: "DEPARTED" },
    { time: "08:40", flight: "BJ317", destination: "TOKYO", gate: "B4", status: "DEPARTED" },
    { time: "09:05", flight: "BJ82", destination: "BERLIN", gate: "C7", status: "GATE CLOSED" },
    { time: "09:30", flight: "BJ551", destination: "OSLO", gate: "D2", status: "BOARDING" },
    { time: "10:10", flight: "BJ19", destination: "NEW YORK", gate: "E9", status: "DELAYED" },
  ],
];

function diffMessage(prev: FlapRow[], next: FlapRow[], columns: FlapColumn[]): string {
  const parts: string[] = [];
  const count = Math.max(prev.length, next.length);
  for (let r = 0; r < count; r++) {
    const before = prev[r] ?? {};
    const after = next[r] ?? {};
    const changed = columns.filter((col) => (before[col.key] ?? "") !== (after[col.key] ?? ""));
    if (changed.length === 0) continue;
    const values = changed.map((col) => after[col.key] ?? "").filter(Boolean).join(", ");
    parts.push(`Row ${r + 1} updated${values ? `: ${values}` : ""}`);
  }
  return parts.join(". ");
}

export function FlapLedger({
  columns,
  rows,
  size = "md",
  flapMs = 70,
  stagger = 28,
  cascadeFrom = "changed",
  status,
  announceChanges = false,
  ariaLabel = "Board",
  tone,
  attract = false,
  className,
}: FlapLedgerProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const material = MATERIAL[resolvedTone];
  const reduced = !!useReducedMotion();
  const m = useMemo(() => buildMetrics(size), [size]);
  const cycles = useMemo(() => columns.map(buildCycle), [columns]);

  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BoardEngine | null>(null);
  const genRef = useRef(0);
  const firstRunRef = useRef(true);
  const pauseUntilRef = useRef(0);
  const attractAccRef = useRef(0);

  const [attractStep, setAttractStep] = useState(0);
  const attractActive = attract && !reduced;
  const liveRows = attract ? FLAP_LEDGER_SAMPLE_ROWS[reduced ? 0 : attractStep % FLAP_LEDGER_SAMPLE_ROWS.length] : rows;

  // Row slots stay mounted while removed rows flip to blank.
  const [slots, setSlots] = useState(liveRows.length);
  if (liveRows.length > slots) setSlots(liveRows.length);

  // Announcements, computed while rendering from the previous rows snapshot.
  const rowsKey = JSON.stringify(liveRows);
  const [seenKey, setSeenKey] = useState(rowsKey);
  const [prevRows, setPrevRows] = useState<FlapRow[]>(liveRows);
  const [announcement, setAnnouncement] = useState("");
  if (rowsKey !== seenKey) {
    setSeenKey(rowsKey);
    if (announceChanges) setAnnouncement(diffMessage(prevRows, liveRows, columns));
    setPrevRows(liveRows);
  }

  // One loop per board: it advances every flipping cell and the attract timer,
  // and goes idle when neither has work.
  const frame = useCallback(
    (dt: number) => {
      const now = performance.now();
      const moving = engineRef.current ? engineRef.current.frame(now) : false;
      if (attractActive && now >= pauseUntilRef.current) {
        attractAccRef.current += dt;
        if (attractAccRef.current >= ATTRACT_MS / 1000) {
          attractAccRef.current = 0;
          setAttractStep((s) => (s + 1) % FLAP_LEDGER_SAMPLE_ROWS.length);
        }
      }
      return attractActive || moving;
    },
    [attractActive],
  );
  const { wake } = useVisibleLoop(rootRef, frame);

  const pauseAttract = useCallback(() => {
    pauseUntilRef.current = performance.now() + ATTRACT_RESUME_MS;
  }, []);

  const ink = palette.text;
  const ledColours: Record<FlapStatus, string> = {
    ok: palette.success,
    warn: palette.warning,
    off: palette.textFaint,
  };
  const ledSpace = status ? m.led + m.ledGap : 0;
  const boardWidth = columns.reduce((sum, col) => sum + columnPx(col.width, m), 0) + Math.max(0, columns.length - 1) * m.colGap;
  const canvasW = ledSpace + boardWidth;
  const canvasH = slots * m.cellH + Math.max(0, slots - 1) * m.rowGap;

  // Canvas size, cell rects and glyph atlases. Re-run when the layout or the look changes.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const board = boardRef.current;
    if (!canvas || !board) return;
    const engine = (engineRef.current ??= new BoardEngine(canvas));
    const dpr = sizeCanvas(canvas, canvasW, canvasH);
    engine.look = {
      dpr,
      board: material.board,
      split: material.split,
      splitHighlight: material.splitHighlight,
      perspective: m.perspective * dpr,
    };
    const h = Math.round(m.cellH * dpr);
    const specs: AtlasSpec[] = columns.map((col, c) => {
      const kind = Array.isArray(col.charset) ? "word" : "char";
      const w = Math.round((kind === "word" ? columnPx(col.width, m) : m.cellW) * dpr);
      return { values: cycles[c], kind, w, h };
    });
    const family = getComputedStyle(board).fontFamily || "ui-monospace, monospace";
    const buildAll = () => {
      engine.atlases = specs.map((spec) => buildAtlas(spec, m, dpr, family, ink, material));
      engine.shadeSprite = makeShadeSprite(h / 2);
      engine.invalidate();
      engine.draw();
    };

    // Cell rects in device pixels. Existing cells keep their state.
    const keep = new Set<string>();
    let colX = ledSpace;
    columns.forEach((col, c) => {
      const isWord = Array.isArray(col.charset);
      const count = isWord ? 1 : col.width;
      for (let r = 0; r < slots; r++) {
        for (let i = 0; i < count; i++) {
          const key = `${r}:${c}:${i}`;
          keep.add(key);
          let cell = engine.cells.get(key);
          if (!cell) {
            cell = {
              key,
              c,
              x: 0,
              y: 0,
              w: 0,
              h: 0,
              value: "",
              target: null,
              top: "",
              bottom: "",
              fallText: "",
              riseText: "",
              fallDeg: -90,
              riseDeg: 90,
              shade: 0,
              alpha: 1,
              mode: "idle",
              started: false,
              startMs: 0,
              jump: null,
              steps: [],
              k: -1,
              done: Promise.resolve(),
              resolve: null,
            };
            engine.cells.set(key, cell);
          }
          cell.c = c;
          cell.x = Math.round((colX + i * (m.cellW + m.cellGap)) * dpr);
          cell.y = Math.round(r * (m.cellH + m.rowGap) * dpr);
          cell.w = specs[c].w;
          cell.h = h;
        }
      }
      colX += columnPx(col.width, m) + m.colGap;
    });
    for (const [key, cell] of engine.cells) {
      if (keep.has(key)) continue;
      engine.settle(cell);
      engine.dirty.delete(cell);
      engine.cells.delete(key);
    }
    buildAll();

    // Rebuild once the board font has loaded, so glyphs never stay in a fallback face.
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts) {
      const fs = Math.max(m.charFs, m.wordFs) * dpr;
      void document.fonts.load(`500 ${fs}px ${family}`).then(() => {
        if (!cancelled) buildAll();
      });
    }
    return () => {
      cancelled = true;
    };
  }, [slots, columns, cycles, m, ink, material, ledSpace, canvasW, canvasH]);

  // Flip the board toward the current rows. Only cells whose target changed move.
  useLayoutEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const gen = ++genRef.current;
    const instant = firstRunRef.current;
    firstRunRef.current = false;
    const mode: CellMode = instant ? "instant" : reduced ? "crossfade" : "flip";
    engine.flapMs = flapMs;

    const targetCache = new Map<string, string[]>();
    const jobs = Array.from(engine.cells.values()).map((cell) => {
      const [r, c, i] = cell.key.split(":").map(Number);
      const key = `${r}:${c}`;
      let targets = targetCache.get(key);
      if (!targets) {
        targets = cellTargets(columns[c], cycles[c], liveRows[r]);
        targetCache.set(key, targets);
      }
      return { cell, r, c, cycle: cycles[c], target: targets[i] };
    });

    const colDistance = columns.map(() => 0);
    if (mode === "flip") {
      for (const job of jobs) {
        if (job.target === undefined || job.cell.target === job.target) continue;
        colDistance[job.c] += distance(job.cycle, job.cell.value, job.target);
      }
    }
    let origin = 0;
    if (cascadeFrom === "right") origin = columns.length - 1;
    else if (cascadeFrom === "changed") {
      let best = -1;
      colDistance.forEach((d, c) => {
        if (d > best) {
          best = d;
          origin = c;
        }
      });
    }

    const now = performance.now();
    let moving = false;
    for (const job of jobs) {
      if (job.target === undefined || job.cell.target === job.target) continue;
      job.cell.target = job.target;
      const delay = mode === "flip" ? Math.abs(job.c - origin) * stagger + job.r * ROW_DELAY_MS : 0;
      if (engine.start(job.cell, job.cycle, job.target, mode, now + delay)) moving = true;
    }
    engine.draw();
    if (moving) wake();

    // Rows removed from the data flip to blank, then unmount.
    if (slots > liveRows.length) {
      const len = liveRows.length;
      const removed = jobs.filter((job) => job.r >= len).map((job) => job.cell.done);
      void Promise.all(removed).then(() => {
        if (genRef.current === gen) setSlots(len);
      });
    }
  }, [liveRows, slots, columns, cycles, cascadeFrom, stagger, flapMs, reduced, m, wake]);

  // When the board is wider than its container, fade the right edge so the
  // clipped columns read as scrollable. The fade drops once scrolled to the end.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let faded: boolean | null = null;
    const update = () => {
      const more = root.scrollWidth - root.clientWidth - root.scrollLeft > 1;
      if (more === faded) return;
      faded = more;
      const mask = more ? `linear-gradient(to right, #000 calc(100% - ${EDGE_FADE_PX}px), transparent)` : "";
      root.style.maskImage = mask;
      root.style.setProperty("-webkit-mask-image", mask);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    if (boardRef.current) observer.observe(boardRef.current);
    root.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn("relative max-w-full overflow-x-auto overscroll-x-contain", className)}
      onPointerDown={pauseAttract}
      onPointerMove={pauseAttract}
    >
      <div
        ref={boardRef}
        aria-hidden="true"
        className="relative block w-max font-mono tabular-nums select-none"
        style={{
          padding: m.pad,
          borderRadius: m.boardRadius,
          background: material.board,
          border: `1px solid var(--bjork-border, ${palette.border})`,
          boxShadow: "var(--bjork-shadow-panel, none)",
          color: ink,
          width: boardWidth + ledSpace + m.pad * 2 + 2,
        }}
      >
        <div className="flex" style={{ paddingLeft: ledSpace, marginBottom: m.headerGap }}>
          {columns.map((col, c) => {
            const right = col.align === "right";
            return (
              <span
                key={col.key}
                className="block overflow-hidden whitespace-nowrap font-mono uppercase"
                style={{
                  width: columnPx(col.width, m),
                  marginLeft: c > 0 ? m.colGap : 0,
                  fontSize: m.headerFs,
                  lineHeight: 1,
                  letterSpacing: "0.12em",
                  textAlign: right ? "right" : "left",
                  // Trailing letter-spacing pushes right-aligned text left. Pull it back by one tracking unit.
                  marginRight: right ? "-0.12em" : undefined,
                  color: palette.textFaint,
                }}
              >
                {col.header}
              </span>
            );
          })}
        </div>

        <div className="relative flex flex-col" style={{ gap: m.rowGap }}>
          {Array.from({ length: slots }, (_, r) => {
            const state: FlapStatus = status && r < liveRows.length ? status(liveRows[r]) : "off";
            return (
              <div key={r} className="flex items-center">
                {status ? <Led state={state} m={m} colours={ledColours} /> : null}
                <span className="block shrink-0" style={{ width: boardWidth, height: m.cellH }} />
              </div>
            );
          })}
          <canvas
            ref={canvasRef}
            data-flap-canvas=""
            className="pointer-events-none absolute top-0 left-0 block"
            style={{ width: canvasW, height: canvasH }}
          />
        </div>
      </div>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {liveRows.map((row, r) => (
            <tr key={r}>
              {columns.map((col) => (
                <td key={col.key}>{row[col.key] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {announceChanges ? <LiveRegion message={announcement} /> : null}
    </div>
  );
}
