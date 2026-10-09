"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { cubicBezier, easeCss, springs } from "@/components/bjork-ui/_core/motion";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { BJORK_SURFACE } from "@/components/bjork-ui/_core/surface";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { sizeCanvas, useElementSize } from "@/components/bjork-ui/_core/canvas";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export type InkPen = "pen" | "brush" | "fineliner";
/** [x, y, tMs, pressure]. Pressure is 0 for non-pen pointers. */
export type InkPoint = [number, number, number, number];

export interface InkStroke {
  pen: InkPen;
  color: string;
  points: InkPoint[];
  /** Set for Shift-straightened strokes. They are drawn as a straight line at constant mid width. */
  snapped?: boolean;
}

export interface VelocityInkProps {
  value?: InkStroke[];
  defaultValue?: InkStroke[];
  /** Fires on pointerup, undo, clear and typed input. Receives the strokes and an SVG string. */
  onChange?: (strokes: InkStroke[], svg: string) => void;
  onClear?: () => void;
  pen?: InkPen;
  defaultPen?: InkPen;
  onPenChange?: (pen: InkPen) => void;
  colors?: { ink?: string; accent?: string };
  /** Overrides the [min, max] width of every pen. */
  width?: [number, number];
  /** Shift snaps to this many directions. 0 disables snapping. */
  snapAngles?: 8 | 0;
  guide?: "signature" | "grid" | "none";
  toolbar?: boolean;
  fallbackInput?: boolean;
  readOnly?: boolean;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

type Range = [number, number];
type Xf = { s: number; ox: number; oy: number };
interface Dense {
  x: number[];
  y: number[];
  w: number[];
  length: number;
}
interface Live {
  id: number;
  pen: InkPen;
  color: string;
  pts: InkPoint[];
  drawn: number;
  snapping: boolean;
  left: number;
  top: number;
  lastT: number;
}

// Speed-driven width ranges. Fineliner is a constant 1.6, clamped into the range.
const PEN_RANGE: Record<InkPen, Range> = {
  pen: [1.2, 4.2],
  brush: [1.5, 9],
  fineliner: [1.6, 1.6],
};
const SPEED_SMOOTHING = 0.35;
const SAMPLE_STEP = 2;
const CAP_SEGMENTS = 12;
const LIVE_OVERLAP = 6; // dense samples repainted behind the tip, so the live seam never shows
const MIN_MOVE = 0.75;
const MIN_FRAME_MS = 1000 / 120;
const IDENTITY: Xf = { s: 1, ox: 0, oy: 0 };

const SIG_W = 560;
const SIG_H = 240;
const ATTRACT_IDLE_S = 4;
const ATTRACT_HOLD_MS = 2000;
const ATTRACT_FADE_MS = 300;
const CLEAR_MS = 180;

const pressable =
  "transition-[transform,background-color,color,opacity] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent,#ec5c13)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset,#121212)] disabled:opacity-40 disabled:active:scale-100";

function tok(name: string, fallback: string) {
  return `var(--bjork-${name}, ${fallback})`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function rangeFor(pen: InkPen, override?: Range): Range {
  return override ?? PEN_RANGE[pen];
}

// Width per raw sample. Speed is smoothed with an exponential average, and taper is applied at the stroke ends.
// `live` skips the tail taper, because the tail is not known until pointerup.
function widthsFor(stroke: InkStroke, [lo, hi]: Range, live: boolean): number[] {
  const pts = stroke.points;
  const n = pts.length;
  const out = new Array<number>(n).fill((lo + hi) / 2);
  if (stroke.snapped) return out;

  let speed = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const dt = Math.max(1, pts[i][2] - pts[i - 1][2]);
      const raw = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / dt;
      speed = i === 1 ? raw : SPEED_SMOOTHING * raw + (1 - SPEED_SMOOTHING) * speed;
    }
    let w: number;
    if (stroke.pen === "fineliner") w = clamp(1.6, lo, hi);
    else if (stroke.pen === "brush") w = clamp(speed * 3.2, lo, hi);
    else w = clamp(hi - speed * 1.6, lo, hi);
    const pressure = pts[i][3];
    if (pressure > 0) w *= 0.4 + pressure * 0.9;
    out[i] = w;
  }

  // Sample 0 has no speed yet; give it the first measured width so fast strokes don't start fat.
  if (n > 1) out[0] = out[1];

  if (stroke.pen === "brush") {
    for (let i = 0; i < n; i++) {
      const head = i < 8 ? 0.3 + 0.7 * (i / 8) : 1;
      const tailDistance = n - 1 - i;
      const tail = !live && tailDistance < 8 ? 0.3 + 0.7 * (tailDistance / 8) : 1;
      out[i] *= Math.min(head, tail);
    }
  }
  return out;
}

function cr(p0: number, p1: number, p2: number, p3: number, u: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

// Catmull-Rom centreline with interpolated widths, resampled every SAMPLE_STEP px. Transformed by `xf`.
function centreline(stroke: InkStroke, range: Range, live: boolean, xf: Xf): Dense {
  const pts = stroke.points;
  const n = pts.length;
  const widths = widthsFor(stroke, range, live);
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];

  if (n === 1) {
    xs.push(pts[0][0]);
    ys.push(pts[0][1]);
    ws.push(widths[0]);
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const count = i === n - 2 ? 9 : 8; // the final segment also emits u = 1
    for (let j = 0; j < count; j++) {
      const u = j / 8;
      xs.push(cr(p0[0], p1[0], p2[0], p3[0], u));
      ys.push(cr(p0[1], p1[1], p2[1], p3[1], u));
      ws.push(widths[i] + (widths[i + 1] - widths[i]) * u);
    }
  }

  const px = [xs[0]];
  const py = [ys[0]];
  const pw = [ws[0]];
  let carry = 0;
  let length = 0;
  for (let k = 1; k < xs.length; k++) {
    const ax = xs[k - 1];
    const ay = ys[k - 1];
    const aw = ws[k - 1];
    const bx = xs[k];
    const by = ys[k];
    const bw = ws[k];
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    length += seg;
    let pos = SAMPLE_STEP - carry;
    while (pos <= seg) {
      const u = pos / seg;
      px.push(ax + (bx - ax) * u);
      py.push(ay + (by - ay) * u);
      pw.push(aw + (bw - aw) * u);
      pos += SAMPLE_STEP;
    }
    carry = seg - (pos - SAMPLE_STEP);
  }
  const lx = xs[xs.length - 1];
  const ly = ys[ys.length - 1];
  if (Math.hypot(lx - px[px.length - 1], ly - py[py.length - 1]) > 0.01) {
    px.push(lx);
    py.push(ly);
    pw.push(ws[ws.length - 1]);
  }

  return {
    x: px.map((v) => v * xf.s + xf.ox),
    y: py.map((v) => v * xf.s + xf.oy),
    w: pw.map((v) => v * xf.s),
    length,
  };
}

function tangentAt(d: Dense, k: number): [number, number] {
  const n = d.x.length;
  const a = Math.max(0, k - 1);
  const b = Math.min(n - 1, k + 1);
  const tx = d.x[b] - d.x[a];
  const ty = d.y[b] - d.y[a];
  const len = Math.hypot(tx, ty) || 1;
  return [tx / len, ty / len];
}

// Half circle around (cx, cy), from the left normal through `dir` to the right normal.
function arc(out: number[], cx: number, cy: number, r: number, dir: number, from: number, to: number) {
  for (let j = from; j <= to; j++) {
    const a = dir + Math.PI / 2 - (Math.PI * j) / CAP_SEGMENTS;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}

function pathD(pts: number[]): string {
  if (pts.length < 4) return "";
  let s = `M${pts[0].toFixed(2)} ${pts[1].toFixed(2)}`;
  for (let i = 2; i < pts.length; i += 2) s += `L${pts[i].toFixed(2)} ${pts[i + 1].toFixed(2)}`;
  return `${s}Z`;
}

// One filled polygon per run. Rounded caps are optional, so the live run can stay flat at the tip.
function ribbon(d: Dense, i0: number, i1: number, capStart: boolean, capEnd: boolean): string {
  const count = i1 - i0 + 1;
  const left: number[] = [];
  const right: number[] = [];
  for (let k = i0; k <= i1; k++) {
    const [tx, ty] = tangentAt(d, k);
    const hw = d.w[k] / 2;
    left.push(d.x[k] - ty * hw, d.y[k] + tx * hw);
    right.push(d.x[k] + ty * hw, d.y[k] - tx * hw);
  }
  const out: number[] = [];
  for (let j = 0; j < count; j++) out.push(left[2 * j], left[2 * j + 1]);
  if (capEnd) {
    const [tx, ty] = tangentAt(d, i1);
    arc(out, d.x[i1], d.y[i1], d.w[i1] / 2, Math.atan2(ty, tx), 1, CAP_SEGMENTS);
  }
  for (let j = count - 1; j >= 0; j--) out.push(right[2 * j], right[2 * j + 1]);
  if (capStart) {
    const [tx, ty] = tangentAt(d, i0);
    arc(out, d.x[i0], d.y[i0], d.w[i0] / 2, Math.atan2(-ty, -tx), 1, CAP_SEGMENTS);
  }
  return pathD(out);
}

function dotD(x: number, y: number, r: number): string {
  const out: number[] = [];
  for (let j = 0; j < 24; j++) {
    const a = (Math.PI * 2 * j) / 24;
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return pathD(out);
}

// Full outline of one stroke as SVG path data. Strokes with fewer than two distinct points become a dot.
function outlineD(stroke: InkStroke, width: Range | undefined, xf: Xf): string {
  if (stroke.points.length === 0) return "";
  const range = rangeFor(stroke.pen, width);
  const d = centreline(stroke, range, false, xf);
  if (d.length < 0.5 || d.x.length < 2) return dotD(d.x[0], d.y[0], d.w[0] / 2);
  return ribbon(d, 0, d.x.length - 1, true, true);
}

// Live run from dense index `from` to the tip. Returns the new dense count so the caller can track the tip.
function liveRun(stroke: InkStroke, width: Range | undefined, from: number): { d: string; count: number } {
  const d = centreline(stroke, rangeFor(stroke.pen, width), true, IDENTITY);
  const count = d.x.length;
  if (count < 2 || d.length < 0.5 || from >= count - 1) return { d: "", count };
  return { d: ribbon(d, from, count - 1, from === 0, false), count };
}

// Shift snap: the end point moves onto the nearest multiple of 360 / steps degrees from the start.
function snapEnd(start: InkPoint, end: [number, number], steps: number): [number, number] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  const step = (Math.PI * 2) / steps;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return [start[0] + Math.cos(a) * len, start[1] + Math.sin(a) * len];
}

function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: InkStroke[],
  width: Range | undefined,
  xf: Xf,
  color?: string,
) {
  for (const stroke of strokes) {
    ctx.fillStyle = color ?? stroke.color;
    ctx.fill(new Path2D(outlineD(stroke, width, xf)));
  }
}

function paintCanvas(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  strokes: InkStroke[],
  width: Range | undefined,
  xf: Xf,
  color?: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  paintStrokes(ctx, strokes, width, xf, color);
}

function escAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function exportSvg(strokes: InkStroke[], w: number, h: number, width?: Range): string {
  const paths = strokes
    .map((s) => `<path d="${outlineD(s, width, IDENTITY)}" fill="${escAttr(s.color)}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}">${paths}</svg>`;
}

function textSvg(text: string, w: number, h: number, ink: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}"><text x="${(w * 0.08).toFixed(2)}" y="${(h * 0.72).toFixed(2)}" font-family="'Bjork Grotesk Display', sans-serif" font-style="italic" font-size="40" fill="${escAttr(ink)}">${escXml(text)}</text></svg>`;
}

/** Serialises strokes as an SVG string: one path per stroke, coordinates to two decimals. */
export function strokesToSvg(strokes: InkStroke[], size: { width: number; height: number }): string {
  return exportSvg(strokes, size.width, size.height);
}

// Built-in signature, authored as loose "Bjork" in a 560 x 240 box with real timestamps (about 1.66s).
const SIGNATURE_POINTS: InkPoint[][] = [
  [
    [150, 152, 0, 0],
    [150, 146, 8, 0],
    [150, 140, 17, 0],
    [149.9, 134, 25, 0],
    [149.8, 128, 33, 0],
    [149.8, 122, 42, 0],
    [149.8, 116, 50, 0],
    [149.8, 110, 58, 0],
    [149.8, 104, 67, 0],
    [149.9, 98, 75, 0],
    [150.1, 92, 83, 0],
    [150.3, 86, 92, 0],
    [150.8, 80, 100, 0],
    [151.6, 74.1, 108, 0],
    [153.2, 68.3, 117, 0],
    [156.9, 63.7, 125, 0],
    [162.7, 62.7, 133, 0],
    [168.6, 63.7, 141, 0],
    [174.6, 64, 150, 0],
    [180.5, 64.7, 158, 0],
    [186.3, 66.2, 166, 0],
    [191.8, 68.6, 175, 0],
    [196.7, 72.2, 183, 0],
    [200.7, 76.6, 191, 0],
    [204, 81.6, 200, 0],
    [205.9, 87.3, 208, 0],
    [205.4, 93.2, 216, 0],
    [202.7, 98.5, 224, 0],
    [198.4, 102.6, 233, 0],
    [192.9, 105.1, 241, 0],
    [187, 106.3, 249, 0],
    [181.1, 107.1, 258, 0],
    [175.1, 107.7, 266, 0],
    [169.2, 108.4, 274, 0],
    [163.2, 109.3, 283, 0],
    [166.3, 111.1, 288, 0],
    [172.2, 111.6, 296, 0],
    [178.2, 112.1, 304, 0],
    [184.2, 112.7, 313, 0],
    [190.1, 113.6, 321, 0],
    [195.9, 115.1, 329, 0],
    [201.1, 118.1, 338, 0],
    [205.4, 122.2, 346, 0],
    [208.8, 127.1, 354, 0],
    [211.2, 132.6, 362, 0],
    [212, 138.5, 371, 0],
    [210.5, 144.3, 379, 0],
    [207.5, 149.5, 387, 0],
    [203.4, 153.8, 396, 0],
    [198.3, 157, 404, 0],
    [192.6, 158.9, 412, 0],
    [186.7, 159.7, 421, 0],
    [180.7, 160.1, 429, 0],
    [174.7, 160.2, 437, 0],
    [168.7, 160.2, 446, 0],
    [162.7, 160.1, 454, 0],
    [156.7, 160, 462, 0],
    [150.7, 160, 471, 0],
    [150, 160, 472, 0],
  ],
  [
    [252, 96, 612, 0],
    [251.8, 102, 620, 0],
    [251.6, 108, 628, 0],
    [251.3, 114, 637, 0],
    [251.1, 120, 645, 0],
    [250.9, 126, 653, 0],
    [250.6, 132, 662, 0],
    [250.2, 138, 670, 0],
    [249.6, 143.9, 678, 0],
    [249.1, 149.9, 687, 0],
    [248.2, 155.8, 695, 0],
    [246.3, 161.5, 703, 0],
    [242.6, 166.3, 712, 0],
    [237.6, 169.4, 720, 0],
    [231.7, 169.5, 728, 0],
    [226.3, 167, 736, 0],
    [222.9, 162.4, 744, 0],
    [226.7, 158, 752, 0],
    [232, 155.4, 761, 0],
    [237.5, 153, 769, 0],
    [243.1, 150.7, 777, 0],
    [248.6, 148.3, 786, 0],
    [253.9, 145.6, 794, 0],
    [259, 142.5, 802, 0],
    [263.4, 138.4, 811, 0],
    [266.5, 133.2, 819, 0],
    [268.6, 127.6, 827, 0],
    [270.2, 121.8, 836, 0],
    [271.8, 116.1, 844, 0],
    [274.1, 110.5, 852, 0],
    [278.2, 106.3, 860, 0],
    [283.6, 103.6, 869, 0],
    [289.4, 102.3, 877, 0],
    [295.4, 102.3, 885, 0],
    [300.7, 104.7, 894, 0],
    [303.4, 110, 902, 0],
    [304.5, 115.9, 910, 0],
    [304.7, 121.9, 918, 0],
    [304.3, 127.9, 927, 0],
    [303.1, 133.8, 935, 0],
    [301.1, 139.4, 943, 0],
    [298.6, 144.9, 952, 0],
    [295.5, 150, 960, 0],
    [291.6, 154.6, 968, 0],
    [286.7, 157.9, 977, 0],
    [280.9, 159.6, 985, 0],
    [274.9, 160.1, 993, 0],
    [269, 159.3, 1002, 0],
    [264.3, 155.9, 1010, 0],
    [262.8, 150.1, 1018, 0],
    [262.3, 144.2, 1026, 0],
    [262.2, 138.2, 1035, 0],
    [262, 136, 1038, 0],
  ],
  [
    [326, 160, 1178, 0],
    [325.9, 154, 1186, 0],
    [325.7, 148, 1194, 0],
    [325.5, 142, 1203, 0],
    [325.4, 136, 1211, 0],
    [325.4, 130, 1219, 0],
    [325.7, 124, 1228, 0],
    [327.1, 118.2, 1236, 0],
    [331.7, 114.8, 1244, 0],
    [337.3, 112.7, 1252, 0],
    [343.2, 111.6, 1261, 0],
    [349, 112.6, 1269, 0],
    [352.4, 117.5, 1277, 0],
    [355.6, 122.6, 1285, 0],
    [360.1, 121.7, 1292, 0],
    [362.2, 116.1, 1300, 0],
    [363.8, 110.4, 1308, 0],
    [365.3, 104.5, 1317, 0],
    [366.6, 98.7, 1325, 0],
    [367.9, 92.8, 1333, 0],
    [369.2, 87, 1342, 0],
    [370.5, 81.1, 1350, 0],
    [371.8, 75.2, 1358, 0],
    [373.3, 69.4, 1367, 0],
    [374.3, 72.3, 1371, 0],
    [373.8, 78.3, 1379, 0],
    [373.3, 84.2, 1388, 0],
    [372.7, 90.2, 1396, 0],
    [372.1, 96.2, 1404, 0],
    [371.5, 102.2, 1413, 0],
    [370.9, 108.1, 1421, 0],
    [370.4, 114.1, 1429, 0],
    [370, 120.1, 1438, 0],
    [369.8, 126.1, 1446, 0],
    [369.7, 132.1, 1454, 0],
    [369.7, 138.1, 1463, 0],
    [369.7, 144.1, 1471, 0],
    [369.8, 150.1, 1479, 0],
    [369.9, 156.1, 1488, 0],
    [369.6, 158, 1490, 0],
    [369, 152.1, 1499, 0],
    [368.5, 146.1, 1507, 0],
    [368.4, 140.1, 1515, 0],
    [368.7, 134.1, 1524, 0],
    [369.9, 128.2, 1532, 0],
    [373.1, 123.2, 1540, 0],
    [377.2, 118.8, 1549, 0],
    [381.7, 114.9, 1557, 0],
    [386.5, 111.3, 1565, 0],
    [391.6, 108.1, 1574, 0],
    [388.1, 111.8, 1580, 0],
    [384, 116.1, 1589, 0],
    [380.9, 121.2, 1597, 0],
    [380.2, 127, 1605, 0],
    [382.1, 132.7, 1614, 0],
    [384.8, 138.1, 1622, 0],
    [387.8, 143.3, 1630, 0],
    [390.9, 148.4, 1639, 0],
    [394.1, 153.5, 1647, 0],
    [397.2, 158.6, 1655, 0],
    [398, 160, 1658, 0],
  ],
];

export const DEMO_SIGNATURE: InkStroke[] = SIGNATURE_POINTS.map((points) => ({
  pen: "pen",
  color: "#ededed",
  points,
}));

const DEMO_END_MS = Math.max(...DEMO_SIGNATURE.flatMap((s) => s.points.map((p) => p[2])));
const DEMO_CYCLE_MS = DEMO_END_MS + 240 + ATTRACT_HOLD_MS + ATTRACT_FADE_MS;

// Fits the 560 x 240 signature into the pad, scaling down on narrow pads and centring on wide ones.
function demoTransform(w: number, h: number): Xf {
  const s = Math.max(0.05, Math.min(1, (w - 24) / SIG_W));
  return { s, ox: (w - SIG_W * s) / 2, oy: (h - SIG_H * s) / 2 };
}

function demoUntil(t: number): InkStroke[] {
  const out: InkStroke[] = [];
  for (const stroke of DEMO_SIGNATURE) {
    const points = stroke.points.filter((p) => p[2] <= t);
    if (points.length) out.push({ ...stroke, points });
  }
  return out;
}

const easeFade = cubicBezier(0.23, 1, 0.32, 1);

function PenGlyph({ kind }: { kind: InkPen }) {
  if (kind === "pen") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" focusable="false">
        <path d="M3 13l1.2-3.6L10.4 2.2l2.4 2.4-6.2 6.2z" />
        <path d="M9.2 3.4l2.4 2.4" />
      </svg>
    );
  }
  if (kind === "brush") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" focusable="false">
        <path d="M2.5 11c2.2-5.4 4.6-5.4 6.2-1.8s3.2 3.6 4.8-.6" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" focusable="false">
      <path d="M2.5 11c2.2-5.4 4.6-5.4 6.2-1.8s3.2 3.6 4.8-.6" />
    </svg>
  );
}

export function VelocityInk({
  value,
  defaultValue,
  onChange,
  onClear,
  pen: penProp,
  defaultPen = "pen",
  onPenChange,
  colors,
  width,
  snapAngles = 8,
  guide = "signature",
  toolbar = true,
  fallbackInput = true,
  readOnly = false,
  height = 240,
  ariaLabel = "Signature pad",
  tone,
  attract = false,
  className,
}: VelocityInkProps) {
  const resolvedTone = useBjorkTone(tone);
  const p = BJORK_PALETTE[resolvedTone];
  const reduced = !!useReducedMotion();
  const idBase = useId();
  const inputId = `${idBase}-typed`;
  const padRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(padRef);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dprRef = useRef(1);

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<InkStroke[]>(defaultValue ?? []);
  const strokes = value ?? internal;
  const strokesRef = useRef(strokes);
  useLayoutEffect(() => {
    strokesRef.current = strokes;
  });

  const [rev, setRev] = useState(0);
  const [penState, setPenState] = useState<InkPen>(defaultPen);
  const pen = penProp ?? penState;
  const [inkChoice, setInkChoice] = useState<"ink" | "accent">("ink");
  const [typed, setTyped] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [announce, setAnnounce] = useState("");

  const inkColor = colors?.ink ?? p.text;
  const accentColor = colors?.accent ?? p.accentInk;
  const activeColor = inkChoice === "ink" ? inkColor : accentColor;

  const isEmpty = strokes.length === 0;
  const attractOn = attract && !reduced && isEmpty && !typed;
  const staticDemo = attract && reduced && isEmpty && !typed;

  // Paint the committed state. Attract and typed mode paint their own frames, so this effect steps aside for them.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const dpr = sizeCanvas(canvas, size.width, size.height);
    dprRef.current = dpr;
    sizeRef.current = { w: size.width, h: size.height };
    canvas.style.opacity = "1";
    canvas.style.transition = "none";
    if (typed || attractOn) return;
    const drawn = staticDemo ? DEMO_SIGNATURE : strokes;
    const isDemo = drawn === DEMO_SIGNATURE;
    paintCanvas(
      canvas,
      size.width,
      size.height,
      dpr,
      drawn,
      width,
      isDemo ? demoTransform(size.width, size.height) : IDENTITY,
      isDemo ? p.text : undefined,
    );
  }, [size.width, size.height, strokes, rev, typed, attractOn, staticDemo, width, p.text]);

  // Attract: replays the built-in signature after 4s without input, then holds, fades and restarts.
  const inputRef = useRef(false);
  const idleRef = useRef(ATTRACT_IDLE_S);
  const playingRef = useRef(false);
  const timeRef = useRef(0);
  useVisibleLoop(
    padRef,
    (dt) => {
      if (inputRef.current) {
        inputRef.current = false;
        idleRef.current = 0;
      } else {
        idleRef.current += dt;
      }
      const canvas = canvasRef.current;
      if (!canvas) return true;
      if (idleRef.current < ATTRACT_IDLE_S) {
        playingRef.current = false;
        return true;
      }
      if (!playingRef.current) {
        playingRef.current = true;
        timeRef.current = 0;
      }
      let t = timeRef.current + dt * 1000;
      if (t >= DEMO_CYCLE_MS) t -= DEMO_CYCLE_MS;
      timeRef.current = t;

      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) return true;
      const drawEnd = DEMO_END_MS + 240;
      let frame = DEMO_SIGNATURE;
      let opacity = 1;
      if (t < drawEnd) frame = demoUntil(t);
      else if (t > drawEnd + ATTRACT_HOLD_MS) {
        const f = clamp((t - drawEnd - ATTRACT_HOLD_MS) / ATTRACT_FADE_MS, 0, 1);
        opacity = 1 - easeFade(f);
      }
      canvas.style.opacity = String(opacity);
      paintCanvas(canvas, w, h, dprRef.current, frame, undefined, demoTransform(w, h), p.text);
      return true;
    },
    { enabled: attractOn },
  );

  const liveRef = useRef<Live | null>(null);
  const clearingRef = useRef(false);
  const clearTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  const commit = (next: InkStroke[]) => {
    if (!isControlled) setInternal(next);
    strokesRef.current = next;
    setRev((r) => r + 1);
    const w = size.width || 460;
    const h = size.height || height;
    onChange?.(next, exportSvg(next, w, h, width));
  };

  const undo = () => {
    const current = strokesRef.current;
    if (current.length === 0) return;
    commit(current.slice(0, -1));
    setAnnounce("Undone");
  };

  const clear = () => {
    const current = strokesRef.current;
    if (current.length === 0 || clearingRef.current) return;
    onClear?.();
    const finish = () => {
      clearingRef.current = false;
      commit([]);
      setAnnounce("Cleared");
    };
    if (reduced) {
      finish();
      return;
    }
    const canvas = canvasRef.current;
    clearingRef.current = true;
    if (canvas) {
      canvas.style.transition = `opacity ${CLEAR_MS}ms ${easeCss.out}`;
      canvas.style.opacity = "0";
    }
    clearTimer.current = window.setTimeout(() => {
      clearTimer.current = null;
      if (canvas) {
        canvas.style.transition = "none";
        canvas.style.opacity = "1";
      }
      finish();
    }, CLEAR_MS);
  };

  const choosePen = (next: InkPen) => {
    if (penProp === undefined) setPenState(next);
    onPenChange?.(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || liveRef.current !== null || clearingRef.current || typed) return;
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    padRef.current?.focus({ preventScroll: true });
    inputRef.current = true;
    if (strokesRef.current.length === 0) {
      const { w, h } = sizeRef.current;
      if (w > 0) paintCanvas(canvas, w, h, dprRef.current, [], undefined, IDENTITY);
    }
    const rect = canvas.getBoundingClientRect();
    liveRef.current = {
      id: e.pointerId,
      pen,
      color: activeColor,
      pts: [[e.clientX - rect.left, e.clientY - rect.top, e.timeStamp, e.pointerType === "pen" ? e.pressure : 0]],
      drawn: 0,
      snapping: false,
      left: rect.left,
      top: rect.top,
      lastT: e.timeStamp,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const L = liveRef.current;
    if (!L || e.pointerId !== L.id) return;
    inputRef.current = true;

    // Capped at 120Hz and deduplicated under 0.75px. Coalesced events carry the real sample times.
    const native = e.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const list = coalesced.length > 0 ? coalesced : [native];
    let added = false;
    for (const ev of list) {
      const t = ev.timeStamp;
      if (t - L.lastT < MIN_FRAME_MS - 0.5) continue;
      const x = ev.clientX - L.left;
      const y = ev.clientY - L.top;
      const last = L.pts[L.pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < MIN_MOVE) continue;
      L.pts.push([x, y, t, ev.pointerType === "pen" ? ev.pressure : 0]);
      L.lastT = t;
      added = true;
    }

    const canvas = e.currentTarget;
    const ctx = canvas.getContext("2d");
    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    if (!ctx || w === 0) return;

    if (e.shiftKey && snapAngles > 0) {
      // Shift: straight preview at constant mid width. Repaints the committed layer, which is cheap for a 2-point stroke.
      const end = snapEnd(L.pts[0], [e.clientX - L.left, e.clientY - L.top], snapAngles);
      L.snapping = true;
      const preview: InkStroke = {
        pen: L.pen,
        color: L.color,
        snapped: true,
        points: [
          [L.pts[0][0], L.pts[0][1], L.pts[0][2], 0],
          [end[0], end[1], e.timeStamp, 0],
        ],
      };
      paintCanvas(canvas, w, h, dpr, [...strokesRef.current, preview], width, IDENTITY);
      return;
    }
    if (L.snapping) {
      L.snapping = false;
      L.drawn = 0;
      paintCanvas(canvas, w, h, dpr, strokesRef.current, width, IDENTITY);
    }
    if (!added) return;

    // Incremental: paint only the new run, from a short overlap behind the tip.
    const from = Math.max(0, L.drawn - LIVE_OVERLAP);
    const { d, count } = liveRun({ pen: L.pen, color: L.color, points: L.pts }, width, from);
    if (d) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = L.color;
      ctx.fill(new Path2D(d));
    }
    L.drawn = Math.max(L.drawn, count - 1);
  };

  const finishStroke = (e: PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const L = liveRef.current;
    if (!L || e.pointerId !== L.id) return;
    liveRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const x = e.clientX - L.left;
    const y = e.clientY - L.top;
    const straight = snapAngles > 0 && (cancelled ? L.snapping : e.shiftKey);

    let stroke: InkStroke;
    if (straight) {
      const end = snapEnd(L.pts[0], [x, y], snapAngles);
      stroke = {
        pen: L.pen,
        color: L.color,
        snapped: true,
        points: [
          [r2(L.pts[0][0]), r2(L.pts[0][1]), Math.round(L.pts[0][2]), 0],
          [r2(end[0]), r2(end[1]), Math.round(e.timeStamp), 0],
        ],
      };
    } else {
      const pts = [...L.pts];
      if (!cancelled) {
        const last = pts[pts.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) >= MIN_MOVE) {
          pts.push([x, y, e.timeStamp, e.pointerType === "pen" ? e.pressure : 0]);
        }
      }
      stroke = {
        pen: L.pen,
        color: L.color,
        points: pts.map(([px, py, t, pr]) => [r2(px), r2(py), Math.round(t), r2(pr)] as InkPoint),
      };
    }
    commit([...strokesRef.current, stroke]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    inputRef.current = true;
    if (readOnly || typed) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  };

  const onTypeChange = (text: string) => {
    setTypedText(text);
    const w = size.width || 460;
    const h = size.height || height;
    onChange?.([], textSvg(text, w, h, inkColor));
  };

  const leaveType = () => {
    setTyped(false);
    const w = size.width || 460;
    const h = size.height || height;
    onChange?.(strokesRef.current, exportSvg(strokesRef.current, w, h, width));
  };

  const tokens = {
    text: tok("text", p.text),
    textMedium: tok("text-medium", p.textMedium),
    textMuted: tok("text-muted", p.textMuted),
    textSoft: tok("text-soft", p.textSoft),
    textFaint: tok("text-faint", p.textFaint),
    border: tok("border", p.border),
    borderStrong: tok("border-strong", p.borderStrong),
    hair: tok("hair", p.hair),
    surface: tok("surface", p.surface),
    surfaceActive: tok("surface-active", p.active),
    menu: tok("menu", p.surface),
    accentInk: tok("accent-ink", p.accentInk),
    accentSoft: tok("accent-soft", p.accentSoft),
  };

  const pens: { id: InkPen; label: string }[] = [
    { id: "pen", label: "Pen" },
    { id: "brush", label: "Brush" },
    { id: "fineliner", label: "Fineliner" },
  ];
  const swatches: { id: "ink" | "accent"; label: string; color: string }[] = [
    { id: "ink", label: "Ink", color: inkColor },
    { id: "accent", label: "Accent", color: accentColor },
  ];
  const showToolbar = toolbar && !readOnly && !typed;
  const showFallback = fallbackInput && !readOnly;
  const indicatorId = `${idBase}-pen`;
  const gridBackground = `radial-gradient(circle, ${p.hair} 1px, transparent 1.25px)`;

  return (
    <div
      ref={padRef}
      data-velocity-ink=""
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cn("@container relative w-full min-w-0 select-none overflow-hidden rounded-[18px] border outline-none", className)}
      style={{
        height,
        background: tokens.surface,
        borderColor: tokens.border,
        boxShadow: BJORK_SURFACE[resolvedTone].shadowSurface,
        color: tokens.text,
      } as CSSProperties}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${ariaLabel} (${strokes.length} strokes)`}
        onPointerDown={readOnly ? undefined : onPointerDown}
        onPointerMove={readOnly ? undefined : onPointerMove}
        onPointerUp={readOnly ? undefined : (e) => finishStroke(e, false)}
        onPointerCancel={readOnly ? undefined : (e) => finishStroke(e, true)}
        className="absolute inset-0 block touch-none"
        style={{
          cursor: readOnly ? "default" : "crosshair",
          visibility: typed ? "hidden" : "visible",
        }}
      />

      {guide === "grid" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: gridBackground, backgroundSize: "24px 24px", backgroundPosition: "12px 12px" }}
        />
      )}
      {guide === "signature" && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-px"
            style={{ left: "8%", width: "84%", top: "72%", background: tokens.hair }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute font-mono text-[14px] leading-none"
            style={{
              left: "max(8px, calc(8% - 20px))",
              top: "72%",
              // Optical: the cross reads low against the line, so it sits 0.5px higher (blur test: -1px left the ink 0.5px above the line).
              transform: "translateY(calc(-50% - 0.5px))",
              color: tokens.textSoft,
            }}
          >
            ×
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute hidden font-mono text-[11px] uppercase tracking-[0.06em] @[400px]:block"
            style={{ right: "8%", top: "calc(72% + 8px)", color: tokens.textFaint }}
          >
            Sign above
          </span>
        </>
      )}

      {typed && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute whitespace-pre font-bjork-display text-[40px] italic leading-none"
          style={{ left: "8%", top: "72%", transform: "translateY(-80%)", color: inkColor }}
        >
          {typedText}
        </span>
      )}

      {showToolbar && (
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="absolute bottom-2 left-2 flex items-center gap-0.5 rounded-[16px] border p-1"
          style={{ background: tokens.menu, borderColor: tokens.border, boxShadow: tok("shadow-menu", "none") }}
        >
          {pens.map((item) => {
            const active = pen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-pressed={active}
                onClick={() => choosePen(item.id)}
                className={cn("relative grid size-8 place-items-center rounded-[11px]", pressable)}
                style={{ color: active ? tokens.accentInk : tokens.textMedium }}
              >
                {active && (
                  <motion.span
                    layoutId={indicatorId}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[11px]"
                    style={{ background: tokens.surfaceActive }}
                    transition={reduced ? { duration: 0 } : springs.standard}
                  />
                )}
                <span className="relative grid place-items-center">
                  <PenGlyph kind={item.id} />
                </span>
              </button>
            );
          })}
          <span aria-hidden="true" className="mx-0.5 h-4 w-px" style={{ background: tokens.border }} />
          {swatches.map((sw) => {
            const active = inkChoice === sw.id;
            return (
              <button
                key={sw.id}
                type="button"
                aria-label={sw.label}
                aria-pressed={active}
                onClick={() => setInkChoice(sw.id)}
                className={cn("grid size-6 place-items-center rounded-full", pressable)}
              >
                <span
                  aria-hidden="true"
                  className="block size-4 rounded-full"
                  style={{
                    background: sw.color,
                    boxShadow: active ? `0 0 0 2px ${tokens.menu}, 0 0 0 3px ${sw.color}` : undefined,
                  }}
                />
              </button>
            );
          })}
          <span aria-hidden="true" className="mx-0.5 h-4 w-px" style={{ background: tokens.border }} />
          <button
            type="button"
            onClick={undo}
            disabled={isEmpty}
            className={cn("h-7 rounded-[10px] px-2 font-mono text-[11px]", pressable)}
            style={{ color: tokens.textMedium }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={isEmpty}
            className={cn("h-7 rounded-[10px] px-2 font-mono text-[11px]", pressable)}
            style={{ color: tokens.textMedium }}
          >
            Clear
          </button>
        </div>
      )}

      {typed && !readOnly && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <label htmlFor={inputId} className="font-mono text-[11px] uppercase tracking-[0.04em]" style={{ color: tokens.textMuted }}>
            Name
          </label>
          <input
            id={inputId}
            autoFocus
            value={typedText}
            onChange={(e) => onTypeChange(e.target.value)}
            autoComplete="off"
            className="h-7 w-40 min-w-0 rounded-[6px] border-b bg-transparent px-1 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent,#ec5c13)]"
            style={{ borderColor: tokens.borderStrong, color: tokens.text }}
          />
        </div>
      )}

      {showFallback && (
        <button
          type="button"
          onClick={() => (typed ? leaveType() : setTyped(true))}
          className={cn("absolute right-2 top-2 h-7 rounded-[10px] px-2 font-mono text-[11px] @[460px]:bottom-2 @[460px]:top-auto", pressable)}
          style={{ color: tokens.accentInk, background: typed ? "transparent" : tokens.accentSoft }}
        >
          {typed ? "Draw instead" : "Type instead"}
        </button>
      )}

      <LiveRegion message={announce} />
    </div>
  );
}
