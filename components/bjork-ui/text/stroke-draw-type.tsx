"use client";

// Stroke Draw Type: outline type that draws itself with a pen, then fills from below like
// liquid rising in a glass. A small accent glow rides the leading end of every stroke.
// Hovering drains the fill back down; the surface is a goo-filtered mask, so the liquid
// clings to the letter tops in beads before it lets go. The glyph edges come from the text
// itself, so the type stays sharp at any DPR.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { cubicBezier } from "../_core/motion";
import { mulberry32, hashString } from "../_core/random";

export type StrokeDrawTrigger = "mount" | "in-view" | "hover" | "loop";

export interface StrokeDrawTypeProps {
  text?: string;
  /** Outline width in CSS px at the largest font size. */
  strokeWidth?: number;
  /** Outline colour. Defaults to the tone's text colour. */
  color?: string;
  /** Colour of the rising fill. Defaults to `color`. */
  fillColor?: string;
  /** Pen-tip glow colour. */
  accentColor?: string;
  /**
   * mount: draw on mount. in-view: draw when first scrolled into view. hover: draw the outline,
   * then fill only while hovered. loop: draw, fill, drain and undraw on repeat.
   */
  trigger?: StrokeDrawTrigger;
  /** Seconds one letter's outline takes to draw. */
  duration?: number;
  /** Seconds between neighbouring letters. */
  stagger?: number;
  /** Seconds before the first letter starts. */
  delay?: number;
  /** Seconds the filled word holds before draining, in loop mode. */
  hold?: number;
  /** Hovering drains the fill (mount and in-view triggers). */
  drainOnHover?: boolean;
  /** Largest font size in CSS px. The word shrinks to fit narrower containers. */
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** Tracking in em. */
  letterSpacing?: number;
  tone?: BjorkTone;
  /** False holds the first frame until changed. */
  autoplay?: boolean;
  /** Renders a still frame this far (0 to 1) through the draw and fill. For previews. */
  freezeAt?: number;
  seed?: number;
  ariaLabel?: string;
  className?: string;
}

const FS = 100; // font size in SVG user units; the viewBox scales it to the container
const DASH_MAX = 900;
const TIP = 7;
const DROPS = 3;
const SAMPLES = 9;
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;
const DEFAULT_FONT = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

const drawEase = cubicBezier(0.55, 0.06, 0.35, 1);
const fillEase = cubicBezier(0.3, 0, 0.2, 1);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Letter {
  ch: string;
  x: number;
  left: number;
  right: number;
  /** Estimated length of the glyph's longest contour (text has no getTotalLength). */
  dash: number;
}
interface Layout {
  letters: Letter[];
  vb: [number, number, number, number];
  top: number;
  bottom: number;
}
interface Drop {
  x: number;
  r: number;
  k: number; // spring stiffness; slow drops hang back as beads
  off: number;
}

export function StrokeDrawType({
  text = "Signature",
  strokeWidth = 1.6,
  color,
  fillColor,
  accentColor,
  trigger = "in-view",
  duration = 1.5,
  stagger = 0.11,
  delay = 0.15,
  hold = 1.6,
  drainOnHover = true,
  fontSize = 160,
  fontWeight = 600,
  fontFamily = DEFAULT_FONT,
  letterSpacing = -0.035,
  tone,
  autoplay = true,
  freezeAt,
  seed,
  ariaLabel,
  className,
}: StrokeDrawTypeProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const ink = color ?? palette.text;
  const fill = fillColor ?? ink;
  const accent = accentColor ?? palette.accentInk;
  // Gate on mount so the server render and hydration agree; the preference applies right after.
  const mounted = useSyncExternalStore(subscribeNoop, getTrue, getFalse);
  const reduced = (useReducedMotion() ?? false) && mounted;
  const frozen = freezeAt !== undefined && !reduced;
  const animated = !reduced && !frozen;

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = { mask: `sdt-mask-${uid}`, goo: `sdt-goo-${uid}`, glow: `sdt-glow-${uid}` };

  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const strokeEls = useRef<(SVGTextElement | null)[]>([]);
  const tipEls = useRef<(SVGTextElement | null)[]>([]);
  const surfaceEls = useRef<(SVGPathElement | null)[]>([]);
  const dropEls = useRef<(SVGCircleElement | null)[]>([]);
  const fillGroupRef = useRef<SVGGElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  const sw = (strokeWidth * FS) / fontSize;

  // Measure per-letter positions (kerning included) and the word's box.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      let box: DOMRect;
      try {
        box = el.getBBox();
      } catch {
        return;
      }
      if (!box.width) return;
      const letters: Letter[] = [];
      let idx = 0;
      for (const ch of Array.from(text)) {
        if (ch.trim()) {
          const start = el.getStartPositionOfChar(idx);
          const ext = el.getExtentOfChar(idx);
          const w = ext.width;
          letters.push({ ch, x: start.x, left: ext.x, right: ext.x + w, dash: Math.min(DASH_MAX, 2.4 * w + FS * 1.05) });
        }
        idx += ch.length;
      }
      const pad = sw * 2 + FS * 0.05;
      setLayout({
        letters,
        vb: [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2],
        top: box.y,
        bottom: box.y + box.height,
      });
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      alive = false;
    };
  }, [text, fontFamily, fontWeight, letterSpacing, sw]);

  const n = layout?.letters.length ?? 0;
  const drawEnd = duration;
  const fillStart = duration * 0.58;
  const fillDur = duration * 0.85;
  const total = delay + Math.max(0, n - 1) * stagger + fillStart + fillDur;
  const drainDur = duration * 0.9;
  const cycle = total + hold + (n - 1) * stagger * 0.5 + drainDur + duration * 0.7 + 0.7;

  const drops = useMemo<Drop[]>(() => {
    if (!layout) return [];
    const rand = mulberry32(seed ?? hashString(text));
    const out: Drop[] = [];
    for (const l of layout.letters) {
      const w = l.right - l.left;
      for (let d = 0; d < DROPS; d++) {
        out.push({
          x: l.left + w * (0.2 + 0.6 * ((d + 0.5) / DROPS)) + (rand() - 0.5) * w * 0.15,
          r: FS * (0.035 + rand() * 0.035),
          k: 55 + rand() * 110,
          off: FS * (0.02 + rand() * 0.04),
        });
      }
    }
    return out;
  }, [layout, seed, text]);

  const sim = useRef({
    clock: 0,
    started: false,
    hoverOn: false,
    hoverLetter: 0,
    drain: new Float64Array(0),
    hoverAt: new Float64Array(0),
    surface: new Float64Array(0),
    prevSurface: new Float64Array(0),
    dropY: new Float64Array(0),
    dropV: new Float64Array(0),
    draw: new Float64Array(0),
    level: new Float64Array(0),
  });

  // Reset the per-letter buffers when the layout changes.
  useEffect(() => {
    const s = sim.current;
    s.drain = new Float64Array(n).fill(trigger === "hover" ? 1 : 0);
    s.hoverAt = new Float64Array(n);
    s.surface = new Float64Array(n);
    s.prevSurface = new Float64Array(n);
    s.dropY = new Float64Array(n * DROPS).fill(1e4);
    s.dropV = new Float64Array(n * DROPS);
    s.draw = new Float64Array(n);
    s.level = new Float64Array(n);
  }, [n, trigger]);

  // Writes one frame. `draw[i]` and `level[i]` are 0..1; `vel[i]` is the surface speed for the wave.
  const paint = useCallback(
    (draw: ArrayLike<number>, level: ArrayLike<number>, t: number, dt: number, settleDrops: boolean) => {
      if (!layout) return;
      const { letters, top, bottom } = layout;
      const s = sim.current;
      const lo = top - FS * 0.12;
      const hi = bottom + FS * 0.16;
      let anyPartial = false;
      for (let i = 0; i < letters.length; i++) {
        const p = draw[i];
        const stroke = strokeEls.current[i];
        const tip = tipEls.current[i];
        if (stroke) {
          if (p >= 1) {
            stroke.style.strokeDasharray = "none";
            stroke.style.strokeDashoffset = "0";
          } else {
            const L = letters[i].dash;
            stroke.style.strokeDasharray = `${L} ${L}`;
            stroke.style.strokeDashoffset = (L * (1 - p)).toFixed(2);
          }
          stroke.style.opacity = p <= 0 ? "0" : "1";
        }
        if (tip) {
          const along = p * letters[i].dash;
          tip.style.strokeDasharray = `${TIP} ${DASH_MAX * 2}`;
          tip.style.strokeDashoffset = (-(along - TIP)).toFixed(2);
          const vis = p > 0 && p < 1 ? Math.min(1, p * 12, (1 - p) * 6) : 0;
          tip.style.opacity = vis.toFixed(3);
        }

        const lv = clamp01(level[i]);
        if (lv > 0 && lv < 1) anyPartial = true;
        const y = hi + (lo - hi) * lv;
        s.prevSurface[i] = s.surface[i] || y;
        s.surface[i] = y;
        const vel = dt > 0 ? (y - s.prevSurface[i]) / dt : 0;
        const amp = Math.min(FS * 0.035, Math.abs(vel) * 0.012) + (lv > 0 && lv < 1 ? FS * 0.008 : 0);
        const l = letters[i];
        const x0 = l.left - FS * 0.08;
        const x1 = l.right + FS * 0.08;
        let d = `M${x0.toFixed(1)} ${(hi + FS).toFixed(1)}`;
        for (let k = 0; k <= SAMPLES; k++) {
          const x = x0 + ((x1 - x0) * k) / SAMPLES;
          const wy = y + amp * Math.sin(x * 0.11 + t * 7 + i * 1.7) + amp * 0.5 * Math.sin(x * 0.27 - t * 4.3);
          d += `L${x.toFixed(1)} ${wy.toFixed(1)}`;
        }
        d += `L${x1.toFixed(1)} ${(hi + FS).toFixed(1)}Z`;
        surfaceEls.current[i]?.setAttribute("d", d);

        for (let k = 0; k < DROPS; k++) {
          const di = i * DROPS + k;
          const drop = drops[di];
          const el = dropEls.current[di];
          if (!drop || !el) continue;
          const target = y + drop.off + drop.r;
          if (settleDrops || dt <= 0 || s.dropY[di] > 9e3) {
            s.dropY[di] = target;
            s.dropV[di] = 0;
          } else {
            // Damped spring, sub-stepped. Slow drops hang above a falling surface.
            const steps = 3;
            const h = dt / steps;
            for (let q = 0; q < steps; q++) {
              const a = -drop.k * (s.dropY[di] - target) - 11 * s.dropV[di];
              s.dropV[di] += a * h;
              s.dropY[di] += s.dropV[di] * h;
            }
          }
          el.setAttribute("cy", (s.dropY[di] || target).toFixed(2));
        }
      }
      // A full or empty mask is a plain fill; skip the goo pass then.
      const g = fillGroupRef.current;
      if (g) {
        const allFull = !anyPartial && Array.from({ length: letters.length }, (_, i) => level[i] >= 1).every(Boolean);
        const dropsSettled = s.dropV.every((v) => Math.abs(v) < 0.5);
        g.setAttribute("mask", allFull && dropsSettled ? "none" : `url(#${ids.mask})`);
      }
    },
    [layout, drops, ids.mask],
  );

  // Timeline: per-letter draw and fill amounts at time `t` (seconds since start).
  const timeline = useCallback(
    (t: number, draw: Float64Array, level: Float64Array) => {
      for (let i = 0; i < n; i++) {
        const s0 = delay + i * stagger;
        draw[i] = drawEase(clamp01((t - s0) / drawEnd));
        level[i] = fillEase(clamp01((t - s0 - fillStart) / fillDur));
      }
    },
    [n, delay, stagger, drawEnd, fillStart, fillDur],
  );

  const frame = useCallback(
    (dt: number) => {
      const s = sim.current;
      if (!s.started || !layout) return false;
      s.clock += dt;
      const t = s.clock;
      if (s.draw.length !== n) {
        s.draw = new Float64Array(n);
        s.level = new Float64Array(n);
      }
      const { draw, level } = s;
      let busy = true;

      if (trigger === "loop") {
        const c = t % cycle;
        timeline(c, draw, level);
        const drainStart = total + hold;
        const undrawStart = drainStart + (n - 1) * stagger * 0.5 + drainDur;
        for (let i = 0; i < n; i++) {
          const dn = fillEase(clamp01((c - drainStart - i * stagger * 0.5) / drainDur));
          level[i] *= 1 - dn;
          if (c >= undrawStart) {
            const u = drawEase(clamp01((c - undrawStart - i * stagger * 0.4) / (duration * 0.7)));
            draw[i] = 1 - u;
          }
        }
      } else {
        timeline(t, draw, level);
        const hoverMode = trigger === "hover";
        let moving = t < total + 0.1;
        for (let i = 0; i < n; i++) {
          // Hover trigger: empty at rest, fill while hovered. Otherwise: full at rest, drain while hovered.
          const wantOn = s.hoverOn && t >= s.hoverAt[i];
          const target = hoverMode ? (wantOn ? 0 : 1) : wantOn && drainOnHover ? 1 : 0;
          // Constant-rate tween; the ease is applied below. Draining is slower than refilling.
          const step = dt / (target > s.drain[i] ? duration * 0.85 : duration * 0.6);
          s.drain[i] = target > s.drain[i] ? Math.min(target, s.drain[i] + step) : Math.max(target, s.drain[i] - step);
          if (s.drain[i] !== target) moving = true;
          level[i] *= 1 - fillEase(s.drain[i]);
        }
        for (const v of s.dropV) if (Math.abs(v) > 0.5) moving = true;
        busy = moving || s.hoverOn;
      }
      paint(draw, level, t, dt, false);
      return busy;
    },
    [layout, trigger, cycle, timeline, total, hold, n, stagger, drainDur, duration, drainOnHover, paint],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: animated && autoplay && !!layout });

  // Start: mount and loop start at once, in-view waits for the first intersection.
  useEffect(() => {
    if (!animated || !layout) return;
    const s = sim.current;
    if (s.started) return;
    if (trigger !== "in-view") {
      s.started = true;
      wake();
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          s.started = true;
          io.disconnect();
          wake();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animated, layout, trigger, wake]);

  // Before the loop's first frame, paint the start state so nothing flashes filled.
  useLayoutEffect(() => {
    if (!layout) return;
    const draw = new Float64Array(n);
    const level = new Float64Array(n);
    if (reduced) {
      draw.fill(1);
      level.fill(1);
      paint(draw, level, 0, 0, true);
      return;
    }
    if (frozen) {
      timeline(clamp01(freezeAt ?? 0) * total, draw, level);
      paint(draw, level, 1.3, 0, true);
      return;
    }
    if (!sim.current.started) paint(draw, level, 0, 0, true);
  }, [layout, n, reduced, frozen, freezeAt, total, timeline, paint]);

  // Hover input.
  useEffect(() => {
    if (!animated || trigger === "loop" || !layout) return;
    if (trigger !== "hover" && !drainOnHover) return;
    const el = rootRef.current;
    if (!el) return;
    const s = sim.current;
    const letterAt = (clientX: number) => {
      const svg = el.querySelector("svg");
      if (!svg) return 0;
      const r = svg.getBoundingClientRect();
      const ux = layout.vb[0] + ((clientX - r.left) / Math.max(1, r.width)) * layout.vb[2];
      let best = 0;
      let bestD = Infinity;
      layout.letters.forEach((l, i) => {
        const dd = Math.abs((l.left + l.right) / 2 - ux);
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      });
      return best;
    };
    const onEnter = (e: PointerEvent) => {
      s.hoverOn = true;
      s.hoverLetter = letterAt(e.clientX);
      for (let i = 0; i < n; i++) s.hoverAt[i] = s.clock + Math.abs(i - s.hoverLetter) * 0.045;
      wake();
    };
    const onLeave = () => {
      s.hoverOn = false;
      wake();
    };
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [animated, trigger, drainOnHover, layout, n, wake]);

  const vb = layout?.vb;
  const textProps = {
    fontSize: FS,
    style: { fontFamily, fontWeight, letterSpacing: `${letterSpacing}em`, fontKerning: "normal" as const },
  };
  const maxWidth = vb ? (vb[2] * fontSize) / FS : undefined;

  return (
    <div
      ref={rootRef}
      className={cn("relative flex w-full justify-center", className)}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
    >
      <span className="sr-only">{text}</span>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={vb ? vb.map((v) => v.toFixed(2)).join(" ") : "0 -100 600 130"}
        className="block h-auto w-full overflow-visible"
        style={{ maxWidth, aspectRatio: vb ? `${vb[2]} / ${vb[3]}` : undefined }}
      >
        <text ref={measureRef} x={0} y={0} {...textProps} visibility="hidden">
          {text}
        </text>
        {layout && vb ? (
          <>
            <defs>
              <filter
                id={ids.goo}
                filterUnits="userSpaceOnUse"
                x={vb[0]}
                y={vb[1] - FS * 0.3}
                width={vb[2]}
                height={vb[3] + FS * 0.6}
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur in="SourceGraphic" stdDeviation={FS * 0.032} result="b" />
                <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="g" />
                <feGaussianBlur in="g" stdDeviation={FS * 0.008} />
              </filter>
              <mask id={ids.mask} maskUnits="userSpaceOnUse" x={vb[0]} y={vb[1] - FS * 0.3} width={vb[2]} height={vb[3] + FS * 0.6}>
                <g filter={`url(#${ids.goo})`} fill="#fff">
                  {layout.letters.map((_, i) => (
                    <path key={i} ref={(el) => void (surfaceEls.current[i] = el)} />
                  ))}
                  {drops.map((d, i) => (
                    <circle key={i} ref={(el) => void (dropEls.current[i] = el)} cx={d.x} cy={layout.bottom + FS} r={d.r} />
                  ))}
                </g>
              </mask>
              <filter
                id={ids.glow}
                filterUnits="userSpaceOnUse"
                x={vb[0]}
                y={vb[1]}
                width={vb[2]}
                height={vb[3]}
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur in="SourceGraphic" stdDeviation={FS * 0.03} result="halo" />
                <feMerge>
                  <feMergeNode in="halo" />
                  <feMergeNode in="halo" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g ref={fillGroupRef} mask={`url(#${ids.mask})`} fill={fill}>
              {layout.letters.map((l, i) => (
                <text key={i} x={l.x} y={0} {...textProps}>
                  {l.ch}
                </text>
              ))}
            </g>
            <g fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
              {layout.letters.map((l, i) => (
                <text key={i} ref={(el) => void (strokeEls.current[i] = el)} x={l.x} y={0} {...textProps} style={{ ...textProps.style, opacity: 0 }}>
                  {l.ch}
                </text>
              ))}
            </g>
            <g
              fill="none"
              stroke={accent}
              strokeWidth={sw * 2.4}
              strokeLinecap="round"
              filter={animated || frozen ? `url(#${ids.glow})` : undefined}
            >
              {layout.letters.map((l, i) => (
                <text key={i} ref={(el) => void (tipEls.current[i] = el)} x={l.x} y={0} {...textProps} style={{ ...textProps.style, opacity: 0 }}>
                  {l.ch}
                </text>
              ))}
            </g>
          </>
        ) : null}
      </svg>
    </div>
  );
}
