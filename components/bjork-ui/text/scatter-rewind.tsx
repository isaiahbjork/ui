"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop, isCoarsePointer } from "@/components/bjork-ui/_core/loop";
import { defaultMaxDpr, sizeCanvas } from "@/components/bjork-ui/_core/canvas";
import { hashString, mulberry32 } from "@/components/bjork-ui/_core/random";

export type ScatterRewindPhase = "intact" | "dissolving" | "scattered" | "rewinding";
export type ScatterRewindTrigger = "inView" | "hover" | "click" | "manual";

export interface ScatterRewindProps {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  trigger?: ScatterRewindTrigger;
  /** Manual mode only. 0 is intact, 1 is fully scattered. */
  progress?: number;
  /** Dissolve time in ms. */
  duration?: number;
  /** Rewind time in ms. */
  rewindDuration?: number;
  /** Hold time in ms at the scattered frame before the rewind starts (inView only). */
  holdMs?: number;
  /** Repeat the inView cycle. Forced on by `attract`. */
  loop?: boolean;
  /** Wind direction in degrees. Negative is up and to the right. */
  windAngle?: number;
  /** How far, in px, the dust may travel along the wind. */
  spill?: number;
  accentRatio?: number;
  /** Particle cap. Defaults to 1400, or 700 on coarse pointers. */
  maxParticles?: number;
  seed?: string;
  onPhaseChange?: (phase: ScatterRewindPhase) => void;
  tone?: BjorkTone;
  /** Plays the inView cycle on loop. Pauses on pointer or key input for 4s. Static under reduced motion. */
  attract?: boolean;
  className?: string;
  /**
   * Test only. Shows the particle canvas at T = 0 (the heading is hidden) so its
   * ink overlap with the heading can be measured.
   */
  debugShowCanvasAt0?: boolean;
}

// Sampling grid in CSS px. The plan's `step = 3 x DPR` in device px is 3 CSS px.
const STEP_CSS = 3;
// Canvas margin beyond the spill, on every side, for the wobble and the drift spread.
const CANVAS_PAD = 40;
const FLIGHT = 0.25;
const PERP_WOBBLE = 8;
const DUST_ALPHA_FLOOR = 0.2;
const FIRST_DELAY = 1.2;
const LOOP_DELAY = 2;
const RESUME_DELAY = 1;
const REDUCED_FADE = 0.3;
const REDUCED_OPACITY = 0.15;
const ATTRACT_IDLE_MS = 4000;

const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

interface Particles {
  n: number;
  hx: Float32Array;
  hy: Float32Array;
  dx: Float32Array;
  dy: Float32Array;
  rel: Float32Array;
  ph: Float32Array;
  acc: Uint8Array;
}

interface Scene {
  particles: Particles;
  left: number;
  top: number;
  width: number;
  height: number;
  wx: number;
  wy: number;
}

interface Sim {
  /** Global time, 0 intact to 1 scattered. */
  t: number;
  target: number;
  dir: number;
  timer: number | null;
  next: "dissolve" | "rewind" | null;
  started: boolean;
  paused: boolean;
}

interface Live {
  root: HTMLDivElement | null;
  heading: HTMLElement | null;
  canvas: HTMLCanvasElement | null;
  scene: Scene | null;
  dpr: number;
  phase: ScatterRewindPhase;
}

interface Snapshot {
  text: string;
  reduce: boolean;
  attract: boolean;
  trigger: ScatterRewindTrigger;
  loop: boolean;
  duration: number;
  rewindDuration: number;
  holdMs: number;
  tone: BjorkTone;
  debug: boolean;
  onPhaseChange?: (phase: ScatterRewindPhase) => void;
}

function clamp01(n: number) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function newSim(): Sim {
  return { t: 0, target: 0, dir: 1, timer: null, next: null, started: false, paused: false };
}

// Advances the global time T and the automatic inView timeline. Returns true while the loop should keep running.
function stepSim(dt: number, p: Snapshot, sim: Sim): boolean {
  if (p.trigger === "manual") return false;
  const auto = p.attract || p.trigger === "inView";

  if (p.attract && p.reduce) {
    sim.t = 0;
    sim.target = 0;
    sim.timer = null;
    sim.next = null;
    return false;
  }
  if (auto && sim.paused) return false;

  if (auto && !sim.started) {
    sim.started = true;
    sim.timer = FIRST_DELAY;
    sim.next = "dissolve";
  }
  if (auto && sim.timer !== null) {
    sim.timer -= dt;
    if (sim.timer <= 0) {
      sim.target = sim.next === "rewind" ? 0 : 1;
      sim.timer = null;
      sim.next = null;
    }
  }

  const prev = sim.t;
  const dur = p.reduce ? REDUCED_FADE : p.duration / 1000;
  const rw = p.reduce ? REDUCED_FADE : p.rewindDuration / 1000;
  const dir = sim.target > sim.t ? 1 : sim.target < sim.t ? -1 : 0;
  if (dir !== 0) {
    sim.dir = dir;
    sim.t += dir * (dir > 0 ? dt / dur : dt / rw);
    if ((dir > 0 && sim.t > sim.target) || (dir < 0 && sim.t < sim.target)) sim.t = sim.target;
  }

  if (auto) {
    if (prev < 1 && sim.t >= 1) {
      sim.next = "rewind";
      sim.timer = p.holdMs / 1000;
    }
    if (prev > 0 && sim.t <= 0) {
      if (p.loop || p.attract) {
        sim.next = "dissolve";
        sim.timer = LOOP_DELAY;
      } else {
        sim.next = null;
        sim.timer = null;
      }
    }
  }

  return sim.timer !== null || sim.t !== sim.target;
}

// Writes the frame. Stateless for the particles, so any T can be drawn exactly.
function paint(live: Live, sim: Sim, p: Snapshot) {
  const { root, heading, canvas, scene } = live;
  if (!root || !heading || !canvas) return;

  const T = sim.t;
  const phase: ScatterRewindPhase =
    T <= 0 ? "intact" : T >= 1 ? "scattered" : sim.dir > 0 ? "dissolving" : "rewinding";
  if (phase !== live.phase) {
    live.phase = phase;
    root.dataset.phase = phase;
    p.onPhaseChange?.(phase);
  } else if (root.dataset.phase !== phase) {
    root.dataset.phase = phase;
  }

  if (p.reduce) {
    heading.style.opacity = String(1 - (1 - REDUCED_OPACITY) * T);
    canvas.style.visibility = "hidden";
    return;
  }

  const showCanvas = !!scene && (T > 0 || p.debug);
  heading.style.opacity = showCanvas ? "0" : "1";
  canvas.style.visibility = showCanvas ? "visible" : "hidden";
  if (!showCanvas || !scene) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cssW = scene.width;
  const cssH = scene.height;
  const P = scene.particles;
  const { wx, wy } = scene;
  const px = -wy;
  const py = wx;

  const computed = getComputedStyle(heading).color;
  const colText = computed && computed !== "rgba(0, 0, 0, 0)" ? computed : BJORK_PALETTE[p.tone].text;
  const colAccent = BJORK_PALETTE[p.tone].accent;

  ctx.setTransform(live.dpr, 0, 0, live.dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  // Two passes: one fillStyle switch for heading ink, one for accent dust.
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? colText : colAccent;
    for (let i = 0; i < P.n; i++) {
      if (P.acc[i] !== pass) continue;
      let u = (T - P.rel[i]) / FLIGHT;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      const wob = Math.sin(u * Math.PI * 2 + P.ph[i]) * PERP_WOBBLE * u;
      const x = P.hx[i] + (P.dx[i] - P.hx[i]) * e + px * wob;
      const y = P.hy[i] + (P.dy[i] - P.hy[i]) * e + py * wob;
      const alpha = 1 - (1 - DUST_ALPHA_FLOOR) * Math.pow(u, 1.5);
      const s = 2 * (1 - 0.5 * u);
      ctx.globalAlpha = alpha;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

// Canvas-side ink mask of the heading, laid out word by word so wrapped headings sample correctly.
interface Raster {
  data: Uint8ClampedArray;
  w: number;
  h: number;
  dpr: number;
  cw: number;
  ch: number;
}

async function rasterize(heading: HTMLElement, cs: CSSStyleDeclaration, cw: number, ch: number): Promise<Raster | null> {
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  try {
    await document.fonts.load(font);
  } catch {
    // Use whatever face is loaded.
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cw * dpr));
  canvas.height = Math.max(1, Math.round(ch * dpr));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.fillStyle = "#000";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const tracking = cs.letterSpacing && cs.letterSpacing !== "normal" ? cs.letterSpacing : "0px";
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = tracking;

  const elRect = heading.getBoundingClientRect();
  const sx = heading.offsetWidth ? elRect.width / heading.offsetWidth : 1;
  const sy = heading.offsetHeight ? elRect.height / heading.offsetHeight : 1;
  const originX = elRect.left + (parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)) * sx;
  const originY = elRect.top + (parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop)) * sy;
  const transform = cs.textTransform;

  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let drawn = 0;
  while (node) {
    const data = node.nodeValue ?? "";
    for (const m of data.matchAll(/\S+/g)) {
      const start = m.index ?? 0;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + m[0].length);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const word = transform === "uppercase" ? m[0].toUpperCase() : transform === "lowercase" ? m[0].toLowerCase() : m[0];
      const x = (r.left - originX) / sx;
      const top = (r.top - originY) / sy;
      // The inline box is the font's content area, so its top plus the ascent is the baseline.
      const ascent = ctx.measureText(word).fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
      ctx.fillText(word, x, top + ascent);
      drawn++;
    }
    node = walker.nextNode();
  }
  if (!drawn) return null;

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { data, w: canvas.width, h: canvas.height, dpr, cw, ch };
}

// Grid points where the ink alpha is above 128, in CSS px of the content box.
function scan(r: Raster, step: number): Float32Array {
  const pts: number[] = [];
  for (let y = 0; y < r.ch; y += step) {
    for (let x = 0; x < r.cw; x += step) {
      const px = Math.min(r.w - 1, Math.floor(x * r.dpr));
      const py = Math.min(r.h - 1, Math.floor(y * r.dpr));
      if (r.data[(py * r.w + px) * 4 + 3] > 128) pts.push(x, y);
    }
  }
  return Float32Array.from(pts);
}

interface BuildOptions {
  text: string;
  cap: number;
  seed: string;
  windAngle: number;
  spill: number;
  accentRatio: number;
  cs: CSSStyleDeclaration;
  heading: HTMLElement;
}

async function buildScene(o: BuildOptions): Promise<Scene | null> {
  const { heading, cs } = o;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;
  const borderL = parseFloat(cs.borderLeftWidth) || 0;
  const borderT = parseFloat(cs.borderTopWidth) || 0;

  // Optical: the canvas is aligned to the text box, so subtract the padding.
  const cw = Math.round(heading.clientWidth - padL - padR);
  const ch = Math.round(heading.clientHeight - padT - padB);
  if (cw <= 0 || ch <= 0) return null;

  const raster = await rasterize(heading, cs, cw, ch);
  if (!raster) return null;

  // Sampling step grows by 1.5 until the ink count fits under the cap.
  let step = STEP_CSS;
  let xy = scan(raster, step);
  for (let i = 0; i < 8 && xy.length / 2 > o.cap; i++) {
    step *= 1.5;
    xy = scan(raster, step);
  }

  const rng = mulberry32(hashString(o.seed));
  let count = xy.length / 2;
  if (count > o.cap) {
    // Deterministic subsample: shuffle the indices with a seeded RNG, then keep the first `cap`.
    const shuffleRng = mulberry32(hashString(o.seed) ^ 0x5bd1e995);
    const idx = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(shuffleRng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const picked = new Float32Array(o.cap * 2);
    for (let k = 0; k < o.cap; k++) {
      picked[k * 2] = xy[idx[k] * 2];
      picked[k * 2 + 1] = xy[idx[k] * 2 + 1];
    }
    xy = picked;
    count = o.cap;
  }

  const angle = (o.windAngle * Math.PI) / 180;
  const wx = Math.cos(angle);
  const wy = Math.sin(angle);
  const px = -wy;
  const py = wx;

  // Canvas margin: spill along the wind on each side, plus the padding for the spread.
  const mL = CANVAS_PAD + o.spill * Math.max(0, -wx);
  const mR = CANVAS_PAD + o.spill * Math.max(0, wx);
  const mT = CANVAS_PAD + o.spill * Math.max(0, -wy);
  const mB = CANVAS_PAD + o.spill * Math.max(0, wy);

  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < count; i++) {
    const p = xy[i * 2] * wx + xy[i * 2 + 1] * wy;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  const span = maxP - minP || 1;

  const hx = new Float32Array(count);
  const hy = new Float32Array(count);
  const dx = new Float32Array(count);
  const dy = new Float32Array(count);
  const rel = new Float32Array(count);
  const ph = new Float32Array(count);
  const acc = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const x = xy[i * 2];
    const y = xy[i * 2 + 1];
    const order = (x * wx + y * wy - minP) / span;
    // Six draws per particle, always in this order, so the seed fixes every particle.
    const rA = rng();
    const rB = rng();
    const rC = rng();
    const rD = rng();
    const rE = rng();
    const rF = rng();
    rel[i] = 0.6 * order + 0.15 * rA;
    const dist = 120 + 140 * rB;
    const perpOff = (rC - 0.5) * 60;
    const upOff = -20 * rD;
    // up = (0, -1), so `up * upOff` adds -upOff to y.
    hx[i] = x + mL;
    hy[i] = y + mT;
    dx[i] = hx[i] + wx * dist + px * perpOff;
    dy[i] = hy[i] + wy * dist + py * perpOff - upOff;
    ph[i] = rE * Math.PI * 2;
    acc[i] = rF < o.accentRatio ? 1 : 0;
  }

  return {
    particles: { n: count, hx, hy, dx, dy, rel, ph, acc },
    // Canvas origin sits at the content box origin, minus the margins.
    left: heading.offsetLeft + borderL + padL - mL,
    top: heading.offsetTop + borderT + padT - mT,
    width: cw + mL + mR,
    height: ch + mT + mB,
    wx,
    wy,
  };
}

export function ScatterRewind({
  text,
  as = "h2",
  trigger = "inView",
  progress,
  duration = 1600,
  rewindDuration = 1200,
  holdMs = 900,
  loop = true,
  windAngle = -15,
  spill = 280,
  accentRatio = 0.12,
  maxParticles,
  seed = "bjork",
  onPhaseChange,
  tone,
  attract = false,
  className,
  debugShowCanvasAt0 = false,
}: ScatterRewindProps) {
  const resolvedTone = useBjorkTone(tone);
  const reducedRaw = useReducedMotion();
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const reduce = mounted && reducedRaw === true;

  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim>(newSim());
  const liveRef = useRef<Live>({ root: null, heading: null, canvas: null, scene: null, dpr: 1, phase: "intact" });
  const propsRef = useRef<Snapshot | null>(null);
  const lastTextRef = useRef<string | null>(null);
  const resumeRef = useRef<number | null>(null);
  const [sizeTick, setSizeTick] = useState(0);

  // Keeps the latest props visible to the loop and the async build without re-running effects.
  useEffect(() => {
    propsRef.current = {
      text,
      reduce,
      attract,
      trigger: attract ? "inView" : trigger,
      loop,
      duration,
      rewindDuration,
      holdMs,
      tone: resolvedTone,
      debug: debugShowCanvasAt0,
      onPhaseChange,
    };
  });

  const frame = (dt: number): boolean => {
    const p = propsRef.current;
    if (!p) return false;
    const sim = simRef.current;
    const keep = stepSim(dt, p, sim);
    paint(liveRef.current, sim, p);
    return keep;
  };

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: true });

  // Trigger and attract changes reset the timeline. Manual mode takes its T from `progress` instead.
  useEffect(() => {
    const sim = simRef.current;
    if (trigger === "manual" && !attract) return;
    sim.t = 0;
    sim.target = 0;
    sim.dir = 1;
    sim.timer = null;
    sim.next = null;
    sim.started = false;
    sim.paused = false;
    if (resumeRef.current !== null) {
      window.clearTimeout(resumeRef.current);
      resumeRef.current = null;
    }
    const p = propsRef.current;
    if (p) paint(liveRef.current, sim, { ...p, trigger: attract ? "inView" : trigger });
    wake();
  }, [trigger, attract, wake]);

  useEffect(() => {
    if (!(trigger === "manual" && !attract)) return;
    const sim = simRef.current;
    const next = clamp01(progress ?? 0);
    sim.dir = next >= sim.t ? 1 : -1;
    sim.t = next;
    sim.target = next;
    const p = propsRef.current;
    if (p) paint(liveRef.current, sim, { ...p, trigger: "manual" });
  }, [progress, trigger, attract]);

  // Builds the sampled particles. Reruns on text, box size, or any particle constant change.
  const isClick = trigger === "click";
  const hasText = text.length > 0;
  useEffect(() => {
    const live = liveRef.current;
    const root = rootRef.current;
    const heading = headingRef.current;
    const canvas = canvasRef.current;
    live.root = root;
    live.heading = heading;
    live.canvas = canvas;
    const p = propsRef.current;
    if (!root || !heading || !canvas || !p || !p.text) {
      live.scene = null;
      return;
    }
    const sim = simRef.current;
    if (lastTextRef.current !== p.text) {
      lastTextRef.current = p.text;
      sim.t = 0;
      sim.target = 0;
      sim.timer = null;
      sim.next = null;
      sim.started = false;
    }

    let cancelled = false;
    const cs = getComputedStyle(heading);
    const cap = maxParticles ?? (isCoarsePointer() ? 700 : 1400);

    (async () => {
      try {
        await document.fonts.ready;
      } catch {
        // Proceed with the fallback face.
      }
      if (cancelled) return;
      const scene = await buildScene({
        text: p.text,
        cap,
        seed,
        windAngle,
        spill,
        accentRatio,
        cs,
        heading,
      });
      if (cancelled) return;
      if (!scene) {
        live.scene = null;
        paint(live, sim, p);
        return;
      }
      live.dpr = sizeCanvas(canvas, scene.width, scene.height, defaultMaxDpr());
      canvas.style.left = `${scene.left}px`;
      canvas.style.top = `${scene.top}px`;
      live.scene = scene;
      paint(live, sim, p);
      wake();
    })();

    return () => {
      cancelled = true;
    };
  }, [text, as, className, maxParticles, seed, windAngle, spill, accentRatio, isClick, hasText, sizeTick, wake]);

  // Re-samples when the heading box changes size, since its wrap and ink change with it.
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setSizeTick((n) => n + 1));
    observer.observe(heading);
    return () => observer.disconnect();
  }, [as, hasText]);

  // A late-loading face changes the ink, so it triggers a re-sample too.
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    const onFonts = () => setSizeTick((n) => n + 1);
    fonts.addEventListener("loadingdone", onFonts);
    return () => fonts.removeEventListener("loadingdone", onFonts);
  }, []);

  // Cleanup for the attract resume timer.
  useEffect(() => {
    return () => {
      if (resumeRef.current !== null) window.clearTimeout(resumeRef.current);
    };
  }, []);

  const noteInput = () => {
    const p = propsRef.current;
    if (!p || !p.attract || p.reduce) return;
    const sim = simRef.current;
    sim.paused = true;
    if (resumeRef.current !== null) window.clearTimeout(resumeRef.current);
    resumeRef.current = window.setTimeout(() => {
      resumeRef.current = null;
      sim.paused = false;
      if (sim.t <= 0) {
        sim.target = 0;
        sim.timer = RESUME_DELAY;
        sim.next = "dissolve";
      } else {
        sim.target = 0;
        sim.timer = null;
        sim.next = null;
      }
      wake();
    }, ATTRACT_IDLE_MS);
  };

  const onEnter = () => {
    noteInput();
    const p = propsRef.current;
    if (p && p.trigger === "hover") {
      simRef.current.target = 1;
      wake();
    }
  };

  const onLeave = () => {
    const p = propsRef.current;
    if (p && p.trigger === "hover") {
      simRef.current.target = 0;
      wake();
    }
  };

  const onClick = () => {
    const sim = simRef.current;
    sim.target = sim.target >= 1 ? 0 : 1;
    sim.timer = null;
    sim.next = null;
    wake();
  };

  const Tag = as;
  if (!text) return null;

  return (
    <div
      ref={rootRef}
      data-scatter-rewind=""
      className="relative w-full"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onPointerDown={noteInput}
      onPointerMove={noteInput}
      onKeyDown={noteInput}
    >
      <Tag
        ref={headingRef as RefObject<HTMLHeadingElement & HTMLParagraphElement>}
        className={cn("m-0 text-[color:var(--bjork-text,#ededed)]", className)}
      >
        {isClick ? (
          <button
            type="button"
            onClick={onClick}
            className="cursor-pointer rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]"
          >
            {text}
          </button>
        ) : (
          text
        )}
      </Tag>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0"
      />
    </div>
  );
}
