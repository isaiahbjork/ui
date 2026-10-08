"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { LiveRegion } from "../_core/a11y";
import { cubicBezier } from "../_core/motion";
import { mulberry32, hashString } from "../_core/random";
import { stepSpring, type SpringConfig } from "../_core/spring";

export type SliceShiftTrigger = "hover" | "scroll" | "loop";

export interface SliceShiftProps {
  /** Headline for the shear effect. Ignored when `words` has two or more entries. */
  text?: string;
  /** Two or more words switch the component into the venetian-blind word swap. */
  words?: string[];
  /**
   * What drives the shear. hover: pointer velocity. scroll: page scroll velocity. loop: a pulse every `interval`.
   * In word mode, loop cycles words on `interval`, hover advances on pointer enter, scroll cycles and shears on scroll.
   */
  trigger?: SliceShiftTrigger;
  /** Number of horizontal strips, 2 to 16. */
  slices?: number;
  /** Largest sideways offset of a strip, in em. */
  maxOffset?: number;
  /** Delay between neighbouring strips, in seconds. */
  stagger?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** Loop pulse or word interval, in ms. */
  interval?: number;
  /** Duration of one strip's word swap travel, in ms. */
  duration?: number;
  /** Largest font size in px. The type shrinks to fit narrower containers. */
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** Tracking in em. */
  letterSpacing?: number;
  align?: "left" | "center";
  /** Shows accent hairlines at the cut lines while strips are out of registration. */
  hairlines?: boolean;
  tone?: BjorkTone;
  color?: string;
  accentColor?: string;
  /** False stops the loop and word cycling. Hover and scroll still respond. */
  autoplay?: boolean;
  /** Renders a still frame at this shear amount (0 to 1), or this far through a word swap. For previews. */
  freezeAt?: number;
  /** Announces word changes politely. */
  announce?: boolean;
  seed?: number;
  ariaLabel?: string;
  className?: string;
}

const subscribeNoop = () => () => {};
const getTrue = () => true;
const getFalse = () => false;
const DEFAULT_FONT = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";
// Geist in a line-height 1 box: cap top near 0.15em, baseline near 0.86em. Cuts land inside that band.
const CAP_TOP = 0.15;
const BASELINE = 0.86;
const OVERHANG = 0.45;
const easeOut = cubicBezier(0.55, 0, 0.75, 0.2);
const easeIn = cubicBezier(0.22, 1.2, 0.36, 1);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface StripNodes {
  layer: HTMLDivElement | null;
  strips: (HTMLDivElement | null)[];
}

export function SliceShift({
  text = "Registration",
  words,
  trigger,
  slices = 7,
  maxOffset = 0.22,
  stagger = 0.032,
  stiffness = 320,
  damping = 13,
  mass = 1,
  interval = 2600,
  duration = 860,
  fontSize = 128,
  fontWeight = 640,
  fontFamily = DEFAULT_FONT,
  letterSpacing = -0.045,
  align = "center",
  hairlines = true,
  tone,
  color,
  accentColor,
  autoplay = true,
  freezeAt,
  announce = false,
  seed,
  ariaLabel,
  className,
}: SliceShiftProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const ink = color ?? palette.text;
  const accent = accentColor ?? palette.accent;
  // Gate on mount so the server render and hydration agree; the preference applies right after.
  const mounted = useSyncExternalStore(subscribeNoop, getTrue, getFalse);
  const reduced = (useReducedMotion() ?? false) && mounted;

  const list = useMemo(() => (words && words.length > 1 ? words : [words?.[0] ?? text]), [words, text]);
  const wordMode = list.length > 1;
  const mode: SliceShiftTrigger = trigger ?? (wordMode ? "loop" : "hover");
  const n = clamp(Math.round(slices), 2, 16);
  const frozen = freezeAt !== undefined && !reduced;
  const animated = !reduced && !frozen;

  const [idx, setIdx] = useState(0);
  const [incoming, setIncoming] = useState<number | null>(() => (frozen && wordMode ? 1 : null));
  const [fitPx, setFitPx] = useState(fontSize);

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  const layerA = useRef<StripNodes>({ layer: null, strips: [] });
  const layerB = useRef<StripNodes>({ layer: null, strips: [] });
  const hairRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Per-strip amplitude jitter so the shear reads as cut paper, not a sine wave.
  const amps = useMemo(() => {
    const rand = mulberry32(seed ?? hashString(list.join("|")));
    return Array.from({ length: n }, () => 0.72 + rand() * 0.28);
  }, [n, seed, list]);

  const sim = useRef({
    x: new Float64Array(16),
    v: new Float64Array(16),
    e: 0,
    origin: 0,
    hist: [] as { t: number; e: number }[],
    t: 0,
    lastY: 0,
    pulse: 0,
    sign: 1,
    wordT: 0,
    swap: "idle" as "idle" | "pending" | "run" | "commit",
    swapStart: 0,
    lastPointerX: null as number | null,
  });
  const cache = useRef(new WeakMap<HTMLElement, Record<string, string>>());
  const write = useCallback((el: HTMLElement | null, prop: "transform" | "opacity" | "visibility", value: string) => {
    if (!el) return;
    let entry = cache.current.get(el);
    if (!entry) {
      entry = {};
      cache.current.set(el, entry);
    }
    if (entry[prop] === value) return;
    entry[prop] = value;
    el.style[prop] = value;
  }, []);

  // Fit the widest word to the container.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const sizer = sizerRef.current;
    if (!root || !sizer) return;
    let raf = 0;
    const measure = () => {
      const avail = root.clientWidth;
      const current = parseFloat(getComputedStyle(sizer).fontSize) || fontSize;
      const w = sizer.offsetWidth;
      if (!avail || !w) return;
      const perPx = w / current;
      // Shrink-wrapped parents report the content width back, which resolves to the current size, so this never feeds back.
      const next = Math.max(10, Math.min(fontSize, avail / perPx));
      setFitPx((prev) => (Math.abs(prev - next) < 0.25 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(root);
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fontSize, list, fontFamily, fontWeight, letterSpacing]);

  const cfg = useMemo<SpringConfig>(() => ({ stiffness, damping, mass }), [stiffness, damping, mass]);
  const maxPx = maxOffset * fitPx;
  // The blind cascade reads better a little slower than the shear ripple.
  const swapStagger = Math.max(stagger * 2, 0.05);
  const swapTotal = duration / 1000 + (n - 1) * swapStagger;

  // Writes one frame of strip positions. `shear` holds per-strip shear in px; `swapAt` is seconds into a word swap or null.
  const paint = useCallback(
    (shear: ArrayLike<number>, swapAt: number | null, holdIncoming: boolean) => {
      const travel = fitPx * 0.7;
      const offA: number[] = [];
      const offB: number[] = [];
      const opsA: number[] = [];
      const opsB: number[] = [];
      let moving = false;
      for (let i = 0; i < n; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        let a = shear[i];
        let b = shear[i];
        let opA = 1;
        let opB = 0;
        if (holdIncoming) {
          opA = 0;
          opB = 1;
        } else if (swapAt !== null) {
          const local = clamp((swapAt - i * swapStagger) / (duration / 1000), 0, 1);
          const outP = clamp(local / 0.5, 0, 1);
          const inP = clamp((local - 0.4) / 0.6, 0, 1);
          a += dir * travel * easeOut(outP);
          b += -dir * travel * (1 - easeIn(inP));
          opA = 1 - outP * outP;
          opB = Math.min(1, inP * 1.6);
        }
        offA.push(a);
        offB.push(b);
        opsA.push(opA);
        opsB.push(opB);
        if (Math.abs(a) > 0.04 || swapAt !== null || holdIncoming) moving = true;
        write(layerA.current.strips[i], "transform", `translate3d(${a.toFixed(2)}px,0,0)`);
        write(layerA.current.strips[i], "opacity", opA.toFixed(3));
        write(layerB.current.strips[i], "transform", `translate3d(${b.toFixed(2)}px,0,0)`);
        write(layerB.current.strips[i], "opacity", opB.toFixed(3));
      }
      write(restRef.current, "opacity", moving ? "0" : "1");
      write(layerA.current.layer, "visibility", moving ? "visible" : "hidden");
      write(layerB.current.layer, "visibility", swapAt !== null || holdIncoming ? "visible" : "hidden");
      const ref = Math.max(1, maxPx * 0.3);
      for (let k = 0; k < n - 1; k++) {
        const el = hairRefs.current[k];
        if (!el) continue;
        let d = Math.abs(offA[k] - offA[k + 1]);
        if (swapAt !== null) {
          d = Math.max(
            Math.abs(offA[k] - offA[k + 1]) * Math.min(opsA[k], opsA[k + 1]),
            Math.abs(offB[k] - offB[k + 1]) * Math.min(opsB[k], opsB[k + 1]),
          ) * 0.5;
        }
        const op = holdIncoming ? 0 : clamp(d / ref, 0, 1);
        write(el, "opacity", op.toFixed(3));
        write(el, "transform", `translateY(-0.5px) scaleX(${(0.35 + 0.65 * op).toFixed(3)})`);
      }
    },
    [n, fitPx, maxPx, swapStagger, duration, write],
  );

  // History of the drive signal, read with a per-strip delay so the shear ripples away from its origin.
  const sampleHist = (t: number) => {
    const h = sim.current.hist;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i].e;
    return h.length ? h[0].e : 0;
  };

  const frame = useCallback(
    (dt: number, t: number) => {
      const s = sim.current;
      s.t = t;
      if (mode === "scroll") {
        const y = window.scrollY;
        const vel = dt > 0 ? (y - s.lastY) / dt : 0;
        s.lastY = y;
        const target = clamp(vel / 2400, -1.4, 1.4);
        s.e += (target - s.e) * (1 - Math.exp(-dt * 14));
        if (Math.abs(vel) > 40) s.origin = vel > 0 ? 0 : n - 1;
      } else {
        s.e *= Math.exp(-dt * 7.5);
      }
      if (!wordMode && mode === "loop" && autoplay) {
        s.pulse += dt;
        if (s.pulse >= interval / 1000) {
          s.pulse = 0;
          s.e = 1.15 * s.sign;
          s.origin = s.sign > 0 ? 0 : n - 1;
          s.sign *= -1;
        }
      }
      s.hist.push({ t, e: s.e });
      const keepFrom = t - (n * stagger + 0.2);
      while (s.hist.length > 2 && s.hist[1].t < keepFrom) s.hist.shift();

      let energy = Math.abs(s.e);
      for (let i = 0; i < n; i++) {
        const delay = Math.abs(i - s.origin) * stagger;
        const e = sampleHist(t - delay);
        const dir = i % 2 === 0 ? 1 : -1;
        const target = maxPx * amps[i] * dir * Math.tanh(e * 1.25);
        const st = { x: s.x[i], v: s.v[i] };
        stepSpring(st, target, cfg, dt);
        s.x[i] = st.x;
        s.v[i] = st.v;
        energy += Math.abs(st.x) + Math.abs(st.v) * 0.02;
      }

      if (wordMode) {
        if (s.swap === "idle" && autoplay && mode !== "hover") {
          s.wordT += dt;
          if (s.wordT >= interval / 1000) {
            s.wordT = 0;
            s.swap = "pending";
            setIncoming((cur) => (cur === null ? (idx + 1) % list.length : cur));
          }
        }
        if (s.swap === "run") {
          const at = t - s.swapStart;
          if (at >= swapTotal) {
            s.swap = "commit";
            const next = incoming ?? (idx + 1) % list.length;
            setIdx(next);
            setIncoming(null);
            paint(s.x, null, true);
          } else {
            paint(s.x, at, false);
          }
          return true;
        }
        if (s.swap === "commit" || s.swap === "pending") {
          paint(s.x, null, s.swap === "commit");
          return true;
        }
      }

      paint(s.x, null, false);
      const busy = energy > 0.02 || mode === "scroll" || (mode === "loop" && autoplay) || (wordMode && autoplay && mode !== "hover");
      return busy;
    },
    [mode, n, stagger, maxPx, amps, cfg, wordMode, autoplay, interval, list.length, idx, incoming, swapTotal, paint],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: animated });

  // A swap starts once the incoming word has been committed to the DOM.
  useLayoutEffect(() => {
    const s = sim.current;
    if (incoming !== null && animated) {
      s.swap = "run";
      s.swapStart = s.t;
      wake();
    }
  }, [incoming, animated, wake]);

  useLayoutEffect(() => {
    const s = sim.current;
    if (s.swap === "commit") {
      s.swap = "idle";
      s.wordT = 0;
      paint(s.x, null, false);
      wake();
    }
  }, [idx, paint, wake]);

  // Still frame for previews and the reduced-motion path.
  useLayoutEffect(() => {
    if (animated) return;
    if (reduced) {
      paint(new Float64Array(n), null, false);
      return;
    }
    const f = clamp(freezeAt ?? 0, 0, 1);
    if (wordMode) {
      const shear = Array.from({ length: n }, (_, i) => maxPx * 0.25 * amps[i] * (i % 2 ? -1 : 1));
      paint(shear, f * swapTotal, false);
      return;
    }
    // A ripple caught mid-flight: strips near the origin have already overshot back.
    const shear = Array.from({ length: n }, (_, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      const phase = Math.cos(i * 0.42 - 0.2) * Math.exp(-i * 0.05);
      return maxPx * amps[i] * dir * f * phase;
    });
    paint(shear, null, false);
  }, [animated, reduced, freezeAt, wordMode, n, maxPx, amps, swapTotal, paint, incoming]);

  // Inputs.
  useEffect(() => {
    if (!animated) return;
    const root = rootRef.current;
    if (!root) return;
    const s = sim.current;
    if (mode === "scroll") {
      s.lastY = window.scrollY;
      const onScroll = () => wake();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    if (mode !== "hover") return;
    const stripAt = (clientY: number) => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box || !box.height) return 0;
      const y = (clientY - box.top) / box.height;
      return clamp(Math.floor(((y - CAP_TOP) / (BASELINE - CAP_TOP)) * n), 0, n - 1);
    };
    const onEnter = (e: PointerEvent) => {
      s.lastPointerX = e.clientX;
      const box = root.getBoundingClientRect();
      const fromLeft = e.clientX < box.left + box.width / 2;
      s.origin = stripAt(e.clientY);
      s.e = clamp(s.e + (fromLeft ? 0.55 : -0.55), -1.5, 1.5);
      if (wordMode && s.swap === "idle") {
        s.swap = "pending";
        setIncoming((cur) => (cur === null ? (idx + 1) % list.length : cur));
      }
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const last = s.lastPointerX ?? e.clientX;
      s.lastPointerX = e.clientX;
      const dx = e.clientX - last;
      s.e = clamp(s.e + dx / (fitPx * 1.8), -1.5, 1.5);
      s.origin = stripAt(e.clientY);
      wake();
    };
    const onLeave = () => {
      s.lastPointerX = null;
    };
    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [animated, mode, n, fitPx, wordMode, idx, list.length, wake]);

  // Reduced motion: words still cycle, as a plain swap.
  useEffect(() => {
    if (!reduced || !wordMode || !autoplay) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % list.length), interval);
    return () => window.clearInterval(id);
  }, [reduced, wordMode, autoplay, interval, list.length]);

  const current = list[idx % list.length];
  const next = incoming !== null ? list[incoming % list.length] : null;
  const span = BASELINE - CAP_TOP;
  const textStyle: CSSProperties = {
    whiteSpace: "pre",
    letterSpacing: `${letterSpacing}em`,
  };
  const justify = align === "center" ? "center" : "flex-start";

  const renderLayer = (word: string | null, nodes: typeof layerA, hidden: boolean) => (
    <div
      ref={(el) => {
        nodes.current.layer = el;
      }}
      className="pointer-events-none absolute inset-0"
      style={{ visibility: hidden ? "hidden" : undefined }}
    >
      {Array.from({ length: n }, (_, i) => {
        const top = i === 0 ? -OVERHANG : CAP_TOP + (i * span) / n;
        const bottom = i === n - 1 ? 1 + OVERHANG : CAP_TOP + ((i + 1) * span) / n;
        return (
          <div
            key={i}
            ref={(el) => {
              nodes.current.strips[i] = el;
            }}
            className="absolute inset-0 flex"
            style={{
              justifyContent: justify,
              clipPath: `inset(${top.toFixed(4)}em -${OVERHANG}em ${(1 - bottom).toFixed(4)}em -${OVERHANG}em)`,
              willChange: animated ? "transform" : undefined,
            }}
          >
            <span style={textStyle}>{word ?? ""}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative block w-full select-none", className)}
      style={{ textAlign: align, color: ink }}
      aria-label={ariaLabel}
      role={ariaLabel ? "group" : undefined}
    >
      <span className="sr-only">{wordMode ? current : list[0]}</span>
      {announce && wordMode ? <LiveRegion message={current} /> : null}
      <div
        ref={boxRef}
        aria-hidden="true"
        className="relative inline-block align-top"
        style={{
          fontSize: fitPx,
          fontFamily,
          fontWeight,
          lineHeight: 1,
          fontKerning: "normal",
        }}
      >
        <div ref={sizerRef} className="grid" style={{ visibility: "hidden", paddingInline: "0.04em" }}>
          {list.map((w, i) => (
            <span key={i} style={{ ...textStyle, gridArea: "1 / 1", justifySelf: justify === "center" ? "center" : "start" }}>
              {w}
            </span>
          ))}
        </div>
        <div ref={restRef} className="absolute inset-0 flex" style={{ justifyContent: justify }}>
          <span style={textStyle}>{current}</span>
        </div>
        {!reduced ? (
          <>
            {renderLayer(current, layerA, true)}
            {renderLayer(next, layerB, true)}
            {hairlines
              ? Array.from({ length: n - 1 }, (_, k) => (
                  <div
                    key={k}
                    ref={(el) => {
                      hairRefs.current[k] = el;
                    }}
                    className="pointer-events-none absolute"
                    style={{
                      left: "-0.12em",
                      right: "-0.12em",
                      top: `${(CAP_TOP + ((k + 1) * span) / n).toFixed(4)}em`,
                      height: 1,
                      opacity: 0,
                      background: `linear-gradient(90deg, transparent, ${accent} 18%, ${accent} 82%, transparent)`,
                      transformOrigin: "50% 50%",
                    }}
                  />
                ))
              : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
