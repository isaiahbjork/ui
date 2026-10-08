"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { stepSpring, type SpringConfig, type SpringState } from "../_core/spring";

export interface WeightWaveProps {
  /** The line to set. One span per glyph; keep it to a single display line. */
  text?: string;
  tone?: BjorkTone;
  /** Ink colour. Defaults to the tone's text colour. */
  color?: string;
  /** Tint that blooms on the heaviest glyphs only. Pass `null` to keep the line one colour. */
  accentColor?: string | null;
  /** Lightest weight on the `wght` axis (rest state). */
  minWeight?: number;
  /** Heaviest weight on the `wght` axis (crest under the cursor). */
  maxWeight?: number;
  /** Gaussian falloff of the cursor, as a sigma in em. 0.9 reaches roughly two letters each side. */
  radius?: number;
  /** A crest that travels the line while the pointer is away (and on touch devices). */
  idle?: boolean;
  /** Seconds for the idle crest to cross the line once. */
  waveDuration?: number;
  /** Width of the idle crest, as a sigma in glyphs. */
  waveWidth?: number;
  /** Faux slant in degrees applied with the weight (Geist has no slnt axis, so this is a skew). */
  slant?: number;
  /** Upper bound in px. The line also shrinks to fit its container at max weight. */
  fontSize?: number;
  fontFamily?: string;
  /** Letter spacing in em. */
  tracking?: number;
  /** Spring for each glyph's weight. */
  spring?: Partial<SpringConfig>;
  /** 0..1 renders a still frame of the idle crest at that point of its pass. No loop runs. */
  frozenPhase?: number;
  className?: string;
  ariaLabel?: string;
}

const DEFAULT_SPRING: SpringConfig = { stiffness: 140, damping: 19, mass: 1 };
const EDGE = 3; // glyphs of run-up before and after the idle crest
// Share of each glyph's extra advance (heavy minus light) absorbed by negative side margins.
// Enough that the light letters at the line's ends barely drift as the crest passes, not so
// much that heavy neighbours touch.
const ADVANCE_ABSORB = 0.42;

interface Metrics {
  /** Rest-weight glyph centres relative to the line centre, in px at the fitted size. */
  centers: number[];
  /** Per glyph, heavy advance minus light advance, in em. */
  grow: number[];
  fontPx: number;
  width: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function WeightWave({
  text = "Feel the weight",
  tone,
  color,
  accentColor,
  minWeight = 140,
  maxWeight = 900,
  radius = 0.95,
  idle = true,
  waveDuration = 3.2,
  waveWidth = 1.7,
  slant = 0,
  fontSize = 132,
  fontFamily = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  tracking = -0.035,
  spring,
  frozenPhase,
  className,
  ariaLabel,
}: WeightWaveProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const ink = color ?? palette.text;
  const accent = accentColor === null ? null : accentColor ?? palette.accent;
  const reduced = useReducedMotion() ?? false;
  const frozen = frozenPhase !== undefined || reduced;

  const glyphs = useMemo(() => Array.from(text), [text]);
  const cfg = useMemo<SpringConfig>(() => ({ ...DEFAULT_SPRING, ...spring }), [spring]);

  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const minRowRef = useRef<HTMLDivElement>(null);
  const maxRowRef = useRef<HTMLDivElement>(null);

  const metrics = useRef<Metrics>({ centers: [], grow: [], fontPx: 0, width: 0 });
  const states = useRef<SpringState[]>([]);
  const written = useRef<{ w: number; tint: number }[]>([]);
  const pointer = useRef({ x: 0, y: 0, active: false, presence: 0, touch: false });

  // Everything the frame needs, kept current without re-subscribing the loop.
  const live = useRef({ minWeight, maxWeight, radius, idle, waveDuration, waveWidth, slant, ink, accent, cfg });
  useEffect(() => {
    live.current = { minWeight, maxWeight, radius, idle, waveDuration, waveWidth, slant, ink, accent, cfg };
  }, [minWeight, maxWeight, radius, idle, waveDuration, waveWidth, slant, ink, accent, cfg]);

  const writeGlyphs = useCallback((force = false) => {
    const line = lineRef.current;
    if (!line) return;
    const { minWeight: lo, maxWeight: hi, slant: sl, ink: c, accent: a } = live.current;
    const spans = line.children;
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i] as HTMLElement;
      const x = clamp01(states.current[i]?.x ?? 0);
      const w = Math.round(lo + (hi - lo) * x);
      const tintRaw = a ? clamp01((x - 0.7) / 0.3) : 0;
      const tint = Math.round(tintRaw * tintRaw * 58);
      const prev = written.current[i] ?? { w: -1, tint: -1 };
      if (force || prev.w !== w) {
        el.style.fontVariationSettings = `"wght" ${w}`;
        const g = metrics.current.grow[i] ?? 0;
        el.style.marginInline = g > 0 ? `${(-(g * ADVANCE_ABSORB * (w - lo)) / (hi - lo || 1) / 2).toFixed(4)}em` : "";
        if (sl) el.style.transform = `skewX(${(-sl * x).toFixed(2)}deg)`;
        else if (force) el.style.transform = "";
      }
      if (force || prev.tint !== tint) {
        el.style.color = tint > 0 && a ? `color-mix(in oklab, ${a} ${tint}%, ${c})` : c;
      }
      written.current[i] = { w, tint };
    }
  }, []);

  const idleTarget = useCallback((i: number, n: number, phase: number) => {
    const { waveWidth: ww } = live.current;
    const c = -EDGE + (n - 1 + EDGE * 2) * phase;
    const d = (i - c) / ww;
    return Math.exp(-0.5 * d * d);
  }, []);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const line = lineRef.current;
    const minRow = minRowRef.current;
    const maxRow = maxRowRef.current;
    if (!root || !line || !minRow || !maxRow) return;
    const width = root.clientWidth;
    if (!width) return;
    // Rows are set at 100px; everything scales linearly from there.
    const maxTotal = maxRow.scrollWidth;
    const fit = maxTotal > 0 ? ((width * 0.97) / maxTotal) * 100 : fontSize;
    const fontPx = Math.max(10, Math.min(fontSize, fit));
    const s = fontPx / 100;
    const kids = minRow.children;
    const centers: number[] = [];
    let cum = 0;
    const advances: number[] = [];
    for (let i = 0; i < kids.length; i++) {
      const adv = (kids[i] as HTMLElement).getBoundingClientRect().width;
      advances.push(adv);
      cum += adv;
    }
    // getBoundingClientRect picks up any ancestor scale, so normalise against layout width.
    const rowRect = minRow.getBoundingClientRect().width;
    const layoutScale = rowRect > 0 && minRow.offsetWidth > 0 ? rowRect / minRow.offsetWidth : 1;
    let run = 0;
    for (let i = 0; i < advances.length; i++) {
      const a = advances[i] / layoutScale;
      centers.push((run + a / 2 - cum / layoutScale / 2) * s);
      run += a;
    }
    const heavy = maxRow.children;
    const grow: number[] = [];
    for (let i = 0; i < kids.length; i++) {
      const h = heavy[i] ? (heavy[i] as HTMLElement).getBoundingClientRect().width / layoutScale : 0;
      grow.push(Math.max(0, (h - advances[i] / layoutScale) / 100));
    }
    metrics.current = { centers, grow, fontPx, width };
    line.style.fontSize = `${fontPx}px`;
    root.style.height = `${Math.ceil(fontPx * 1.18)}px`;
  }, [fontSize]);

  const settleTo = useCallback(
    (phase: number) => {
      const n = glyphs.length;
      states.current = glyphs.map((_, i) => ({ x: idleTarget(i, n, phase), v: 0 }));
      writeGlyphs(true);
    },
    [glyphs, idleTarget, writeGlyphs],
  );

  // Measure on mount, on resize, and again once the webfont is in.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    measure();
    if (states.current.length !== glyphs.length) {
      states.current = glyphs.map(() => ({ x: 0, v: 0 }));
      written.current = [];
    }
    if (frozen) settleTo(frozenPhase ?? 0.46);
    else writeGlyphs(true);
    const ro = new ResizeObserver(() => {
      measure();
      writeGlyphs(true);
    });
    ro.observe(root);
    document.fonts?.ready.then(() => {
      if (cancelled) return;
      measure();
      writeGlyphs(true);
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [measure, glyphs, frozen, frozenPhase, settleTo, writeGlyphs]);

  // Colour or weight range changed while frozen or idle: repaint once.
  useEffect(() => {
    writeGlyphs(true);
  }, [ink, accent, minWeight, maxWeight, slant, writeGlyphs]);

  const frame = useCallback(
    (dt: number, t: number) => {
      const n = glyphs.length;
      const m = metrics.current;
      const p = pointer.current;
      const L = live.current;
      if (!n || !m.fontPx) return;

      const presenceTarget = p.active ? 1 : 0;
      p.presence += (presenceTarget - p.presence) * (1 - Math.exp(-dt * (p.active ? 7 : 2.4)));

      const sigma = Math.max(4, L.radius * m.fontPx);
      const lineCx = m.width / 2;
      const phase = L.idle ? (t / L.waveDuration) % 1 : 0;
      const idleMix = L.idle ? 1 - p.presence : 0;
      let moving = false;

      for (let i = 0; i < n; i++) {
        const st = states.current[i];
        if (!st) continue;
        let target = 0;
        if (idleMix > 0.001) target += idleTarget(i, n, phase) * idleMix;
        if (p.presence > 0.001) {
          const dx = (lineCx + m.centers[i] - p.x) / sigma;
          const dy = Math.max(0, Math.abs(p.y) - m.fontPx * 0.45) / (sigma * 1.6);
          target += Math.exp(-0.5 * (dx * dx + dy * dy)) * p.presence;
        }
        stepSpring(st, target, L.cfg, dt);
        if (Math.abs(st.x - target) > 0.002 || Math.abs(st.v) > 0.002) moving = true;
      }
      writeGlyphs();
      if (!L.idle && !p.active && p.presence < 0.002 && !moving) return false;
    },
    [glyphs.length, idleTarget, writeGlyphs],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: !frozen });

  // Window-level pointer so the falloff can reach past the box edge.
  useEffect(() => {
    if (frozen) return;
    const root = rootRef.current;
    if (!root) return;
    const toLocal = (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const scale = root.offsetWidth > 0 ? rect.width / root.offsetWidth : 1;
      return {
        x: (e.clientX - rect.left) / scale,
        // y relative to the line's vertical centre
        y: (e.clientY - rect.top) / scale - root.offsetHeight / 2,
        reach: rect,
        scale,
      };
    };
    const onMove = (e: PointerEvent) => {
      const p = pointer.current;
      if (e.pointerType === "touch" && !p.touch) return;
      const { x, y, reach, scale } = toLocal(e);
      const pad = (metrics.current.fontPx || 60) * 1.4 * scale;
      const inside =
        e.clientX > reach.left - pad &&
        e.clientX < reach.right + pad &&
        e.clientY > reach.top - pad &&
        e.clientY < reach.bottom + pad;
      p.x = x;
      p.y = y;
      if (inside !== p.active) {
        p.active = inside;
      }
      if (inside) wake();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (!root.contains(e.target as Node)) return;
      pointer.current.touch = true;
      onMove(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pointer.current.touch = false;
      pointer.current.active = false;
      wake();
    };
    const onLeave = () => {
      pointer.current.active = false;
      wake();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [frozen, wake]);

  useEffect(() => {
    if (!frozen) wake();
  }, [idle, frozen, wake]);

  const rowStyle = {
    fontFamily,
    fontSize: 100,
    letterSpacing: `${tracking}em`,
    lineHeight: 1,
    whiteSpace: "pre" as const,
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full select-none", className)}
      style={{ height: Math.ceil(fontSize * 1.18), touchAction: "pan-y" }}
    >
      <span className="sr-only">{ariaLabel ?? text}</span>
      <div
        ref={lineRef}
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
        style={{
          fontFamily,
          fontSize,
          letterSpacing: `${tracking}em`,
          lineHeight: 1,
          whiteSpace: "pre",
          color: ink,
          fontKerning: "none",
        }}
      >
        {glyphs.map((ch, i) => (
          <span
            key={`${i}-${ch}`}
            className="inline-block origin-bottom"
            style={{ fontVariationSettings: `"wght" ${minWeight}` }}
          >
            {ch}
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden">
        <div ref={minRowRef} className="inline-flex" style={{ ...rowStyle, fontKerning: "none" }}>
          {glyphs.map((ch, i) => (
            <span key={i} className="inline-block" style={{ fontVariationSettings: `"wght" ${minWeight}` }}>
              {ch}
            </span>
          ))}
        </div>
        <div ref={maxRowRef} className="inline-flex" style={{ ...rowStyle, fontKerning: "none" }}>
          {glyphs.map((ch, i) => (
            <span key={i} className="inline-block" style={{ fontVariationSettings: `"wght" ${maxWeight}` }}>
              {ch}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WeightWave;
