"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { catmullRomToBezier, resamplePath } from "@/components/bjork-ui/_core/path";
import { hashString, mulberry32 } from "@/components/bjork-ui/_core/random";

export interface ElasticFrameHandle {
  /** Pulls the string outward near `at` (0 to 1 along the outline) by `strength` px and lets it ring. */
  pluck: (at: number, strength?: number) => void;
}

export interface ElasticFrameProps {
  /** Content. Its corner radius should be `radius - padding / 2` so it sits concentric with the frame. */
  children?: ReactNode;
  radius?: number;
  points?: number;
  stiffness?: number;
  coupling?: number;
  damping?: number;
  pluckDistance?: number;
  maxStretch?: number;
  strokeWidth?: number;
  glow?: boolean;
  glowColor?: string;
  padding?: number;
  tone?: BjorkTone;
  attract?: boolean;
  /** Posed state: one frozen displaced frame with no loop. Used by preview captures. */
  debugState?: { at: number; amount: number };
  className?: string;
}

// The outline sits 12px inside the root. Half-pixel values keep the 1.5px straight runs crisp.
const INSET = 12.5;
const SUBSTEP = 1 / 240;
const GRAB_ARC = 40;
const GRAB_SIGMA = 18;
const GRAB_GAIN = 400;
const PLUCK_SIGMA = 22;
const POSE_SIGMA = 56;
const BREATH_IMPULSE = 40;
const ATTRACT_INTERVAL = 2800;
const ATTRACT_IDLE = 4000;
const ATTRACT_STRENGTH = 30;
const DEFAULT_PLUCK = 24;
const IDLE_EPS = 0.05;
const GLOW_WIDTH = 6;
const GLOW_ALPHA = 0.18;

type RGB = [number, number, number];

interface Colors {
  rest: RGB;
  ink: RGB;
}

interface Outline {
  width: number;
  height: number;
  count: number;
  rest: Float32Array;
  normal: Float32Array;
  spacing: number;
}

interface Sim {
  o: Float32Array;
  v: Float32Array;
  acc: Float32Array;
  pts: Float32Array;
}

interface Grab {
  j: number;
  s: number;
}

interface Params {
  stiffness: number;
  coupling: number;
  damping: number;
  maxStretch: number;
  pluckDistance: number;
}

interface Bounds {
  left: number;
  top: number;
  sx: number;
  sy: number;
}

function roundedRectPath(x0: number, y0: number, x1: number, y1: number, r: number): string {
  return [
    `M${x0 + r} ${y0}`,
    `H${x1 - r}`,
    `A${r} ${r} 0 0 1 ${x1} ${y0 + r}`,
    `V${y1 - r}`,
    `A${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `H${x0 + r}`,
    `A${r} ${r} 0 0 1 ${x0} ${y1 - r}`,
    `V${y0 + r}`,
    `A${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    "Z",
  ].join(" ");
}

// Rest outline: equal arc-length samples plus outward unit normals, all in root coordinates.
function buildOutline(width: number, height: number, radius: number, count: number): Outline | null {
  if (width < 40 || height < 40) return null;
  const x0 = INSET;
  const y0 = INSET;
  const x1 = width - INSET;
  const y1 = height - INSET;
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const perimeter = 2 * (x1 - x0 - 2 * r) + 2 * (y1 - y0 - 2 * r) + 2 * Math.PI * r;

  // The sampler returns count + 1 points; the last one repeats the first.
  const sampled = resamplePath(roundedRectPath(x0, y0, x1, y1, r), count + 1);
  const rest = new Float32Array(count * 2);
  const normal = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    rest[i * 2] = sampled[i * 2];
    rest[i * 2 + 1] = sampled[i * 2 + 1];
  }
  for (let i = 0; i < count; i++) {
    const prev = (i - 1 + count) % count;
    const next = (i + 1) % count;
    const tx = rest[next * 2] - rest[prev * 2];
    const ty = rest[next * 2 + 1] - rest[prev * 2 + 1];
    const len = Math.hypot(tx, ty) || 1;
    // Clockwise in screen space, so (ty, -tx) points outward.
    normal[i * 2] = ty / len;
    normal[i * 2 + 1] = -tx / len;
  }
  return { width, height, count, rest, normal, spacing: perimeter / count };
}

function createSim(count: number): Sim {
  return {
    o: new Float32Array(count),
    v: new Float32Array(count),
    acc: new Float32Array(count),
    pts: new Float32Array(count * 2),
  };
}

// Shortest index distance around the closed loop, in px of arc length.
function arcPx(i: number, at: number, count: number, spacing: number): number {
  const d = Math.abs(i - at);
  return Math.min(d, count - d) * spacing;
}

function applyPose(sim: Sim, g: Outline, at: number, amount: number) {
  const idx = (((at % 1) + 1) % 1) * g.count;
  for (let i = 0; i < g.count; i++) {
    const d = arcPx(i, idx, g.count, g.spacing);
    sim.o[i] = amount * Math.exp(-(d * d) / (2 * POSE_SIGMA * POSE_SIGMA));
    sim.v[i] = 0;
  }
}

function pluckSim(g: Outline | null, sim: Sim | null, at: number, strength: number): boolean {
  if (!g || !sim) return false;
  const idx = (((at % 1) + 1) % 1) * g.count;
  for (let i = 0; i < g.count; i++) {
    const d = arcPx(i, idx, g.count, g.spacing);
    sim.o[i] += strength * Math.exp(-(d * d) / (2 * PLUCK_SIGMA * PLUCK_SIGMA));
  }
  return true;
}

// Semi-implicit Euler in 1/240s substeps: a = -k·o + c·laplacian(o) - d·v + grab force.
function stepSim(sim: Sim, g: Outline, grab: Grab | null, p: Params, dt: number) {
  const n = g.count;
  const { o, v, acc } = sim;
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 1e-6));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) {
      const prev = i === 0 ? n - 1 : i - 1;
      const next = i === n - 1 ? 0 : i + 1;
      const lap = o[prev] + o[next] - 2 * o[i];
      let force = 0;
      if (grab) {
        const d = arcPx(i, grab.j, n, g.spacing);
        if (d <= GRAB_ARC) {
          const target = Math.min(p.maxStretch, Math.max(-p.maxStretch, grab.s));
          force = GRAB_GAIN * (target - o[i]) * Math.exp(-(d * d) / (2 * GRAB_SIGMA * GRAB_SIGMA));
        }
      }
      acc[i] = -p.stiffness * o[i] + p.coupling * lap - p.damping * v[i] + force;
    }
    for (let i = 0; i < n; i++) {
      v[i] += acc[i] * h;
      o[i] += v[i] * h;
    }
  }
}

function maxAbs(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Math.abs(a[i]);
    if (x > m) m = x;
  }
  return m;
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColor(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// Writes the displaced outline to both paths. Returns max |o|, used for energy and dev checks.
function paintSim(
  sim: Sim,
  g: Outline,
  maxStretch: number,
  colors: Colors,
  main: SVGPathElement | null,
  glow: SVGPathElement | null,
): number {
  const { o, pts } = sim;
  let maxO = 0;
  for (let i = 0; i < g.count; i++) {
    const off = o[i];
    const a = Math.abs(off);
    if (a > maxO) maxO = a;
    pts[i * 2] = g.rest[i * 2] + g.normal[i * 2] * off;
    pts[i * 2 + 1] = g.rest[i * 2 + 1] + g.normal[i * 2 + 1] * off;
  }
  const d = catmullRomToBezier(pts, true);
  const energy = Math.min(1, maxO / maxStretch);
  if (main) {
    main.setAttribute("d", d);
    main.setAttribute("stroke", mixColor(colors.rest, colors.ink, energy));
  }
  if (glow) {
    glow.setAttribute("d", d);
    glow.setAttribute("stroke-opacity", String(GLOW_ALPHA * energy));
  }
  return maxO;
}

/**
 * A frame drawn as a tensioned string. Bring the pointer near an edge to pluck it;
 * it rings back to rest. Children sit centred inside `padding`.
 * Concentric content: give children `borderRadius: radius - padding / 2`.
 */
export const ElasticFrame = forwardRef<ElasticFrameHandle, ElasticFrameProps>(function ElasticFrame(
  {
    children,
    radius = 24,
    points = 64,
    stiffness = 180,
    coupling = 900,
    damping = 14,
    pluckDistance = 36,
    maxStretch = 28,
    strokeWidth = 1.5,
    glow = true,
    glowColor,
    padding = 32,
    tone,
    attract = false,
    debugState,
    className,
  },
  ref,
) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const reduce = useReducedMotion() === true;
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const size = useElementSize(rootRef);
  const outline = useMemo(
    () => buildOutline(size.width, size.height, radius, points),
    [size.width, size.height, radius, points],
  );

  const debugAt = debugState?.at;
  const debugAmount = debugState?.amount ?? 0;
  const glowCss = glowColor ?? palette.accent;
  const colors = useMemo<Colors>(
    () => ({
      rest: hexToRgb(palette.borderStrong),
      ink: hexToRgb(palette.accentInk),
    }),
    [palette],
  );

  const outlineRef = useRef<Outline | null>(null);
  const simRef = useRef<Sim | null>(null);
  const grabRef = useRef<Grab | null>(null);
  const boundsRef = useRef<Bounds | null>(null);
  const lastInputRef = useRef(Number.NEGATIVE_INFINITY);
  const reduceRef = useRef(reduce);
  const colorsRef = useRef<Colors>(colors);
  const wakeRef = useRef<() => void>(() => {});
  const measureRef = useRef<(() => void) | null>(null);
  const paramsRef = useRef<Params>({
    stiffness,
    coupling,
    damping,
    maxStretch,
    pluckDistance,
  });

  const frame = (dt: number): boolean => {
    const g = outlineRef.current;
    const sim = simRef.current;
    if (!g || !sim) return false;
    const p = paramsRef.current;
    const grab = grabRef.current;
    stepSim(sim, g, grab, p, dt);
    const maxO = paintSim(sim, g, p.maxStretch, colorsRef.current, mainRef.current, glowRef.current);
    if (process.env.NODE_ENV !== "production" && rootRef.current) {
      rootRef.current.dataset.maxOffset = maxO.toFixed(2);
    }
    if (!grab && maxO < IDLE_EPS && maxAbs(sim.v) < IDLE_EPS) {
      sim.o.fill(0);
      sim.v.fill(0);
      paintSim(sim, g, p.maxStretch, colorsRef.current, mainRef.current, glowRef.current);
      return false;
    }
    return true;
  };

  const loop = useVisibleLoop(rootRef, frame, { enabled: !reduce && debugAt === undefined });

  useImperativeHandle(
    ref,
    () => ({
      pluck: (at: number, strength = DEFAULT_PLUCK) => {
        if (reduceRef.current) return;
        if (pluckSim(outlineRef.current, simRef.current, at, strength)) wakeRef.current();
      },
    }),
    [],
  );

  // Keep the latest props and loop handle visible to the rAF and pointer callbacks.
  useEffect(() => {
    paramsRef.current = { stiffness, coupling, damping, maxStretch, pluckDistance };
    wakeRef.current = loop.wake;
  });

  // Geometry, reduced motion and posed state: rebuild the sim and paint once.
  useEffect(() => {
    reduceRef.current = reduce;
    outlineRef.current = outline;
    const sim = outline ? createSim(outline.count) : null;
    simRef.current = sim;
    grabRef.current = null;
    measureRef.current?.();
    if (outline && sim) {
      if (debugAt !== undefined) applyPose(sim, outline, debugAt, debugAmount);
      paintSim(sim, outline, paramsRef.current.maxStretch, colorsRef.current, mainRef.current, glowRef.current);
      wakeRef.current();
    }
  }, [outline, debugAt, debugAmount, reduce]);

  // Colour and glow changes repaint without resetting the string.
  useEffect(() => {
    colorsRef.current = colors;
    const g = outlineRef.current;
    const sim = simRef.current;
    if (g && sim) paintSim(sim, g, paramsRef.current.maxStretch, colors, mainRef.current, glowRef.current);
  }, [colors, glow]);

  // Pointer proximity. The pluck zone reaches 36px outside the element, so the listeners sit on
  // window. They are attached only while the frame is near the viewport.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let listening = false;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const g = outlineRef.current;
      boundsRef.current = {
        left: r.left,
        top: r.top,
        sx: g && g.width ? r.width / g.width : 1,
        sy: g && g.height ? r.height / g.height : 1,
      };
    };
    measureRef.current = measure;

    const release = () => {
      if (grabRef.current) {
        grabRef.current = null;
        wakeRef.current();
      }
    };

    const onMove = (e: PointerEvent) => {
      const b = boundsRef.current;
      const g = outlineRef.current;
      const sim = simRef.current;
      if (!b || !g || !sim || reduceRef.current) return;
      const p = paramsRef.current;
      const px = (e.clientX - b.left) / b.sx;
      const py = (e.clientY - b.top) / b.sy;
      const zone = p.pluckDistance;
      if (px < -zone || py < -zone || px > g.width + zone || py > g.height + zone) {
        release();
        return;
      }
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let j = 0; j < g.count; j++) {
        const dx = px - g.rest[j * 2];
        const dy = py - g.rest[j * 2 + 1];
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = j;
        }
      }
      // Signed distance along the nearest normal: positive is outside the frame.
      const s =
        (px - g.rest[best * 2]) * g.normal[best * 2] + (py - g.rest[best * 2 + 1]) * g.normal[best * 2 + 1];
      lastInputRef.current = performance.now();
      if (Math.abs(s) <= p.maxStretch + 8) {
        grabRef.current = { j: best, s };
        wakeRef.current();
      } else {
        release();
      }
    };

    // Pointer left the window: nothing is held any more.
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) release();
    };

    const onViewport = () => measure();

    const start = () => {
      if (listening) return;
      listening = true;
      measure();
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerout", onOut, { passive: true });
      window.addEventListener("scroll", onViewport, { passive: true, capture: true });
      window.addEventListener("resize", onViewport, { passive: true });
    };

    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("scroll", onViewport, { capture: true });
      window.removeEventListener("resize", onViewport);
      grabRef.current = null;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) start();
        else stop();
      },
      { rootMargin: "96px" },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      stop();
      measureRef.current = null;
    };
  }, []);

  // Attract: a seeded pluck every 2.8s, paused while the pointer or keyboard is inside.
  useEffect(() => {
    if (!attract) return;
    const rng = mulberry32(hashString("elastic-frame"));
    const id = window.setInterval(() => {
      if (reduceRef.current) return;
      if (performance.now() - lastInputRef.current < ATTRACT_IDLE) return;
      if (pluckSim(outlineRef.current, simRef.current, rng(), ATTRACT_STRENGTH)) wakeRef.current();
    }, ATTRACT_INTERVAL);
    return () => window.clearInterval(id);
  }, [attract]);

  const onFocus = () => {
    lastInputRef.current = performance.now();
    if (reduceRef.current) return;
    const sim = simRef.current;
    if (!sim) return;
    for (let i = 0; i < sim.v.length; i++) sim.v[i] += BREATH_IMPULSE;
    wakeRef.current();
  };

  const onPointerDown = () => {
    lastInputRef.current = performance.now();
  };

  return (
    <div
      ref={rootRef}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      className={cn("relative isolate w-full", className)}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        {glow ? (
          <path
            ref={glowRef}
            fill="none"
            stroke={glowCss}
            strokeWidth={GLOW_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <path
          ref={mainRef}
          fill="none"
          stroke={palette.borderStrong}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="relative flex h-full w-full items-center justify-center" style={{ padding }}>
        {children}
      </div>
    </div>
  );
});

/** Pulls the frame from outside through a ref: `pluck(frameRef, 0.4, 26)`. */
export function pluck(
  target: { current: ElasticFrameHandle | null },
  at: number,
  strength?: number,
): void {
  target.current?.pluck(at, strength);
}
