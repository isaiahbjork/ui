"use client";

import { memo, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { cubicBezier, ease, springs } from "@/components/bjork-ui/_core/motion";
import { stepSpring, type SpringState } from "@/components/bjork-ui/_core/spring";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export interface ClickWheelItem {
  id: string;
  label: string;
  meta?: string;
}

export interface ClickWheelProps {
  items: ClickWheelItem[];
  value?: number;
  defaultValue?: number;
  onValueChange?: (index: number) => void;
  onSelect?: (item: ClickWheelItem, index: number) => void;
  onTick?: (index: number) => void;
  detentsPerRev?: number;
  inertia?: number;
  loop?: boolean;
  haptics?: boolean;
  layout?: "stacked" | "wheel-only";
  size?: number;
  centerLabel?: string;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

// Stacked layout: 140 display + 60 gap + 220 wheel = 420 tall.
const LIST_W = 260;
const LIST_H = 140;
const ROW_H = 28;
const ROW_TOP = (LIST_H - ROW_H) / 2; // the active row sits in the middle, 56px from the top
const PILL_INSET = 4;
const PILL_RADIUS = 8;
const STACK_GAP = 60;
const DEFAULT_SIZE = 220;
const CENTER_AT_DEFAULT = 92;
const FLASH_MS = 160;
const TWEEN_MS = 120;
const FLICK_SPEED = 8; // items per second
const FLICK_EVERY = 4; // seconds of idle before an attract flick
const SNAP_SPEED = 0.5; // items per second, below which the wheel snaps to a detent
const MAX_FLICK = 6; // items/s, keeps any flick's settle ≤ 1.2s
const RELEASE_WINDOW_MS = 80;
const SAMPLE_KEEP_MS = 200;
const RUBBER = 0.35;
const WHEEL_PX_PER_ITEM = 40;
const WHEEL_SNAP_DELAY = 140;
const FADE_MASK = "linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)";
const easeOut = cubicBezier(...ease.out);

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// Index shown to the user for an unwrapped step count.
function wrapIndex(k: number, n: number, loop: boolean) {
  if (n <= 0) return 0;
  return loop ? mod(k, n) : clamp(k, 0, n - 1);
}

// Unwrapped step the wheel may rest on. Without loop, the rest positions stop at the ends.
function restStep(k: number, n: number, loop: boolean) {
  if (n <= 0 || loop) return k;
  return clamp(k, 0, n - 1);
}

function pointerAngle(x: number, y: number, cx: number, cy: number) {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

interface WheelRowProps {
  id?: string;
  option: boolean;
  selected: boolean;
  hidden: boolean;
  label: string;
  meta?: string;
  labelColor: string;
  metaColor: string;
}

// Memoised so a detent only re-renders the rows whose selected state changed, not the whole list.
const WheelRow = memo(function WheelRow({ id, option, selected, hidden, label, meta, labelColor, metaColor }: WheelRowProps) {
  return (
    <div
      id={id}
      role={option ? "option" : undefined}
      aria-selected={option ? selected : undefined}
      aria-hidden={hidden || undefined}
      className="flex h-[28px] items-center justify-between gap-3 px-[14px]"
    >
      <span className="truncate font-bjork-alpha text-[13px] font-medium" style={{ color: labelColor }}>
        {label}
      </span>
      {meta && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: metaColor }}>
          {meta}
        </span>
      )}
    </div>
  );
});

// Token with a palette fallback, so the component keeps its tone outside the site.
function tok(name: string, fallback: string) {
  return `var(--bjork-${name}, ${fallback})`;
}

export function ClickWheel({
  items,
  value,
  defaultValue = 0,
  onValueChange,
  onSelect,
  onTick,
  detentsPerRev = 12,
  inertia = 0.94,
  loop = false,
  haptics = true,
  layout = "stacked",
  size = DEFAULT_SIZE,
  centerLabel = "Select",
  ariaLabel = "Click wheel",
  tone,
  attract = false,
  className,
}: ClickWheelProps) {
  const resolvedTone = useBjorkTone(tone);
  const p = BJORK_PALETTE[resolvedTone];
  const dark = resolvedTone === "dark";
  const reduced = useReducedMotion();
  const uid = useId();
  const listboxId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const n = items.length;
  const detents = Math.max(1, Math.round(detentsPerRev));
  const step = 360 / detents;
  const stacked = layout === "stacked";
  const isControlled = value !== undefined;
  const attractOn = attract && !reduced && !isControlled && n > 0;
  const centerD = Math.round((size * CENTER_AT_DEFAULT) / DEFAULT_SIZE);
  // Loop mode repeats the list so the rows around the centre are always filled.
  const mid = loop && n > 0 ? Math.ceil(4 / n) : 0;
  const copies = loop && n > 0 ? 2 * mid + 1 : 1;
  const rowCount = n * copies;

  // Continuous position in items, plus the last reported (unwrapped) step.
  const startStep = restStep(value ?? defaultValue, n, loop);
  const posRef = useRef(startStep);
  const lastStepRef = useRef(Math.round(startStep));
  const [index, setIndex] = useState(() => wrapIndex(Math.round(startStep), n, loop));
  const velRef = useRef(0);
  const springTarget = useRef<number | null>(null);
  const springState = useRef<SpringState>({ x: 0, v: 0 });
  const tween = useRef<{ from: number; to: number; t0: number } | null>(null);
  const drag = useRef<{ cx: number; cy: number; last: number; samples: { t: number; p: number }[] } | null>(null);
  const flashes = useRef<{ tick: number; t0: number }[]>([]);
  const tickEls = useRef<(HTMLSpanElement | null)[]>([]);
  const listEl = useRef<HTMLDivElement | null>(null);
  const invEl = useRef<HTMLDivElement | null>(null);
  const notchEl = useRef<HTMLSpanElement | null>(null);
  const wheelEl = useRef<HTMLDivElement | null>(null);
  const rootEl = useRef<HTMLDivElement | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  const inputSeen = useRef(false);
  const idleFor = useRef(0);
  const flickDir = useRef(1);
  const wheelSnap = useRef<number | null>(null);
  const wheelHandler = useRef<(e: WheelEvent) => void>(() => {});

  const kick = useCallback(() => wakeRef.current(), []);

  // Writes transforms straight to the DOM. React never re-renders for a frame of motion.
  const paint = useCallback(() => {
    const pos = posRef.current;
    const wrapped = loop && n > 0 ? mod(pos, n) : pos;
    const y = `translate3d(0, ${(ROW_TOP - (wrapped + mid * n) * ROW_H).toFixed(2)}px, 0)`;
    if (listEl.current) listEl.current.style.transform = y;
    if (invEl.current) invEl.current.style.transform = y;
    if (notchEl.current) notchEl.current.style.transform = `rotate(${(pos * step).toFixed(3)}deg)`;
  }, [loop, n, mid, step]);

  // Fires the callbacks for every detent between the last reported step and `k`.
  const reportTo = (k: number) => {
    const from = lastStepRef.current;
    if (k === from || n === 0) return;
    const dir = k > from ? 1 : -1;
    const t0 = performance.now();
    lastStepRef.current = k;
    for (let s = from + dir; dir > 0 ? s <= k : s >= k; s += dir) {
      const idx = wrapIndex(s, n, loop);
      if (haptics && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(3);
      }
      onTick?.(idx);
      onValueChange?.(idx);
      if (!reduced) flashes.current.push({ tick: mod(idx, detents), t0 });
    }
    setIndex(wrapIndex(k, n, loop));
    kick();
  };

  const stopMotion = () => {
    velRef.current = 0;
    springTarget.current = null;
    tween.current = null;
  };

  const startSpring = (target: number, v0: number) => {
    springTarget.current = target;
    springState.current = { x: posRef.current, v: v0 };
  };

  const frame = (dt: number) => {
    const now = performance.now();
    let busy = false;

    // Attract: flick every few seconds while nobody touches the wheel. Alternates direction.
    if (attractOn && !drag.current) {
      if (inputSeen.current) {
        inputSeen.current = false;
        idleFor.current = 0;
      } else {
        idleFor.current += dt;
      }
      if (
        idleFor.current >= FLICK_EVERY &&
        !tween.current &&
        springTarget.current === null &&
        velRef.current === 0
      ) {
        idleFor.current = 0;
        velRef.current = flickDir.current * FLICK_SPEED;
        flickDir.current = -flickDir.current;
      }
      busy = true;
    }

    if (drag.current) {
      busy = true;
    } else if (tween.current) {
      const tw = tween.current;
      const pr = Math.min(1, (now - tw.t0) / TWEEN_MS);
      posRef.current = tw.from + (tw.to - tw.from) * easeOut(pr);
      if (pr >= 1) {
        posRef.current = tw.to;
        tween.current = null;
      }
      busy = true;
    } else if (springTarget.current !== null) {
      const target = springTarget.current;
      const s = springState.current;
      stepSpring(s, target, springs.settle, dt);
      posRef.current = s.x;
      if (Math.abs(s.x - target) < 1e-3 && Math.abs(s.v) < 1e-3) {
        posRef.current = target;
        springTarget.current = null;
        s.v = 0;
      }
      busy = true;
    } else if (velRef.current !== 0) {
      const v = velRef.current;
      posRef.current += v * dt;
      velRef.current = v * Math.pow(inertia, dt * 60);
      const outside = !loop && n > 0 && (posRef.current < 0 || posRef.current > n - 1);
      if (outside) {
        // Past an end without loop: spring back to the end.
        velRef.current = 0;
        startSpring(restStep(Math.round(posRef.current), n, loop), v);
      } else if (Math.abs(velRef.current) < SNAP_SPEED) {
        // Slow enough: settle on the nearest detent.
        velRef.current = 0;
        startSpring(restStep(Math.round(posRef.current), n, loop), 0);
      }
      busy = true;
    }

    if (flashes.current.length > 0) {
      const keep: { tick: number; t0: number }[] = [];
      for (const f of flashes.current) {
        const pr = (now - f.t0) / FLASH_MS;
        const el = tickEls.current[f.tick];
        if (pr >= 1) {
          if (el) el.style.transform = "";
          continue;
        }
        // Ticks rest at full opacity, so the flash is a pulse: the tick grows from 6px to 10px and back over 160ms.
        // This deliberately replaces the plan's opacity flash, which dipped the tick below its resting opacity.
        if (el) el.style.transform = `scaleY(${(1 + 0.67 * Math.sin(Math.PI * pr)).toFixed(3)})`;
        keep.push(f);
      }
      flashes.current = keep;
      busy = true;
    }

    paint();
    if (!tween.current && !drag.current) {
      reportTo(restStep(Math.round(posRef.current), n, loop));
    }
    return busy;
  };

  const { wake } = useVisibleLoop(rootEl, frame);
  useEffect(() => {
    wakeRef.current = wake;
  }, [wake]);

  // Keep the DOM transforms in step with the latest render (list, notch).
  useEffect(() => {
    paint();
  });

  // The wheel listens natively, non-passive, so it can stop page scroll while the pointer is over it.
  useEffect(() => {
    wheelHandler.current = (e: WheelEvent) => {
      if (n === 0) return;
      e.preventDefault();
      inputSeen.current = true;
      tween.current = null;
      springTarget.current = null;
      velRef.current = 0;
      posRef.current += e.deltaY / WHEEL_PX_PER_ITEM;
      paint();
      reportTo(restStep(Math.round(posRef.current), n, loop));
      if (wheelSnap.current !== null) window.clearTimeout(wheelSnap.current);
      wheelSnap.current = window.setTimeout(() => {
        wheelSnap.current = null;
        const target = restStep(Math.round(posRef.current), n, loop);
        if (reduced) {
          posRef.current = target;
          paint();
          return;
        }
        startSpring(target, 0);
        kick();
      }, WHEEL_SNAP_DELAY);
    };
  });

  useEffect(() => {
    const el = wheelEl.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelHandler.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelSnap.current !== null) window.clearTimeout(wheelSnap.current);
    };
  }, []);

  // Controlled value: jump to it when the parent changes it and the user is not dragging.
  useEffect(() => {
    if (value === undefined || n === 0 || drag.current) return;
    const cur = wrapIndex(lastStepRef.current, n, loop);
    const want = wrapIndex(value, n, loop);
    if (cur === want) return;
    let target = want;
    if (loop) {
      let d = mod(want - cur, n);
      if (d > n / 2) d -= n;
      target = lastStepRef.current + d;
    }
    velRef.current = 0;
    springTarget.current = null;
    tween.current = null;
    posRef.current = target;
    lastStepRef.current = target;
    paint();
    kick();
  }, [value, n, loop, paint, kick]);

  const selectCurrent = () => {
    if (n === 0) return;
    inputSeen.current = true;
    const idx = wrapIndex(lastStepRef.current, n, loop);
    onSelect?.(items[idx], idx);
  };

  const onWheelPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0 || e.button !== 0) return;
    // The one measurement on the gesture path. Read once per press, never in pointermove or rAF.
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > rect.width / 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    inputSeen.current = true;
    stopMotion();
    drag.current = {
      cx,
      cy,
      last: pointerAngle(e.clientX, e.clientY, cx, cy),
      samples: [{ t: performance.now(), p: posRef.current }],
    };
    kick();
  };

  const onWheelPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const ang = pointerAngle(e.clientX, e.clientY, d.cx, d.cy);
    let delta = ang - d.last;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    d.last = ang;
    const items = delta / step;
    const outside = !loop && n > 0 && (posRef.current < 0 || posRef.current > n - 1);
    posRef.current += outside ? items * RUBBER : items;
    const t = performance.now();
    d.samples.push({ t, p: posRef.current });
    while (d.samples.length > 2 && t - d.samples[0].t > SAMPLE_KEEP_MS) d.samples.shift();
    paint();
    reportTo(restStep(Math.round(posRef.current), n, loop));
  };

  const onWheelPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const t = performance.now();
    d.samples.push({ t, p: posRef.current });
    const recent = d.samples.filter((s) => t - s.t <= RELEASE_WINDOW_MS);
    let v = 0;
    if (recent.length >= 2) {
      const a = recent[0];
      const b = recent[recent.length - 1];
      const span = (b.t - a.t) / 1000;
      if (span > 0) v = (b.p - a.p) / span;
    }
    v = clamp(v, -MAX_FLICK, MAX_FLICK);
    const pos = posRef.current;
    const outside = !loop && n > 0 && (pos < 0 || pos > n - 1);
    const target = restStep(Math.round(pos), n, loop);
    if (reduced) {
      velRef.current = 0;
      posRef.current = target;
      paint();
      reportTo(target);
    } else if (!outside && Math.abs(v) >= SNAP_SPEED) {
      velRef.current = v;
      springTarget.current = null;
    } else {
      velRef.current = 0;
      startSpring(target, 0);
    }
    kick();
  };

  const onWheelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const cur = lastStepRef.current;
    let target: number;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowLeft":
        target = cur - 1;
        break;
      case "ArrowDown":
      case "ArrowRight":
        target = cur + 1;
        break;
      case "PageUp":
        target = cur - 5;
        break;
      case "PageDown":
        target = cur + 5;
        break;
      case "Home":
        target = loop ? cur - mod(cur, n) : 0;
        break;
      case "End":
        target = loop ? cur + (n - 1 - mod(cur, n)) : n - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        selectCurrent();
        return;
      default:
        return;
    }
    e.preventDefault();
    inputSeen.current = true;
    const dest = restStep(target, n, loop);
    stopMotion();
    if (dest === cur) return;
    if (reduced) {
      posRef.current = dest;
    } else {
      tween.current = { from: posRef.current, to: dest, t0: performance.now() };
    }
    reportTo(dest);
  };

  const shown = n === 0 ? 0 : wrapIndex(isControlled ? value : index, n, loop);
  const current = n === 0 ? undefined : items[shown];

  const surface = tok("surface", p.surface);
  const border = tok("border", p.border);
  const borderStrong = tok("border-strong", p.borderStrong);
  const text = tok("text", p.text);
  const faint = tok("text-faint", p.textFaint);
  const muted = tok("text-muted", p.textMuted);
  const soft = tok("text-soft", p.textSoft);
  const medium = tok("text-medium", p.textMedium);
  const accent = tok("accent", p.accent);
  const faceCentre = dark ? p.raised : p.surface;
  const faceEdge = dark ? "#0d0d0d" : p.raised;

  const renderRows = (inverted: boolean) =>
    Array.from({ length: rowCount }, (_, k) => {
      const idx = k % n;
      const copy = Math.floor(k / n);
      const isMid = copy === mid;
      const item = items[idx];
      return (
        <WheelRow
          key={`${copy}-${idx}`}
          id={!inverted && isMid ? optionId(idx) : undefined}
          option={!inverted && isMid}
          selected={idx === shown}
          hidden={!isMid}
          label={item.label}
          meta={item.meta}
          labelColor={inverted ? tok("bg", p.bg) : medium}
          metaColor={inverted ? tok("bg", p.bg) : soft}
        />
      );
    });

  const display = stacked && (
    <div
      role="listbox"
      id={listboxId}
      aria-label={`${ariaLabel} items`}
      aria-activedescendant={n > 0 ? optionId(shown) : undefined}
      className="relative overflow-hidden"
      style={{
        width: LIST_W,
        height: LIST_H,
        borderRadius: 16,
        background: surface,
        border: `1px solid ${border}`,
        boxShadow: tok("shadow-inset", "inset 0 1px 10px rgba(88,72,49,0.12)"),
      }}
    >
      <div className="absolute inset-0" style={{ WebkitMaskImage: FADE_MASK, maskImage: FADE_MASK }}>
        <div ref={listEl} className="absolute inset-x-0 top-0 will-change-transform">
          {renderRows(false)}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[8px]"
          style={{ left: PILL_INSET, right: PILL_INSET, top: ROW_TOP, height: ROW_H, background: text }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            clipPath: `inset(${ROW_TOP}px ${PILL_INSET}px ${LIST_H - ROW_TOP - ROW_H}px ${PILL_INSET}px round ${PILL_RADIUS}px)`,
          }}
        >
          <div ref={invEl} className="absolute inset-x-0 top-0 will-change-transform">
            {renderRows(true)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={rootEl}
      className={cn("relative flex flex-col items-center", className)}
      style={{
        width: stacked ? LIST_W : size,
        gap: stacked ? STACK_GAP : 0,
      }}
    >
      {display}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div
          ref={wheelEl}
          role="slider"
          tabIndex={n > 0 ? 0 : -1}
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={shown}
          aria-valuetext={current ? current.label : "No items"}
          aria-controls={stacked ? listboxId : undefined}
          aria-disabled={n === 0 || undefined}
          onPointerDown={onWheelPointerDown}
          onPointerMove={onWheelPointerMove}
          onPointerUp={onWheelPointerEnd}
          onPointerCancel={onWheelPointerEnd}
          onKeyDown={onWheelKeyDown}
          className="absolute inset-0 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)] aria-disabled:opacity-45"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${faceCentre} 0%, ${faceEdge} 100%)`,
            border: `1px solid ${border}`,
          }}
        >
          {dark && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
            />
          )}
          {Array.from({ length: detents }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ transform: `rotate(${i * step}deg)` }}
            >
              <span
                ref={(el) => {
                  tickEls.current[i] = el;
                }}
                className="absolute h-[6px] w-px"
                style={{
                  left: "calc(50% - 0.5px)",
                  top: 7,
                  transformOrigin: "50% 0",
                  background: n > 0 && i === shown % detents ? accent : resolvedTone === "light" ? soft : faint,
                }}
              />
            </span>
          ))}
          <span ref={notchEl} aria-hidden="true" className="pointer-events-none absolute inset-0">
            <span
              className="absolute h-1 w-1 rounded-full"
              style={{ left: "calc(50% - 2px)", top: 20, background: muted }}
            />
          </span>
        </div>
        {/* pl offsets the trailing letter-spacing so the ink is centred (blur test: -0.44px) */}
        <motion.button
          type="button"
          aria-label={current ? `Select ${current.label}` : "Select"}
          disabled={n === 0}
          onClick={selectCurrent}
          whileTap={{ scale: 0.96 }}
          transition={springs.press}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full pl-[0.08em] font-mono text-[11px] uppercase leading-none tracking-[0.08em] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)] disabled:opacity-45"
          style={{
            width: centerD,
            height: centerD,
            background: surface,
            border: `1px solid ${borderStrong}`,
            color: text,
          }}
        >
          {centerLabel}
        </motion.button>
      </div>
    </div>
  );
}
