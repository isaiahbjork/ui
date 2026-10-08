"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { stepSpring, type SpringState } from "@/components/bjork-ui/_core/spring";
import { easeCss } from "@/components/bjork-ui/_core/motion";

export type StrokeIconName =
  | "menu"
  | "equal"
  | "minus"
  | "plus"
  | "close"
  | "chevron-down"
  | "chevron-up"
  | "chevron-right"
  | "chevron-left"
  | "arrow-right"
  | "arrow-down"
  | "arrow-left"
  | "arrow-up"
  | "check"
  | "play"
  | "pause"
  | "dot"
  | "ellipsis"
  | "busy"
  | (string & {});

// Three line segments in a 24 x 24 box. `hidden` lines render at opacity 0 and collapse
// onto the centroid of the visible endpoints. `group` icons share geometry and only rotate.
export interface StrokeIconDef {
  lines: [number, number, number, number][];
  hidden?: [boolean, boolean, boolean];
  group?: string;
  rotation?: number;
  spin?: boolean;
  strokeScale?: number;
}

export interface StrokeMorphIconProps {
  name: StrokeIconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  spring?: { stiffness: number; damping: number; mass: number };
  spin?: boolean;
  label?: string;
  className?: string;
}

type Seg = [number, number, number, number];

const DEFAULT_SPRING = { stiffness: 380, damping: 30, mass: 0.7 };
const CROSS_LINES: StrokeIconDef["lines"] = [
  [12, 5, 12, 19],
  [5, 12, 19, 12],
  [12, 12, 12, 12],
];
const CHEVRON_LINES: StrokeIconDef["lines"] = [
  [6, 9, 12, 15],
  [12, 15, 18, 9],
  [12, 15, 12, 15],
];
const ARROW_LINES: StrokeIconDef["lines"] = [
  [5, 12, 19, 12],
  [13, 6, 19, 12],
  [13, 18, 19, 12],
];

export const strokeIcons: Record<string, StrokeIconDef> = {
  menu: {
    lines: [
      [4, 7, 20, 7],
      [4, 12, 20, 12],
      [4, 17, 20, 17],
    ],
  },
  equal: {
    lines: [
      [5, 9, 19, 9],
      [5, 15, 19, 15],
      [12, 12, 12, 12],
    ],
    hidden: [false, false, true],
  },
  minus: {
    lines: [
      [5, 12, 19, 12],
      [12, 12, 12, 12],
      [12, 12, 12, 12],
    ],
    hidden: [false, true, true],
  },
  plus: { lines: CROSS_LINES, hidden: [false, false, true], group: "cross", rotation: 0 },
  close: { lines: CROSS_LINES, hidden: [false, false, true], group: "cross", rotation: 45 },
  "chevron-down": { lines: CHEVRON_LINES, hidden: [false, false, true], group: "chevron", rotation: 0 },
  "chevron-up": { lines: CHEVRON_LINES, hidden: [false, false, true], group: "chevron", rotation: 180 },
  "chevron-right": { lines: CHEVRON_LINES, hidden: [false, false, true], group: "chevron", rotation: -90 },
  "chevron-left": { lines: CHEVRON_LINES, hidden: [false, false, true], group: "chevron", rotation: 90 },
  "arrow-right": { lines: ARROW_LINES, group: "arrow", rotation: 0 },
  "arrow-down": { lines: ARROW_LINES, group: "arrow", rotation: 90 },
  "arrow-left": { lines: ARROW_LINES, group: "arrow", rotation: 180 },
  "arrow-up": { lines: ARROW_LINES, group: "arrow", rotation: -90 },
  check: {
    lines: [
      [5, 12.5, 10, 17.5],
      [10, 17.5, 19, 7],
      [10, 17.5, 10, 17.5],
    ],
    hidden: [false, false, true],
  },
  // The +0.75px optical x nudge is already in these coordinates (OPTICAL-ALIGNMENT R2).
  play: {
    lines: [
      [8.75, 5, 8.75, 19],
      [8.75, 5, 19.75, 12],
      [8.75, 19, 19.75, 12],
    ],
  },
  pause: {
    lines: [
      [9, 6, 9, 18],
      [15, 6, 15, 18],
      [12, 12, 12, 12],
    ],
    hidden: [false, false, true],
  },
  dot: {
    lines: [
      [12, 12, 12, 12],
      [12, 12, 12, 12],
      [12, 12, 12, 12],
    ],
    hidden: [false, true, true],
    strokeScale: 1.6,
  },
  ellipsis: {
    lines: [
      [6, 12, 6, 12],
      [12, 12, 12, 12],
      [18, 12, 18, 12],
    ],
  },
  busy: {
    lines: [
      [12, 12, 12, 5],
      [12, 12, 18.06, 15.5],
      [12, 12, 5.94, 15.5],
    ],
    group: "busy",
    rotation: 0,
    spin: true,
  },
};

function isSeg(v: unknown): v is Seg {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

// Registers a custom icon. Throws a TypeError unless it has exactly three finite line segments.
export function defineStrokeIcon(name: string, def: StrokeIconDef): void {
  if (!name) throw new TypeError("defineStrokeIcon: name must be a non-empty string");
  if (!Array.isArray(def.lines) || def.lines.length !== 3 || !def.lines.every(isSeg)) {
    throw new TypeError(`defineStrokeIcon("${name}"): lines must be exactly 3 [x1, y1, x2, y2] segments`);
  }
  if (def.hidden !== undefined && (!Array.isArray(def.hidden) || def.hidden.length !== 3)) {
    throw new TypeError(`defineStrokeIcon("${name}"): hidden must have exactly 3 booleans`);
  }
  strokeIcons[name] = def;
}

const warnedNames = new Set<string>();

function resolveStrokeIcon(name: string): StrokeIconDef {
  if (Object.prototype.hasOwnProperty.call(strokeIcons, name)) return strokeIcons[name];
  if (process.env.NODE_ENV !== "production" && !warnedNames.has(name)) {
    warnedNames.add(name);
    console.warn(`StrokeMorphIcon: unknown name "${name}", rendering "dot" instead.`);
  }
  return strokeIcons.dot;
}

// Effective geometry: hidden lines collapse onto the centroid of the visible endpoints.
const effCache = new WeakMap<StrokeIconDef, Seg[]>();

function effOf(def: StrokeIconDef): Seg[] {
  const cached = effCache.get(def);
  if (cached) return cached;
  const visible = [0, 1, 2].map((i) => !def.hidden?.[i]);
  let sx = 0;
  let sy = 0;
  let n = 0;
  def.lines.forEach(([x1, y1, x2, y2], i) => {
    if (!visible[i]) return;
    sx += x1 + x2;
    sy += y1 + y2;
    n += 2;
  });
  const cx = n ? sx / n : 12;
  const cy = n ? sy / n : 12;
  const eff = def.lines.map((seg, i): Seg => (visible[i] ? seg : [cx, cy, cx, cy]));
  effCache.set(def, eff);
  return eff;
}

function visibleOf(def: StrokeIconDef): boolean[] {
  return [0, 1, 2].map((i) => !def.hidden?.[i]);
}

interface Assignment {
  perm: number[]; // source line i goes to target line perm[i]
  flip: boolean[]; // swap that line's endpoints
}

const PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// Best endpoint matching: 6 permutations, and per line the cheaper of the 2 endpoint flips
// (the 8 flip combinations reduce to this because each line's flip is independent).
function bestAssignment(src: Seg[], dst: Seg[]): Assignment {
  let best: Assignment = { perm: [0, 1, 2], flip: [false, false, false] };
  let bestCost = Infinity;
  for (const perm of PERMS) {
    let total = 0;
    const flip: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const [ax1, ay1, ax2, ay2] = src[i];
      const [bx1, by1, bx2, by2] = dst[perm[i]];
      const straight = (ax1 - bx1) ** 2 + (ay1 - by1) ** 2 + (ax2 - bx2) ** 2 + (ay2 - by2) ** 2;
      const crossed = (ax1 - bx2) ** 2 + (ay1 - by2) ** 2 + (ax2 - bx1) ** 2 + (ay2 - by1) ** 2;
      flip.push(crossed < straight);
      total += Math.min(straight, crossed);
    }
    if (total < bestCost) {
      bestCost = total;
      best = { perm: [...perm], flip };
    }
  }
  return best;
}

// Memoised per (from, to) pair of defs. Used when the icon has settled on `from`.
const matchCache = new WeakMap<StrokeIconDef, WeakMap<StrokeIconDef, Assignment>>();

function canonicalMatch(from: StrokeIconDef, to: StrokeIconDef): Assignment {
  let inner = matchCache.get(from);
  if (!inner) {
    inner = new WeakMap();
    matchCache.set(from, inner);
  }
  const cached = inner.get(to);
  if (cached) return cached;
  const result = bestAssignment(effOf(from), effOf(to));
  inner.set(to, result);
  return result;
}

// Shortest signed rotation from `from` to `to` (degrees), in (-180, 180].
function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
const COORDS = ["x1", "y1", "x2", "y2"] as const;

interface MorphEls {
  group: SVGGElement;
  lines: (SVGLineElement | null)[];
}

// Owns the imperative morph. React renders once; every frame writes attributes through refs.
class Morph {
  private els: MorphEls | null = null;
  private cur = new Float64Array(12);
  private from = new Float64Array(12);
  private to = new Float64Array(12);
  private curAngle: number;
  private fromAngle: number;
  private toAngle: number;
  private curScale = 1;
  private fromScale = 1;
  private toScale = 1;
  private slotLine = [0, 1, 2]; // settled: element s shows canonical line slotLine[s]
  private targetLine = [0, 1, 2];
  private visibleTo = [true, true, true];
  private spring: SpringState = { x: 0, v: 0 };
  private written: (string | undefined)[] = [];
  private strokeWidth = 2;
  private active = false;
  private cfg = DEFAULT_SPRING;
  target: StrokeIconDef;

  constructor(def: StrokeIconDef) {
    this.target = def;
    effOf(def).forEach((seg, s) => this.to.set(seg, s * 4));
    this.cur.set(this.to);
    this.from.set(this.to);
    this.curAngle = this.fromAngle = this.toAngle = def.rotation ?? 0;
    this.curScale = this.fromScale = this.toScale = def.strokeScale ?? 1;
  }

  bind(els: MorphEls) {
    this.els = els;
    this.paint(1);
  }

  setConfig(cfg: { stiffness: number; damping: number; mass: number }) {
    this.cfg = cfg;
  }

  setStrokeWidth(strokeWidth: number) {
    this.strokeWidth = strokeWidth;
    this.paint(this.active ? this.spring.x : 1);
  }

  retarget(next: StrokeIconDef, reduce: boolean) {
    const prev = this.target;
    const sameGroup = !!next.group && next.group === prev.group;
    this.target = next;

    if (!sameGroup) {
      let assignment: Assignment;
      if (this.active) {
        // Mid-flight: match from the current lerped geometry, not from a settled def.
        const current: Seg[] = [0, 1, 2].map((s) => [
          this.cur[s * 4],
          this.cur[s * 4 + 1],
          this.cur[s * 4 + 2],
          this.cur[s * 4 + 3],
        ]);
        assignment = bestAssignment(current, effOf(next));
      } else {
        assignment = canonicalMatch(prev, next);
      }
      const eff = effOf(next);
      const visible = visibleOf(next);
      for (let s = 0; s < 3; s++) {
        const c = this.active ? s : this.slotLine[s];
        const t = this.active ? assignment.perm[s] : assignment.perm[c];
        const flip = this.active ? assignment.flip[s] : assignment.flip[c];
        this.targetLine[s] = t;
        const [x1, y1, x2, y2] = eff[t];
        const seg: Seg = flip ? [x2, y2, x1, y1] : [x1, y1, x2, y2];
        this.to.set(seg, s * 4);
        this.visibleTo[s] = visible[t];
      }
      // A line that changes visibility fades over 120ms ease-out, or instantly when reduced.
      this.applyVisibility(reduce);
    }

    this.fromAngle = this.curAngle;
    this.fromScale = this.curScale;
    this.from.set(this.cur);
    this.toAngle = this.curAngle + shortestDelta(this.curAngle, next.rotation ?? 0);
    this.toScale = next.strokeScale ?? 1;

    if (reduce) {
      this.settle();
      return;
    }
    this.spring.x = 0; // keep the velocity so an interrupted move carries its momentum
    this.active = true;
  }

  private applyVisibility(reduce: boolean) {
    const els = this.els;
    if (!els) return;
    for (let s = 0; s < 3; s++) {
      const line = els.lines[s];
      if (!line) continue;
      line.style.transition = reduce ? "none" : `opacity 120ms ${easeCss.out}`;
      line.style.opacity = this.visibleTo[s] ? "1" : "0";
    }
  }

  // Frame step for useVisibleLoop. Returns false when idle.
  step(dt: number): boolean {
    if (!this.active) return false;
    stepSpring(this.spring, 1, this.cfg, dt);
    if (Math.abs(this.spring.x - 1) < 1e-4 && Math.abs(this.spring.v) < 1e-3) {
      this.settle();
      return false;
    }
    this.paint(this.spring.x);
    return true;
  }

  // Snap to the exact canonical geometry of the target and go idle.
  private settle() {
    const eff = effOf(this.target);
    for (let s = 0; s < 3; s++) {
      this.slotLine[s] = this.targetLine[s];
      const seg = eff[this.targetLine[s]];
      this.to.set(seg, s * 4);
    }
    this.from.set(this.to);
    this.fromAngle = this.toAngle;
    this.curAngle = this.toAngle;
    this.fromScale = this.toScale;
    this.curScale = this.toScale;
    this.active = false;
    this.spring.x = 1;
    this.spring.v = 0;
    this.paint(1);
  }

  private paint(p: number) {
    const els = this.els;
    if (!els) return;
    for (let s = 0; s < 3; s++) {
      const line = els.lines[s];
      for (let k = 0; k < 4; k++) {
        const i = s * 4 + k;
        const v = this.from[i] + (this.to[i] - this.from[i]) * p;
        this.cur[i] = v;
        const str = fmt(v);
        if (line && this.written[i] !== str) {
          line.setAttribute(COORDS[k], str);
          this.written[i] = str;
        }
      }
    }
    this.curAngle = this.fromAngle + (this.toAngle - this.fromAngle) * p;
    this.curScale = this.fromScale + (this.toScale - this.fromScale) * p;
    const transform = `rotate(${fmt(this.curAngle)} 12 12)`;
    if (this.written[12] !== transform) {
      els.group.setAttribute("transform", transform);
      this.written[12] = transform;
    }
    const sw = fmt(this.strokeWidth * this.curScale);
    if (this.written[13] !== sw) {
      els.group.setAttribute("stroke-width", sw);
      this.written[13] = sw;
    }
  }
}

export function StrokeMorphIcon({
  name,
  size = 24,
  strokeWidth = 2,
  color = "currentColor",
  spring,
  spin,
  label,
  className,
}: StrokeMorphIconProps) {
  const reduceMotion = useReducedMotion() === true;
  const def = resolveStrokeIcon(name);

  // Initial markup only. After mount, attributes are owned by the Morph, so these
  // constants never change and React never overwrites an in-flight frame.
  const [initial] = useState(() => {
    const eff = effOf(def);
    const visible = visibleOf(def);
    return {
      segs: eff,
      visible,
      transform: `rotate(${def.rotation ?? 0} 12 12)`,
      strokeWidth: fmt(strokeWidth * (def.strokeScale ?? 1)),
    };
  });
  const [morph] = useState(() => new Morph(def));

  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const lineRefs = useRef<(SVGLineElement | null)[]>([null, null, null]);

  // The <svg> stays the root (icon-with-label rules target `>svg`). The loop hook only reads
  // the element's box and dataset, which SVG elements also have.
  const loop = useVisibleLoop(svgRef as RefObject<HTMLElement | null>, (dt) => morph.step(dt));

  useLayoutEffect(() => {
    if (!groupRef.current) return;
    morph.bind({ group: groupRef.current, lines: lineRefs.current });
  }, [morph]);

  useLayoutEffect(() => {
    morph.setConfig(spring ?? DEFAULT_SPRING);
  });

  useLayoutEffect(() => {
    if (morph.target === def) return;
    morph.retarget(def, reduceMotion);
    if (!reduceMotion) loop.wake();
  }, [def, reduceMotion, morph, loop]);

  useLayoutEffect(() => {
    morph.setStrokeWidth(strokeWidth);
  }, [morph, strokeWidth]);

  const spinning = (spin ?? def.spin) === true;

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", className)}
    >
      <g
        className={spinning ? "motion-safe:animate-spin" : undefined}
        style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
      >
        <g ref={groupRef} strokeWidth={initial.strokeWidth} transform={initial.transform}>
          {initial.segs.map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              style={{ opacity: initial.visible[i] ? 1 : 0 }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
