"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { mulberry32 } from "../_core/random";

export type DecodeCharsetName = "blocks" | "box" | "braille" | "katakana-half" | "math" | "binary";
/** A named glyph set, or any custom string of glyphs to scramble through. */
export type DecodeCharset = DecodeCharsetName | (string & {});
export type DecodeOrder = "left" | "center" | "random";
export type DecodeTrigger = "mount" | "inView" | "hover" | "manual";

export interface DecodeTextHandle {
  /** Scramble and decode again from the start. */
  replay: () => void;
}

export interface DecodeTextProps {
  /** Text to decode. Ignored when `words` is set. */
  text?: string;
  /** Cycle through these, decoding from one to the next. */
  words?: string[];
  charset?: DecodeCharset;
  /** Where the lock-in starts. */
  order?: DecodeOrder;
  trigger?: DecodeTrigger;
  /** Seconds from the first glyph locking to the last. */
  duration?: number;
  /** Seconds before the first glyph can lock. */
  delay?: number;
  /** 0..1 share of each glyph's settle time that is randomised. */
  jitter?: number;
  /** Scramble glyph changes per second, per cell. */
  scrambleRate?: number;
  /** Seconds a resolved word holds before the next one decodes. */
  interval?: number;
  /** Deterministic scramble and settle order. */
  seed?: number;
  /** 0..1 renders a still frame of the decode at that point. No loop runs. */
  frozenProgress?: number;
  tone?: BjorkTone;
  color?: string;
  /** Flash on each glyph as it locks. */
  accentColor?: string;
  /** Colour of unresolved glyphs. */
  scrambleColor?: string;
  /** Upper bound in px. The line shrinks to fit its container. */
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  /** Letter spacing in em. */
  tracking?: number;
  uppercase?: boolean;
  align?: "left" | "center";
  className?: string;
  ariaLabel?: string;
  onComplete?: () => void;
  ref?: Ref<DecodeTextHandle>;
}

const CHARSETS: Record<DecodeCharsetName, string> = {
  blocks: "░▒▓█▌▐▀▄▖▗▘▝▚▞",
  box: "─│┼╳┌┐└┘├┤┬┴╱╲═║╋",
  braille: Array.from({ length: 255 }, (_, i) => String.fromCharCode(0x2801 + i)).join(""),
  "katakana-half": Array.from({ length: 56 }, (_, i) => String.fromCharCode(0xff66 + i)).join(""),
  math: "∑∂∆∇∫∏√∞≈≠≤≥±×÷∈∩∪∀∃∅⊂⊕",
  binary: "01",
};

const FLASH = 0.45; // seconds the lock flash takes to fade
const START_LEAD = 0.4; // share of a cell's settle time spent showing the old glyph on word changes

function resolveCharset(c: DecodeCharset): string[] {
  const named = (CHARSETS as Record<string, string>)[c];
  const glyphs = Array.from(named ?? c).filter((g) => g.trim() !== "");
  return glyphs.length ? glyphs : Array.from(CHARSETS.blocks);
}

// Integer hash to [0, 1).
function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Plan {
  chars: string[];
  from: string[];
  settle: number[];
  start: number[];
  rate: number[];
  seed: number;
  end: number;
}

function makePlan(
  chars: string[],
  from: string[],
  order: DecodeOrder,
  delay: number,
  duration: number,
  jitter: number,
  scrambleRate: number,
  seed: number,
): Plan {
  const rand = mulberry32(seed);
  const n = chars.length;
  const mid = (n - 1) / 2;
  const settle: number[] = [];
  const start: number[] = [];
  const rate: number[] = [];
  let end = 0;
  for (let i = 0; i < n; i++) {
    const r1 = rand();
    const r2 = rand();
    let rank: number;
    if (order === "center") rank = mid > 0 ? Math.abs(i - mid) / mid : 0;
    else if (order === "random") rank = r1;
    else rank = n > 1 ? i / (n - 1) : 0;
    const s = delay + duration * ((1 - jitter) * rank + jitter * r2);
    settle.push(s);
    start.push(from.length ? s * START_LEAD : 0);
    rate.push(scrambleRate * (0.7 + 0.6 * r1));
    end = Math.max(end, s);
  }
  return { chars, from, settle, start, rate, seed, end: end + FLASH };
}

/** What a cell shows at time t, and how much of the lock flash remains (0..1). */
function cellAt(plan: Plan, i: number, t: number, glyphs: string[]): { ch: string; state: 0 | 1 | 2; flash: number } {
  const target = plan.chars[i];
  if (target === " ") return { ch: " ", state: 2, flash: 0 };
  if (t >= plan.settle[i]) {
    const f = 1 - (t - plan.settle[i]) / FLASH;
    return { ch: target, state: 2, flash: f > 0 ? f : 0 };
  }
  if (t < plan.start[i]) {
    const old = plan.from[i];
    if (old && old !== " ") return { ch: old, state: 1, flash: 0 };
    if (plan.from.length) return { ch: " ", state: 1, flash: 0 };
  }
  const tick = Math.floor(t * plan.rate[i]);
  const g = glyphs[Math.floor(hash3(plan.seed, i, tick) * glyphs.length)];
  return { ch: g, state: 0, flash: 0 };
}

export function DecodeText({
  text = "Signal received",
  words,
  charset = "blocks",
  order = "left",
  trigger = "inView",
  duration = 1.15,
  delay = 0.18,
  jitter = 0.4,
  scrambleRate = 16,
  interval = 2.4,
  seed = 7,
  frozenProgress,
  tone,
  color,
  accentColor,
  scrambleColor,
  fontSize = 72,
  fontFamily = "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  fontWeight = 500,
  tracking = -0.02,
  uppercase = false,
  align = "center",
  className,
  ariaLabel,
  onComplete,
  ref,
}: DecodeTextProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const ink = color ?? palette.text;
  const accent = accentColor ?? palette.accent;
  const dim = scrambleColor ?? palette.textSoft;
  const reduced = useReducedMotion() ?? false;
  const frozen = frozenProgress !== undefined;

  const list = useMemo(() => {
    const raw = words && words.length ? words : [text];
    return raw.map((w) => (uppercase ? w.toUpperCase() : w));
  }, [words, text, uppercase]);
  const glyphs = useMemo(() => resolveCharset(charset), [charset]);

  const [wordIndex, setWordIndex] = useState(0);
  const index = wordIndex % list.length;
  const current = list[index];
  const chars = useMemo(() => Array.from(current), [current]);

  const rootRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const clock = useRef(0);
  const playStart = useRef(0);
  const playing = useRef(false);
  const plays = useRef(0);
  const prevChars = useRef<string[]>([]);
  const holdUntil = useRef<number | null>(null);
  const hasPlayed = useRef(false);
  const inViewSeen = useRef(trigger !== "inView");

  const opts = useRef({ order, delay, duration, jitter, scrambleRate, seed, interval, onComplete });
  useEffect(() => {
    opts.current = { order, delay, duration, jitter, scrambleRate, seed, interval, onComplete };
  }, [order, delay, duration, jitter, scrambleRate, seed, interval, onComplete]);

  const buildPlan = useCallback(
    (from: string[], salt: number) => {
      const o = opts.current;
      return makePlan(chars, from, o.order, o.delay, o.duration, o.jitter, o.scrambleRate, (o.seed + salt * 977) | 0);
    },
    [chars],
  );

  const plan = useRef<Plan>(makePlan(chars, [], order, delay, duration, jitter, scrambleRate, seed));
  const colors = useRef({ ink, accent, dim });
  useEffect(() => {
    colors.current = { ink, accent, dim };
  }, [ink, accent, dim]);

  // Writes every cell for time t into the plan. Returns true once fully settled.
  const paint = useCallback(
    (t: number) => {
      const line = lineRef.current;
      if (!line) return true;
      const p = plan.current;
      const { ink: c, accent: a, dim: d } = colors.current;
      const cells = line.children;
      let done = true;
      for (let i = 0; i < cells.length && i < p.chars.length; i++) {
        const glyph = cells[i].lastElementChild as HTMLElement | null;
        if (!glyph) continue;
        const { ch, state, flash } = cellAt(p, i, t, glyphs);
        if (glyph.textContent !== ch) glyph.textContent = ch;
        let col: string;
        if (state === 0) col = d;
        else if (state === 1) col = c;
        else if (flash > 0) col = `color-mix(in oklab, ${a} ${Math.round(flash * flash * 62)}%, ${c})`;
        else col = c;
        if (glyph.dataset.col !== col) {
          glyph.style.color = col;
          glyph.dataset.col = col;
        }
        const st = state === 0 ? "scramble" : "set";
        if (glyph.dataset.state !== st) {
          // Scramble glyphs come from fallback fonts with taller boxes; set them a touch smaller.
          glyph.style.fontSize = state === 0 ? "0.8em" : "";
          glyph.dataset.state = st;
        }
        if (state !== 2 || flash > 0) done = false;
      }
      return done;
    },
    [glyphs],
  );

  const paintSettled = useCallback(() => {
    plan.current = makePlan(chars, [], "left", 0, 0, 0, 1, 1);
    paint(1e6);
  }, [chars, paint]);

  const start = useCallback(
    (from: string[]) => {
      plays.current += 1;
      plan.current = buildPlan(from, plays.current - 1);
      playStart.current = clock.current;
      playing.current = true;
      holdUntil.current = null;
      hasPlayed.current = true;
    },
    [buildPlan],
  );

  const animated = !reduced && !frozen;
  const autoplay = trigger === "mount" || trigger === "inView";

  const frame = useCallback(
    (dt: number) => {
      clock.current += dt;
      if (autoplay && !hasPlayed.current && inViewSeen.current) start([]);
      if (playing.current) {
        const done = paint(clock.current - playStart.current);
        if (done) {
          playing.current = false;
          opts.current.onComplete?.();
          if (list.length > 1 && autoplay) holdUntil.current = clock.current + opts.current.interval;
        }
        return;
      }
      if (holdUntil.current !== null && clock.current >= holdUntil.current) {
        holdUntil.current = null;
        prevChars.current = chars;
        setWordIndex((w) => w + 1);
        return;
      }
      if (holdUntil.current !== null) return;
      if (autoplay && !hasPlayed.current) return;
      return false;
    },
    [autoplay, chars, list.length, paint, start],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: animated });

  // A new word mounted its cells: decode into it from the previous word.
  useLayoutEffect(() => {
    if (!animated) return;
    if (prevChars.current.length) {
      const from = prevChars.current;
      prevChars.current = [];
      start(from);
      paint(0);
      wake();
    }
  }, [chars, animated, start, paint, wake]);

  // First paint before the browser shows anything.
  useLayoutEffect(() => {
    if (frozen) {
      const p = makePlan(chars, [], order, delay, duration, jitter, scrambleRate, seed);
      plan.current = p;
      paint((p.end - FLASH) * Math.min(1, Math.max(0, frozenProgress ?? 0)));
      return;
    }
    if (!animated || !autoplay) {
      if (!playing.current) paintSettled();
      return;
    }
    if (!hasPlayed.current) {
      plan.current = makePlan(chars, [], order, delay, duration, jitter, scrambleRate, seed);
      paint(0);
    }
  }, [frozen, frozenProgress, animated, autoplay, chars, order, delay, duration, jitter, scrambleRate, seed, paint, paintSettled]);

  // Colours changed: repaint the current frame.
  useEffect(() => {
    if (!playing.current) {
      if (frozen) {
        paint((plan.current.end - FLASH) * Math.min(1, Math.max(0, frozenProgress ?? 0)));
      } else if (hasPlayed.current || !autoplay || !animated) paintSettled();
    }
  }, [ink, accent, dim, frozen, frozenProgress, autoplay, animated, paint, paintSettled]);

  // In-view trigger waits until half the line is on screen.
  useEffect(() => {
    if (trigger !== "inView" || !animated) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          inViewSeen.current = true;
          wake();
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [trigger, animated, wake]);

  const replay = useCallback(() => {
    if (!animated) return;
    start([]);
    paint(0);
    wake();
  }, [animated, start, paint, wake]);

  useImperativeHandle(ref, () => ({ replay }), [replay]);

  const onHover = useCallback(() => {
    if (trigger !== "hover" || !animated || playing.current) return;
    if (list.length > 1) {
      prevChars.current = chars;
      setWordIndex((w) => w + 1);
    } else {
      replay();
    }
  }, [trigger, animated, list.length, chars, replay]);

  const longest = list.reduce((m, w) => Math.max(m, Array.from(w).length), 1);
  // Fit by character count: monospace advance is ~0.6em, plus tracking.
  const fitCqi = 100 / (longest * Math.max(0.3, 0.62 + tracking));

  const label = ariaLabel ?? (list.length > 1 ? list.join(", ") : list[0]);

  return (
    <span
      ref={rootRef}
      className={cn("relative block w-full", className)}
      style={{ containerType: "inline-size" }}
      onPointerEnter={onHover}
      onFocus={onHover}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="grid select-none"
        style={{
          fontFamily,
          fontWeight,
          fontSize: `min(${fontSize}px, ${fitCqi.toFixed(3)}cqi)`,
          letterSpacing: `${tracking}em`,
          lineHeight: 1.1,
          justifyItems: align === "center" ? "center" : "start",
          color: ink,
        }}
      >
        {/* Every word sits in the same grid cell, invisible, so the box is always the widest word. */}
        {list.map((w, i) => (
          <span key={`ghost-${i}`} className="invisible whitespace-pre" style={{ gridArea: "1 / 1" }}>
            {w}
          </span>
        ))}
        <span ref={lineRef} className="whitespace-pre" style={{ gridArea: "1 / 1" }}>
          {chars.map((ch, i) => (
            <span key={`${index}-${i}`} className="relative inline-block">
              {/* The final glyph holds the cell's width, so scrambling never shifts the line. */}
              <span className="invisible">{ch}</span>
              <span className="absolute inset-0 flex items-center justify-center" />
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

export default DecodeText;
