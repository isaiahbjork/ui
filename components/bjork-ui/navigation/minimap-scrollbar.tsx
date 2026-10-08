"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export interface MinimapMark {
  at: number;
  label?: string;
  level?: 1 | 2 | 3 | 4;
}

export interface MinimapScrollbarProps {
  target: RefObject<HTMLElement | null>;
  selector?: string;
  marks?: MinimapMark[];
  side?: "right" | "left";
  width?: number;
  showLabels?: boolean;
  showBlocks?: boolean;
  lens?: boolean;
  onJump?: (mark: MinimapMark) => void;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
  /** Document fraction (0-1) to pin the hover lens and label to. For previews and tests. */
  debugHoverAt?: number;
}

interface Mark {
  at: number;
  label: string;
  level: 1 | 2 | 3 | 4;
  block: boolean;
  /** Section number shown in the label pill, "01".."99". Only set on headings. */
  num?: string;
}

interface DomMarks {
  headings: Mark[];
  blocks: Mark[];
}

interface DragState {
  id: number;
  startY: number;
  startScroll: number;
  trackH: number;
  scrollH: number;
}

const DEFAULT_SELECTOR = "h2, h3";
const BLOCK_SELECTOR = "p, pre, figure, ul, ol";
const HEADING_LEVELS: Record<string, 1 | 2 | 3 | 4> = { H1: 1, H2: 1, H3: 2, H4: 3, H5: 3, H6: 3 };
const TICK_SIZE: Record<Mark["level"], { w: number; h: number }> = {
  1: { w: 16, h: 1.5 },
  2: { w: 10, h: 1 },
  3: { w: 6, h: 1 },
  4: { w: 4, h: 1 },
};
const COARSE_TRACK_WIDTH = 24;
const LENS_RANGE = 48;
const LENS_SIGMA = 18;
const LENS_GAIN = 0.6;
const LABEL_FLASH_MS = 900;
const LABEL_FADE_MS = 120;
const MUTATION_DEBOUNCE_MS = 150;
const ATTRACT_SPEED = 40;
const ATTRACT_PAUSE_MS = 1000;
const ATTRACT_IDLE_RESUME_MS = 4000;

const WINDOW_FILL = { dark: "rgba(237,237,237,0.04)", light: "rgba(23,23,23,0.04)" } as const;
// bjorkMenu surface and shadow, from the menu tokens in app/globals.css.
const MENU = {
  dark: {
    background: "rgba(18, 18, 18, 0.98)",
    shadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.055), inset 0 12px 24px rgba(255, 255, 255, 0.018), inset 0 -18px 26px rgba(0, 0, 0, 0.24), 0 22px 42px -22px rgba(0, 0, 0, 0.9)",
  },
  light: {
    background: "rgba(255, 252, 246, 0.98)",
    shadow:
      "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 0 12px 24px rgba(88, 72, 49, 0.022), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.62), 0 22px 44px -26px rgba(66, 52, 33, 0.22)",
  },
} as const;

type Palette = (typeof BJORK_PALETTE)[BjorkTone];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// offsetTop is relative to the offsetParent. When the target is not positioned, fall back to rects.
function offsetWithin(el: HTMLElement, container: HTMLElement) {
  if (el.offsetParent === container) return el.offsetTop;
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

function readDomMarks(container: HTMLElement, headingSelector: string | null, showBlocks: boolean): DomMarks {
  const scrollH = Math.max(container.scrollHeight, 1);
  const headings: Mark[] = headingSelector
    ? Array.from(container.querySelectorAll<HTMLElement>(headingSelector)).map((el) => ({
        at: clamp01(offsetWithin(el, container) / scrollH),
        label: cleanText(el.textContent),
        level: HEADING_LEVELS[el.tagName] ?? 2,
        block: false,
      }))
    : [];
  const blocks: Mark[] = showBlocks
    ? Array.from(container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).map((el) => ({
        at: clamp01(offsetWithin(el, container) / scrollH),
        label: cleanText(el.textContent),
        level: 4,
        block: true,
      }))
    : [];
  return { headings, blocks };
}

function sameMarks(a: Mark[], b: Mark[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].at !== b[i].at || a[i].label !== b[i].label || a[i].level !== b[i].level) return false;
  }
  return true;
}

function nearestIndex(list: Mark[], at: number) {
  let best = -1;
  let dist = Infinity;
  list.forEach((mark, index) => {
    const d = Math.abs(mark.at - at);
    if (d < dist) {
      dist = d;
      best = index;
    }
  });
  return best;
}

function tickColor(palette: Palette, level: Mark["level"]) {
  if (level === 1) return palette.textMuted;
  if (level === 4) return palette.hair;
  return palette.textSoft;
}

function subscribeMediaQuery(query: string) {
  return (onChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    subscribeMediaQuery(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function MinimapScrollbar({
  target,
  selector,
  marks,
  side = "right",
  width = 28,
  showLabels = true,
  showBlocks = true,
  lens = true,
  onJump,
  ariaLabel = "Document position",
  tone,
  attract = false,
  className,
  debugHoverAt,
}: MinimapScrollbarProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const menu = MENU[resolvedTone];
  const reducedMotion = useReducedMotion() ?? false;
  const coarse = useMediaQuery("(pointer: coarse)");
  const trackWidth = coarse ? Math.min(width, COARSE_TRACK_WIDTH) : width;
  const lensOn = lens && !coarse && !reducedMotion;
  const reactId = useId();
  const contentIdBase = reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const hasMarksProp = marks !== undefined;

  const [dom, setDom] = useState<DomMarks>({ headings: [], blocks: [] });
  const [labelIdx, setLabelIdx] = useState(-1);
  const [labelOpen, setLabelOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const trackRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trackHRef = useRef(0);
  const marksRef = useRef<Mark[]>([]);
  // 0 = outside the viewport, 1 = inside it, 2 = unknown (forces a repaint of every tick).
  const litRef = useRef<Uint8Array>(new Uint8Array(0));
  const rafRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const pillYRef = useRef<number | null>(null);
  const lensYRef = useRef<number | null>(null);
  const flashTimerRef = useRef(0);
  const attractStateRef = useRef({ started: false, pos: 0, dir: 1 as 1 | -1, hold: 0, wrote: 0 });
  const attractUserRef = useRef(false);
  const attractIdleTimerRef = useRef(0);
  const rectRef = useRef<DOMRect | null>(null);
  // The scroll container, read from the target prop after each commit. Callbacks use this ref, not the prop.
  const containerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    containerRef.current = target.current;
  });

  const headings = useMemo(() => {
    const base: Mark[] = hasMarksProp
      ? marks.map((m) => ({ at: clamp01(m.at), label: cleanText(m.label), level: m.level ?? 1, block: false }))
      : dom.headings;
    const sorted = [...base].sort((a, b) => a.at - b.at);
    const numbered: Mark[] = [];
    let section = 0;
    for (const mark of sorted) {
      if (mark.level === 1) section += 1;
      numbered.push({ ...mark, num: section ? String(section).padStart(2, "0") : "" });
    }
    return numbered;
  }, [hasMarksProp, marks, dom.headings]);

  const allMarks = useMemo(
    () => [...headings, ...(showBlocks ? dom.blocks : [])].sort((a, b) => a.at - b.at),
    [headings, dom.blocks, showBlocks],
  );

  // A debug pose pins the label to a fixed position; otherwise it follows hover or keyboard flashes.
  const shownIdx = debugHoverAt != null ? nearestIndex(headings, clamp01(debugHoverAt)) : labelIdx;
  const shownOpen = debugHoverAt != null ? true : labelOpen;
  const pillMark = showLabels && shownIdx >= 0 ? headings[shownIdx] : undefined;

  // Scroll sync. Reads scroll metrics once, then writes transforms only.
  const sync = useCallback(() => {
    const t = containerRef.current;
    const win = windowRef.current;
    const line = lineRef.current;
    const track = trackRef.current;
    if (!t) return;
    const scrollTop = t.scrollTop;
    const scrollH = Math.max(t.scrollHeight, 1);
    const clientH = t.clientHeight;
    const maxScroll = scrollH - clientH;
    const overflow = maxScroll > 1;
    const trackH = trackHRef.current;

    const top = overflow ? scrollTop / scrollH : 0;
    const size = overflow ? clientH / scrollH : 1;
    if (win) {
      win.style.transform = `translateY(${top * trackH}px)`;
      win.style.height = `${size * trackH}px`;
    }
    if (line) {
      line.style.transform = `translateY(${((scrollTop + clientH / 2) / scrollH) * trackH}px)`;
    }

    const vTop = scrollTop / scrollH;
    const vBottom = (scrollTop + clientH) / scrollH;
    const marksNow = marksRef.current;
    const lit = litRef.current;
    const ticks = tickRefs.current;
    for (let i = 0; i < marksNow.length; i++) {
      const on = marksNow[i].at >= vTop && marksNow[i].at <= vBottom ? 1 : 0;
      if (lit[i] === on) continue;
      lit[i] = on;
      const el = ticks[i];
      if (el) el.style.backgroundColor = on ? palette.text : tickColor(palette, marksNow[i].level);
    }

    if (track) {
      const value = overflow ? Math.round(clamp01(scrollTop / maxScroll) * 100) : 0;
      track.setAttribute("aria-valuenow", String(value));
    }
  }, [palette]);

  const scheduleSync = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      sync();
    });
  }, [sync]);

  // Re-reads marks and track size from the DOM. Only called on mount, resize and DOM mutation, never on scroll.
  const measure = useCallback(() => {
    const t = containerRef.current;
    const track = trackRef.current;
    if (!t) return;
    if (track) trackHRef.current = track.clientHeight;
    rectRef.current = null;
    const next = readDomMarks(t, hasMarksProp ? null : selector ?? DEFAULT_SELECTOR, showBlocks);
    setDom((prev) =>
      sameMarks(prev.headings, next.headings) && sameMarks(prev.blocks, next.blocks) ? prev : next,
    );
    sync();
  }, [selector, hasMarksProp, showBlocks, sync]);

  // Writes the lens scale and the label pill position.
  const applyHover = useCallback(() => {
    const trackH = trackHRef.current;
    const pill = pillRef.current;
    const pillY = debugHoverAt != null ? clamp01(debugHoverAt) * trackH : pillYRef.current;
    if (pill && pillY != null) pill.style.transform = `translateY(${pillY}px)`;

    const lensY =
      debugHoverAt != null ? clamp01(debugHoverAt) * trackH : lensOn ? lensYRef.current : null;
    const marksNow = marksRef.current;
    const ticks = tickRefs.current;
    for (let i = 0; i < marksNow.length; i++) {
      const el = ticks[i];
      if (!el) continue;
      let scale = 1;
      if (lensY != null) {
        const dy = lensY - marksNow[i].at * trackH;
        if (Math.abs(dy) < LENS_RANGE) {
          scale = 1 + LENS_GAIN * Math.exp(-(dy * dy) / (2 * LENS_SIGMA * LENS_SIGMA));
        }
      }
      el.style.transform = scale === 1 ? "" : `scaleX(${scale.toFixed(3)})`;
    }
  }, [debugHoverAt, lensOn]);

  // Marks or tone changed: refresh the tick arrays and repaint every tick.
  useLayoutEffect(() => {
    marksRef.current = allMarks;
    tickRefs.current.length = allMarks.length;
    litRef.current = new Uint8Array(allMarks.length).fill(2);
    sync();
    applyHover();
  }, [allMarks, resolvedTone, sync, applyHover]);

  // The pill mounts after the state change commits, so position it after commit.
  useLayoutEffect(() => {
    applyHover();
  }, [applyHover, shownIdx, shownOpen]);

  // Target wiring: scroll listener, observers and aria-controls.
  useEffect(() => {
    const t = containerRef.current;
    const track = trackRef.current;
    if (!t || !track) return;
    if (!t.id) t.id = `${contentIdBase}-content`;
    track.setAttribute("aria-controls", t.id);

    t.addEventListener("scroll", scheduleSync, { passive: true });

    // ResizeObserver fires once on observe, which covers the initial measure.
    const ro = new ResizeObserver(() => {
      trackHRef.current = track.clientHeight || trackHRef.current;
      measure();
    });
    ro.observe(track);
    ro.observe(t);
    const content = t.firstElementChild;
    if (content instanceof HTMLElement) ro.observe(content);

    let mutationTimer = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(measure, MUTATION_DEBOUNCE_MS);
    });
    mo.observe(t, { childList: true, subtree: true });

    return () => {
      t.removeEventListener("scroll", scheduleSync);
      ro.disconnect();
      mo.disconnect();
      window.clearTimeout(mutationTimer);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [contentIdBase, measure, scheduleSync]);

  // Attract: ping-pong the target at a fixed speed. useVisibleLoop pauses it offscreen.
  // User input holds it still; it resumes after ATTRACT_IDLE_RESUME_MS without input.
  const attractOn = attract && !reducedMotion;
  const attractWakeRef = useRef<() => void>(() => {});

  const noteAttractInput = useCallback(() => {
    if (!attractOn) return;
    attractUserRef.current = true;
    window.clearTimeout(attractIdleTimerRef.current);
    attractIdleTimerRef.current = window.setTimeout(() => {
      const el = containerRef.current;
      if (el) {
        attractStateRef.current = {
          started: true,
          pos: el.scrollTop,
          dir: attractStateRef.current.dir,
          hold: 0,
          wrote: el.scrollTop,
        };
      }
      attractUserRef.current = false;
      attractWakeRef.current();
    }, ATTRACT_IDLE_RESUME_MS);
  }, [attractOn]);

  const attractLoop = useVisibleLoop(
    trackRef,
    (dt) => {
      const el = containerRef.current;
      if (!el || attractUserRef.current) return false;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return false;
      const s = attractStateRef.current;
      if (!s.started) {
        s.started = true;
        s.pos = s.wrote = el.scrollTop;
      } else if (Math.abs(el.scrollTop - s.wrote) > 1.5) {
        // Moved by something other than attract (native scrollbar, keys, touch).
        noteAttractInput();
        return false;
      }
      if (s.hold > 0) {
        s.hold -= dt;
      } else {
        s.pos += s.dir * ATTRACT_SPEED * dt;
        if (s.pos >= maxScroll) {
          s.pos = maxScroll;
          s.dir = -1;
          s.hold = ATTRACT_PAUSE_MS / 1000;
        } else if (s.pos <= 0) {
          s.pos = 0;
          s.dir = 1;
          s.hold = ATTRACT_PAUSE_MS / 1000;
        }
        s.wrote = s.pos;
        el.scrollTop = s.pos;
      }
      return true;
    },
    { enabled: attractOn },
  );

  useEffect(() => {
    attractWakeRef.current = attractLoop.wake;
  }, [attractLoop.wake]);

  useEffect(() => {
    const t = containerRef.current;
    if (!attractOn || !t) return;
    const onUser = () => noteAttractInput();
    t.addEventListener("wheel", onUser, { passive: true });
    t.addEventListener("touchstart", onUser, { passive: true });
    t.addEventListener("pointerdown", onUser);
    return () => {
      t.removeEventListener("wheel", onUser);
      t.removeEventListener("touchstart", onUser);
      t.removeEventListener("pointerdown", onUser);
    };
  }, [attractOn, noteAttractInput]);

  useEffect(() => {
    return () => {
      window.clearTimeout(flashTimerRef.current);
      window.clearTimeout(attractIdleTimerRef.current);
    };
  }, []);

  const pointAt = (y: number, withLens: boolean) => {
    const trackH = trackHRef.current || 1;
    pillYRef.current = y;
    lensYRef.current = withLens ? y : null;
    if (showLabels) {
      const idx = nearestIndex(headings, clamp01(y / trackH));
      setLabelIdx(idx);
      setLabelOpen(idx >= 0);
    }
    applyHover();
  };

  const clearHover = () => {
    if (debugHoverAt != null) return;
    lensYRef.current = null;
    setLabelOpen(false);
    applyHover();
  };

  const flashHeading = (mark: Mark) => {
    const trackH = trackHRef.current || 1;
    setAnnouncement(`Section: ${mark.label}`);
    const idx = headings.indexOf(mark);
    if (idx < 0) return;
    pillYRef.current = mark.at * trackH;
    lensYRef.current = null;
    setLabelIdx(idx);
    setLabelOpen(true);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setLabelOpen(false), LABEL_FLASH_MS);
    applyHover();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const t = containerRef.current;
    const track = trackRef.current;
    if (!t || !track || event.button !== 0) return;
    noteAttractInput();
    const rect = track.getBoundingClientRect();
    rectRef.current = rect;
    const trackH = rect.height || trackHRef.current || 1;
    const y = clamp(event.clientY - rect.top, 0, trackH);
    const maxScroll = Math.max(0, t.scrollHeight - t.clientHeight);
    track.setPointerCapture(event.pointerId);

    if (maxScroll > 1 && windowRef.current?.contains(event.target as Node)) {
      dragRef.current = {
        id: event.pointerId,
        startY: event.clientY,
        startScroll: t.scrollTop,
        trackH,
        scrollH: t.scrollHeight,
      };
      pointAt(y, false);
      return;
    }

    // Click on the rail: centre the clicked fraction of the document.
    const fraction = y / trackH;
    const top = clamp(fraction * t.scrollHeight - t.clientHeight / 2, 0, maxScroll);
    t.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });

    const mark = allMarks[nearestIndex(allMarks, fraction)];
    if (!mark) return;
    onJump?.({ at: mark.at, label: mark.label, level: mark.level });
    if (!mark.block) flashHeading(mark);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const t = containerRef.current;
    const track = trackRef.current;
    if (!t || !track) return;
    // Uses the rect cached on enter or down, so pointer moves do no layout reads.
    const rect = rectRef.current ?? (rectRef.current = track.getBoundingClientRect());
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const drag = dragRef.current;
    if (drag && drag.id === event.pointerId) {
      const maxScroll = Math.max(0, t.scrollHeight - t.clientHeight);
      t.scrollTop = clamp(
        drag.startScroll + ((event.clientY - drag.startY) * drag.scrollH) / drag.trackH,
        0,
        maxScroll,
      );
      pointAt(y, false);
      return;
    }
    if (event.pointerType === "touch" || drag) return;
    pointAt(y, lensOn);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag && drag.id === event.pointerId) dragRef.current = null;
    if (event.pointerType !== "mouse") clearHover();
  };

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    rectRef.current = event.currentTarget.getBoundingClientRect();
  };

  const onPointerLeave = () => {
    if (dragRef.current) return;
    rectRef.current = null;
    clearHover();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const t = containerRef.current;
    if (!t) return;
    noteAttractInput();
    const scrollH = Math.max(t.scrollHeight, 1);
    const maxScroll = Math.max(0, t.scrollHeight - t.clientHeight);
    const current = t.scrollTop;

    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const position = current / scrollH;
      const eps = 0.5 / scrollH;
      const next =
        event.key === "]"
          ? headings.find((h) => h.at > position + eps)
          : [...headings].reverse().find((h) => h.at < position - eps);
      if (!next) return;
      t.scrollTop = clamp(next.at * scrollH, 0, maxScroll);
      flashHeading(next);
      return;
    }

    let to: number;
    switch (event.key) {
      case "ArrowUp":
        to = current - 0.05 * scrollH;
        break;
      case "ArrowDown":
        to = current + 0.05 * scrollH;
        break;
      case "PageUp":
        to = current - t.clientHeight;
        break;
      case "PageDown":
        to = current + t.clientHeight;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = maxScroll;
        break;
      default:
        return;
    }
    event.preventDefault();
    // Keyboard repeats stay instant: no smooth scroll.
    t.scrollTop = clamp(to, 0, maxScroll);
  };

  const edge: CSSProperties =
    side === "right" ? { right: 0, transformOrigin: "left center" } : { left: 0, transformOrigin: "right center" };
  const pillEdge: CSSProperties =
    side === "right" ? { right: "calc(100% + 8px)" } : { left: "calc(100% + 8px)" };

  return (
    <>
      <div
        ref={trackRef}
        role="scrollbar"
        tabIndex={0}
        aria-controls={`${contentIdBase}-content`}
        aria-label={ariaLabel}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-y-3 z-10 cursor-pointer touch-none select-none rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]",
          side === "right" ? "right-2" : "left-2",
          className,
        )}
        style={{ width: trackWidth, color: palette.accent }}
      >
        <div
          ref={windowRef}
          aria-hidden
          className="absolute inset-x-0 top-0 cursor-grab rounded-[3px] border active:cursor-grabbing"
          style={{ borderColor: palette.hair, backgroundColor: WINDOW_FILL[resolvedTone], height: "100%" }}
        />

        {allMarks.map((mark, index) => {
          const size = TICK_SIZE[mark.level];
          return (
            <div
              key={index}
              ref={(el) => {
                tickRefs.current[index] = el;
              }}
              aria-hidden
              className="pointer-events-none absolute -translate-y-1/2 transition-transform duration-[120ms] ease-out motion-reduce:transition-none"
              style={{
                ...edge,
                top: `${mark.at * 100}%`,
                width: size.w,
                height: size.h,
                backgroundColor: tickColor(palette, mark.level),
              }}
            />
          );
        })}

        <div
          ref={lineRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] -translate-y-1/2"
          style={{ backgroundColor: palette.accent }}
        />

        {pillMark ? (
          <div
            ref={pillRef}
            aria-hidden
            className="pointer-events-none absolute top-0 z-20 flex max-w-[240px] -translate-y-1/2 items-center whitespace-nowrap rounded-[8px] border px-2.5 py-1.5 text-[12px] font-medium leading-none"
            style={{
              ...pillEdge,
              backgroundColor: menu.background,
              borderColor: palette.border,
              boxShadow: menu.shadow,
              color: palette.text,
              opacity: shownOpen ? 1 : 0,
              transition: shownOpen ? "none" : `opacity ${LABEL_FADE_MS}ms ease-out`,
            }}
          >
            {pillMark.num ? (
              <span className="mr-2 font-mono text-[10px] tabular-nums" style={{ color: palette.textFaint }}>
                {pillMark.num}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{pillMark.label}</span>
          </div>
        ) : null}
      </div>
      <LiveRegion message={announcement} />
    </>
  );
}
