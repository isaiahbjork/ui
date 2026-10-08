"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  BJORK_PALETTE,
  type BjorkTone,
} from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { cn } from "@/lib/utils";

export type GlowRulesAxis = "rows" | "cols" | "grid";

export interface GlowRulesTether {
  /** Centre of the second light, in px from the container's top-left. */
  x: number;
  y: number;
  /** Half-width of the light in px. Default 360. */
  width?: number;
  /** Half-height of the light in px. Default 56. */
  height?: number;
  /** 0 to 1. Default 1. */
  intensity?: number;
}

export interface GlowRulesProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "color"
> {
  children?: ReactNode;
  /** Elements whose edges become rules. Matched inside the container. Default `"li"`. */
  selector?: string;
  /** `rows` draws horizontal rules, `cols` vertical rules, `grid` both. Default `"rows"`. */
  axis?: GlowRulesAxis;
  /** Light size: [half-width as a share of the container, half-height in px]. Default `[0.4, 100]`. */
  radius?: [number, number];
  /** Share of the remaining distance the light covers per 60 Hz frame. Default 0.12. */
  lerp?: number;
  /** Snaps the light to this grid (px) so style writes stay rare. Default 4. */
  quantize?: number;
  /** Light colour. Defaults to white on dark and warm ink on light. */
  color?: string;
  /** Peak opacity of the light, 0 to 1. Default 1 on dark, 0.85 on light. */
  intensity?: number;
  /** Colour of the resting rules. `false` hides them, so the light only shows where you already draw borders. */
  ruleColor?: string | false;
  /** Blend for the light. `auto` uses screen on dark and multiply on light. */
  blend?: "auto" | CSSProperties["mixBlendMode"];
  /** Draw a rule above the first item and below the last. Default true. */
  outerEdges?: boolean;
  /** Keyboard focus inside a matched element moves the light there. Default true. */
  followFocus?: boolean;
  /** A second light pinned to a point, e.g. to lead the eye toward a card. */
  tether?: GlowRulesTether | null;
  /** Draws the rules in from the left the first time they are measured. Default false. */
  drawIn?: boolean;
  /** Turns the light off without unmounting. */
  disabled?: boolean;
  tone?: BjorkTone;
}

export interface GlowRulesHandle {
  /** Re-measures the rules. Call after a change the observers cannot see, such as a transform-free reflow. */
  measure: () => void;
  /** Moves the light to a point (container px) and shows it, as keyboard focus does. */
  pointAt: (x: number, y: number) => void;
  /** Hides the light. */
  release: () => void;
  element: HTMLDivElement | null;
}

const FADE_MS = 350;

function offsetWithin(el: HTMLElement, root: HTMLElement) {
  // offsetTop/Left ignore transforms, so entrance animations on the items do not drag the rules around.
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent || !root.contains(parent)) {
      if (parent !== root) {
        // root is not an offsetParent of this chain: fall back to layout rects.
        const a = el.getBoundingClientRect();
        const b = root.getBoundingClientRect();
        return {
          x: a.left - b.left,
          y: a.top - b.top,
          w: el.offsetWidth,
          h: el.offsetHeight,
        };
      }
    }
    node = parent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Hairline rules that catch a soft light under the pointer. One overlay draws every rule:
 * the rules are 1 px mask layers measured from the matched children, the light is a single
 * radial gradient behind that mask. The pointer is eased and quantised; the loop sleeps when settled.
 */
export const GlowRules = forwardRef<GlowRulesHandle, GlowRulesProps>(
  function GlowRules(
    {
      children,
      selector = "li",
      axis = "rows",
      radius = [0.4, 100],
      lerp = 0.12,
      quantize = 4,
      color,
      intensity,
      ruleColor,
      blend = "auto",
      outerEdges = true,
      followFocus = true,
      tether = null,
      drawIn = false,
      disabled = false,
      tone,
      className,
      style,
      onPointerMove,
      onPointerEnter,
      onPointerLeave,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const resolved = useBjorkTone(tone);
    const palette = BJORK_PALETTE[resolved];
    const isDark = resolved === "dark";
    const lightColor = color ?? (isDark ? "#ffffff" : "#6b4a2b");
    const peak = intensity ?? (isDark ? 1 : 0.85);
    const rules = ruleColor === undefined ? palette.hair : ruleColor;
    const mixBlend =
      blend === "auto" ? (isDark ? "screen" : "multiply") : blend;

    const rootRef = useRef<HTMLDivElement>(null);
    const layersRef = useRef<HTMLDivElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);
    const tetherRef = useRef<HTMLDivElement>(null);
    const drawnRef = useRef(false);

    // Pointer state lives in refs; React never re-renders for it.
    const state = useRef({
      tx: -9999,
      ty: -9999,
      x: -9999,
      y: -9999,
      lastX: NaN,
      lastY: NaN,
      raf: 0,
      last: 0,
      pointerInside: false,
      focusInside: false,
      snapNext: true,
      // Tether light: eased toward its target in the same loop.
      hx: NaN,
      hy: NaN,
      htx: NaN,
      hty: NaN,
      hLastX: NaN,
      hLastY: NaN,
    });
    const optsRef = useRef({ lerp, quantize });
    useEffect(() => {
      optsRef.current = { lerp, quantize };
    }, [lerp, quantize]);

    const write = useCallback((x: number, y: number) => {
      const el = glowRef.current;
      if (!el) return;
      el.style.setProperty("--gr-x", `${x}px`);
      el.style.setProperty("--gr-y", `${y}px`);
    }, []);

    const tick = useCallback(
      (now: number) => {
        const s = state.current;
        s.raf = 0;
        const dt = s.last ? Math.min(64, now - s.last) : 16.7;
        s.last = now;
        const reduce = prefersReducedMotion();
        const { lerp: l, quantize: q } = optsRef.current;
        const k =
          s.snapNext || reduce
            ? 1
            : 1 - Math.pow(1 - Math.min(1, Math.max(0.001, l)), dt / 16.667);
        s.snapNext = false;
        s.x += (s.tx - s.x) * k;
        s.y += (s.ty - s.y) * k;
        const step = Math.max(1, q);
        const qx = Math.round(s.x / step) * step;
        const qy = Math.round(s.y / step) * step;
        if (qx !== s.lastX || qy !== s.lastY) {
          write(qx, qy);
          s.lastX = qx;
          s.lastY = qy;
        }
        let tetherMoving = false;
        if (!Number.isNaN(s.htx)) {
          if (Number.isNaN(s.hx) || reduce) {
            s.hx = s.htx;
            s.hy = s.hty;
          } else {
            // A touch slower than the pointer light, so the tether trails it.
            const kt = 1 - Math.pow(1 - 0.16, dt / 16.667);
            s.hx += (s.htx - s.hx) * kt;
            s.hy += (s.hty - s.hy) * kt;
          }
          const hx = Math.round(s.hx);
          const hy = Math.round(s.hy);
          if (hx !== s.hLastX || hy !== s.hLastY) {
            tetherRef.current?.style.setProperty("--gt-x", `${hx}px`);
            tetherRef.current?.style.setProperty("--gt-y", `${hy}px`);
            s.hLastX = hx;
            s.hLastY = hy;
          }
          tetherMoving =
            Math.abs(s.htx - s.hx) > 0.5 || Math.abs(s.hty - s.hy) > 0.5;
        }
        if (
          tetherMoving ||
          Math.abs(s.tx - s.x) > 0.5 ||
          Math.abs(s.ty - s.y) > 0.5
        ) {
          s.raf = requestAnimationFrame(tick);
        } else {
          s.last = 0;
        }
      },
      [write],
    );

    const kick = useCallback(() => {
      const s = state.current;
      if (!s.raf) s.raf = requestAnimationFrame(tick);
    }, [tick]);

    const setOn = useCallback(
      (on: boolean) => {
        const el = glowRef.current;
        if (!el) return;
        el.style.opacity = on && !disabled ? String(peak) : "0";
      },
      [disabled, peak],
    );

    const measure = useCallback(() => {
      const root = rootRef.current;
      const layers = layersRef.current;
      if (!root || !layers) return;
      let items: HTMLElement[] = [];
      try {
        items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
          (el) => el.offsetParent !== null || el.getClientRects().length > 0,
        );
      } catch {
        items = [];
      }
      const images: string[] = [];
      const sizes: string[] = [];
      const positions: string[] = [];
      const push = (x: number, y: number, w: number, h: number) => {
        images.push("linear-gradient(#000,#000)");
        sizes.push(`${Math.round(w)}px ${Math.round(h)}px`);
        positions.push(`${Math.round(x)}px ${Math.round(y)}px`);
      };
      const boxes = items.map((el) => offsetWithin(el, root));
      const near = (a: number, b: number) => Math.abs(a - b) <= 1.5;
      const overlapX = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
        a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1;
      const overlapY = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
        a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      const seen = new Set<string>();
      const line = (x: number, y: number, w: number, h: number) => {
        const key = `${Math.round(x)}:${Math.round(y)}:${Math.round(w)}:${Math.round(h)}`;
        if (seen.has(key)) return;
        seen.add(key);
        push(x, y, w, h);
      };
      if (axis === "rows" || axis === "grid") {
        boxes.forEach((b) => {
          // Top edge, unless it is the outer edge and outer edges are off.
          const hasAbove = boxes.some(
            (o) => o !== b && near(o.y + o.h, b.y) && overlapX(o, b),
          );
          if (outerEdges || hasAbove) line(b.x, b.y, b.w, 1);
          // Bottom edge only where nothing sits directly below, so shared edges draw once.
          const hasBelow = boxes.some(
            (o) => o !== b && near(o.y, b.y + b.h) && overlapX(o, b),
          );
          if (outerEdges && !hasBelow) line(b.x, b.y + b.h - 1, b.w, 1);
        });
      }
      if (axis === "cols" || axis === "grid") {
        boxes.forEach((b) => {
          const hasLeft = boxes.some(
            (o) => o !== b && near(o.x + o.w, b.x) && overlapY(o, b),
          );
          if (outerEdges || hasLeft) line(b.x, b.y, 1, b.h);
          const hasRight = boxes.some(
            (o) => o !== b && near(o.x, b.x + b.w) && overlapY(o, b),
          );
          if (outerEdges && !hasRight) line(b.x + b.w - 1, b.y, 1, b.h);
        });
      }
      const mask = images.length
        ? images.join(",")
        : "linear-gradient(transparent,transparent)";
      layers.style.setProperty("--gr-mask", mask);
      layers.style.setProperty("--gr-mask-size", sizes.join(",") || "0 0");
      layers.style.setProperty("--gr-mask-pos", positions.join(",") || "0 0");
      if (drawIn && !drawnRef.current && images.length) {
        drawnRef.current = true;
        if (!prefersReducedMotion()) {
          layers.animate(
            [
              { clipPath: "inset(0 100% 0 0)" },
              { clipPath: "inset(0 0% 0 0)" },
            ],
            {
              duration: 700,
              easing: "cubic-bezier(0.23,1,0.32,1)",
              fill: "both",
            },
          );
        }
      }
    }, [selector, axis, outerEdges, drawIn]);

    // Measure on size and structure changes. Observing every matched item catches rows that grow.
    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      let frame = 0;
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
          observeItems();
        });
      };
      const ro = new ResizeObserver(schedule);
      const observed = new Set<Element>();
      const observeItems = () => {
        let items: Element[] = [];
        try {
          items = Array.from(root.querySelectorAll(selector));
        } catch {
          items = [];
        }
        for (const el of items) {
          if (!observed.has(el)) {
            observed.add(el);
            ro.observe(el);
          }
        }
      };
      ro.observe(root);
      observeItems();
      const mo = new MutationObserver(schedule);
      mo.observe(root, { childList: true, subtree: true });
      schedule();
      if (typeof document !== "undefined" && document.fonts?.ready) {
        document.fonts.ready.then(schedule).catch(() => {});
      }
      return () => {
        if (frame) cancelAnimationFrame(frame);
        ro.disconnect();
        mo.disconnect();
      };
    }, [measure, selector]);

    useEffect(() => {
      const s = state.current;
      return () => {
        if (s.raf) cancelAnimationFrame(s.raf);
      };
    }, []);

    useEffect(() => {
      setOn(state.current.pointerInside || state.current.focusInside);
    }, [setOn]);

    // Tether: keep the last position while it fades out, ease to new positions while it is on.
    const tetherX = tether?.x;
    const tetherY = tether?.y;
    const tetherOn = tether != null && !disabled;
    const tetherAlpha = (tether?.intensity ?? 1) * peak;
    useEffect(() => {
      const el = tetherRef.current;
      if (!el) return;
      const s = state.current;
      if (tetherOn && tetherX != null && tetherY != null) {
        const wasOff = el.style.opacity === "0" || el.style.opacity === "";
        s.htx = tetherX;
        s.hty = tetherY;
        if (wasOff) {
          // Appearing: start in place rather than sliding from the last row.
          s.hx = NaN;
          s.hy = NaN;
        }
        el.style.opacity = String(tetherAlpha);
        kick();
      } else {
        el.style.opacity = "0";
      }
    }, [tetherOn, tetherX, tetherY, tetherAlpha, kick]);

    const pointAt = useCallback(
      (x: number, y: number) => {
        const s = state.current;
        const wasOff = !(s.pointerInside || s.focusInside);
        s.tx = x;
        s.ty = y;
        if (wasOff && s.x < -9000) s.snapNext = true;
        s.focusInside = true;
        setOn(true);
        kick();
      },
      [kick, setOn],
    );

    const release = useCallback(() => {
      state.current.focusInside = false;
      setOn(state.current.pointerInside);
    }, [setOn]);

    useImperativeHandle(
      ref,
      () => ({ measure, pointAt, release, element: rootRef.current }),
      [measure, pointAt, release],
    );

    // Works inside scaled parents: layout px = screen px / scale.
    const toLocal = (clientX: number, clientY: number) => {
      const el = rootRef.current!;
      const r = el.getBoundingClientRect();
      const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const sy = el.offsetHeight ? r.height / el.offsetHeight : 1;
      return {
        x: (clientX - r.left) / (sx || 1),
        y: (clientY - r.top) / (sy || 1),
      };
    };

    const [rx, ry] = radius;
    const glowBg = `radial-gradient(ellipse ${Math.max(1, rx * 100)}% ${ry}px at var(--gr-x, -9999px) var(--gr-y, -9999px), ${lightColor} 0%, color-mix(in srgb, ${lightColor} 55%, transparent) 38%, transparent 100%)`;
    const tetherBg = `radial-gradient(ellipse ${tether?.width ?? 360}px ${tether?.height ?? 56}px at var(--gt-x, -9999px) var(--gt-y, -9999px), ${lightColor} 0%, color-mix(in srgb, ${lightColor} 40%, transparent) 45%, transparent 100%)`;

    const maskStyle: CSSProperties = {
      WebkitMaskImage: "var(--gr-mask)",
      maskImage: "var(--gr-mask)",
      WebkitMaskSize: "var(--gr-mask-size)",
      maskSize: "var(--gr-mask-size)",
      WebkitMaskPosition: "var(--gr-mask-pos)",
      maskPosition: "var(--gr-mask-pos)",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
    };

    return (
      <div
        ref={rootRef}
        className={cn("relative", className)}
        style={style}
        data-glow-rules=""
        onPointerMove={(e) => {
          onPointerMove?.(e);
          if (disabled || e.pointerType === "touch") return;
          const s = state.current;
          const p = toLocal(e.clientX, e.clientY);
          s.tx = p.x;
          s.ty = p.y;
          if (!s.pointerInside) {
            s.pointerInside = true;
            // First contact: start the light under the pointer instead of sweeping in from the last spot.
            if (!s.focusInside) s.snapNext = true;
            setOn(true);
          }
          kick();
        }}
        onPointerEnter={(e) => {
          onPointerEnter?.(e);
          if (disabled || e.pointerType === "touch") return;
          const s = state.current;
          const p = toLocal(e.clientX, e.clientY);
          s.tx = p.x;
          s.ty = p.y;
          s.pointerInside = true;
          if (!s.focusInside) s.snapNext = true;
          setOn(true);
          kick();
        }}
        onPointerLeave={(e) => {
          onPointerLeave?.(e);
          state.current.pointerInside = false;
          setOn(state.current.focusInside);
        }}
        onFocus={(e) => {
          onFocus?.(e);
          if (!followFocus || disabled) return;
          const target = e.target as HTMLElement;
          let item: HTMLElement | null = null;
          try {
            item = target.closest<HTMLElement>(selector);
          } catch {
            item = null;
          }
          if (!item || !rootRef.current?.contains(item)) return;
          if (!target.matches(":focus-visible")) return;
          const b = offsetWithin(item, rootRef.current);
          // Light the left third of the item, where the eye starts reading.
          pointAt(b.x + Math.min(b.w * 0.3, 320), b.y + b.h / 2);
        }}
        onBlur={(e) => {
          onBlur?.(e);
          const next = e.relatedTarget as Node | null;
          if (next && rootRef.current?.contains(next)) return;
          release();
        }}
        {...rest}
      >
        {children}
        <div
          ref={layersRef}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 1 }}
        >
          {rules !== false && (
            <div
              className="absolute inset-0"
              style={{ ...maskStyle, background: rules }}
            />
          )}
          <div
            ref={glowRef}
            className="absolute inset-0"
            style={{
              ...maskStyle,
              background: glowBg,
              mixBlendMode: mixBlend,
              opacity: 0,
              transition: `opacity ${FADE_MS}ms ease`,
            }}
          />
          <div
            ref={tetherRef}
            className="absolute inset-0"
            style={{
              ...maskStyle,
              background: tetherBg,
              mixBlendMode: mixBlend,
              opacity: 0,
              transition: `opacity ${FADE_MS}ms ease`,
            }}
          />
        </div>
      </div>
    );
  },
);
