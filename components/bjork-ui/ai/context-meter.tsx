"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  formatTokens,
  useAiTone,
  useControllable,
  useHydrated,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

export interface ContextSegment {
  id: string;
  label: string;
  tokens: number;
  /** Space held back rather than spent, such as room for the reply. Drawn hatched. */
  reserved?: boolean;
  /** Override the fill. Defaults to the next tonal step of the accent. */
  color?: string;
}

export type ContextLevel = "ok" | "warn" | "danger";

export interface ContextMeterProps {
  segments: ContextSegment[];
  /** Context window size in tokens. */
  limit: number;
  /** "full" draws the bar and legend. "compact" is a ring and number that opens the breakdown in a popover. */
  variant?: "full" | "compact";
  /** Fraction of the limit where the meter turns amber. Default 0.75. */
  warnAt?: number;
  /** Fraction of the limit where the meter turns red. Default 0.9. */
  dangerAt?: number;
  /** Header label. Default "Context". */
  label?: string;
  /** Compact only: controlled popover state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Compact only: which side the popover prefers. It flips when there is no room. Default "top". */
  side?: "top" | "bottom";
  /** Which edge of the trigger the popover lines up with. "end" suits a trigger at the right of a footer. Default "end". */
  align?: "start" | "end";
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_CONTEXT: ContextSegment[] = [
  { id: "system", label: "System prompt", tokens: 6_800 },
  { id: "conversation", label: "Conversation", tokens: 71_400 },
  { id: "files", label: "Attached files", tokens: 46_200 },
  { id: "tools", label: "Tool results", tokens: 15_600 },
  { id: "reserved", label: "Reserved for output", tokens: 16_000, reserved: true },
];

// Tonal steps of the accent, then neutrals. Never a rainbow: every fill reads as the same family.
const STEPS = [
  "var(--bjork-text-medium)",
  "var(--bjork-accent)",
  "color-mix(in srgb, var(--bjork-accent) 58%, transparent)",
  "color-mix(in srgb, var(--bjork-accent) 32%, transparent)",
  "var(--bjork-text-soft)",
  "var(--bjork-text-faint)",
];
const HATCH = "repeating-linear-gradient(-45deg, var(--bjork-text-soft) 0 1.5px, transparent 1.5px 4px)";

const LEVEL_WORD: Record<ContextLevel, string> = { ok: "", warn: "Getting full", danger: "Will summarize soon" };
const LEVEL_COLOR: Record<ContextLevel, string> = {
  ok: "var(--bjork-text-muted)",
  warn: "var(--bjork-warning)",
  danger: "var(--bjork-error)",
};

function fillOf(seg: ContextSegment, i: number): string {
  if (seg.reserved) return HATCH;
  return seg.color ?? STEPS[i % STEPS.length];
}

function pct(n: number): string {
  if (n > 0 && n < 0.01) return "<1%";
  return `${Math.round(n * 100)}%`;
}

function levelOf(ratio: number, warnAt: number, dangerAt: number): ContextLevel {
  if (ratio >= dangerAt) return "danger";
  if (ratio >= warnAt) return "warn";
  return "ok";
}

/**
 * How much of the context window a conversation is using, split by what is using it. The bar and legend are
 * linked: pointing at either highlights the same category. Crossing the warn and danger lines is announced.
 */
export function ContextMeter({
  segments,
  limit,
  variant = "full",
  warnAt = 0.75,
  dangerAt = 0.9,
  label = "Context",
  open,
  defaultOpen = false,
  onOpenChange,
  side = "top",
  align = "end",
  tone: toneProp,
  className,
}: ContextMeterProps) {
  const { pal, style } = useAiTone(toneProp);
  const used = segments.reduce((sum, s) => sum + Math.max(0, s.tokens), 0);
  const ratio = limit > 0 ? used / limit : 0;
  const level = levelOf(ratio, warnAt, dangerAt);

  // Announce threshold transitions only, derived during render.
  const [announce, setAnnounce] = useState({ level, message: "" });
  if (announce.level !== level) {
    const message =
      level === "ok" ? "Context usage back under the limit" : `Context ${pct(ratio)} used. ${LEVEL_WORD[level]}`;
    setAnnounce({ level, message });
  }

  const shared = { segments, limit, used, ratio, level, warnAt, dangerAt, label };

  return (
    <div
      className={cn(
        "relative font-bjork-alpha text-[color:var(--bjork-text)]",
        // Size containment would collapse the inline compact trigger to zero width, so only the full meter is a container.
        variant === "full" ? "@container w-full max-w-[520px]" : "inline-flex shrink-0",
        className,
      )}
      style={style}
    >
      {variant === "full" ? (
        <MeterBody {...shared} />
      ) : (
        <CompactMeter
          {...shared}
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          side={side}
          align={align}
          ringTrack={pal.border}
        />
      )}
      <LiveRegion message={announce.message} />
    </div>
  );
}

interface BodyProps {
  segments: ContextSegment[];
  limit: number;
  used: number;
  ratio: number;
  level: ContextLevel;
  warnAt: number;
  dangerAt: number;
  label: string;
}

function MeterBody({ segments, limit, used, ratio, level, warnAt, dangerAt, label }: BodyProps) {
  const reduce = useReduceMotion();
  const hydrated = useHydrated();
  const [hot, setHot] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hot ?? pinned;
  const labelId = useId();

  const free = Math.max(0, limit - used);
  const scaleBase = Math.max(limit, used);
  // Each segment is a full-width layer that is scaled and shifted, so value changes animate on the compositor.
  const starts = segments.reduce<number[]>(
    (acc, seg, i) => [...acc, i === 0 ? 0 : acc[i - 1] + Math.max(0, segments[i - 1].tokens)],
    [],
  );
  const layers = segments.map((seg, i) => ({
    seg,
    i,
    start: starts[i] / scaleBase,
    frac: Math.max(0, seg.tokens) / scaleBase,
  }));
  const transition = reduce ? "none" : `transform 520ms ${easeCss.out}, opacity 160ms ease-out`;
  const levelColor = LEVEL_COLOR[level];
  const valueText = `${used.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} tokens, ${pct(ratio)}${
    level === "ok" ? "" : `. ${LEVEL_WORD[level]}`
  }`;

  return (
    <div className="w-full">
      <div className="flex min-w-0 items-baseline justify-between gap-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span id={labelId} className="text-[14px] font-semibold leading-5">
            {label}
          </span>
          <span
            className="truncate font-mono text-[10px] uppercase leading-5 tracking-[0.08em] transition-colors duration-200"
            style={{ color: levelColor }}
          >
            {level === "ok" ? "" : LEVEL_WORD[level]}
          </span>
        </div>
        <span className="shrink-0 whitespace-nowrap font-mono text-[12px] leading-5 tabular-nums">
          <span style={{ color: level === "ok" ? "var(--bjork-text)" : levelColor }}>{formatTokens(used)}</span>
          <span className="text-[color:var(--bjork-text-faint)]"> / {formatTokens(limit)}</span>
          <span className="ml-2 inline-block min-w-[4ch] text-right text-[color:var(--bjork-text-muted)]">
            {pct(ratio)}
          </span>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={valueText}
        className="relative"
        onPointerLeave={() => setHot(null)}
      >
        <div className="relative h-2.5 overflow-hidden rounded-full bg-[color:var(--bjork-hair)]">
          {layers.map(({ seg, i, start, frac }) => (
            <div
              key={seg.id}
              aria-hidden="true"
              data-segment={seg.id}
              onPointerEnter={() => setHot(seg.id)}
              className="absolute inset-0 origin-left"
              style={{
                transform: `translateX(${(hydrated ? start : 0) * 100}%) scaleX(${hydrated ? frac : 0})`,
                background: fillOf(seg, i),
                opacity: active && active !== seg.id ? 0.28 : 1,
                transition,
              }}
            />
          ))}
          {/* 2px surface-coloured cuts between segments, moved with transforms like the fills. */}
          {layers.slice(1).map(({ seg, start }) => (
            <div
              key={`cut-${seg.id}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ transform: `translateX(${(hydrated ? start : 0) * 100}%)`, transition }}
            >
              <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-[color:var(--bjork-ring-offset)]" />
            </div>
          ))}
        </div>
        {/* Threshold ticks under the bar. */}
        <div aria-hidden="true" className="relative h-2">
          {[warnAt, dangerAt].map((t, i) => (
            <span
              key={t}
              className="absolute top-1 h-1.5 w-px -translate-x-1/2"
              style={{
                left: `${Math.min(1, t) * 100}%`,
                background: i === 0 ? "var(--bjork-warning)" : "var(--bjork-error)",
                opacity: level === "ok" ? 0.45 : 0.9,
              }}
            />
          ))}
        </div>
      </div>

      <ul className="mt-1.5 flex flex-col" aria-label={`${label} breakdown`}>
        {layers.map(({ seg, i }) => {
          const on = active === seg.id;
          return (
            <li key={seg.id}>
              <button
                type="button"
                aria-pressed={pinned === seg.id}
                onPointerEnter={() => setHot(seg.id)}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot(seg.id)}
                onBlur={() => setHot(null)}
                onClick={() => setPinned((p) => (p === seg.id ? null : seg.id))}
                className={cn(
                  "group flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2 text-left transition-[background-color,opacity] duration-150",
                  FOCUS_RING,
                  on ? "bg-[color:var(--bjork-surface-active)]" : "hover:bg-[color:var(--bjork-surface-active)]",
                  active && !on && "opacity-55",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{
                    background: fillOf(seg, i),
                    boxShadow: seg.reserved ? "inset 0 0 0 1px var(--bjork-text-faint)" : undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[color:var(--bjork-text-medium)] group-aria-pressed:text-[color:var(--bjork-text)]">
                  {seg.label}
                </span>
                <span className="min-w-[6ch] shrink-0 text-right font-mono text-[12px] leading-5 tabular-nums text-[color:var(--bjork-text)]">
                  {formatTokens(seg.tokens)}
                </span>
                <span className="min-w-[4ch] shrink-0 text-right font-mono text-[11px] leading-5 tabular-nums text-[color:var(--bjork-text-faint)]">
                  {pct(seg.tokens / Math.max(1, limit))}
                </span>
              </button>
            </li>
          );
        })}
        <li className="mt-1 flex h-8 items-center gap-2.5 border-t border-[color:var(--bjork-border)] px-2 pt-1">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px] bg-[color:var(--bjork-hair)]" />
          <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">
            Free
          </span>
          <span className="min-w-[6ch] shrink-0 text-right font-mono text-[12px] leading-5 tabular-nums text-[color:var(--bjork-text-muted)]">
            {formatTokens(free)}
          </span>
          <span className="min-w-[4ch] shrink-0 text-right font-mono text-[11px] leading-5 tabular-nums text-[color:var(--bjork-text-faint)]">
            {pct(free / Math.max(1, limit))}
          </span>
        </li>
      </ul>
    </div>
  );
}

interface CompactProps extends BodyProps {
  open?: boolean;
  defaultOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  side: "top" | "bottom";
  align: "start" | "end";
  ringTrack: string;
}

const RING = 18;
const RING_STROKE = 2;

function CompactMeter({ open, defaultOpen, onOpenChange, side, align, ringTrack, ...body }: CompactProps) {
  const reduce = useReduceMotion();
  const hydrated = useHydrated();
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const [placement, setPlacement] = useState<"top" | "bottom">(side);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.min(1, body.ratio);
  const color = body.level === "ok" ? "var(--bjork-accent)" : LEVEL_COLOR[body.level];

  const toggle = () => {
    if (!isOpen) {
      // Flip to the other side when the preferred one has no room for a ~360px panel.
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const roomTop = rect.top;
        const roomBottom = window.innerHeight - rect.bottom;
        const cramped = side === "top" ? roomTop < 360 && roomBottom > roomTop : roomBottom < 360 && roomTop > roomBottom;
        setPlacement(cramped ? (side === "top" ? "bottom" : "top") : side);
      }
    }
    setOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, setOpen]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={`${body.label}: ${formatTokens(body.used)} of ${formatTokens(body.limit)} tokens, ${pct(body.ratio)}`}
        onClick={toggle}
        className={cn(
          "flex h-7 cursor-pointer items-center gap-1.5 rounded-full pl-1.5 pr-2.5 text-[color:var(--bjork-text-muted)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
          isOpen && "bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text)]",
          FOCUS_RING,
          PRESS,
        )}
      >
        <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true" className="-rotate-90">
          <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={ringTrack} strokeWidth={RING_STROKE} />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (hydrated ? shown : 0))}
            style={{ transition: reduce ? "none" : `stroke-dashoffset 520ms ${easeCss.out}, stroke 200ms ease-out` }}
          />
        </svg>
        <span className="min-w-[4ch] font-mono text-[11px] leading-4 tabular-nums" style={{ color: body.level === "ok" ? undefined : color }}>
          {pct(body.ratio)}
        </span>
      </button>

      <div
        id={panelId}
        role="dialog"
        aria-label={`${body.label} usage`}
        hidden={!isOpen}
        className={cn(
          "absolute z-30 w-[min(320px,calc(100vw-32px))] rounded-[12px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] p-3 pt-2.5 shadow-[var(--bjork-shadow-menu)] backdrop-blur-md",
          align === "end" ? "right-0" : "left-0",
          placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
          placement === "top"
            ? align === "end" ? "origin-bottom-right" : "origin-bottom-left"
            : align === "end" ? "origin-top-right" : "origin-top-left",
          !reduce && "motion-safe:animate-[bjork-ctx-pop_180ms_cubic-bezier(0.23,1,0.32,1)]",
        )}
      >
        <style href="bjork-context-meter-pop" precedence="default">
          {"@keyframes bjork-ctx-pop{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}}"}
        </style>
        {isOpen && <MeterBody {...body} />}
      </div>
    </div>
  );
}

