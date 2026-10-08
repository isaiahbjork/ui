"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { isCoarsePointer, useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export type PlaneTypeVariant = "solid" | "mixed" | "outline";
export type PlaneTypePointerSource = "self" | "window" | "scroll" | "none";
export type PlaneTypeAlign = "left" | "center" | "right";

export interface PlaneTypeProps {
  lines: string[];
  as?: "h1" | "h2" | "h3";
  size?: string;
  depth?: number;
  tilt?: number;
  slide?: number;
  overlap?: number;
  skew?: number;
  variant?: PlaneTypeVariant;
  knockout?: boolean;
  pointerSource?: PlaneTypePointerSource;
  align?: PlaneTypeAlign;
  opticalAlign?: boolean;
  spring?: { stiffness: number; damping: number; mass: number };
  /** Fixed normalised pointer position, for deterministic previews. Overrides pointer input. */
  pose?: { x: number; y: number };
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const MAX_LINES = 6;
const LINE_HEIGHT = 0.82; // em
// Cap height of the display face in em, used so the stack's box matches its visible caps.
const CAP_HEIGHT = 0.7; // em
const OUTLINE_STROKE = "1.5px";
const DEFAULT_SPRING = { stiffness: 150, damping: 20, mass: 1 };
const ATTRACT_IDLE_MS = 4000;
const ATTRACT_AMPLITUDE = 0.6;
const ATTRACT_PERIOD_X = 7;
const ATTRACT_PERIOD_Y = 11;

// Optical left-edge offsets, in em. The right edge mirrors these values.
const OPTICAL_EM: Record<string, number> = {
  O: -0.04,
  Q: -0.04,
  C: -0.03,
  G: -0.03,
  S: -0.02,
  A: -0.02,
  V: -0.02,
  W: -0.02,
  T: -0.02,
  Y: -0.02,
};

function opticalOffset(line: string, align: PlaneTypeAlign): number {
  if (align === "center") return 0;
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const edge = align === "right" ? trimmed.charAt(trimmed.length - 1) : trimmed.charAt(0);
  const value = OPTICAL_EM[edge.toUpperCase()] ?? 0;
  return align === "right" ? -value : value;
}

function clamp(v: number) {
  return Math.max(-1, Math.min(1, v));
}

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

interface Paint {
  color: string;
  outline: boolean;
  blend: "normal" | "difference" | "multiply";
}

function paintFor(index: number, variant: PlaneTypeVariant, knockout: boolean, tone: BjorkTone): Paint {
  const kind =
    variant === "outline" ? "outline" : variant === "solid" ? "solid" : (["solid", "accent", "outline"] as const)[index % 3];
  const text = "var(--bjork-text)";
  const accent = "var(--bjork-accent)";
  if (knockout) {
    const color = tone === "dark" ? text : index % 2 === 0 ? text : accent;
    return { color, outline: kind === "outline", blend: tone === "dark" ? "difference" : "multiply" };
  }
  return { color: kind === "accent" ? accent : text, outline: kind === "outline", blend: "normal" };
}

interface PlaneProps {
  text: string;
  index: number;
  count: number;
  depth: number;
  skew: number;
  overlap: number;
  opticalEm: number;
  reduce: boolean;
  shift: MotionValue<number>;
  paint: Paint;
  align: PlaneTypeAlign;
}

// Each plane's transform is built once per instance. Every constant it closes over is part of the key in PlaneType.
function Plane({ text, index, count, depth, skew, overlap, opticalEm, reduce, shift, paint, align }: PlaneProps) {
  const mid = (count - 1) / 2;
  const dx = index - mid;
  const z = dx * depth;
  const rotation = reduce ? 0 : (index % 2 ? 1 : -1) * skew;
  const y = index * (1 - overlap) * LINE_HEIGHT;
  const transform = useTransform(
    shift,
    (v: number) =>
      `translateX(calc(${opticalEm}em + ${(v * dx).toFixed(3)}px)) translateY(${y}em) translateZ(${z}px) rotateZ(${rotation}deg)`,
  );

  const justify = align === "center" ? "justify-self-center" : align === "right" ? "justify-self-end" : "justify-self-start";
  const style: CSSProperties = paint.outline
    ? { color: "transparent", WebkitTextStroke: `${OUTLINE_STROKE} ${paint.color}`, mixBlendMode: paint.blend }
    : { color: paint.color, WebkitTextStroke: "0", mixBlendMode: paint.blend };

  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "pointer-events-none block w-max self-start whitespace-nowrap font-bjork-display font-bold leading-[0.82] tracking-[-0.04em] [grid-area:1/1] [text-box:trim-both_cap_alphabetic]",
        justify,
      )}
      style={{ ...style, transform }}
    >
      {text || " "}
    </motion.span>
  );
}

/**
 * Display type set as overlapping planes in 3D space. The whole stack tilts with the pointer,
 * and each plane slides against the others, so the lines pass each other as you move.
 */
export function PlaneType({
  lines,
  as = "h2",
  size = "clamp(48px, 9vw, 128px)",
  depth = 48,
  tilt = 8,
  slide = 6,
  overlap = 0.18,
  skew = 0,
  variant = "mixed",
  knockout = false,
  pointerSource = "self",
  align = "left",
  opticalAlign = true,
  spring = DEFAULT_SPRING,
  pose,
  tone: toneProp,
  attract = false,
  className,
}: PlaneTypeProps) {
  const tone = useBjorkTone(toneProp);
  const palette = BJORK_PALETTE[tone];
  const reduce = useReducedMotion() === true;
  const rootRef = useRef<HTMLDivElement>(null);
  const shown = lines.slice(0, MAX_LINES);
  const count = shown.length;
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarsePointer, () => false);
  // Touch devices cannot hover, so "self" falls back to "scroll".
  const source: PlaneTypePointerSource = pointerSource === "self" && coarse ? "scroll" : pointerSource;

  const hasPose = pose !== undefined;
  const poseX = pose?.x ?? 0;
  const poseY = pose?.y ?? 0;

  // Raw targets are already in rendered units: degrees for the tilt, px for the slide.
  const rotX = useMotionValue(hasPose && !reduce ? -poseY * tilt : 0);
  const rotY = useMotionValue(hasPose && !reduce ? poseX * tilt : 0);
  const shift = useMotionValue(hasPose && !reduce ? poseX * slide : 0);

  const springConfig = useMemo(
    () => ({ stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass }),
    [spring.stiffness, spring.damping, spring.mass],
  );
  const rotXs = useSpring(rotX, springConfig);
  const rotYs = useSpring(rotY, springConfig);
  const shiftS = useSpring(shift, springConfig);

  const aim = (nx: number, ny: number) => {
    if (reduce) {
      rotX.set(0);
      rotY.set(0);
      shift.set(0);
      return;
    }
    const x = clamp(nx);
    const y = clamp(ny);
    rotX.set(-y * tilt);
    rotY.set(x * tilt);
    shift.set(x * slide);
  };
  const aimRef = useRef(aim);
  useEffect(() => {
    aimRef.current = aim;
  });

  // Pose and reduced motion both replace the pointer's target.
  useEffect(() => {
    if (reduce) aimRef.current(0, 0);
    else if (hasPose) aimRef.current(poseX, poseY);
  }, [reduce, hasPose, poseX, poseY]);

  const lastInput = useRef(Number.NEGATIVE_INFINITY);
  const rect = useRef<DOMRect | null>(null);

  const onPointerEnter = () => {
    if (source !== "self") return;
    rect.current = rootRef.current?.getBoundingClientRect() ?? null;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (source !== "self") return;
    lastInput.current = performance.now();
    const r = rect.current ?? rootRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    rect.current = r;
    aim(((event.clientX - r.left) / r.width) * 2 - 1, ((event.clientY - r.top) / r.height) * 2 - 1);
  };

  const onPointerLeave = () => {
    if (source !== "self") return;
    rect.current = null;
    aim(0, 0);
  };

  // Window and scroll sources only listen while the component is on screen.
  useEffect(() => {
    if (source !== "window" && source !== "scroll") return;
    const el = rootRef.current;
    if (!el) return;

    const onWindowMove = (event: globalThis.PointerEvent) => {
      lastInput.current = performance.now();
      aimRef.current((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1);
    };
    const onWindowOut = (event: globalThis.PointerEvent) => {
      if (!event.relatedTarget) aimRef.current(0, 0);
    };
    const onScroll = () => {
      lastInput.current = performance.now();
      const r = el.getBoundingClientRect();
      const half = window.innerHeight / 2;
      const centre = r.top + r.height / 2;
      aimRef.current(0, (half - centre) / half);
    };

    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      if (source === "window") {
        window.addEventListener("pointermove", onWindowMove, { passive: true });
        window.addEventListener("pointerout", onWindowOut, { passive: true });
      } else {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        onScroll();
      }
    };
    const detach = () => {
      if (!attached) return;
      attached = false;
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerout", onWindowOut);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) attach();
      else detach();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      detach();
    };
  }, [source]);

  // Idle drift: a Lissajous path feeds the springs. Any input inside the component pauses it for 4s.
  const attractOn = attract && !reduce && !hasPose && source !== "none";
  const attractT = useRef(0);
  useVisibleLoop(
    rootRef,
    (dt) => {
      if (performance.now() - lastInput.current < ATTRACT_IDLE_MS) return;
      attractT.current += dt;
      const t = attractT.current;
      aimRef.current(
        ATTRACT_AMPLITUDE * Math.sin((2 * Math.PI * t) / ATTRACT_PERIOD_X),
        ATTRACT_AMPLITUDE * Math.sin((2 * Math.PI * t) / ATTRACT_PERIOD_Y),
      );
    },
    { enabled: attractOn },
  );

  useEffect(() => {
    if (count > 0 && lines.length > MAX_LINES) {
      console.warn(`PlaneType renders up to ${MAX_LINES} lines; ${lines.length} were given.`);
    }
  }, [lines.length, count]);

  const cssVars = { "--bjork-text": palette.text, "--bjork-accent": palette.accent } as CSSProperties;
  const justifyRow = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  const totalEm = count > 0 ? (count - 1) * (1 - overlap) * LINE_HEIGHT + CAP_HEIGHT : 0;
  const Tag = as;

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full select-none", className)}
      style={{
        ...cssVars,
        perspective: "900px",
        isolation: "isolate",
        fontSize: size,
        backgroundColor: knockout ? palette.stage : undefined,
      }}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <motion.div
        className={cn("flex w-full", justifyRow)}
        style={{ rotateX: rotXs, rotateY: rotYs, transformStyle: "preserve-3d" }}
      >
        <Tag className="m-0 w-max max-w-full font-bjork-display" style={{ transformStyle: "preserve-3d" }}>
          <VisuallyHidden>{shown.join(" ")}</VisuallyHidden>
          <span aria-hidden="true" className="grid w-max" style={{ transformStyle: "preserve-3d" }}>
            <span aria-hidden="true" className="invisible [grid-area:1/1]" style={{ height: `${totalEm}em` }} />
            {shown.map((line, index) => {
              const opticalEm = opticalAlign ? opticalOffset(line, align) : 0;
              return (
                <Plane
                  key={`${index}|${count}|${depth}|${skew}|${overlap}|${opticalEm}|${reduce ? 1 : 0}`}
                  text={line}
                  index={index}
                  count={count}
                  depth={depth}
                  skew={skew}
                  overlap={overlap}
                  opticalEm={opticalEm}
                  reduce={reduce}
                  shift={shiftS}
                  paint={paintFor(index, variant, knockout, tone)}
                  align={align}
                />
              );
            })}
          </span>
        </Tag>
      </motion.div>
    </div>
  );
}
