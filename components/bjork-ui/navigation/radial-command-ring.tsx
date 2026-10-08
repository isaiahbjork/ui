"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { isCoarsePointer, useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { springs } from "@/components/bjork-ui/_core/motion";

export interface RadialCommandItem {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  disabled?: boolean;
}

export type RadialCommandOpenOn = "hold" | "contextmenu" | "both";

export interface RadialCommandRingProps {
  items: RadialCommandItem[];
  onSelect: (id: string) => void;
  children?: ReactNode;
  openOn?: RadialCommandOpenOn;
  holdMs?: number;
  radius?: number;
  innerRadius?: number;
  deadZone?: number;
  startAngle?: number;
  showLabels?: boolean;
  haptics?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fixes the ring centre (px in the root). Applies when `open` is controlled. */
  anchor?: { x: number; y: number };
  /** Controlled highlight. Used for posed previews and tests. */
  highlightedId?: string | null;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

type Mode = "hold" | "sticky" | "keyboard" | "attract";

interface RingState {
  open: boolean;
  x: number | null;
  y: number | null;
  highlight: number | null;
  mode: Mode;
  coarse: boolean;
  flash: boolean;
}

const CLOSED_RING: RingState = {
  open: false,
  x: null,
  y: null,
  highlight: null,
  mode: "sticky",
  coarse: false,
  flash: false,
};

interface Snapshot {
  items: RadialCommandItem[];
  n: number;
  startAngle: number;
  deadZone: number;
  holdMs: number;
  openOn: RadialCommandOpenOn;
  haptics: boolean;
  controlled: boolean;
  openProp: boolean | undefined;
  onSelect: (id: string) => void;
  onOpenChange: ((open: boolean) => void) | undefined;
  radiusProp: number | undefined;
  geom: { open: boolean; mode: Mode; x: number; y: number; radius: number; c: number };
}

const MAX_ITEMS = 8;
const MIN_ITEMS = 3;
// Room around the ring for outer labels. The container is 2 * (radius + PAD) square.
const PAD = 120;
const HOLD_CANCEL_PX = 8;
const FLASH_MS = 90;
const EDGE_GAP = 12;
const ATTRACT_CYCLE_MS = 3200;
const ATTRACT_IDLE_MS = 4000;
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const OPEN_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;
const ROTATE_SPRING = { stiffness: 520, damping: 38, mass: 0.6 };
const CLOSE_TRANSITION = { duration: 0.12, ease: EASE_OUT } as const;
// Opacity gets its own short ease-out so it reaches 1 within 260ms. The spring stays on scale.
const OPEN_FADE = { duration: 0.2, ease: EASE_OUT } as const;

// Event-time clock. Kept out of render so the purity rule stays quiet.
const eventNow = () => performance.now();

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function normDeg(d: number) {
  return ((d % 360) + 360) % 360;
}

// Round to half a pixel so icon centres land on a stable grid.
function roundHalf(v: number) {
  return Math.round(v * 2) / 2;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// Direction, not target: the slice under the pointer, measured from the centre.
function indexAt(dx: number, dy: number, n: number, startAngle: number, deadZone: number) {
  if (n === 0 || Math.hypot(dx, dy) < deadZone) return null;
  const step = 360 / n;
  const theta = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rel = normDeg(theta - startAngle + step / 2);
  return Math.min(n - 1, Math.floor(rel / step));
}

function wedgePath(c: number, ri: number, ro: number, step: number, gap: number, midR: number) {
  const half = ((step / 2) * Math.PI) / 180;
  const d = gap / midR; // equal arc length at the mid radius, on each side
  const a0 = -half + d;
  const a1 = half - d;
  const pt = (r: number, a: number) =>
    `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${pt(ri, a0)} L ${pt(ro, a0)} A ${ro} ${ro} 0 ${large} 1 ${pt(ro, a1)} L ${pt(ri, a1)} A ${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
}

function attractPhase(t: number, n: number) {
  if (t >= 2100) return { open: false, highlight: null as number | null };
  const h = t < 300 ? null : t < 900 ? 0 : t < 1500 ? 1 : 2;
  return { open: true, highlight: h === null ? null : Math.min(h, n - 1) };
}

function clampCentre(x: number, y: number, radius: number, w: number, h: number) {
  const m = radius + EDGE_GAP;
  const cx = w >= 2 * m ? Math.min(Math.max(x, m), w - m) : w / 2;
  const cy = h >= 2 * m ? Math.min(Math.max(y, m), h - m) : h / 2;
  return { x: cx, y: cy };
}

export function RadialCommandRing({
  items: rawItems,
  onSelect,
  children,
  openOn = "both",
  holdMs = 220,
  radius: radiusProp,
  innerRadius = 44,
  deadZone = 28,
  startAngle = -90,
  showLabels = true,
  haptics = true,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  anchor,
  highlightedId,
  tone,
  attract = false,
  className,
}: RadialCommandRingProps) {
  const resolvedTone = useBjorkTone(tone);
  const p = BJORK_PALETTE[resolvedTone];
  const dark = resolvedTone === "dark";
  const reduce = useReducedMotion() ?? false;
  const uid = useId();
  const controlled = openProp !== undefined;

  const items = useMemo(() => rawItems.slice(0, MAX_ITEMS), [rawItems]);
  const n = items.length;
  const step = n > 0 ? 360 / n : 360;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (rawItems.length > MAX_ITEMS) {
      console.warn(`RadialCommandRing takes 3 to 8 items. Rendering the first ${MAX_ITEMS} of ${rawItems.length}.`);
    } else if (rawItems.length < MIN_ITEMS) {
      console.warn(`RadialCommandRing takes 3 to 8 items. Got ${rawItems.length}.`);
    }
  }, [rawItems.length]);

  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tetherRef = useRef<SVGLineElement>(null);
  const wedgeRef = useRef<SVGGElement>(null);
  const size = useElementSize(rootRef);

  const [ring, setRing] = useState<RingState>(() => ({ ...CLOSED_RING, open: defaultOpen && !controlled }));
  const ringRef = useRef<RingState>(ring);
  const live = useRef<Snapshot>(null as unknown as Snapshot);
  const closeRef = useRef<() => void>(() => {});
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const holdRef = useRef<{ id: number; timer: number; x0: number; y0: number; x: number; y: number; fired: boolean } | null>(null);
  const captureRef = useRef<number | null>(null);
  const flashTimer = useRef(0);
  const busyUntil = useRef(0);
  const focusOnOpen = useRef(false);
  const unwrapped = useRef(startAngle);
  const attractClock = useRef<number | null>(null);
  const attractKey = useRef("");

  const commit = useCallback((patch: Partial<RingState>) => {
    const next = { ...ringRef.current, ...patch };
    ringRef.current = next;
    setRing(next);
  }, []);

  const cx = size.width / 2;
  const cy = size.height / 2;
  const hi = highlightedId === undefined ? ring.highlight : items.findIndex((it) => it.id === highlightedId);
  const staticAttract = attract && reduce && !controlled;
  const attractEnabled = attract && !reduce && !controlled;

  // Shown state. Controlled `open` wins. Reduced-motion attract shows one static frame.
  let shown = {
    open: controlled ? !!openProp : ring.open,
    x: (controlled && anchor ? anchor.x : ring.x) ?? cx,
    y: (controlled && anchor ? anchor.y : ring.y) ?? cy,
    highlight: hi === -1 ? null : hi,
    mode: ring.mode,
    radius: radiusProp ?? (ring.coarse ? 128 : 112),
    flash: ring.flash,
  };
  if (staticAttract && !ring.open) {
    shown = { ...shown, open: true, x: cx, y: cy, highlight: n > 1 ? 1 : 0, mode: "attract", radius: radiusProp ?? 112, flash: false };
  }

  const R = shown.radius;
  const c = R + PAD;
  const S = 2 * c;
  const midR = (innerRadius + R) / 2;
  const hubR = innerRadius - 6;
  const itemId = (i: number) => `${uid}-item-${i}`;
  const shownItem = shown.highlight !== null ? items[shown.highlight] : undefined;

  useLayoutEffect(() => {
    if (controlled) ringRef.current = { ...ringRef.current, open: !!openProp };
    live.current = {
      items,
      n,
      startAngle,
      deadZone,
      holdMs,
      openOn,
      haptics,
      controlled,
      openProp,
      onSelect,
      onOpenChange,
      radiusProp,
      geom: { open: shown.open, mode: shown.mode, x: shown.x, y: shown.y, radius: R, c },
    };
  });

  // Rotation of the highlight wedge. A motion value, so the spring never re-renders React.
  const rot = useMotionValue(startAngle);
  const rotSpring = useSpring(rot, ROTATE_SPRING);
  const rotation = reduce ? rot : rotSpring;

  useMotionValueEvent(rotation, "change", (v) => {
    const el = wedgeRef.current;
    if (el) el.setAttribute("transform", `rotate(${v} ${live.current.geom.c} ${live.current.geom.c})`);
  });

  useLayoutEffect(() => {
    const el = wedgeRef.current;
    if (el) el.setAttribute("transform", `rotate(${rotation.get()} ${c} ${c})`);
  }, [shown.open, c, rotation]);

  const aim = useCallback(
    (h: number) => {
      const cur = unwrapped.current;
      const target = startAngle + h * step;
      const delta = (((target - cur) % 360) + 540) % 360 - 180; // shortest path
      unwrapped.current = cur + delta;
      rot.set(unwrapped.current);
    },
    [rot, startAngle, step],
  );

  useEffect(() => {
    if (shown.highlight !== null) aim(shown.highlight);
  }, [shown.highlight, aim]);

  // The tether runs from the hub edge toward the pointer. It is set through refs only.
  const syncTether = () => {
    const el = tetherRef.current;
    if (!el) return;
    const g = live.current.geom;
    const pt = pointerRef.current;
    const hidden = !pt || !g.open || g.mode === "attract";
    const dx = hidden ? 0 : pt.x - g.x;
    const dy = hidden ? 0 : pt.y - g.y;
    const d = Math.hypot(dx, dy);
    if (hidden || d < hubR) {
      el.setAttribute("x1", String(g.c));
      el.setAttribute("y1", String(g.c));
      el.setAttribute("x2", String(g.c));
      el.setAttribute("y2", String(g.c));
      return;
    }
    const ux = dx / d;
    const uy = dy / d;
    const end = Math.min(d, g.radius);
    el.setAttribute("x1", (g.c + ux * hubR).toFixed(2));
    el.setAttribute("y1", (g.c + uy * hubR).toFixed(2));
    el.setAttribute("x2", (g.c + ux * end).toFixed(2));
    el.setAttribute("y2", (g.c + uy * end).toFixed(2));
  };

  useLayoutEffect(() => {
    syncTether();
  }, [shown.open, shown.x, shown.y, R]);

  useLayoutEffect(() => {
    if (shown.open && focusOnOpen.current) {
      focusOnOpen.current = false;
      menuRef.current?.focus({ preventScroll: true });
    }
  }, [shown.open]);

  // Attract: a deterministic idle loop. Pauses for 4s after any input inside the component.
  const attractRunning = attractEnabled;
  useVisibleLoop(
    rootRef,
    (dt) => {
      const r = ringRef.current;
      if (r.open && r.mode !== "attract") {
        attractClock.current = null;
        return true;
      }
      if (eventNow() < busyUntil.current) {
        attractClock.current = null;
        return true;
      }
      if (attractClock.current === null) {
        attractClock.current = 0;
        attractKey.current = "";
      }
      attractClock.current += dt * 1000;
      const phase = attractPhase(attractClock.current % ATTRACT_CYCLE_MS, live.current.n);
      const key = `${phase.open}|${phase.highlight}`;
      if (key !== attractKey.current) {
        attractKey.current = key;
        commit({ open: phase.open, x: null, y: null, highlight: phase.highlight, mode: "attract", coarse: isCoarsePointer(), flash: false });
      }
      return true;
    },
    { enabled: attractRunning },
  );

  const noteInput = () => {
    busyUntil.current = eventNow() + ATTRACT_IDLE_MS;
    if (ringRef.current.open && ringRef.current.mode === "attract") {
      commit({ open: false });
    }
  };

  const releaseCapture = () => {
    const id = captureRef.current;
    captureRef.current = null;
    const el = rootRef.current;
    if (id !== null && el && el.hasPointerCapture(id)) el.releasePointerCapture(id);
  };

  const closeRing = () => {
    if (!ringRef.current.open) return;
    const menuHadFocus = menuRef.current?.contains(document.activeElement) ?? false;
    const wasAttract = ringRef.current.mode === "attract";
    holdRef.current = null;
    releaseCapture();
    commit({ open: false, flash: false });
    if (menuHadFocus) surfaceRef.current?.focus({ preventScroll: true });
    if (!wasAttract) live.current.onOpenChange?.(false);
  };

  useLayoutEffect(() => {
    closeRef.current = closeRing;
  });

  const activate = (i: number) => {
    const item = live.current.items[i];
    if (!item || item.disabled) return;
    live.current.onSelect(item.id);
    closeRing();
  };

  const setHighlight = (h: number | null) => {
    if (ringRef.current.highlight === h) return;
    if (h !== null && live.current.haptics) navigator.vibrate?.(4);
    commit({ highlight: h });
  };

  const openRing = (mode: Mode, pos: { x: number; y: number } | null, highlight: number | null) => {
    const L = live.current;
    const el = rootRef.current;
    if (!el || L.n === 0) return;
    const rect = el.getBoundingClientRect();
    rectRef.current = rect;
    const coarse = isCoarsePointer();
    const radius = L.radiusProp ?? (coarse ? 128 : 112);
    const at = clampCentre(pos?.x ?? rect.width / 2, pos?.y ?? rect.height / 2, radius, rect.width, rect.height);
    pointerRef.current = pos;
    const wasOpen = ringRef.current.open;
    commit({ open: true, x: at.x, y: at.y, highlight, mode, coarse, flash: false });
    focusOnOpen.current = true;
    if (!wasOpen) L.onOpenChange?.(true);
  };

  const fireHold = () => {
    const h = holdRef.current;
    if (!h) return;
    h.fired = true;
    h.timer = 0;
    captureRef.current = h.id;
    try {
      rootRef.current?.setPointerCapture(h.id);
    } catch {
      captureRef.current = null;
    }
    openRing("hold", { x: h.x, y: h.y }, null);
  };

  const localPoint = (e: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => {
    const rect = rectRef.current ?? e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    noteInput();
    const L = live.current;
    if (ringRef.current.open) return;
    if (e.button !== 0 || L.n === 0) return;
    if (L.openOn !== "hold" && L.openOn !== "both") return;
    const rect = e.currentTarget.getBoundingClientRect();
    rectRef.current = rect;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    holdRef.current = {
      id: e.pointerId,
      timer: window.setTimeout(fireHold, L.holdMs),
      x0: x,
      y0: y,
      x,
      y,
      fired: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    noteInput();
    const pt = localPoint(e);
    const h = holdRef.current;
    if (h && !h.fired) {
      h.x = pt.x;
      h.y = pt.y;
      if (Math.hypot(pt.x - h.x0, pt.y - h.y0) > HOLD_CANCEL_PX) {
        window.clearTimeout(h.timer);
        holdRef.current = null;
      }
      return;
    }
    if (!ringRef.current.open || ringRef.current.flash) return;
    pointerRef.current = pt;
    const r = ringRef.current;
    const gx = r.x ?? cx;
    const gy = r.y ?? cy;
    setHighlight(indexAt(pt.x - gx, pt.y - gy, live.current.n, startAngle, deadZone));
    syncTether();
  };

  const onPointerUp = () => {
    const h = holdRef.current;
    if (h && !h.fired) {
      window.clearTimeout(h.timer);
      holdRef.current = null;
      return;
    }
    const r = ringRef.current;
    if (!r.open || r.mode !== "hold" || r.flash) return;
    holdRef.current = null;
    releaseCapture();
    const idx = r.highlight;
    const item = idx !== null ? live.current.items[idx] : undefined;
    if (idx !== null && item && !item.disabled) {
      commit({ flash: true });
      flashTimer.current = window.setTimeout(() => {
        flashTimer.current = 0;
        activate(idx);
      }, FLASH_MS);
    } else {
      closeRing();
    }
  };

  const onPointerCancel = () => {
    const h = holdRef.current;
    if (h && !h.fired) {
      window.clearTimeout(h.timer);
      holdRef.current = null;
      return;
    }
    if (ringRef.current.open && ringRef.current.mode === "hold") closeRing();
  };

  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const L = live.current;
    if (L.openOn !== "contextmenu" && L.openOn !== "both") return;
    e.preventDefault();
    noteInput();
    const pt = localPoint(e);
    if (ringRef.current.open) {
      commit({ x: pt.x, y: pt.y });
      pointerRef.current = pt;
      return;
    }
    openRing("sticky", pt, null);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    noteInput();
    const L = live.current;
    const key = e.key;
    const n = L.n;
    if (!ringRef.current.open) {
      if (key === "Enter" || key === " " || key === "ContextMenu" || (key === "F10" && e.shiftKey)) {
        e.preventDefault();
        if (e.repeat) return;
        const first = L.items.findIndex((it) => !it.disabled);
        const el = rootRef.current;
        if (!el) return;
        openRing("keyboard", null, first === -1 ? 0 : first);
      }
      return;
    }
    const h = ringRef.current.highlight;
    if (ringRef.current.flash) {
      e.preventDefault();
      return;
    }
    switch (key) {
      case "Escape":
        e.preventDefault();
        closeRing();
        return;
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        setHighlight(h === null ? 0 : (h + 1) % n);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        setHighlight(h === null ? n - 1 : (h - 1 + n) % n);
        return;
      case "Home":
        e.preventDefault();
        setHighlight(0);
        return;
      case "End":
        e.preventDefault();
        setHighlight(n - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (e.repeat || h === null) return;
        activate(h);
        return;
      default:
        break;
    }
    if (/^[1-8]$/.test(key)) {
      const idx = Number(key) - 1;
      if (idx < n) {
        e.preventDefault();
        activate(idx);
      }
      return;
    }
    if (key.length === 1 && /[a-z]/i.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const want = key.toLowerCase();
      for (let k = 1; k <= n; k += 1) {
        const j = ((h ?? -1) + k) % n;
        if (L.items[j].label.trim().toLowerCase().startsWith(want)) {
          e.preventDefault();
          setHighlight(j);
          return;
        }
      }
    }
  };

  // Click outside closes a sticky or keyboard-opened ring.
  const outsideActive = ring.open && (ring.mode === "sticky" || ring.mode === "keyboard");
  useEffect(() => {
    if (!outsideActive) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) closeRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [outsideActive]);

  useEffect(() => {
    const flash = flashTimer;
    const hold = holdRef;
    return () => {
      window.clearTimeout(flash.current);
      if (hold.current) window.clearTimeout(hold.current.timer);
    };
  }, []);

  const discBg = dark ? "rgba(18,18,18,0.92)" : "rgba(255,252,246,0.94)";
  const discBorder = dark ? p.border : p.borderStrong;
  const discShadow = dark
    ? "0 24px 48px -16px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)"
    : "0 24px 48px -20px rgba(66,52,33,.25)";
  const wedgeFill = hexToRgba(p.accent, shown.flash ? 0.3 : 0.16);
  const wedgeStroke = hexToRgba(p.accent, dark ? 0.55 : 0.6);
  const wedgeD = wedgePath(c, innerRadius + 4, R - 4, step, 2, midR);
  const hairPath = Array.from({ length: n }, (_, k) => {
    const a = startAngle - step / 2 + k * step;
    const [x1, y1] = polar(c, c, innerRadius, a);
    const [x2, y2] = polar(c, c, R, a);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join("");

  let labelAnchor: "start" | "middle" | "end" = "middle";
  let labelX = c;
  let labelY = c;
  if (showLabels && shown.highlight !== null) {
    const theta = startAngle + shown.highlight * step;
    const cosT = Math.cos((theta * Math.PI) / 180);
    labelAnchor = Math.abs(cosT) < Math.sin((15 * Math.PI) / 180) ? "middle" : cosT < 0 ? "end" : "start";
    [labelX, labelY] = polar(c, c, R + 18, theta);
  }
  // The outer label renders only when it fits inside the root. The hub already names the item.
  const lw = shownItem ? shownItem.label.length * 7 + 4 : 0;
  const lx = shown.x - c + labelX;
  const labelFits =
    labelAnchor === "start"
      ? lx + lw <= size.width - 4
      : labelAnchor === "end"
        ? lx - lw >= 4
        : lx - lw / 2 >= 4 && lx + lw / 2 <= size.width - 4;

  const ringStyle: CSSProperties = {
    left: shown.x - c,
    top: shown.y - c,
    width: S,
    height: S,
  };

  const hubHead = shownItem ? shownItem.label : shown.mode === "hold" ? "Release to cancel" : "Escape to close";

  return (
    <div
      ref={rootRef}
      data-tone={resolvedTone}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      className={cn(
        "relative select-none",
        className,
      )}
      style={{
        WebkitTouchCallout: "none",
        touchAction: shown.open ? "none" : undefined,
      } as CSSProperties}
    >
      <div
        ref={surfaceRef}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={shown.open}
        aria-label="Actions"
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--bjork-accent)]"
      >
        <VisuallyHidden>Press Enter for actions</VisuallyHidden>
      </div>
      {children}
      <AnimatePresence>
        {shown.open && (
          <motion.div
            key="ring"
            ref={menuRef}
            role="menu"
            aria-label="Actions"
            tabIndex={-1}
            aria-activedescendant={shown.highlight !== null ? itemId(shown.highlight) : undefined}
            className="pointer-events-none absolute outline-none"
            style={ringStyle}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96, transition: CLOSE_TRANSITION }}
            transition={reduce ? CLOSE_TRANSITION : { scale: OPEN_SPRING, opacity: OPEN_FADE }}
          >
            <div
              className="absolute rounded-full border backdrop-blur-[16px]"
              style={{
                left: PAD,
                top: PAD,
                width: 2 * R,
                height: 2 * R,
                background: discBg,
                borderColor: discBorder,
                boxShadow: discShadow,
              }}
            />
            <svg
              aria-hidden="true"
              width={S}
              height={S}
              viewBox={`0 0 ${S} ${S}`}
              className="absolute left-0 top-0"
              style={{ overflow: "visible" }}
            >
              <g ref={wedgeRef} style={{ opacity: shown.highlight === null ? 0 : 1 }}>
                <path d={wedgeD} fill={wedgeFill} stroke={wedgeStroke} strokeWidth={1} />
              </g>
              <path d={hairPath} stroke={p.hair} strokeWidth={1} fill="none" />
              <line ref={tetherRef} stroke={p.textFaint} strokeWidth={1} />
              {shownItem && labelAnchor !== undefined && labelFits && (
                <motion.text
                  key={shown.highlight ?? -1}
                  x={labelX}
                  y={labelY}
                  textAnchor={labelAnchor}
                  dominantBaseline="middle"
                  fill={p.text}
                  className="font-bjork-alpha"
                  style={{ fontSize: 12, fontWeight: 500 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={CLOSE_TRANSITION}
                >
                  {shownItem.label}
                </motion.text>
              )}
            </svg>
            <div
              className="absolute grid place-items-center rounded-full border"
              style={{
                left: c - hubR,
                top: c - hubR,
                width: 2 * hubR,
                height: 2 * hubR,
                background: p.surface,
                borderColor: p.border,
              }}
            >
              <div className="flex w-[68px] flex-col items-center text-center">
                <span
                  className="block max-h-[26px] overflow-hidden font-mono text-[11px] uppercase leading-[13px] tracking-[0.08em] [text-box:trim-both_cap_alphabetic]"
                  style={{ color: p.text }}
                >
                  {hubHead}
                </span>
                {shownItem?.shortcut && (
                  <span className="mt-1.5 font-mono text-[10px] leading-none tabular-nums" style={{ color: p.textFaint }}>
                    {shownItem.shortcut}
                  </span>
                )}
              </div>
            </div>
            {items.map((item, i) => {
              const [ix, iy] = polar(c, c, midR, startAngle + i * step);
              const active = shown.highlight === i;
              return (
                <button
                  key={item.id}
                  id={itemId(i)}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-label={item.label}
                  aria-disabled={item.disabled ? true : undefined}
                  onClick={() => {
                    if (ringRef.current.mode === "hold") return;
                    activate(i);
                  }}
                  className="pointer-events-auto absolute grid size-11 place-items-center rounded-full outline-none"
                  style={{
                    left: roundHalf(ix),
                    top: roundHalf(iy),
                    transform: "translate(-50%,-50%)",
                    color: active ? p.text : p.textMuted,
                    background: "transparent",
                    border: 0,
                    padding: 0,
                  }}
                >
                  <motion.span
                    className="grid place-items-center"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={reduce ? CLOSE_TRANSITION : { ...springs.snappy, delay: i * 0.012 }}
                  >
                    <span
                      className="grid place-items-center [&_svg]:size-5"
                      style={{
                        transform: active ? "scale(1.08)" : undefined,
                        opacity: item.disabled ? 0.3 : 1,
                      }}
                    >
                      {item.icon}
                    </span>
                  </motion.span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
