"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { mulberry32 } from "../_core/random";
import { stepSpring, type SpringConfig, type SpringState } from "../_core/spring";

export type MagneticMode = "attract" | "repel";

export interface MagneticLettersProps {
  text?: string;
  /** Letters lean toward the cursor, or shy away from it. */
  mode?: MagneticMode;
  /** Scales how far letters travel. 1 is the tuned default. */
  strength?: number;
  /** Reach of the field as a gaussian sigma, in em. */
  radius?: number;
  /** Spring stiffness for the snap back. */
  stiffness?: number;
  /** Spring damping. Lower overshoots more. */
  damping?: number;
  /** Click (or Enter / Space) scatters the letters and lets them reassemble. */
  shockwave?: boolean;
  tone?: BjorkTone;
  color?: string;
  /** Tint for letters deep in the field, and the shockwave ring. */
  accentColor?: string;
  /** Upper bound in px. The type also shrinks to fit its container. */
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  /** Letter spacing in em. */
  tracking?: number;
  align?: "left" | "center";
  /**
   * Fixed pointer position as fractions of the box (0..1). Renders a still, displaced frame
   * with no loop — for previews and screenshots.
   */
  pointer?: { x: number; y: number };
  className?: string;
  ariaLabel?: string;
}

interface Glyph {
  cx: number;
  cy: number;
  x: SpringState;
  y: SpringState;
  r: SpringState;
  s: SpringState;
  /** Writes are skipped when nothing visible changed. */
  key: string;
  tint: number;
  kickAt: number;
  seed: number;
}

interface Ring {
  x: number;
  y: number;
  age: number;
}

const RING_LIFE = 0.9;
const subscribeNoop = () => () => {};
const clampAbs = (v: number, m: number) => (v > m ? m : v < -m ? -m : v);

interface FieldParams {
  mode: MagneticMode;
  strength: number;
  radius: number;
}

/** Field targets for one glyph given the pointer. Also sets the glyph's tint. */
function fieldTarget(g: Glyph, px: number, py: number, presence: number, L: FieldParams, em: number) {
  const sigma = Math.max(8, L.radius * em);
  const dx = px - g.cx;
  const dy = py - g.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const f = Math.exp((-0.5 * dist * dist) / (sigma * sigma)) * presence;
  let tx: number;
  let ty: number;
  if (L.mode === "attract") {
    // Lean toward the cursor, never past it. Sideways pull is kept well under half a letter so
    // neighbours converging on the same point never collide; the lift carries the gesture.
    const pull = L.strength * f;
    tx = clampAbs(dx * pull * 0.11, em * 0.14 * L.strength);
    ty = clampAbs(dy * pull * 0.34, em * 0.42 * L.strength);
  } else {
    const push = em * 0.62 * L.strength * f;
    tx = (-dx / dist) * push;
    ty = (-dy / dist) * push;
  }
  // Lean into the direction of travel.
  const tr = clampAbs(tx * (60 / em), 14);
  const ts = L.mode === "attract" ? 1 + 0.07 * f * L.strength : 1 - 0.18 * f * L.strength;
  g.tint = L.mode === "attract" ? Math.round(Math.max(0, f - 0.45) * 70) : Math.round(Math.max(0, f - 0.5) * 60);
  return { tx, ty, tr, ts };
}

export function MagneticLetters({
  text = "Pull me closer",
  mode = "attract",
  strength = 1,
  radius = 1.35,
  stiffness = 210,
  damping = 15,
  shockwave = true,
  tone,
  color,
  accentColor,
  fontSize = 112,
  fontFamily = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  fontWeight = 640,
  tracking = -0.045,
  align = "center",
  pointer: fixedPointer,
  className,
  ariaLabel,
}: MagneticLettersProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const ink = color ?? palette.text;
  const accent = accentColor ?? palette.accent;
  const reduced = useReducedMotion() ?? false;
  // Reduced motion is only known on the client; hold the first client render to the server's.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const still = (mounted && reduced) || fixedPointer !== undefined;
  const fixedX = fixedPointer?.x;
  const fixedY = fixedPointer?.y;

  const words = useMemo(() => text.split(/(\s+)/).filter((w) => w.length > 0), [text]);
  const longest = useMemo(() => words.reduce((m, w) => Math.max(m, Array.from(w).length), 1), [words]);

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGSVGElement>(null);
  const letters = useRef<HTMLSpanElement[]>([]);
  const field = useRef<Glyph[]>([]);
  const ptr = useRef({ x: 0, y: 0, active: false, presence: 0, touch: false });
  const ring = useRef<Ring | null>(null);
  const clock = useRef(0);
  const fontPx = useRef(fontSize);

  const live = useRef({ mode, strength, radius, stiffness, damping, ink, accent });
  useEffect(() => {
    live.current = { mode, strength, radius, stiffness, damping, ink, accent };
  }, [mode, strength, radius, stiffness, damping, ink, accent]);

  const collect = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const els = Array.from(box.querySelectorAll<HTMLSpanElement>("[data-letter]"));
    letters.current = els;
    fontPx.current = parseFloat(getComputedStyle(box).fontSize) || fontSize;
    const prev = field.current;
    field.current = els.map((el, i) => {
      // offsetLeft/Top ignore transforms, so these are the true rest positions.
      const cx = el.offsetLeft + el.offsetWidth / 2;
      const cy = el.offsetTop + el.offsetHeight / 2;
      const p = prev[i];
      if (p) return { ...p, cx, cy };
      return {
        cx,
        cy,
        x: { x: 0, v: 0 },
        y: { x: 0, v: 0 },
        r: { x: 0, v: 0 },
        s: { x: 1, v: 0 },
        key: "",
        tint: -1,
        kickAt: -1,
        seed: i,
      };
    });
  }, [fontSize]);

  const write = useCallback(() => {
    const { ink: c, accent: a } = live.current;
    const gs = field.current;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      const el = letters.current[i];
      if (!el) continue;
      const key = `${g.x.x.toFixed(1)},${g.y.x.toFixed(1)},${g.r.x.toFixed(1)},${g.s.x.toFixed(3)}`;
      if (key !== g.key) {
        el.style.transform = `translate3d(${g.x.x.toFixed(2)}px, ${g.y.x.toFixed(2)}px, 0) rotate(${g.r.x.toFixed(2)}deg) scale(${g.s.x.toFixed(3)})`;
        g.key = key;
      }
      const tint = g.tint;
      const prevTint = Number(el.dataset.tint ?? -1);
      if (tint !== prevTint) {
        el.style.color = tint > 0 ? `color-mix(in oklab, ${a} ${tint}%, ${c})` : c;
        el.dataset.tint = String(tint);
      }
    }
    const svg = ringRef.current;
    const r = ring.current;
    if (svg) {
      if (r && r.age < RING_LIFE) {
        const k = r.age / RING_LIFE;
        const ease = 1 - (1 - k) ** 3;
        const size = fontPx.current * (0.4 + 5.5 * ease);
        svg.style.opacity = String((1 - k) * 0.7);
        svg.style.transform = `translate3d(${(r.x - 50).toFixed(1)}px, ${(r.y - 50).toFixed(1)}px, 0) scale(${(size / 100).toFixed(3)})`;
      } else if (svg.style.opacity !== "0") {
        svg.style.opacity = "0";
      }
    }
  }, []);

  const snapTo = useCallback(
    (fx: number, fy: number) => {
      const box = boxRef.current;
      if (!box) return;
      const px = fx * box.offsetWidth;
      const py = fy * box.offsetHeight;
      for (let gi = 0, gs = field.current; gi < gs.length; gi++) {
        const g = gs[gi];
        const { tx, ty, tr, ts } = fieldTarget(g, px, py, 1, live.current, fontPx.current);
        g.x = { x: tx, v: 0 };
        g.y = { x: ty, v: 0 };
        g.r = { x: tr, v: 0 };
        g.s = { x: ts, v: 0 };
      }
      write();
    },
    [write],
  );

  const frame = useCallback(
    (dt: number) => {
      clock.current += dt;
      const L = live.current;
      const p = ptr.current;
      p.presence += ((p.active ? 1 : 0) - p.presence) * (1 - Math.exp(-dt * (p.active ? 10 : 4)));
      const cfg: SpringConfig = { stiffness: L.stiffness, damping: L.damping, mass: 1 };
      const rcfg: SpringConfig = { stiffness: L.stiffness * 0.8, damping: L.damping * 0.85, mass: 1 };
      let moving = false;
      for (let gi = 0, gs = field.current; gi < gs.length; gi++) {
        const g = gs[gi];
        if (g.kickAt >= 0 && clock.current >= g.kickAt) {
          // Focus ripple: a small hop with a lean.
          g.y.v -= fontPx.current * 2.2;
          g.r.v += (g.seed % 2 ? 1 : -1) * 60;
          g.s.v += 1.2;
          g.kickAt = -1;
        }
        const { tx, ty, tr, ts } = fieldTarget(g, p.x, p.y, p.presence, L, fontPx.current);
        stepSpring(g.x, tx, cfg, dt);
        stepSpring(g.y, ty, cfg, dt);
        stepSpring(g.r, tr, rcfg, dt);
        stepSpring(g.s, ts, cfg, dt);
        if (
          g.kickAt >= 0 ||
          Math.abs(g.x.x - tx) + Math.abs(g.y.x - ty) > 0.05 ||
          Math.abs(g.r.x - tr) > 0.05 ||
          Math.abs(g.s.x - ts) > 0.0005 ||
          Math.abs(g.x.v) + Math.abs(g.y.v) + Math.abs(g.r.v) > 0.05
        )
          moving = true;
      }
      if (ring.current) {
        ring.current.age += dt;
        if (ring.current.age >= RING_LIFE) ring.current = null;
        else moving = true;
      }
      write();
      if (!moving && !p.active && p.presence < 0.002) return false;
    },
    [write],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: !still });

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    const refresh = () => {
      collect();
      if (fixedX !== undefined && fixedY !== undefined) snapTo(fixedX, fixedY);
      else write();
    };
    refresh();
    const ro = new ResizeObserver(refresh);
    ro.observe(box);
    document.fonts?.ready.then(() => {
      if (!cancelled) refresh();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [collect, snapTo, write, fixedX, fixedY, text, fontSize, fontWeight, fontFamily, tracking]);

  useEffect(() => {
    if (still) return;
    const box = boxRef.current;
    if (!box) return;
    const local = (clientX: number, clientY: number) => {
      const rect = box.getBoundingClientRect();
      const scale = box.offsetWidth > 0 ? rect.width / box.offsetWidth : 1;
      return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale, rect, scale };
    };
    const onMove = (e: PointerEvent) => {
      const p = ptr.current;
      if (e.pointerType === "touch" && !p.touch) return;
      const { x, y, rect, scale } = local(e.clientX, e.clientY);
      const pad = fontPx.current * live.current.radius * 2 * scale;
      const near =
        e.clientX > rect.left - pad && e.clientX < rect.right + pad && e.clientY > rect.top - pad && e.clientY < rect.bottom + pad;
      p.x = x;
      p.y = y;
      p.active = near;
      if (near) wake();
    };
    const release = (e?: PointerEvent) => {
      if (e && e.pointerType !== "touch") return;
      ptr.current.touch = false;
      ptr.current.active = false;
      wake();
    };
    const onLeave = () => {
      ptr.current.active = false;
      wake();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [still, wake]);

  const blast = useCallback(
    (x: number, y: number) => {
      if (still || !shockwave) return;
      const em = fontPx.current;
      const rand = mulberry32((Math.round(x * 31 + y * 17) ^ field.current.length) >>> 0);
      for (let gi = 0, gs = field.current; gi < gs.length; gi++) {
        const g = gs[gi];
        const dx = g.cx - x;
        const dy = g.cy - y;
        const dist = Math.hypot(dx, dy) || 1;
        const fall = 1 / (1 + (dist / (em * 2.4)) ** 2);
        const speed = em * 16 * fall * live.current.strength * (0.75 + rand() * 0.5);
        g.x.v += (dx / dist) * speed;
        g.y.v += (dy / dist) * speed - em * 4 * fall;
        g.r.v += (rand() - 0.5) * 1400 * fall;
        g.s.v += (rand() - 0.3) * 6 * fall;
      }
      ring.current = { x, y, age: 0 };
      wake();
    },
    [still, shockwave, wake],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (still) return;
      const box = boxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const scale = box.offsetWidth > 0 ? rect.width / box.offsetWidth : 1;
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      if (e.pointerType === "touch") {
        ptr.current.touch = true;
        ptr.current.x = x;
        ptr.current.y = y;
        ptr.current.active = true;
        wake();
      } else {
        blast(x, y);
      }
    },
    [still, blast, wake],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const box = boxRef.current;
      if (!box) return;
      blast(box.offsetWidth / 2, box.offsetHeight / 2);
    },
    [blast],
  );

  const onFocus = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      if (still) return;
      if (!e.currentTarget.matches(":focus-visible")) return;
      const now = clock.current;
      field.current.forEach((g, i) => {
        g.kickAt = now + 0.05 + i * 0.045;
      });
      wake();
    },
    [still, wake],
  );

  const fitCqi = 100 / (longest * Math.max(0.35, 0.6 + tracking));
  let letterIndex = 0;

  return (
    <div
      ref={rootRef}
      role={shockwave && !still ? "button" : undefined}
      tabIndex={shockwave && !still ? 0 : undefined}
      aria-label={shockwave && !still ? ariaLabel ?? text : undefined}
      className={cn(
        "relative block w-full select-none rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent",
        !still && shockwave && "cursor-pointer",
        className,
      )}
      style={{ containerType: "inline-size", touchAction: "pan-y", WebkitTapHighlightColor: "transparent" }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      <div
        ref={boxRef}
        aria-hidden="true"
        className="relative"
        style={{
          fontFamily,
          fontWeight,
          fontSize: `min(${fontSize}px, ${fitCqi.toFixed(3)}cqi)`,
          letterSpacing: `${tracking}em`,
          lineHeight: 1.04,
          textAlign: align,
          color: ink,
          paddingBlock: "0.12em",
        }}
      >
        {words.map((w, wi) =>
          /^\s+$/.test(w) ? (
            <span key={`s${wi}`}>{" "}</span>
          ) : (
            <span key={`w${wi}`} className="inline-block whitespace-nowrap">
              {Array.from(w).map((ch) => {
                const i = letterIndex++;
                return (
                  <span key={i} data-letter="" className="inline-block will-change-transform" style={{ transformOrigin: "50% 60%" }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          ),
        )}
        <svg
          ref={ringRef}
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={100}
          height={100}
          viewBox="0 0 100 100"
          style={{ opacity: 0, transformOrigin: "50% 50%" }}
        >
          <circle cx={50} cy={50} r={49} fill="none" stroke={accent} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <span className="sr-only">{ariaLabel ?? text}</span>
    </div>
  );
}

export default MagneticLetters;
