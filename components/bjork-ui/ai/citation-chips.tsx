"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { springs } from "@/components/bjork-ui/_core/motion";
import { FOCUS_RING, PRESS, useAiTone, useReduceMotion, type BjorkTone } from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

export interface CitationSource {
  id: string;
  title: string;
  url: string;
  /** Shown in mono, such as "fieldnotes.dev". */
  domain: string;
  snippet: string;
  /** A passage inside `snippet` that the answer relies on. Highlighted in the preview. */
  quote?: string;
  /** ISO date, such as "2026-03-14". */
  publishedAt?: string;
}

/** Plain text, or a citation of one or more sources by id. */
export type CitationSegment = string | { cite: string | string[] };

export interface CitedTextProps {
  sources: CitationSource[];
  /** Text with numbered markers such as "[1]" or "[2][3]", numbered from 1 in `sources` order. */
  text?: string;
  /** Pre-split content. Used instead of `text` when given. */
  segments?: CitationSegment[];
  onOpenSource?: (source: CitationSource) => void;
  /** Demo/preview only: opens the card of this marker (0-based, in reading order) on mount. */
  defaultOpenIndex?: number;
  tone?: BjorkTone;
  className?: string;
}

export interface SourceListProps {
  sources: CitationSource[];
  /** Chips shown before "+N more". Default 4. */
  visibleCount?: number;
  onOpenSource?: (source: CitationSource) => void;
  /** Heading above the chips. Default "Sources". Pass null to hide it. */
  label?: string | null;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_SOURCES: CitationSource[] = [
  {
    id: "s1",
    title: "Why cities stay hot after dark",
    url: "https://fieldnotes.dev/notes/urban-heat-at-night",
    domain: "fieldnotes.dev",
    snippet:
      "Most people picture the heat island at noon. The measurements say otherwise: asphalt, brick and concrete bank heat all day and give it back slowly overnight, so the gap with the countryside peaks a few hours after sunset.",
    quote: "the gap with the countryside peaks a few hours after sunset",
    publishedAt: "2026-06-02",
  },
  {
    id: "s2",
    title: "Street canyons and the sky view factor",
    url: "https://quarrylab.org/papers/sky-view-factor",
    domain: "quarrylab.org",
    snippet:
      "In narrow streets lined with tall buildings, surfaces see less open sky. Less of their stored heat radiates upward, and more is exchanged between facing walls, which keeps the canyon warm long into the night.",
    quote: "Less of their stored heat radiates upward",
    publishedAt: "2025-11-19",
  },
  {
    id: "s3",
    title: "Canopy versus cool roofs: a street-level comparison",
    url: "https://civic-ledger.net/reports/canopy-cool-roofs",
    domain: "civic-ledger.net",
    snippet:
      "Reflective roofs lower rooftop temperatures sharply, but pedestrians feel the canopy more. Blocks with mature street trees ran up to 2 °C cooler at night than matched blocks without them.",
    quote: "up to 2 °C cooler at night",
    publishedAt: "2026-04-27",
  },
  {
    id: "s4",
    title: "Warm nights and heat-wave health risk",
    url: "https://tidewaterpost.com/health/warm-nights",
    domain: "tidewaterpost.com",
    snippet:
      "Hospital admissions track night-time lows more closely than daytime highs. When nights stay warm, the body never gets the recovery window it needs between hot days.",
    quote: "the body never gets the recovery window it needs",
    publishedAt: "2026-07-30",
  },
  {
    id: "s5",
    title: "Mapping a city's thermal footprint by bicycle",
    url: "https://openharbor.io/blog/thermal-bike-map",
    domain: "openharbor.io",
    snippet: "Volunteers rode fixed routes at 9pm with clip-on sensors, producing a block-by-block night temperature map.",
    publishedAt: "2025-08-12",
  },
  {
    id: "s6",
    title: "Materials that release heat faster",
    url: "https://lowtide.science/articles/emissive-pavements",
    domain: "lowtide.science",
    snippet: "High-emissivity coatings let pavements shed stored heat earlier in the evening.",
    publishedAt: "2026-01-08",
  },
  {
    id: "s7",
    title: "A short history of the urban heat island",
    url: "https://marginalia.press/essays/heat-island-history",
    domain: "marginalia.press",
    snippet: "The effect was first described in 1818, from thermometer readings taken inside and outside London.",
    publishedAt: "2024-12-03",
  },
];

export const SAMPLE_CITED_ANSWER =
  "Urban heat islands are strongest after sunset, not at noon: asphalt and brick store heat all day and release it slowly overnight [1]. Dense blocks trap that warmth too, because narrow streets limit how much heat can radiate back to the sky [2]. At street level, trees do more than reflective roofs, cutting night-time temperatures by up to 2 °C [3]. The effect compounds in heat waves, when warm nights leave no time to recover [4].";

const OPEN_DELAY = 150;
const EDGE = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// Deterministic favicon tile: the same domain always gets the same tone.
const TILE_TONES = [
  "bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)]",
  "bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text-medium)]",
  "bg-[color:var(--bjork-text)] text-[color:var(--bjork-ring-offset)]",
  "bg-[color:var(--bjork-hair)] text-[color:var(--bjork-text)]",
];

function hash(s: string): number {
  return s.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
}

function FaviconTile({ domain, size = 16 }: { domain: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[5px] font-mono font-semibold uppercase leading-none",
        TILE_TONES[hash(domain) % TILE_TONES.length],
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }}
    >
      {domain.replace(/^www\./, "")[0]}
    </span>
  );
}

/* Shared highlight between inline markers and source chips. */

interface CitationCtx {
  hot: string | null;
  setHot: (id: string | null) => void;
}
const Ctx = createContext<CitationCtx | null>(null);

/** Wrap a CitedText and SourceList so hovering either highlights the matching chips in the other. */
export function CitationGroup({ children, defaultHighlighted = null }: { children: ReactNode; defaultHighlighted?: string | null }) {
  const [hot, setHot] = useState<string | null>(defaultHighlighted);
  const value = useMemo(() => ({ hot, setHot }), [hot]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useHot(): CitationCtx {
  const shared = useContext(Ctx);
  const [hot, setHot] = useState<string | null>(null);
  return shared ?? { hot, setHot };
}

/* Inline text with markers. */

function parse(text: string, sources: CitationSource[]): CitationSegment[] {
  const parts = text.split(/((?:\s*\[\d+\])+)/g).filter((p) => p !== "");
  return parts.map((p) => {
    const nums = [...p.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    if (nums.length === 0) return p;
    const ids = nums.map((n) => sources[n - 1]?.id).filter((id): id is string => Boolean(id));
    return { cite: ids };
  });
}

/**
 * Answer text with numbered citation chips. Each chip previews its source on hover or focus, and highlights the
 * matching chip in a SourceList inside the same CitationGroup.
 */
export function CitedText({
  sources,
  text = "",
  segments,
  onOpenSource,
  defaultOpenIndex,
  tone: toneProp,
  className,
}: CitedTextProps) {
  const { style } = useAiTone(toneProp);
  const { hot, setHot } = useHot();
  const content = useMemo(() => segments ?? parse(text, sources), [segments, text, sources]);
  const indexOf = (id: string) => sources.findIndex((s) => s.id === id);

  // Marker order in reading order, so `defaultOpenIndex` can address one.
  const markers = content.flatMap((seg, si) =>
    typeof seg === "string" ? [] : [seg.cite].flat().map((id, ci) => ({ key: `${si}-${ci}`, id })),
  );

  return (
    <p className={cn("font-bjork-alpha text-[15px] leading-[26px] text-[color:var(--bjork-text-medium)]", className)} style={style}>
      {content.map((seg, si) => {
        if (typeof seg === "string") return <span key={si}>{seg}</span>;
        const ids = [seg.cite].flat();
        return (
          <span key={si} className="whitespace-nowrap">
            {ids.map((id, ci) => {
              const source = sources.find((s) => s.id === id);
              if (!source) return null;
              const key = `${si}-${ci}`;
              const order = markers.findIndex((m) => m.key === key);
              return (
                <CitationChip
                  key={key}
                  source={source}
                  inline
                  number={indexOf(id) + 1}
                  hot={hot === id}
                  setHot={setHot}
                  onOpenSource={onOpenSource}
                  defaultOpen={order === defaultOpenIndex}
                />
              );
            })}
          </span>
        );
      })}
    </p>
  );
}

/** Source chips under an answer, with "+N more" for the rest. */
export function SourceList({
  sources,
  visibleCount = 4,
  onOpenSource,
  label = "Sources",
  tone: toneProp,
  className,
}: SourceListProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const { hot, setHot } = useHot();
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const shown = expanded ? sources : sources.slice(0, visibleCount);
  const hidden = sources.length - shown.length;

  return (
    <section
      aria-labelledby={label ? headingId : undefined}
      aria-label={label ? undefined : "Sources"}
      className={cn("font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      {label && (
        <h3 id={headingId} className="mb-2 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
          {label} <span className="tabular-nums">· {sources.length}</span>
        </h3>
      )}
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((source, i) => (
          <motion.li
            key={source.id}
            className="min-w-0 max-w-full"
            initial={i >= visibleCount && !reduce ? { opacity: 0, y: 4, filter: "blur(4px)" } : false}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={reduce ? { duration: 0 } : { ...springs.blurIn, delay: Math.max(0, i - visibleCount) * 0.03 }}
          >
            <CitationChip
              source={source}
              number={i + 1}
              hot={hot === source.id}
              setHot={setHot}
              onOpenSource={onOpenSource}
            />
          </motion.li>
        ))}
        {sources.length > visibleCount && (
          <li>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                "h-8 cursor-pointer rounded-full px-3 font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-muted)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                FOCUS_RING,
                PRESS,
              )}
            >
              {expanded ? "Show less" : `+${hidden} more`}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/* One chip and its preview card. */

interface ChipProps {
  source: CitationSource;
  number: number;
  inline?: boolean;
  hot: boolean;
  setHot: (id: string | null) => void;
  onOpenSource?: (source: CitationSource) => void;
  defaultOpen?: boolean;
}

type OpenReason = "hover" | "focus" | "press";

function CitationChip({ source, number, inline = false, hot, setHot, onOpenSource, defaultOpen = false }: ChipProps) {
  const [openBy, setOpenBy] = useState<OpenReason | null>(defaultOpen ? "press" : null);
  const open = openBy !== null;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const cardId = useId();

  const cancel = () => window.clearTimeout(timer.current);
  const openLater = (reason: OpenReason) => {
    cancel();
    timer.current = window.setTimeout(() => setOpenBy((cur) => cur ?? reason), OPEN_DELAY);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Escape closes; a press outside closes a pressed card (touch).
  useEffect(() => {
    if (!open) return;
    const shut = () => {
      window.clearTimeout(timer.current);
      setOpenBy(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") shut();
    };
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) shut();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Flip above or below by available room, then keep the card inside the viewport horizontally.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const card = cardRef.current;
    if (!open || !wrap || !card) return;
    const place = () => {
      const r = wrap.getBoundingClientRect();
      const h = card.offsetHeight;
      const w = card.offsetWidth;
      const below = window.innerHeight - r.bottom;
      const placeBelow = below >= h || below >= r.top;
      card.style.top = placeBelow ? "100%" : "auto";
      card.style.bottom = placeBelow ? "auto" : "100%";
      card.dataset.side = placeBelow ? "bottom" : "top";
      const want = r.left + r.width / 2 - w / 2;
      const left = Math.min(Math.max(EDGE, want), Math.max(EDGE, window.innerWidth - EDGE - w));
      card.style.left = `${left - r.left}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const isMouse = (e: ReactPointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen";

  return (
    <span
      ref={wrapRef}
      className={cn("relative", inline ? "inline-block align-baseline" : "inline-flex max-w-full")}
      onPointerEnter={(e) => {
        if (!isMouse(e)) return;
        setHot(source.id);
        openLater("hover");
      }}
      onPointerLeave={(e) => {
        if (!isMouse(e)) return;
        setHot(null);
        cancel();
        // Instant out, unless keyboard or a press opened it.
        setOpenBy((cur) => (cur === "hover" ? null : cur));
      }}
      onBlur={(e) => {
        if (wrapRef.current?.contains(e.relatedTarget as Node)) return;
        setHot(null);
        cancel();
        setOpenBy((cur) => (cur === "hover" ? cur : null));
      }}
    >
      <button
        type="button"
        aria-describedby={cardId}
        aria-expanded={open}
        aria-label={inline ? `Source ${number}: ${source.title}` : undefined}
        onFocus={(e) => {
          setHot(source.id);
          if (e.currentTarget.matches(":focus-visible")) openLater("focus");
        }}
        onClick={() => {
          cancel();
          setOpenBy((cur) => (cur === null || cur === "hover" ? "press" : null));
        }}
        className={cn(
          "cursor-pointer transition-[background-color,color,border-color] duration-150",
          FOCUS_RING,
          inline
            ? cn(
                // 16px chip with a 28px hit area from the pseudo-element. ml nudges it off the preceding word.
                "relative ml-[3px] inline-flex h-4 min-w-4 -translate-y-[1px] items-center justify-center rounded-[5px] px-[3px] align-baseline font-mono text-[10px] font-medium leading-none tabular-nums before:absolute before:-inset-x-1.5 before:-inset-y-1.5 before:content-['']",
                hot || open
                  ? "bg-[color:var(--bjork-accent)] text-[color:var(--bjork-accent-foreground)]"
                  : "bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
              )
            : cn(
                "flex h-8 min-w-0 max-w-full items-center gap-2 rounded-full border pl-1.5 pr-3 text-left",
                PRESS,
                hot || open
                  ? "border-[color:var(--bjork-accent-muted)] bg-[color:var(--bjork-accent-soft)]"
                  : "border-[color:var(--bjork-border)] hover:bg-[color:var(--bjork-surface-active)]",
              ),
        )}
      >
        {inline ? (
          number
        ) : (
          <>
            <span className="w-3 shrink-0 text-center font-mono text-[10px] tabular-nums text-[color:var(--bjork-text-faint)]">{number}</span>
            <FaviconTile domain={source.domain} />
            <span className="max-w-[148px] truncate text-[12.5px] leading-4 text-[color:var(--bjork-text)]">{source.title}</span>
            <span className="hidden shrink-0 font-mono text-[10.5px] text-[color:var(--bjork-text-faint)] min-[440px]:inline">
              {source.domain}
            </span>
          </>
        )}
      </button>

      <PreviewCard ref={cardRef} id={cardId} source={source} open={open} onOpenSource={onOpenSource} />
    </span>
  );
}

function highlight(snippet: string, quote?: string): ReactNode {
  const at = quote ? snippet.indexOf(quote) : -1;
  if (!quote || at < 0) return snippet;
  return (
    <>
      {snippet.slice(0, at)}
      <mark className="rounded-[3px] bg-[color:var(--bjork-accent-soft)] px-0.5 text-[color:var(--bjork-text)] [box-decoration-break:clone]">
        {quote}
      </mark>
      {snippet.slice(at + quote.length)}
    </>
  );
}

function PreviewCard({
  ref,
  id,
  source,
  open,
  onOpenSource,
}: {
  ref: Ref<HTMLSpanElement>;
  id: string;
  source: CitationSource;
  open: boolean;
  onOpenSource?: (source: CitationSource) => void;
}) {
  const reduce = useReduceMotion();
  return (
    <span
      ref={ref}
      id={id}
      aria-hidden={!open || undefined}
      data-side="bottom"
      // The transparent padding bridges the gap, so the pointer can travel from chip to card.
      className={cn(
        "absolute left-0 top-full z-40 w-[min(312px,calc(100vw-24px))] py-1.5 text-left font-bjork-alpha",
        open ? "block" : "hidden",
      )}
    >
      <span
        className={cn(
          "block rounded-[12px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] p-3 shadow-[var(--bjork-shadow-menu)] backdrop-blur-md",
          !reduce && "motion-safe:animate-[bjork-cite-in_140ms_cubic-bezier(0.23,1,0.32,1)]",
        )}
      >
        <style href="bjork-citation-card" precedence="default">
          {"@keyframes bjork-cite-in{from{opacity:0;transform:translateY(3px) scale(0.98)}to{opacity:1;transform:none}}"}
        </style>
        <span className="flex items-center gap-2">
          <FaviconTile domain={source.domain} size={18} />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-[color:var(--bjork-text-muted)]">
            {source.domain}
          </span>
          {source.publishedAt && (
            <span className="shrink-0 font-mono text-[10.5px] leading-4 tabular-nums text-[color:var(--bjork-text-faint)]">
              {formatDate(source.publishedAt)}
            </span>
          )}
        </span>
        <span className="mt-2 line-clamp-2 block text-[14px] font-medium leading-5 text-[color:var(--bjork-text)]">
          {source.title}
        </span>
        <span className="mt-1.5 line-clamp-4 block text-[12.5px] leading-[19px] text-[color:var(--bjork-text-muted)]">
          {highlight(source.snippet, source.quote)}
        </span>
        <span className="mt-2.5 flex border-t border-[color:var(--bjork-border)] pt-2">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => {
              if (!onOpenSource) return;
              e.preventDefault();
              onOpenSource(source);
            }}
            className={cn(
              "-ml-1 inline-flex h-7 items-center gap-1 rounded-[6px] px-1 text-[12.5px] font-medium text-[color:var(--bjork-accent-ink)] hover:underline hover:underline-offset-2",
              FOCUS_RING,
            )}
          >
            Open source
            <ArrowUpRight aria-hidden="true" size={13} strokeWidth={1.75} />
          </a>
        </span>
      </span>
    </span>
  );
}
