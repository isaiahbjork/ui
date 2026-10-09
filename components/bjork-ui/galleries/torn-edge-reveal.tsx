"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { cubicBezier, springs } from "@/components/bjork-ui/_core/motion";
import { fbm1D, hashString, valueNoise1D } from "@/components/bjork-ui/_core/random";

export type TornEdge = "top" | "right" | "bottom" | "left";

export interface TornEdgeRevealProps {
  children: ReactNode;
  seed?: string | number;
  edges?: TornEdge[];
  tearDepth?: number;
  rimWidth?: number;
  radius?: number;
  paperColor?: string;
  reveal?: "tear" | "fade" | "none";
  revealOn?: "inView" | "mount";
  tearDuration?: number;
  lift?: boolean;
  shadow?: "soft" | "lift" | "none";
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

// Clockwise order. Also the order used to derive per-edge noise seeds.
const EDGE_ORDER: readonly TornEdge[] = ["top", "right", "bottom", "left"];
const SAMPLE_STEP = 6; // px between torn samples
const STRIP_SPAN = 24; // px per falling strip
const FALL_MS = 420;
const MIN_TEAR_SIZE = 48;
const ATTRACT_MS = 6000;
const ATTRACT_IDLE_MS = 4000;
const RESIZE_DEBOUNCE_MS = 100;
const HOVER_LIFT = { y: -3, rotate: -0.3 } as const;
const easeOut = cubicBezier(0.23, 1, 0.32, 1);

// Paper fibre: fractal noise tinted to 6% brown. Rasterises once.
const FIBRE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.4706  0 0 0 0 0.3765  0 0 0 0 0.251  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23f)'/></svg>\")";

const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

interface EdgeFrame {
  x: number;
  y: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  length: number;
}

interface TearSample {
  s: number;
  depth: number;
  rim: number;
}

interface TearEdge {
  frame: EdgeFrame;
  samples: TearSample[];
  step: number;
}

interface TearModel {
  w: number;
  h: number;
  r: number;
  tears: Partial<Record<TornEdge, TearEdge>>;
}

interface StripShape {
  key: string;
  edge: TornEdge;
  uCenter: number;
  d: string;
  ox: number;
  oy: number;
}

interface TearOptions {
  seed: string | number;
  edges: TornEdge[];
  tearDepth: number;
  rimWidth: number;
  radius: number;
}

function edgeFrame(edge: TornEdge, w: number, h: number): EdgeFrame {
  // Origin, travel direction (clockwise), and inward normal for each edge.
  switch (edge) {
    case "top":
      return { x: 0, y: 0, dx: 1, dy: 0, nx: 0, ny: 1, length: w };
    case "right":
      return { x: w, y: 0, dx: 0, dy: 1, nx: -1, ny: 0, length: h };
    case "bottom":
      return { x: w, y: h, dx: -1, dy: 0, nx: 0, ny: -1, length: w };
    case "left":
      return { x: 0, y: h, dx: 0, dy: -1, nx: 1, ny: 0, length: h };
  }
}

function pointAt(f: EdgeFrame, s: number, inward: number) {
  return { x: f.x + f.dx * s + f.nx * inward, y: f.y + f.dy * s + f.ny * inward };
}

function depthAt(tear: TearEdge, s: number): number {
  const { samples, step } = tear;
  const i = Math.min(samples.length - 2, Math.max(0, Math.floor(s / step)));
  const t = Math.min(1, Math.max(0, (s - i * step) / step));
  return samples[i].depth + (samples[i + 1].depth - samples[i].depth) * t;
}

function buildTearModel(w: number, h: number, opts: TearOptions): TearModel {
  const r = Math.max(0, Math.min(opts.radius, w / 2, h / 2));
  const seedNum = typeof opts.seed === "number" ? Math.trunc(opts.seed) : hashString(opts.seed);
  const tears: Partial<Record<TornEdge, TearEdge>> = {};
  const torn = EDGE_ORDER.filter((edge) => opts.edges.includes(edge));
  torn.forEach((edge, k) => {
    const frame = edgeFrame(edge, w, h);
    const count = Math.max(2, Math.ceil(frame.length / SAMPLE_STEP));
    const base = seedNum + k * 97;
    const fbm = fbm1D(base);
    const vDepth = valueNoise1D(base + 1);
    const vRim = valueNoise1D(base + 2);
    const samples: TearSample[] = [];
    for (let i = 0; i <= count; i++) {
      const s = (i * frame.length) / count;
      const t = 1;
      const depth =
        Math.max(0, opts.tearDepth * 14 * (0.5 + 0.5 * fbm(s / 90)) + vDepth(s / 7) * 1.2) * t;
      const rim = opts.rimWidth * (0.6 + 0.8 * (vRim(s / 40) * 0.5 + 0.5)) * t;
      samples.push({ s, depth, rim });
    }
    tears[edge] = { frame, samples, step: frame.length / count };
  });
  return { w, h, r, tears };
}

function inwardAt(tear: TearEdge, j: number, p: number, rimMode: boolean): number {
  const sample = tear.samples[j];
  const torn = p >= 1 || sample.s / tear.frame.length < p;
  return torn ? (rimMode ? sample.depth + sample.rim : sample.depth) : 0;
}

// Outline of the paper (rimMode false) or the media window (rimMode true).
// Torn samples with normalised position u < p use their offsets. Others are straight.
function outlinePath(m: TearModel, p: number, rimMode: boolean): string {
  const fmt = (v: number) => v.toFixed(2);
  const parts: string[] = [];
  const at = (i: number) => EDGE_ORDER[(i + EDGE_ORDER.length) % EDGE_ORDER.length];
  const straight = (i: number) => m.tears[at(i)] === undefined;
  // A corner is rounded only where both edges meeting there are straight.
  const roundStart = (i: number) => m.r > 0 && straight(i) && straight(i - 1);
  const roundEnd = (i: number) => m.r > 0 && straight(i) && straight(i + 1);
  const emit = (kind: "M" | "L" | "Q", pt: { x: number; y: number }, ctrl?: { x: number; y: number }) => {
    const end = `${fmt(pt.x)} ${fmt(pt.y)}`;
    if (kind === "Q" && ctrl) parts.push(`Q${fmt(ctrl.x)} ${fmt(ctrl.y)} ${end}`);
    else parts.push(`${kind}${end}`);
  };
  let start: { x: number; y: number } | null = null;
  for (let i = 0; i < EDGE_ORDER.length; i++) {
    const edge = EDGE_ORDER[i];
    const f = edgeFrame(edge, m.w, m.h);
    const corner = { x: f.x, y: f.y };
    const tear = m.tears[edge];
    if (tear) {
      const prev = m.tears[at(i - 1)];
      const next = m.tears[at(i + 1)];
      const last = tear.samples.length - 1;
      for (let j = 0; j < tear.samples.length; j++) {
        const sample = tear.samples[j];
        const inward = inwardAt(tear, j, p, rimMode);
        // Where two torn edges meet, both end on the same inner point, so the corner is cut inward, never spiked.
        let s = sample.s;
        if (j === 0 && prev) s = inwardAt(prev, prev.samples.length - 1, p, rimMode);
        if (j === last && next) s = f.length - inwardAt(next, 0, p, rimMode);
        const pt = pointAt(f, s, inward);
        if (start === null) {
          start = pt;
          emit("M", pt);
        } else {
          emit("L", pt);
        }
      }
      continue;
    }
    const rs = roundStart(i) ? m.r : 0;
    const re = roundEnd(i) ? m.r : 0;
    const a = pointAt(f, rs, 0);
    const b = pointAt(f, f.length - re, 0);
    if (start === null) {
      start = a;
      emit("M", a);
    } else {
      emit(rs > 0 ? "Q" : "L", a, corner);
    }
    emit("L", b);
  }
  // Close back to the start, rounding the top-left corner if it is straight.
  if (start !== null) {
    if (roundStart(0)) emit("Q", start, { x: 0, y: 0 });
    else emit("L", start);
  }
  parts.push("Z");
  return parts.join(" ");
}

function buildStrips(m: TearModel): StripShape[] {
  const out: StripShape[] = [];
  for (const edge of EDGE_ORDER) {
    const tear = m.tears[edge];
    if (!tear) continue;
    const { frame: f } = tear;
    const count = Math.max(1, Math.ceil(f.length / STRIP_SPAN));
    for (let k = 0; k < count; k++) {
      const sa = (k * f.length) / count;
      const sb = ((k + 1) * f.length) / count;
      const steps = Math.max(2, Math.ceil((sb - sa) / SAMPLE_STEP));
      const pts: { x: number; y: number }[] = [];
      for (let j = 0; j <= steps; j++) {
        const s = sa + ((sb - sa) * j) / steps;
        pts.push(pointAt(f, s, depthAt(tear, s)));
      }
      for (let j = steps; j >= 0; j--) {
        const s = sa + ((sb - sa) * j) / steps;
        pts.push(pointAt(f, s, 0));
      }
      const ox = pts.reduce((sum, pt) => sum + pt.x, 0) / pts.length;
      const oy = pts.reduce((sum, pt) => sum + pt.y, 0) / pts.length;
      const d = `M${pts.map((pt) => `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" L")} Z`;
      out.push({
        key: `${edge}-${k}`,
        edge,
        uCenter: (sa + sb) / 2 / f.length,
        d,
        ox,
        oy,
      });
    }
  }
  return out;
}

/** Static torn outline for a box, as a clip-path path string. Same inputs give the same string. */
export function tornEdgePath(
  size: { width: number; height: number },
  opts: {
    seed: string | number;
    edges: TornEdge[];
    tearDepth: number;
    radius: number;
    inset?: number;
  },
): string {
  const model = buildTearModel(size.width, size.height, {
    seed: opts.seed,
    edges: opts.edges,
    tearDepth: opts.tearDepth,
    rimWidth: opts.inset ?? 0,
    radius: opts.radius,
  });
  return outlinePath(model, 1, opts.inset !== undefined && opts.inset > 0);
}

/**
 * Mean inward depth of one torn edge, in px. The depth formula's fBm term averages to zero,
 * so the mean is 7 x tearDepth. The component uses it to pull the layout box up to the optical paper edge.
 */
export function tornEdgeOffset(tearDepth = 0.6): number {
  return 7 * tearDepth;
}

function shadowFilter(shadow: "soft" | "lift" | "none", tone: BjorkTone): string | undefined {
  if (shadow === "none") return undefined;
  const light = tone === "light";
  if (shadow === "lift") {
    return light
      ? "drop-shadow(0 20px 36px rgba(66,52,33,0.18))"
      : "drop-shadow(0 20px 32px rgba(0,0,0,0.35))";
  }
  return light
    ? "drop-shadow(0 10px 18px rgba(66,52,33,0.18))"
    : "drop-shadow(0 10px 16px rgba(0,0,0,0.35))";
}

export function TornEdgeReveal({
  children,
  seed = "bjork",
  edges = ["bottom"],
  tearDepth = 0.6,
  rimWidth = 4,
  radius = 4,
  paperColor = "#f3eee4",
  reveal = "tear",
  revealOn = "inView",
  tearDuration = 700,
  lift = true,
  shadow = "soft",
  tone,
  attract = false,
  className,
}: TornEdgeRevealProps) {
  const resolvedTone = useBjorkTone(tone);
  const reduceRaw = useReducedMotion();
  // Gate on mount so the server and first client render agree.
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const reduce = mounted && reduceRaw === true;
  const effectiveReveal = reduce ? "none" : reveal;

  const rootRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const modelRef = useRef<TearModel | null>(null);
  const runRef = useRef({
    active: false,
    pending: false,
    startAt: 0,
    lastP: null as number | null,
    fallAt: [] as (number | undefined)[],
  });
  const lastInputRef = useRef(0);

  // Measured size, debounced after the first reading so resizes settle before regenerating.
  const measured = useElementSize(rootRef);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (measured.width === size.width && measured.height === size.height) return;
    const id = window.setTimeout(
      () => setSize(measured),
      size.width === 0 ? 0 : RESIZE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [measured, size]);

  const [attractStep, setAttractStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [stripsOn, setStripsOn] = useState(false);

  const edgeKey = EDGE_ORDER.filter((edge) => edges.includes(edge)).join(",");
  const tearable = size.width >= MIN_TEAR_SIZE && size.height >= MIN_TEAR_SIZE;
  const seedBase = typeof seed === "number" ? Math.trunc(seed) : hashString(seed);
  const effectiveSeed = seedBase + attractStep;

  const model = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    const list = edgeKey ? (edgeKey.split(",") as TornEdge[]) : [];
    return buildTearModel(size.width, size.height, {
      seed: effectiveSeed,
      edges: tearable ? list : [],
      tearDepth,
      rimWidth,
      radius,
    });
  }, [size.width, size.height, effectiveSeed, edgeKey, tearable, tearDepth, rimWidth, radius]);

  const strips = useMemo(
    () => (model && effectiveReveal === "tear" ? buildStrips(model) : []),
    [model, effectiveReveal],
  );

  const restP = effectiveReveal === "tear" ? 0 : 1;

  const paint = useCallback((p: number) => {
    const m = modelRef.current;
    const paper = paperRef.current;
    const media = mediaRef.current;
    if (!m || !paper || !media) return;
    paper.style.clipPath = `path('${outlinePath(m, p, false)}')`;
    media.style.clipPath = `path('${outlinePath(m, p, true)}')`;
  }, []);

  // Keep the painted outline in sync with the model, the same frame it changes.
  useLayoutEffect(() => {
    modelRef.current = model;
    paint(runRef.current.lastP ?? restP);
  }, [model, paint, restP]);

  const frame = useCallback(() => {
    const r = runRef.current;
    if (!r.active) return false;
    const now = performance.now();
    if (r.pending) {
      r.pending = false;
      r.startAt = now;
      r.lastP = 0;
      r.fallAt = [];
      stripRefs.current.forEach((el) => {
        if (!el) return;
        el.style.opacity = "0";
        el.style.transform = "";
      });
    }
    const elapsed = now - r.startAt;
    const p = easeOut(Math.min(1, elapsed / tearDuration));
    r.lastP = p;
    paint(p);
    strips.forEach((strip, i) => {
      const el = stripRefs.current[i];
      if (!el) return;
      if (r.fallAt[i] === undefined && p >= strip.uCenter) r.fallAt[i] = elapsed;
      const fallAt = r.fallAt[i];
      if (fallAt === undefined) return;
      const e = easeOut(Math.min(1, (elapsed - fallAt) / FALL_MS));
      el.style.opacity = String(1 - e);
      el.style.transform = `translate3d(0, ${(24 * e).toFixed(2)}px, 0) rotate(${(4 * e).toFixed(2)}deg)`;
    });
    if (elapsed >= tearDuration + FALL_MS) {
      r.active = false;
      r.lastP = 1;
      paint(1);
      setStripsOn(false);
      return false;
    }
    return true;
  }, [paint, strips, tearDuration]);

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: effectiveReveal === "tear" });

  const play = useCallback(() => {
    const r = runRef.current;
    r.active = true;
    r.pending = true;
    setStarted(true);
    setStripsOn(true);
    wake();
  }, [wake]);

  useEffect(() => {
    if (effectiveReveal === "none" || revealOn !== "mount") return;
    const id = window.setTimeout(play, 0);
    return () => window.clearTimeout(id);
  }, [effectiveReveal, revealOn, play]);

  useEffect(() => {
    if (effectiveReveal === "none" || revealOn !== "inView") return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(play, 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        play();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [effectiveReveal, revealOn, play]);

  // Attract: replay the tear with the next seed every 6s. Pauses for 4s after any input.
  useEffect(() => {
    if (!attract || effectiveReveal !== "tear") return;
    const id = window.setInterval(() => {
      if (performance.now() - lastInputRef.current < ATTRACT_IDLE_MS) return;
      setAttractStep((step) => step + 1);
      play();
    }, ATTRACT_MS);
    return () => window.clearInterval(id);
  }, [attract, effectiveReveal, play]);

  const noteInput = useCallback(() => {
    lastInputRef.current = performance.now();
  }, []);

  const bottomTorn = edgeKey.split(",").includes("bottom");
  // Optical: pull the layout box up by the torn edge's mean depth, so rows align on the paper edge.
  // Value: -tornEdgeOffset(tearDepth), 4.2px at the default depth 0.6. Reason: the rim sits on the paper, not the box.
  const bottomOffset = bottomTorn ? -tornEdgeOffset(tearDepth) : undefined;
  const showStrips = stripsOn && effectiveReveal === "tear" ? strips : [];
  const fade = effectiveReveal === "fade";

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      style={{ filter: shadowFilter(shadow, resolvedTone), marginBottom: bottomOffset }}
      onPointerEnter={noteInput}
      onPointerDown={noteInput}
      onKeyDown={noteInput}
      onFocus={noteInput}
    >
      <motion.div
        className="relative"
        {...(fade
          ? {
              initial: { opacity: 0 },
              animate: { opacity: started ? 1 : 0 },
              transition: { duration: 0.24, ease: easeOut },
            }
          : {})}
        whileHover={lift && !reduce ? { ...HOVER_LIFT, transition: springs.standard } : undefined}
      >
        <div
          ref={paperRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: paperColor, backgroundImage: FIBRE }}
        />
        <div ref={mediaRef} className="relative">
          {children}
        </div>
        {showStrips.map((strip, i) => (
          <div
            key={strip.key}
            ref={(el) => {
              stripRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: 0,
              clipPath: `path('${strip.d}')`,
              transformOrigin: `${strip.ox}px ${strip.oy}px`,
              backgroundColor: paperColor,
              backgroundImage: FIBRE,
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
