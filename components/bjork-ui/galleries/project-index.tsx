"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  GlowRules,
  type GlowRulesHandle,
} from "@/components/bjork-ui/misc/glow-rules";
import { MediaStage } from "@/components/bjork-ui/galleries/project-index-media";
import {
  BJORK_PALETTE,
  type BjorkTone,
} from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { ease, springs } from "@/components/bjork-ui/_core/motion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------------------------------- */

export interface ProjectIndexMedia {
  type: "image" | "video";
  src: string;
  /** Still frame for videos. Shown until the first frame decodes, and instead of the video under reduced motion. */
  poster?: string;
  alt: string;
  /** Focal point for cover cropping, 0 to 1 from the top-left. Default [0.5, 0.5]. */
  focal?: [number, number];
}

export interface ProjectIndexItem {
  id: string;
  title: string;
  href: string;
  client?: string;
  year: number | string;
  /** What you did. The headline of the card. */
  role: string;
  services: string[];
  /** One true number about the work. Leave it out rather than invent one. */
  outcome?: { value: string; label: string };
  category?: { label: string; color?: string };
  media: ProjectIndexMedia;
  /** Tints the row slab and index. Defaults to the index accent. */
  accent?: string;
  disabled?: boolean;
}

export interface ProjectIndexProps {
  items: ProjectIndexItem[];
  heading?: ReactNode;
  tone?: BjorkTone;
  /** Accent for every row without its own. */
  accent?: string;
  /** `corner` docks the card at the bottom right; `follow` lets it lean toward the hovered row. */
  cardPlacement?: "corner" | "follow";
  /** `dissolve` is a WebGL grain dissolve; it falls back to `crossfade` without WebGL. */
  mediaTransition?: "dissolve" | "crossfade" | "none";
  /** Hover time before the card rises, in ms. Default 90. */
  dwellMs?: number;
  /** `auto` uses the expanding list on touch screens and under 900 px. */
  layout?: "auto" | "hover" | "expand";
  showIndexNumbers?: boolean;
  /** Show the item count beside the heading. Default true. */
  showCount?: boolean;
  /** Label of the card's call to action. Default "Open project". */
  openLabel?: string;
  /** Opens links in a new tab. */
  target?: "_self" | "_blank";
  renderRowEnd?: (item: ProjectIndexItem, active: boolean) => ReactNode;
  renderCardBody?: (item: ProjectIndexItem) => ReactNode;
  renderCardFooter?: (item: ProjectIndexItem) => ReactNode;
  onActiveChange?: (item: ProjectIndexItem | null) => void;
  /** Opens the card on this item at mount, as if it were hovered. Useful for previews and pinned states. */
  defaultActiveId?: string;
  className?: string;
}

/* ------------------------------------------------------------------------------------------------
 * Tokens
 * ---------------------------------------------------------------------------------------------- */

const ROW_H = 72;
const EASE_OUT = "cubic-bezier(0.23,1,0.32,1)";
const SPEED_GATE = 1.5; // px per ms
const SETTLE_MS = 60;
const GRACE_MS = 160;

function tokens(tone: BjorkTone) {
  const p = BJORK_PALETTE[tone];
  const dark = tone === "dark";
  return {
    dark,
    text: p.text,
    // Titles dim to these when another row is active. Both stay above 4.5:1 on the index background.
    dim: dark ? 0.56 : 0.66,
    meta: dark ? "rgba(237,237,237,0.6)" : "rgba(23,23,23,0.64)",
    faint: dark ? "rgba(237,237,237,0.42)" : "rgba(23,23,23,0.5)",
    hair: dark ? "rgba(255,255,255,0.1)" : "rgba(23,23,23,0.1)",
    card: dark ? "rgba(18,18,20,0.86)" : "rgba(255,252,246,0.9)",
    cardBorder: dark ? "rgba(255,255,255,0.08)" : "rgba(23,23,23,0.08)",
    cardShadow: dark
      ? "0 40px 90px -20px rgba(0,0,0,0.75), 0 12px 24px -12px rgba(0,0,0,0.5)"
      : "0 30px 60px -24px rgba(66,52,33,0.28), 0 10px 20px -12px rgba(66,52,33,0.16)",
    inner: dark
      ? "inset 0 1px 0 rgba(255,255,255,0.06)"
      : "inset 0 1px 0 rgba(255,255,255,0.9)",
    mediaBg: dark ? "#0d0d0e" : "#ece6da",
    accent: p.accent,
    accentInk: p.accentInk,
    glow: dark ? "#ffffff" : "#5b3f22",
  };
}
type Tokens = ReturnType<typeof tokens>;

/** Accent as ink: on light backgrounds, darken it so small text keeps its contrast. */
function inkFor(accent: string, t: Tokens) {
  return t.dark
    ? `color-mix(in oklab, ${accent} 58%, #ffffff)`
    : `color-mix(in oklab, ${accent} 62%, #1a120c)`;
}

/* ------------------------------------------------------------------------------------------------
 * Hooks
 * ---------------------------------------------------------------------------------------------- */

function useMedia(query: string, server = false) {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => server,
  );
}

const REDUCED = "(prefers-reduced-motion: reduce)";

/* ------------------------------------------------------------------------------------------------
 * Small parts
 * ---------------------------------------------------------------------------------------------- */

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** A field that swaps its value in place. Only changed values move; the old one leaves as the new one arrives. */
function Swap({
  value,
  dir,
  delay,
  intro,
  reduce,
  className,
  style,
  children,
}: {
  value: string;
  dir: number;
  delay: number;
  intro: boolean;
  reduce: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const from = reduce
    ? { opacity: 0 }
    : intro
      ? { opacity: 0, y: 8, filter: "blur(4px)" }
      : { opacity: 0, y: 6 * dir, filter: "blur(0px)" };
  return (
    <span className={cn("grid", className)} style={style}>
      <AnimatePresence initial={true}>
        <motion.span
          key={value}
          className="col-start-1 row-start-1 block min-w-0"
          initial={from}
          animate={{
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            transition: reduce
              ? { duration: 0.15 }
              : {
                  duration: intro ? 0.26 : 0.22,
                  delay: delay / 1000,
                  ease: ease.out,
                },
          }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : -6 * dir,
            transition: { duration: 0.12, ease: ease.out },
          }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Characters roll vertically when they change, in the direction of travel. */
function Roll({
  value,
  dir,
  reduce,
}: {
  value: string;
  dir: number;
  reduce: boolean;
}) {
  const chars = value.split("");
  return (
    <span className="inline-flex tabular-nums" aria-hidden>
      {chars.map((c, i) => (
        <span
          key={i}
          className="relative inline-grid overflow-hidden"
          style={{ height: "1em", lineHeight: 1 }}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={c}
              className="col-start-1 row-start-1 block"
              initial={reduce ? false : { y: `${dir > 0 ? 100 : -100}%` }}
              animate={{
                y: "0%",
                transition: { duration: 0.42, delay: i * 0.03, ease: ease.out },
              }}
              exit={{
                y: `${dir > 0 ? -100 : 100}%`,
                transition: { duration: 0.42, delay: i * 0.03, ease: ease.out },
              }}
            >
              {c === " " ? " " : c}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

function CategoryMark({
  category,
  t,
}: {
  category?: ProjectIndexItem["category"];
  t: Tokens;
}) {
  if (!category) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: category.color ?? t.faint }}
      />
      <span>{category.label}</span>
    </span>
  );
}

/** Stacked stills for the crossfade mode, and the reduced-motion path. Videos play only while active. */
function DomMedia({
  items,
  index,
  reduce,
  mode,
  open,
}: {
  items: ProjectIndexItem[];
  index: number;
  reduce: boolean;
  mode: "crossfade" | "none";
  open: boolean;
}) {
  const ms = mode === "none" ? 0 : reduce ? 150 : 300;
  return (
    <>
      {items.map((item, i) => {
        const m = item.media;
        const active = i === index;
        const still = m.type === "image" ? m.src : m.poster;
        const pos = `${(m.focal?.[0] ?? 0.5) * 100}% ${(m.focal?.[1] ?? 0.5) * 100}%`;
        return (
          <div
            key={item.id}
            className="absolute inset-0"
            style={{
              opacity: active ? 1 : 0,
              transform: active || reduce ? "scale(1)" : "scale(1.04)",
              transition: `opacity ${ms}ms ${EASE_OUT}, transform ${ms}ms ${EASE_OUT}`,
              zIndex: active ? 1 : 0,
            }}
          >
            {still && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={still}
                alt=""
                className="size-full object-cover"
                style={{ objectPosition: pos }}
                decoding="async"
              />
            )}
            {m.type === "video" && active && open && !reduce && (
              <video
                src={m.src}
                poster={m.poster}
                muted
                loop
                playsInline
                autoPlay
                className="absolute inset-0 size-full object-cover"
                style={{ objectPosition: pos }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Hover layout
 * ---------------------------------------------------------------------------------------------- */

interface CardState {
  open: boolean;
  index: number;
  /** Content changes since the card opened. 0 means the fields play their rise. */
  changes: number;
  dir: number;
  /** Bumps on every open so the fields remount and rise again. */
  openId: number;
}

function HoverIndex(props: ProjectIndexProps & { t: Tokens; reduce: boolean }) {
  const {
    items,
    t,
    reduce,
    accent,
    cardPlacement = "corner",
    mediaTransition = "dissolve",
    dwellMs = 90,
    showIndexNumbers = true,
    openLabel = "Open project",
    target,
    renderRowEnd,
    renderCardBody,
    renderCardFooter,
    onActiveChange,
    defaultActiveId,
  } = props;

  const defaultIndex = defaultActiveId
    ? items.findIndex((x) => x.id === defaultActiveId)
    : -1;
  const uid = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<GlowRulesHandle>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const endRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardDockRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaBoxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<MediaStage | null>(null);

  const [hover, setHover] = useState(defaultIndex);
  // Where the slab sits. It keeps its row while fading out, and appears in place (jump) when nothing was active.
  const [slab, setSlab] = useState({
    index: Math.max(0, defaultIndex),
    jump: true,
  });
  const [focusIndex, setFocusIndex] = useState(Math.max(0, defaultIndex));
  const [card, setCard] = useState<CardState>({
    open: defaultIndex >= 0,
    index: Math.max(0, defaultIndex),
    changes: 0,
    dir: 1,
    openId: defaultIndex >= 0 ? 1 : 0,
  });
  const [geom, setGeom] = useState({
    width: 0,
    rowTops: [] as number[],
    rowH: ROW_H,
  });
  const [stageOk, setStageOk] = useState<boolean | null>(null);

  // Live copies for event handlers.
  const live = useRef({
    hover: defaultIndex,
    hoverStart: 0,
    lastFastAt: 0,
    lastMove: { x: 0, y: 0, t: 0 },
    speed: 0,
    gate: 0 as ReturnType<typeof setTimeout> | 0,
    grace: 0 as ReturnType<typeof setTimeout> | 0,
    card,
    pointerY: 0,
  });
  useEffect(() => {
    live.current.card = card;
  }, [card]);

  const useShader =
    mediaTransition === "dissolve" && !reduce && stageOk !== false;
  const domMode: "crossfade" | "none" =
    mediaTransition === "none" ? "none" : "crossfade";

  /* Geometry ----------------------------------------------------------------------------------- */

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const read = () => {
      const width = wrap.clientWidth;
      const rowTops = rowRefs.current.map((r) => r?.offsetTop ?? 0);
      const rowH = rowRefs.current[0]?.offsetHeight ?? ROW_H;
      setGeom((g) =>
        g.width === width &&
        g.rowH === rowH &&
        g.rowTops.join() === rowTops.join()
          ? g
          : { width, rowTops, rowH },
      );
    };
    const ro = new ResizeObserver(read);
    ro.observe(wrap);
    read();
    return () => ro.disconnect();
  }, [items.length]);

  const cardW = Math.round(Math.min(400, Math.max(300, geom.width * 0.34)));
  const inset = 16;

  // A default active row also gets its light, as if the pointer rested on it.
  useEffect(() => {
    if (defaultIndex < 0) return;
    const raf = requestAnimationFrame(() => {
      const row = rowRefs.current[defaultIndex];
      if (row)
        glowRef.current?.pointAt(
          Math.min(row.offsetWidth * 0.3, 320),
          row.offsetTop + row.offsetHeight / 2,
        );
    });
    return () => cancelAnimationFrame(raf);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Media stage -------------------------------------------------------------------------------- */

  const loop = useVisibleLoop(
    wrapRef,
    () => {
      const stage = stageRef.current;
      if (!stage) return false;
      return stage.frame(performance.now());
    },
    { enabled: useShader },
  );

  useEffect(() => {
    if (mediaTransition !== "dissolve" || reduce) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = MediaStage.create(canvas);
    stageRef.current = stage;
    // Reporting the result is the point of this effect: it decides between the canvas and the DOM stack.
    setStageOk(!!stage);
    if (!stage) return;
    const box = mediaBoxRef.current;
    const ro = new ResizeObserver(() => {
      if (!box) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      stage.resize(
        Math.round(box.clientWidth * dpr),
        Math.round(box.clientHeight * dpr),
      );
      loop.wake();
    });
    if (box) ro.observe(box);
    // Warm every still so the first rise never shows an empty frame.
    items.forEach((it) => stage.preload(it.media));
    const c = live.current.card;
    if (c.open && items[c.index])
      stage.show(items[c.index].media, 1, true).then(() => loop.wake());
    const onVis = () => {
      if (document.visibilityState === "hidden") stage.pauseVideos();
      else if (live.current.card.open) stage.resumeVideo();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      stage.dispose();
      stageRef.current = null;
    };
    // items identity changes should not rebuild the GL context; media is looked up by index at show time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaTransition, reduce, loop]);

  const showMedia = useCallback(
    (index: number, dir: number, instant: boolean) => {
      const stage = stageRef.current;
      const item = items[index];
      if (!stage || !item) return;
      stage.show(item.media, dir, instant).then(() => loop.wake());
      loop.wake();
    },
    [items, loop],
  );

  /* Card control ------------------------------------------------------------------------------- */

  const emit = useCallback(
    (item: ProjectIndexItem | null) => {
      onActiveChange?.(item);
    },
    [onActiveChange],
  );

  const openCard = useCallback(
    (index: number) => {
      const c = live.current.card;
      if (c.open && c.index === index) return;
      const dir = c.open ? Math.sign(index - c.index) || 1 : 1;
      const next: CardState = c.open
        ? { ...c, index, dir, changes: c.changes + 1 }
        : { open: true, index, dir: 1, changes: 0, openId: c.openId + 1 };
      live.current.card = next;
      setCard(next);
      showMedia(index, dir, !c.open);
      emit(items[index] ?? null);
    },
    [emit, items, showMedia],
  );

  const closeCard = useCallback(() => {
    const c = live.current.card;
    if (!c.open) return;
    const next = { ...c, open: false };
    live.current.card = next;
    setCard(next);
    emit(null);
    // Let the sink finish before stopping video.
    setTimeout(() => {
      if (!live.current.card.open) stageRef.current?.pauseVideos();
    }, 320);
  }, [emit]);

  const clearGate = () => {
    const l = live.current;
    if (l.gate) clearTimeout(l.gate);
    l.gate = 0;
  };

  const evaluateRef = useRef<() => void>(() => {});
  // The gate: the card rises only after the dwell, and only once the pointer has slowed down.
  // While open, content follows the same speed gate with a shorter dwell, so fast sweeps never flash.
  const evaluate = useCallback(() => {
    const l = live.current;
    l.gate = 0;
    const target = l.hover;
    if (target < 0 || items[target]?.disabled) return;
    const now = performance.now();
    const settled = now - l.lastFastAt >= SETTLE_MS;
    const c = l.card;
    const dwell = c.open ? Math.min(60, dwellMs) : dwellMs;
    if (c.open && c.index === target) return;
    if (now - l.hoverStart >= dwell && settled) {
      openCard(target);
      return;
    }
    l.gate = setTimeout(() => evaluateRef.current(), 16);
  }, [dwellMs, items, openCard]);
  useEffect(() => {
    evaluateRef.current = evaluate;
  }, [evaluate]);

  const enterRow = useCallback(
    (i: number) => {
      const l = live.current;
      if (l.grace) {
        clearTimeout(l.grace);
        l.grace = 0;
      }
      if (l.hover === i) return;
      setSlab({ index: i, jump: l.hover < 0 });
      l.hover = i;
      l.hoverStart = performance.now();
      setHover(i);
      clearGate();
      evaluate();
    },
    [evaluate],
  );

  const leaveList = useCallback(() => {
    const l = live.current;
    clearGate();
    l.hover = -1;
    setHover(-1);
    if (l.grace) clearTimeout(l.grace);
    l.grace = setTimeout(() => {
      l.grace = 0;
      closeCard();
    }, GRACE_MS);
  }, [closeCard]);

  useEffect(() => {
    const l = live.current;
    return () => {
      if (l.gate) clearTimeout(l.gate);
      if (l.grace) clearTimeout(l.grace);
    };
  }, []);

  /* Rows under the card fade their row ends so nothing reads through the glass. -------------- */

  useEffect(() => {
    const dock = cardDockRef.current;
    if (!card.open || !dock) {
      endRefs.current.forEach((el) => el?.removeAttribute("data-covered"));
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = dock.getBoundingClientRect();
      rowRefs.current.forEach((row, i) => {
        const end = endRefs.current[i];
        if (!row || !end) return;
        const b = row.getBoundingClientRect();
        const covered = b.bottom > r.top + 4 && b.top < r.bottom - 4;
        if (covered) end.setAttribute("data-covered", "");
        else end.removeAttribute("data-covered");
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [card.open, geom]);

  /* Keyboard ----------------------------------------------------------------------------------- */

  const focusRow = (i: number) => {
    const n = items.length;
    const next = (i + n) % n;
    linkRefs.current[next]?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const current = linkRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (current < 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRow(items.length - 1);
    } else if (e.key === "Escape") {
      if (live.current.card.open) {
        e.preventDefault();
        closeCard();
      }
    }
  };

  /* Derived ------------------------------------------------------------------------------------ */

  const activeIndex = hover;
  const cardItem = items[card.index];
  const accentOf = (item?: ProjectIndexItem) =>
    item?.accent ?? accent ?? t.accent;
  const slabAccent = accentOf(items[slab.index]);
  const slabY = geom.rowTops[slab.index] ?? 0;

  const tether =
    card.open && !reduce && geom.width > 0
      ? {
          x: geom.width - inset - cardW - 24,
          y: (geom.rowTops[card.index] ?? 0) + geom.rowH / 2,
          width: Math.max(220, geom.width * 0.32),
          height: geom.rowH * 0.62,
          intensity: t.dark ? 0.55 : 0.5,
        }
      : null;

  // Follow mode: the card leans toward the hovered row, a few px at most.
  const followY = (() => {
    if (cardPlacement !== "follow" || !card.open || reduce) return 0;
    const rows = geom.rowTops.length;
    if (!rows) return 0;
    const centre = (rows - 1) / 2;
    return Math.max(-24, Math.min(24, (card.index - centre) * 6));
  })();

  const describe = (item: ProjectIndexItem) =>
    [
      item.role,
      item.services.join(", "),
      item.client,
      String(item.year),
      item.outcome ? `${item.outcome.value} ${item.outcome.label}` : "",
    ]
      .filter(Boolean)
      .join(". ");

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerMove={(e) => {
        if (e.pointerType === "touch") return;
        const l = live.current;
        const now = performance.now();
        const dt = now - l.lastMove.t;
        if (dt > 0 && dt < 100) {
          const v =
            Math.hypot(e.clientX - l.lastMove.x, e.clientY - l.lastMove.y) / dt;
          l.speed = l.speed * 0.6 + v * 0.4;
          if (l.speed > SPEED_GATE) l.lastFastAt = now;
        }
        l.lastMove = { x: e.clientX, y: e.clientY, t: now };
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        leaveList();
      }}
    >
      <GlowRules
        ref={glowRef}
        selector="[data-pi-row]"
        tone={t.dark ? "dark" : "light"}
        color={t.glow}
        ruleColor={t.hair}
        radius={[0.4, 100]}
        lerp={0.12}
        quantize={4}
        tether={tether}
        drawIn
      >
        {/* The slab: one element that travels between rows. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: geom.rowH, zIndex: 0 }}
          initial={false}
          animate={{ y: slabY, opacity: activeIndex >= 0 ? 1 : 0 }}
          transition={{
            y: reduce || slab.jump ? { duration: 0 } : springs.snappy,
            opacity: {
              duration: activeIndex >= 0 ? 0.12 : 0.2,
              ease: "easeOut",
            },
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: `color-mix(in srgb, ${slabAccent} ${t.dark ? 14 : 10}%, transparent)`,
              WebkitMaskImage:
                "linear-gradient(90deg, #000 0%, rgba(0,0,0,0.5) 30%, transparent 72%)",
              maskImage:
                "linear-gradient(90deg, #000 0%, rgba(0,0,0,0.5) 30%, transparent 72%)",
              transition: slab.jump ? "none" : "background-color 220ms ease",
            }}
          />
          <div
            className="absolute bottom-[1px] left-0 top-[1px] w-[2px] origin-center"
            style={{
              background: slabAccent,
              transform: `scaleY(${activeIndex >= 0 ? 1 : 0})`,
              transition: `transform 180ms ${EASE_OUT}${slab.jump ? "" : ", background-color 220ms ease"}`,
            }}
          />
        </motion.div>

        <ul
          role="list"
          className="relative m-0 list-none p-0"
          style={{ zIndex: 0 }}
          onKeyDown={onKeyDown}
        >
          {items.map((item, i) => {
            const active = i === activeIndex;
            const dimmed = activeIndex >= 0 && !active;
            const descId = `${uid}-d${i}`;
            const ink = inkFor(accentOf(item), t);
            return (
              <motion.li
                key={item.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                data-pi-row=""
                className="relative"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                transition={{
                  duration: reduce ? 0.2 : 0.6,
                  delay: reduce ? 0 : i * 0.04,
                  ease: ease.out,
                }}
              >
                <a
                  ref={(el) => {
                    linkRefs.current[i] = el;
                  }}
                  href={item.disabled ? undefined : item.href}
                  target={target}
                  rel={target === "_blank" ? "noreferrer" : undefined}
                  aria-disabled={item.disabled || undefined}
                  aria-describedby={descId}
                  tabIndex={i === focusIndex ? 0 : -1}
                  className={cn(
                    "group/row relative grid items-center px-4 no-underline outline-none",
                    "rounded-[2px] focus-visible:shadow-[inset_0_0_0_1px_var(--pi-ring)]",
                    item.disabled ? "cursor-default" : "cursor-pointer",
                  )}
                  style={
                    {
                      height: ROW_H,
                      gridTemplateColumns: showIndexNumbers
                        ? "48px minmax(0,1fr) auto"
                        : "minmax(0,1fr) auto",
                      color: t.text,
                      "--pi-ring": `color-mix(in srgb, ${accentOf(item)} 45%, transparent)`,
                    } as CSSProperties
                  }
                  onPointerEnter={(e) => {
                    if (e.pointerType === "touch") return;
                    enterRow(i);
                  }}
                  onFocus={(e) => {
                    setFocusIndex(i);
                    // Keyboard runs the same choreography, without the dwell.
                    if (!e.currentTarget.matches(":focus-visible")) return;
                    const l = live.current;
                    if (l.grace) {
                      clearTimeout(l.grace);
                      l.grace = 0;
                    }
                    clearGate();
                    setSlab({ index: i, jump: l.hover < 0 });
                    l.hover = i;
                    setHover(i);
                    if (!item.disabled) openCard(i);
                  }}
                  onBlur={(e) => {
                    const next = e.relatedTarget as Node | null;
                    if (next && wrapRef.current?.contains(next)) return;
                    leaveList();
                  }}
                  onClick={(e) => {
                    if (item.disabled) e.preventDefault();
                  }}
                >
                  {showIndexNumbers && (
                    <span
                      className="font-mono text-[12px] tabular-nums tracking-[0.02em]"
                      style={{
                        color: active ? ink : t.faint,
                        transition: "color 200ms ease",
                      }}
                    >
                      {pad(i + 1)}
                    </span>
                  )}
                  <span
                    className="truncate font-medium leading-none tracking-[-0.015em]"
                    style={{
                      fontSize: "clamp(20px, 2vw, 28px)",
                      opacity: dimmed ? t.dim : item.disabled ? t.dim : 1,
                      transform: `translate3d(${active && !reduce ? 12 : 0}px,0,0)`,
                      transition: `opacity 200ms ease, transform 220ms ${EASE_OUT}`,
                    }}
                  >
                    {item.title}
                  </span>
                  <span
                    ref={(el) => {
                      endRefs.current[i] = el;
                    }}
                    className="flex items-center gap-6 font-mono text-[12px] tabular-nums tracking-[0.02em] transition-opacity duration-200 data-[covered]:opacity-0"
                    style={{ color: t.meta }}
                  >
                    {renderRowEnd ? (
                      renderRowEnd(item, active)
                    ) : (
                      <>
                        <CategoryMark category={item.category} t={t} />
                        <span>{item.year}</span>
                      </>
                    )}
                  </span>
                  <span id={descId} className="sr-only">
                    {describe(item)}
                  </span>
                </a>
              </motion.li>
            );
          })}
        </ul>
      </GlowRules>

      {/* The dossier rail: a column on the right whose card docks at the bottom, and to the viewport bottom on long lists. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 top-0 flex flex-col justify-end"
        style={{ right: inset, width: cardW, zIndex: 2, paddingBottom: inset }}
      >
        <div ref={cardDockRef} className="sticky" style={{ bottom: 24 }}>
          <motion.div
            initial={false}
            animate={{ y: followY }}
            transition={{ type: "spring", stiffness: 170, damping: 26 }}
          >
            <Dossier
              card={card}
              item={cardItem}
              items={items}
              t={t}
              reduce={reduce}
              width={cardW}
              useShader={useShader}
              domMode={domMode}
              canvasRef={canvasRef}
              mediaBoxRef={mediaBoxRef}
              openLabel={openLabel}
              accent={accentOf(cardItem)}
              renderCardBody={renderCardBody}
              renderCardFooter={renderCardFooter}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The card
 * ---------------------------------------------------------------------------------------------- */

function Dossier({
  card,
  item,
  items,
  t,
  reduce,
  width,
  useShader,
  domMode,
  canvasRef,
  mediaBoxRef,
  openLabel,
  accent,
  renderCardBody,
  renderCardFooter,
}: {
  card: CardState;
  item?: ProjectIndexItem;
  items: ProjectIndexItem[];
  t: Tokens;
  reduce: boolean;
  width: number;
  useShader: boolean;
  domMode: "crossfade" | "none";
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  mediaBoxRef: React.RefObject<HTMLDivElement | null>;
  openLabel: string;
  accent: string;
  renderCardBody?: (item: ProjectIndexItem) => ReactNode;
  renderCardFooter?: (item: ProjectIndexItem) => ReactNode;
}) {
  const open = card.open;
  const intro = card.changes === 0;
  const dir = card.dir;
  const R = 14;

  // Rise: the card slides up out of a slot whose lower edge is the card's docked bottom edge,
  // so its top arrives first and the fields can follow top to bottom. It sinks back the same way.
  const shell = reduce
    ? {
        open: {
          opacity: 1,
          y: "0%",
          transition: { duration: 0.15, y: { duration: 0 } },
        },
        closed: {
          opacity: 0,
          y: "0%",
          transition: { duration: 0.15, y: { duration: 0 } },
        },
      }
    : {
        open: {
          opacity: 1,
          y: "0%",
          transition: { duration: 0.56, ease: ease.out },
        },
        closed: {
          opacity: 1,
          y: "101%",
          transition: { duration: 0.3, ease: ease.inOut },
        },
      };
  const shadow = {
    open: {
      opacity: 1,
      transition: {
        duration: reduce ? 0.15 : 0.5,
        ease: ease.out,
        delay: reduce ? 0 : 0.12,
      },
    },
    closed: {
      opacity: 0,
      transition: { duration: reduce ? 0.15 : 0.2, ease: ease.inOut },
    },
  };
  const zoom = {
    open: {
      scale: 1,
      transition: { duration: reduce ? 0 : 0.7, ease: ease.out },
    },
    closed: {
      scale: reduce ? 1 : 1.12,
      transition: { duration: 0, delay: 0.32 },
    },
  };
  const ink = inkFor(accent, t);
  const index = items.findIndex((x) => x.id === item?.id);

  const field = (k: number) => (intro ? 160 + k * 40 : k * 30);

  return (
    <motion.div
      className="relative"
      style={{ width }}
      initial="closed"
      animate={open ? "open" : "closed"}
    >
      {/* Shadow lives outside the clip so the rise does not crop it. */}
      <motion.div
        variants={shadow}
        className="absolute inset-0"
        style={{ borderRadius: R, boxShadow: t.cardShadow }}
      />
      {/* The slot. Its bottom edge is where the card docks; the card rises out of it. */}
      <div className="relative overflow-hidden" style={{ borderRadius: R }}>
        <motion.div
          variants={shell}
          className="relative overflow-hidden"
          style={{
            borderRadius: R,
            background: t.card,
            backdropFilter: "blur(14px) saturate(1.2)",
            WebkitBackdropFilter: "blur(14px) saturate(1.2)",
            boxShadow: `${t.inner}, inset 0 0 0 1px ${t.cardBorder}`,
            willChange: "transform",
          }}
        >
          <div className="p-[6px]">
            <div
              ref={mediaBoxRef}
              className="relative w-full overflow-hidden"
              style={{
                aspectRatio: "16 / 10",
                borderRadius: R - 6,
                background: t.mediaBg,
              }}
            >
              <motion.div variants={zoom} className="absolute inset-0">
                {useShader ? (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 size-full"
                  />
                ) : (
                  <DomMedia
                    items={items}
                    index={card.index}
                    reduce={reduce}
                    mode={domMode}
                    open={open}
                  />
                )}
              </motion.div>
              {/* Hairline inside the media edge, so light stills do not bleed into a light card. */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  borderRadius: R - 6,
                  boxShadow: `inset 0 0 0 1px ${t.dark ? "rgba(255,255,255,0.06)" : "rgba(23,23,23,0.06)"}`,
                }}
              />
            </div>
          </div>

          {item && (
            <div
              key={card.openId}
              className="px-4 pb-4 pt-3"
              style={{ color: t.text }}
            >
              {renderCardBody ? (
                renderCardBody(item)
              ) : (
                <>
                  <div
                    className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em]"
                    style={{ color: t.meta }}
                  >
                    <Swap
                      value={`${item.client ?? item.category?.label ?? ""}·${item.year}`}
                      dir={dir}
                      delay={field(0)}
                      intro={intro}
                      reduce={reduce}
                      className="min-w-0"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: item.category?.color ?? accent }}
                        />
                        <span className="truncate">
                          {item.client ?? item.category?.label}
                        </span>
                        <span aria-hidden style={{ color: t.faint }}>
                          /
                        </span>
                        <span className="tabular-nums">{item.year}</span>
                      </span>
                    </Swap>
                    <span className="tabular-nums" style={{ color: t.faint }}>
                      <Roll value={pad(index + 1)} dir={dir} reduce={reduce} />
                      <span className="px-[3px]">/</span>
                      {pad(items.length)}
                    </span>
                  </div>

                  <Swap
                    value={`t:${item.title}`}
                    dir={dir}
                    delay={field(1)}
                    intro={intro}
                    reduce={reduce}
                    className="mt-3"
                  >
                    <span className="block truncate text-[19px] font-medium leading-[1.15] tracking-[-0.015em]">
                      {item.title}
                    </span>
                  </Swap>
                  <Swap
                    value={`r:${item.role}`}
                    dir={dir}
                    delay={field(2)}
                    intro={intro}
                    reduce={reduce}
                    className="mt-1"
                  >
                    <span
                      className="block truncate text-[14px] leading-[1.3]"
                      style={{ color: t.meta }}
                    >
                      {item.role}
                    </span>
                  </Swap>

                  <Swap
                    value={`s:${item.services.join("|")}`}
                    dir={dir}
                    delay={field(3)}
                    intro={intro}
                    reduce={reduce}
                    className="mt-3"
                    style={{ minHeight: 36 }}
                  >
                    <span
                      className="line-clamp-2 text-[12.5px] leading-[18px]"
                      style={{ color: t.faint }}
                    >
                      {item.services.map((s, k) => (
                        <span key={s}>
                          {k > 0 && (
                            <span aria-hidden className="opacity-60">
                              {" \u2009/\u2009 "}
                            </span>
                          )}
                          <span
                            className="whitespace-nowrap"
                            style={{ color: t.meta }}
                          >
                            {s}
                          </span>
                        </span>
                      ))}
                    </span>
                  </Swap>

                  <div
                    className="mt-4 flex items-end justify-between gap-4 border-t pt-3"
                    style={{ borderColor: t.hair, minHeight: 52 }}
                  >
                    {renderCardFooter ? (
                      renderCardFooter(item)
                    ) : (
                      <>
                        <Swap
                          value={`o:${item.outcome?.value ?? ""}:${item.outcome?.label ?? ""}`}
                          dir={dir}
                          delay={field(4)}
                          intro={intro}
                          reduce={reduce}
                          className="min-w-0"
                        >
                          {item.outcome ? (
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span
                                className="text-[28px] font-medium leading-none tracking-[-0.03em] tabular-nums"
                                style={{ color: t.text }}
                              >
                                {item.outcome.value}
                              </span>
                              <span
                                className="line-clamp-2 max-w-[150px] text-[12px] leading-[1.25]"
                                style={{ color: t.meta }}
                              >
                                {item.outcome.label}
                              </span>
                            </span>
                          ) : (
                            <span className="block h-[28px]" />
                          )}
                        </Swap>
                        <Swap
                          value="cta"
                          dir={dir}
                          delay={field(5)}
                          intro={intro}
                          reduce={reduce}
                          className="shrink-0"
                        >
                          <span
                            className="flex shrink-0 items-center gap-2 pb-[2px] text-[12px]"
                            style={{ color: ink }}
                          >
                            {openLabel}
                            <kbd
                              className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] px-1 font-mono text-[10px] leading-none"
                              style={{
                                color: t.meta,
                                boxShadow: `inset 0 0 0 1px ${t.hair}`,
                              }}
                            >
                              ↵
                            </kbd>
                          </span>
                        </Swap>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Expanding layout (touch and narrow screens)
 * ---------------------------------------------------------------------------------------------- */

function ExpandMedia({
  media,
  open,
  reduce,
  t,
}: {
  media: ProjectIndexMedia;
  open: boolean;
  reduce: boolean;
  t: Tokens;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!open || reduce) {
      v.pause();
      return;
    }
    // Autoplay once most of the frame is on screen; pause when it scrolls away.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [open, reduce]);

  const pos = `${(media.focal?.[0] ?? 0.5) * 100}% ${(media.focal?.[1] ?? 0.5) * 100}%`;
  return (
    <div
      className="relative w-full overflow-hidden rounded-[10px]"
      style={{ aspectRatio: "16 / 10", background: t.mediaBg }}
    >
      {media.type === "video" ? (
        <video
          ref={ref}
          src={open ? media.src : undefined}
          poster={media.poster}
          muted
          loop
          playsInline
          preload="none"
          controls={reduce}
          aria-label={media.alt}
          className="size-full object-cover"
          style={{ objectPosition: pos }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.src}
          alt={media.alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          style={{ objectPosition: pos }}
        />
      )}
    </div>
  );
}

function ExpandIndex(
  props: ProjectIndexProps & { t: Tokens; reduce: boolean },
) {
  const {
    items,
    t,
    reduce,
    accent,
    showIndexNumbers = true,
    openLabel = "Open project",
    target,
    onActiveChange,
    renderCardBody,
  } = props;
  const uid = useId();
  const [openIndex, setOpenIndex] = useState(-1);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (i: number) => {
    const next = openIndex === i ? -1 : i;
    setOpenIndex(next);
    onActiveChange?.(next >= 0 ? items[next] : null);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const current = btnRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (current < 0) return;
    const n = items.length;
    const go = (i: number) => btnRefs.current[(i + n) % n]?.focus();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(n - 1);
    } else if (e.key === "Escape" && openIndex >= 0) {
      e.preventDefault();
      setOpenIndex(-1);
      onActiveChange?.(null);
    }
  };

  return (
    <GlowRules
      selector="[data-pi-row]"
      tone={t.dark ? "dark" : "light"}
      ruleColor={t.hair}
      color={t.glow}
      drawIn
    >
      <ul role="list" className="m-0 list-none p-0" onKeyDown={onKeyDown}>
        {items.map((item, i) => {
          const open = i === openIndex;
          const panelId = `${uid}-p${i}`;
          const ink = inkFor(item.accent ?? accent ?? t.accent, t);
          return (
            <motion.li
              key={item.id}
              data-pi-row=""
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: reduce ? 0.2 : 0.5,
                delay: reduce ? 0 : i * 0.04,
                ease: ease.out,
              }}
            >
              <button
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(i)}
                className="grid w-full items-center gap-0 px-1 text-left outline-none focus-visible:rounded-[4px] focus-visible:shadow-[inset_0_0_0_1px_var(--pi-ring)] active:opacity-80"
                style={
                  {
                    minHeight: 64,
                    gridTemplateColumns: showIndexNumbers
                      ? "36px minmax(0,1fr) auto"
                      : "minmax(0,1fr) auto",
                    color: t.text,
                    "--pi-ring": `color-mix(in srgb, ${item.accent ?? accent ?? t.accent} 45%, transparent)`,
                  } as CSSProperties
                }
              >
                {showIndexNumbers && (
                  <span
                    className="font-mono text-[11px] tabular-nums"
                    style={{
                      color: open ? ink : t.faint,
                      transition: "color 200ms ease",
                    }}
                  >
                    {pad(i + 1)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[19px] font-medium leading-tight tracking-[-0.015em]">
                    {item.title}
                  </span>
                </span>
                <span
                  className="flex items-center gap-3 pl-3 font-mono text-[11px] tabular-nums"
                  style={{ color: t.meta }}
                >
                  {item.year}
                  <span
                    aria-hidden
                    className="relative block size-3"
                    style={{
                      transform: `rotate(${open ? 45 : 0}deg)`,
                      transition: reduce
                        ? "none"
                        : `transform 320ms ${EASE_OUT}`,
                    }}
                  >
                    <span
                      className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2"
                      style={{ background: "currentColor" }}
                    />
                    <span
                      className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2"
                      style={{ background: "currentColor" }}
                    />
                  </span>
                </span>
              </button>
              <div
                id={panelId}
                role="region"
                aria-label={item.title}
                className="grid"
                style={{
                  gridTemplateRows: open ? "1fr" : "0fr",
                  transition: reduce
                    ? "none"
                    : `grid-template-rows 320ms ${EASE_OUT}`,
                }}
                inert={!open}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className="pb-5 pt-1"
                    style={{
                      opacity: open ? 1 : 0,
                      transform: open || reduce ? "none" : "translateY(-6px)",
                      transition: reduce
                        ? "opacity 150ms ease"
                        : `opacity 260ms ease ${open ? 80 : 0}ms, transform 320ms ${EASE_OUT}`,
                    }}
                  >
                    <ExpandMedia
                      media={item.media}
                      open={open}
                      reduce={reduce}
                      t={t}
                    />
                    {renderCardBody ? (
                      <div className="mt-4">{renderCardBody(item)}</div>
                    ) : (
                      <dl className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-snug">
                        <dt
                          className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
                          style={{ color: t.faint, paddingTop: 2 }}
                        >
                          Role
                        </dt>
                        <dd className="m-0" style={{ color: t.text }}>
                          {item.role}
                        </dd>
                        <dt
                          className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
                          style={{ color: t.faint, paddingTop: 2 }}
                        >
                          Work
                        </dt>
                        <dd className="m-0" style={{ color: t.meta }}>
                          {item.services.join(" / ")}
                        </dd>
                        {item.category && (
                          <>
                            <dt
                              className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
                              style={{ color: t.faint, paddingTop: 2 }}
                            >
                              Kind
                            </dt>
                            <dd className="m-0" style={{ color: t.meta }}>
                              <CategoryMark category={item.category} t={t} />
                            </dd>
                          </>
                        )}
                        {item.outcome && (
                          <>
                            <dt
                              className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
                              style={{ color: t.faint, paddingTop: 6 }}
                            >
                              Outcome
                            </dt>
                            <dd className="m-0 flex items-baseline gap-2">
                              <span
                                className="text-[24px] font-medium leading-none tracking-[-0.03em] tabular-nums"
                                style={{ color: t.text }}
                              >
                                {item.outcome.value}
                              </span>
                              <span style={{ color: t.meta }}>
                                {item.outcome.label}
                              </span>
                            </dd>
                          </>
                        )}
                      </dl>
                    )}
                    {!item.disabled && (
                      <a
                        href={item.href}
                        target={target}
                        rel={target === "_blank" ? "noreferrer" : undefined}
                        tabIndex={open ? 0 : -1}
                        className="mt-5 inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium no-underline outline-none transition-transform duration-150 active:scale-[0.97] focus-visible:shadow-[inset_0_0_0_1px_currentColor]"
                        style={{
                          color: ink,
                          background: `color-mix(in srgb, ${item.accent ?? accent ?? t.accent} ${t.dark ? 14 : 12}%, transparent)`,
                        }}
                      >
                        {openLabel}
                        <span aria-hidden>→</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </GlowRules>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Root
 * ---------------------------------------------------------------------------------------------- */

/**
 * A ledger of work. Titles sit on the left; on hover a dossier card rises from the bottom right
 * and stays put while you move between rows, dissolving its media and swapping only the fields
 * that change. Hairline rules catch a soft light under the pointer. Touch screens get an
 * expanding list instead.
 */
export function ProjectIndex(props: ProjectIndexProps) {
  const {
    items,
    heading,
    tone,
    layout = "auto",
    showCount = true,
    className,
  } = props;
  const resolved = useBjorkTone(tone);
  const t = useMemo(() => tokens(resolved), [resolved]);
  const reduce = useMedia(REDUCED);
  const narrow = useMedia(
    "(hover: none), (pointer: coarse), (max-width: 899px)",
  );
  const expand = layout === "expand" || (layout === "auto" && narrow);

  return (
    <section
      className={cn("relative w-full", className)}
      style={{ color: t.text }}
    >
      {(heading || showCount) && (
        <div className="flex items-baseline justify-between gap-4 px-1 pb-5 md:px-4">
          <div className="min-w-0 text-[15px] font-medium tracking-[-0.01em]">
            {heading}
          </div>
          {showCount && (
            <span
              className="font-mono text-[11px] tabular-nums tracking-[0.08em]"
              style={{ color: t.faint }}
            >
              ({pad(items.length)})
            </span>
          )}
        </div>
      )}
      {expand ? (
        <ExpandIndex {...props} t={t} reduce={reduce} />
      ) : (
        <HoverIndex {...props} t={t} reduce={reduce} />
      )}
    </section>
  );
}
