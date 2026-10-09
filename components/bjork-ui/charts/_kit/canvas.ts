"use client";

// Canvas plumbing shared by the Charts collection. One hook gives a chart a measured host, a
// DPR-capped canvas that follows it, and a draw loop that pauses offscreen and idles when settled.

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { sizeCanvas, useElementSize } from "@/components/bjork-ui/_core/canvas";
import { cubicBezier, ease } from "@/components/bjork-ui/_core/motion";

export interface ChartFrame {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dt: number;
  t: number;
}

/**
 * `draw` runs inside `useVisibleLoop`. Return true to keep animating, false to go idle until `wake()`.
 * The loop root is `rootRef` (gets `data-loop`). The canvas is sized to `hostRef`.
 */
export function useChartCanvas(draw: (f: ChartFrame) => boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(hostRef);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });

  const frame = useCallback((dt: number, t: number) => {
    const canvas = canvasRef.current;
    const { w, h, dpr } = sizeRef.current;
    if (!canvas || !w || !h) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return drawRef.current({ ctx, w, h, dt, t });
  }, []);

  const { wake } = useVisibleLoop(rootRef as RefObject<HTMLElement | null>, frame);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    sizeRef.current = { w: size.width, h: size.height, dpr: sizeCanvas(canvas, size.width, size.height) };
    wake();
  }, [size.width, size.height, wake]);

  return { rootRef, hostRef, canvasRef, size, wake };
}

// The house ease-out for entrances, usable in rAF code.
export const easeOut = cubicBezier(...(ease.out as unknown as [number, number, number, number]));
export const easeInOut = cubicBezier(...(ease.inOut as unknown as [number, number, number, number]));

// A 45 degree hatch pattern in `color`, for counterfactual and loss regions.
const hatchCache = new Map<string, CanvasPattern | null>();
export function hatchPattern(ctx: CanvasRenderingContext2D, color: string, gap = 5, width = 1): CanvasPattern | null {
  const key = `${color}|${gap}|${width}`;
  if (hatchCache.has(key)) return hatchCache.get(key)!;
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  const s = gap * 2;
  tile.width = s * 2;
  tile.height = s * 2;
  const c = tile.getContext("2d");
  if (!c) return null;
  c.scale(2, 2);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  for (let k = -s; k <= s * 2; k += gap) {
    c.moveTo(k, s);
    c.lineTo(k + s, 0);
  }
  c.stroke();
  const pattern = ctx.createPattern(tile, "repeat");
  pattern?.setTransform(new DOMMatrix().scale(0.5, 0.5));
  hatchCache.set(key, pattern);
  return pattern;
}

// Rounded rect path with independent top and bottom radii (bars: round data end, square baseline).
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rTop: number,
  rBottom = 0,
) {
  if (w <= 0 || h <= 0) return;
  const rt = Math.min(rTop, w / 2, h / 2);
  const rb = Math.min(rBottom, w / 2, h / 2);
  ctx.moveTo(x + rt, y);
  ctx.lineTo(x + w - rt, y);
  if (rt) ctx.arcTo(x + w, y, x + w, y + rt, rt);
  ctx.lineTo(x + w, y + h - rb);
  if (rb) ctx.arcTo(x + w, y + h, x + w - rb, y + h, rb);
  ctx.lineTo(x + rb, y + h);
  if (rb) ctx.arcTo(x, y + h, x, y + h - rb, rb);
  ctx.lineTo(x, y + rt);
  if (rt) ctx.arcTo(x, y, x + rt, y, rt);
  ctx.closePath();
}

export interface PlacedLabel {
  text: string;
  x: number;
  y: number;
  /** translate percentages applied after the position, e.g. -50 to centre. */
  ax?: number;
  ay?: number;
  opacity?: number;
}

// Writes a pool of absolutely positioned label spans from the loop: text only when it changes,
// position by transform only. Unused spans hide.
export function writeLabels(els: (HTMLElement | null)[], cache: string[], items: PlacedLabel[]) {
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el) continue;
    const it = items[i];
    if (!it) {
      if (el.style.opacity !== "0") el.style.opacity = "0";
      continue;
    }
    if (cache[i] !== it.text) {
      cache[i] = it.text;
      el.textContent = it.text;
    }
    el.style.opacity = String(it.opacity ?? 1);
    el.style.transform = `translate3d(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px, 0) translate(${it.ax ?? 0}%, ${it.ay ?? -50}%)`;
  }
}
