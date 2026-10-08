"use client";

// Ink Bleed Text: a word that soaks into paper. A few drops land, wick outward through the
// fibres (radius grows with the square root of time, as it does on real paper), and the
// letters inside are displaced and feathered by turbulence until the ink settles and the
// type sharpens to crisp. Hovering re-wets the paper around the pointer, and it dries again
// when the pointer leaves. SVG filters only: feTurbulence + feDisplacementMap + a soft mask.
//
// Safari note: WebKit rasterises SVG filters at 1x and repaints them more slowly, so the
// wet frames are a little softer there. Filters and masks are removed once the ink is dry,
// so the settled type is plain vector text in every browser.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { cubicBezier } from "../_core/motion";
import { mulberry32, hashString } from "../_core/random";

export type InkBleedTrigger = "mount" | "in-view" | "loop";

export interface InkBleedTextProps {
  text?: string;
  /** Ink colour. Defaults to the tone's text colour. */
  color?: string;
  /** Colour of the wet halo that runs ahead of the ink and fades as it dries. */
  bleedColor?: string;
  /** mount: bleed on mount. in-view: when first scrolled into view. loop: bleed, hold, fade, repeat. */
  trigger?: InkBleedTrigger;
  /** Seconds from the first drop to dry, crisp type. */
  duration?: number;
  /** Seconds before the first drop. */
  delay?: number;
  /** Number of drops the ink spreads from, 1 to 6. */
  drops?: number;
  /** Seconds the dry word holds in loop mode. */
  hold?: number;
  /** How far the wet ink wanders, 0 to 2. */
  spread?: number;
  /** Hovering re-wets the paper around the pointer. */
  rewet?: boolean;
  /** Largest font size in CSS px. The word shrinks to fit narrower containers. */
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** Tracking in em. */
  letterSpacing?: number;
  tone?: BjorkTone;
  autoplay?: boolean;
  /** Renders a still frame this far (0 to 1) through the bleed. For previews. */
  freezeAt?: number;
  seed?: number;
  ariaLabel?: string;
  className?: string;
}

const FS = 100;
const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;
const DEFAULT_FONT = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";
const settle = cubicBezier(0.3, 0.1, 0.25, 1);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Layout {
  vb: [number, number, number, number];
  box: [number, number, number, number];
}
interface DropSpec {
  x: number;
  y: number;
  at: number; // start, as a fraction of the duration
  reach: number; // final radius in user units
}

// Filter parameters for a wetness `w` (1 = soaking, 0 = dry).
function wetParams(w: number, spread: number) {
  return {
    scale: FS * 0.17 * spread * Math.pow(w, 1.4),
    blur: FS * 0.045 * spread * w * w + 0.001,
    fiber: 0.95 * Math.pow(w, 1.1),
    steep: 1 + 6 * Math.pow(w, 0.8),
    halo: 0.9 * Math.pow(w, 1.3),
  };
}

interface FilterNodes {
  disp: SVGFEDisplacementMapElement | null;
  blur: SVGFEGaussianBlurElement | null;
  haloBlur: SVGFEGaussianBlurElement | null;
  fib: SVGFECompositeElement | null;
  haloFib: SVGFECompositeElement | null;
  steep: SVGFEFuncAElement | null;
  haloA: SVGFEFuncAElement | null;
  turb: SVGFETurbulenceElement | null;
}
const emptyNodes = (): FilterNodes => ({
  disp: null,
  blur: null,
  haloBlur: null,
  fib: null,
  haloFib: null,
  steep: null,
  haloA: null,
  turb: null,
});

function applyWet(n: FilterNodes, w: number, spread: number) {
  const p = wetParams(w, spread);
  n.disp?.setAttribute("scale", p.scale.toFixed(2));
  n.blur?.setAttribute("stdDeviation", p.blur.toFixed(3));
  n.haloBlur?.setAttribute("stdDeviation", (p.blur * 3 + FS * 0.02 * w).toFixed(3));
  n.fib?.setAttribute("k3", p.fiber.toFixed(3));
  n.fib?.setAttribute("k4", (-p.fiber * 0.5).toFixed(3));
  n.haloFib?.setAttribute("k3", (p.fiber * 1.3).toFixed(3));
  n.haloFib?.setAttribute("k4", (-p.fiber * 0.65).toFixed(3));
  n.steep?.setAttribute("slope", p.steep.toFixed(3));
  n.steep?.setAttribute("intercept", (0.5 - p.steep / 2).toFixed(3));
  n.haloA?.setAttribute("slope", (p.halo * 0.95).toFixed(3));
  n.haloA?.setAttribute("intercept", (-p.halo * 0.08).toFixed(3));
}

export function InkBleedText({
  text = "Wet ink",
  color,
  bleedColor,
  trigger = "in-view",
  duration = 2.8,
  delay = 0.1,
  drops = 3,
  hold = 2.6,
  spread = 1,
  rewet = true,
  fontSize = 168,
  fontWeight = 640,
  fontFamily = DEFAULT_FONT,
  letterSpacing = -0.04,
  tone,
  autoplay = true,
  freezeAt,
  seed,
  ariaLabel,
  className,
}: InkBleedTextProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const ink = color ?? palette.text;
  const halo = bleedColor ?? palette.accentInk;
  // Gate on mount so the server render and hydration agree; the preference applies right after.
  const mounted = useSyncExternalStore(subscribeNoop, getTrue, getFalse);
  const reduced = (useReducedMotion() ?? false) && mounted;
  const frozen = freezeAt !== undefined && !reduced;
  const animated = !reduced && !frozen;
  const sp = Math.max(0, Math.min(2, spread));
  const baseSeed = seed ?? hashString(text);

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ids = {
    text: `ibt-text-${uid}`,
    bleed: `ibt-bleed-${uid}`,
    wet: `ibt-wet-${uid}`,
    fibre: `ibt-fibre-${uid}`,
    reveal: `ibt-reveal-${uid}`,
    wetIn: `ibt-wetin-${uid}`,
    wetOut: `ibt-wetout-${uid}`,
    drop: `ibt-drop-${uid}`,
    dropOut: `ibt-dropout-${uid}`,
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const revealGroup = useRef<SVGGElement>(null);
  const bleedGroup = useRef<SVGGElement>(null);
  const crispGroup = useRef<SVGGElement>(null);
  const wetGroup = useRef<SVGGElement>(null);
  const dropEls = useRef<(SVGCircleElement | null)[]>([]);
  const wetCircles = useRef<(SVGCircleElement | null)[]>([]);
  const bleedNodes = useRef<FilterNodes>(emptyNodes());
  const wetNodes = useRef<FilterNodes>(emptyNodes());
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      let b: DOMRect;
      try {
        b = el.getBBox();
      } catch {
        return;
      }
      if (!b.width) return;
      const pad = FS * 0.14 * Math.max(0.6, sp);
      setLayout({ vb: [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2], box: [b.x, b.y, b.width, b.height] });
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      alive = false;
    };
  }, [text, fontFamily, fontWeight, letterSpacing, sp]);

  const nDrops = Math.max(1, Math.min(6, Math.round(drops)));
  const dropSpecs = useMemo<DropSpec[]>(() => {
    if (!layout) return [];
    const [bx, by, bw, bh] = layout.box;
    const rand = mulberry32(baseSeed);
    const out: DropSpec[] = [];
    const order = Array.from({ length: nDrops }, (_, i) => i).sort(() => rand() - 0.5);
    for (let i = 0; i < nDrops; i++) {
      const x = bx + bw * ((i + 0.5) / nDrops) + (rand() - 0.5) * (bw / nDrops) * 0.5;
      const y = by + bh * (0.35 + rand() * 0.3);
      // Reach the farthest corner of this drop's share of the word, with margin for the fibres.
      const share = bw / nDrops;
      const reach = Math.hypot(share * 1.05, bh * 0.75) + FS * 0.2;
      out.push({ x, y, at: (order.indexOf(i) / Math.max(1, nDrops)) * 0.22, reach });
    }
    return out;
  }, [layout, nDrops, baseSeed]);

  // One frame of the bleed at progress `p` (0..1 through `duration`). Returns true once dry.
  const paintBleed = useCallback(
    (p: number) => {
      const dry = p >= 1;
      const w = 1 - settle(clamp01(p));
      if (dry) {
        bleedGroup.current?.removeAttribute("filter");
        revealGroup.current?.removeAttribute("mask");
      } else {
        bleedGroup.current?.setAttribute("filter", `url(#${ids.bleed})`);
        revealGroup.current?.setAttribute("mask", `url(#${ids.reveal})`);
        applyWet(bleedNodes.current, w, sp);
        dropSpecs.forEach((d, i) => {
          // Lucas-Washburn: wicking distance grows with the square root of time.
          const local = clamp01((p - d.at) / 0.7);
          const r = d.reach * Math.sqrt(local);
          dropEls.current[i]?.setAttribute("r", Math.max(0.01, r).toFixed(2));
        });
      }
      return dry;
    },
    [dropSpecs, ids.bleed, ids.reveal, sp],
  );

  const paintWet = useCallback(
    (w: number, x: number, y: number) => {
      const on = w > 0.004;
      if (!on) {
        wetGroup.current?.setAttribute("display", "none");
        crispGroup.current?.removeAttribute("mask");
        return;
      }
      wetGroup.current?.removeAttribute("display");
      crispGroup.current?.setAttribute("mask", `url(#${ids.wetOut})`);
      applyWet(wetNodes.current, w * 0.6, sp);
      const r = FS * (0.42 + 0.22 * w);
      for (const c of wetCircles.current) {
        if (!c) continue;
        c.setAttribute("cx", x.toFixed(2));
        c.setAttribute("cy", y.toFixed(2));
        c.setAttribute("r", r.toFixed(2));
      }
    },
    [ids.wetOut, sp],
  );

  const sim = useRef({
    started: false,
    t: 0,
    cycle: 0,
    wet: 0,
    wetTarget: 0,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
    fade: 1,
  });

  const frame = useCallback(
    (dt: number) => {
      const s = sim.current;
      if (!layout) return false;
      let busy = false;
      if (s.started) {
        s.t += dt;
        const p = (s.t - delay) / duration;
        let dry: boolean;
        if (trigger === "loop") {
          const end = 1 + hold / duration;
          const fadeLen = 0.6 / duration;
          if (p > end + fadeLen) {
            // Next sheet: new drops pattern from a fresh seed.
            s.t = 0;
            s.cycle += 1;
            const seedNext = String(baseSeed + s.cycle * 7919);
            bleedNodes.current.turb?.setAttribute("seed", seedNext);
          }
          const fadeP = clamp01((p - end) / fadeLen);
          const op = p < 0 ? 0 : 1 - fadeP;
          if (Math.abs(op - s.fade) > 0.001) {
            s.fade = op;
            if (revealGroup.current) revealGroup.current.style.opacity = op.toFixed(3);
          }
          dry = paintBleed(Math.max(0, p));
          busy = true;
        } else {
          dry = paintBleed(Math.max(0, p));
          busy = !dry;
        }
        if (p < 0 && revealGroup.current) revealGroup.current.style.opacity = "0";
        else if (trigger !== "loop" && revealGroup.current) revealGroup.current.style.opacity = "1";
        void dry;
      }
      // Re-wet: wetness rises fast under the pointer and dries slowly.
      const rate = s.wetTarget > s.wet ? 5 : 1.1;
      s.wet += (s.wetTarget - s.wet) * (1 - Math.exp(-dt * rate));
      if (s.wet < 0.004 && s.wetTarget === 0) s.wet = 0;
      const follow = 1 - Math.exp(-dt * 9);
      s.px += (s.tx - s.px) * follow;
      s.py += (s.ty - s.py) * follow;
      paintWet(s.wet, s.px, s.py);
      if (s.wet > 0 || s.wetTarget > 0) busy = true;
      return busy;
    },
    [layout, delay, duration, trigger, hold, baseSeed, paintBleed, paintWet],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: animated && autoplay && !!layout });

  // Grab the filter primitives the frame loop writes to.
  useLayoutEffect(() => {
    if (!layout) return;
    const svg = rootRef.current?.querySelector("svg");
    const grab = (id: string): FilterNodes => {
      const f = svg?.querySelector(`#${id}`);
      const q = <T extends Element>(k: string) => (f?.querySelector(`[data-k="${k}"]`) as T | null) ?? null;
      return {
        disp: q<SVGFEDisplacementMapElement>("disp"),
        blur: q<SVGFEGaussianBlurElement>("blur"),
        haloBlur: q<SVGFEGaussianBlurElement>("haloBlur"),
        fib: q<SVGFECompositeElement>("fib"),
        haloFib: q<SVGFECompositeElement>("haloFib"),
        steep: q<SVGFEFuncAElement>("steep"),
        haloA: q<SVGFEFuncAElement>("haloA"),
        turb: q<SVGFETurbulenceElement>("turb"),
      };
    };
    bleedNodes.current = grab(ids.bleed);
    wetNodes.current = grab(ids.wet);
  }, [layout, ids.bleed, ids.wet]);

  // Initial / still frames.
  useLayoutEffect(() => {
    if (!layout) return;
    if (reduced) {
      paintBleed(1);
      paintWet(0, 0, 0);
      return;
    }
    if (frozen) {
      paintBleed(clamp01(freezeAt ?? 0));
      paintWet(0, 0, 0);
      return;
    }
    if (!sim.current.started) {
      paintBleed(0);
      paintWet(0, 0, 0);
      if (revealGroup.current) revealGroup.current.style.opacity = "0";
    }
  }, [layout, reduced, frozen, freezeAt, paintBleed, paintWet]);

  // Start.
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

  // Pointer re-wet.
  useEffect(() => {
    if (!animated || !rewet || !layout) return;
    const el = rootRef.current;
    const svg = el?.querySelector("svg");
    if (!el || !svg) return;
    const s = sim.current;
    const toUser = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return {
        x: layout.vb[0] + ((e.clientX - r.left) / Math.max(1, r.width)) * layout.vb[2],
        y: layout.vb[1] + ((e.clientY - r.top) / Math.max(1, r.height)) * layout.vb[3],
      };
    };
    const onEnter = (e: PointerEvent) => {
      const u = toUser(e);
      if (s.wet < 0.01) {
        s.px = u.x;
        s.py = u.y;
      }
      s.tx = u.x;
      s.ty = u.y;
      s.wetTarget = 1;
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const u = toUser(e);
      s.tx = u.x;
      s.ty = u.y;
      s.wetTarget = 1;
      wake();
    };
    const onLeave = () => {
      s.wetTarget = 0;
      wake();
    };
    svg.addEventListener("pointerenter", onEnter);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);
    return () => {
      svg.removeEventListener("pointerenter", onEnter);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerleave", onLeave);
    };
  }, [animated, rewet, layout, wake]);

  const vb = layout?.vb;
  const maxWidth = vb ? (vb[2] * fontSize) / FS : undefined;
  const region = vb ? { x: vb[0], y: vb[1], width: vb[2], height: vb[3] } : undefined;

  const renderFilter = (id: string, seedOffset: number) => (
    <filter id={id} filterUnits="userSpaceOnUse" {...region} colorInterpolationFilters="sRGB">
      <feTurbulence
        data-k="turb"
        type="fractalNoise"
        baseFrequency={0.026}
        numOctaves={3}
        seed={baseSeed + seedOffset}
        result="warp"
      />
      <feDisplacementMap
        data-k="disp"
        in="SourceGraphic"
        in2="warp"
        scale={0}
        xChannelSelector="R"
        yChannelSelector="G"
        result="disp"
      />
      <feTurbulence type="fractalNoise" baseFrequency="0.11 0.19" numOctaves={2} seed={baseSeed + seedOffset + 1} result="fibre" />
      <feGaussianBlur data-k="blur" in="disp" stdDeviation={0} result="soft" />
      <feComposite data-k="fib" in="soft" in2="fibre" operator="arithmetic" k1={0} k2={1} k3={0} k4={0} result="fibrous" />
      <feComponentTransfer in="fibrous" result="core">
        <feFuncA data-k="steep" type="linear" slope={1} intercept={0} />
      </feComponentTransfer>
      <feFlood floodColor={ink} result="inkC" />
      <feComposite in="inkC" in2="core" operator="in" result="inked" />
      <feGaussianBlur data-k="haloBlur" in="disp" stdDeviation={0} result="haloSoft" />
      <feComposite
        data-k="haloFib"
        in="haloSoft"
        in2="fibre"
        operator="arithmetic"
        k1={0}
        k2={1}
        k3={0}
        k4={0}
        result="haloFibrous"
      />
      <feComponentTransfer in="haloFibrous" result="haloA">
        <feFuncA data-k="haloA" type="linear" slope={0} intercept={0} />
      </feComponentTransfer>
      <feFlood floodColor={halo} result="haloC" />
      <feComposite in="haloC" in2="haloA" operator="in" result="haloed" />
      <feMerge>
        <feMergeNode in="haloed" />
        <feMergeNode in="inked" />
      </feMerge>
    </filter>
  );

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
        <text
          ref={measureRef}
          x={0}
          y={0}
          fontSize={FS}
          visibility="hidden"
          style={{ fontFamily, fontWeight, letterSpacing: `${letterSpacing}em`, fontKerning: "normal" }}
        >
          {text}
        </text>
        <defs>
          <text
            ref={textRef}
            id={ids.text}
            x={0}
            y={0}
            fontSize={FS}
            fill={ink}
            style={{ fontFamily, fontWeight, letterSpacing: `${letterSpacing}em`, fontKerning: "normal" }}
          >
            {text}
          </text>
          {vb ? (
            <>
              {renderFilter(ids.bleed, 0)}
              {renderFilter(ids.wet, 11)}
              {/* Fibrous edge for the wet fronts: displace a soft disc, then tighten its falloff. */}
              <filter id={ids.fibre} filterUnits="userSpaceOnUse" {...region} colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.045 0.11" numOctaves={3} seed={baseSeed + 5} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale={FS * 0.22} xChannelSelector="R" yChannelSelector="G" result="d" />
                <feComponentTransfer in="d">
                  <feFuncA type="linear" slope={2.6} intercept={-0.45} />
                </feComponentTransfer>
              </filter>
              <radialGradient id={ids.drop}>
                <stop offset="0" stopColor="#fff" />
                <stop offset="0.62" stopColor="#fff" stopOpacity={0.9} />
                <stop offset="1" stopColor="#fff" stopOpacity={0} />
              </radialGradient>
              <radialGradient id={ids.dropOut}>
                <stop offset="0" stopColor="#000" />
                <stop offset="0.5" stopColor="#000" stopOpacity={0.9} />
                <stop offset="1" stopColor="#000" stopOpacity={0} />
              </radialGradient>
              <mask id={ids.reveal} maskUnits="userSpaceOnUse" {...region}>
                <g filter={`url(#${ids.fibre})`}>
                  {dropSpecs.map((d, i) => (
                    <circle key={i} ref={(el) => void (dropEls.current[i] = el)} cx={d.x} cy={d.y} r={0.01} fill={`url(#${ids.drop})`} />
                  ))}
                </g>
              </mask>
              <mask id={ids.wetIn} maskUnits="userSpaceOnUse" {...region}>
                <g filter={`url(#${ids.fibre})`}>
                  <circle ref={(el) => void (wetCircles.current[0] = el)} r={0.01} fill={`url(#${ids.drop})`} />
                </g>
              </mask>
              <mask id={ids.wetOut} maskUnits="userSpaceOnUse" {...region}>
                <rect {...region} fill="#fff" />
                <g filter={`url(#${ids.fibre})`}>
                  <circle ref={(el) => void (wetCircles.current[1] = el)} r={0.01} fill={`url(#${ids.dropOut})`} />
                </g>
              </mask>
            </>
          ) : null}
        </defs>
        {vb ? (
          <g ref={revealGroup}>
            <g ref={bleedGroup}>
              <g ref={crispGroup}>
                <use href={`#${ids.text}`} />
              </g>
              <g ref={wetGroup} display="none" mask={`url(#${ids.wetIn})`}>
                <use href={`#${ids.text}`} filter={`url(#${ids.wet})`} />
              </g>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
