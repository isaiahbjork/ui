"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ArrowUpRight, Shuffle } from "lucide-react";
import { LiveRegion, VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  AI_TILE, FOCUS_RING, PRESS, useAiTone, useReduceMotion, type BjorkTone } from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

export interface SuggestedPrompt {
  id: string;
  /** The visible label. Also what is sent, unless `prompt` is set. */
  title: string;
  /** One quiet line under the title. Cards only. */
  subtitle?: string;
  /** Short tag such as "Plan" or "Code". Cards only. */
  category?: string;
  /** The full prompt to send, when it differs from the title. */
  prompt?: string;
}

export interface SuggestedPromptsProps {
  prompts: SuggestedPrompt[];
  /** "cards" for an empty chat, "chips" for follow-ups under an answer. Default "cards". */
  variant?: "cards" | "chips";
  onSelect?: (prompt: SuggestedPrompt) => void;
  /** Show skeletons while suggestions stream in. */
  loading?: boolean;
  /** Card columns at full width. Narrow containers fall back to one column. Default 2. */
  columns?: 1 | 2 | 3;
  /** Small heading above the set, such as "Try asking" or "Follow up". */
  label?: string;
  /** Shows a Shuffle button. Swap `prompts` in the handler; the new set crossfades in. */
  onShuffle?: () => void;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_STARTERS: SuggestedPrompt[] = [
  {
    id: "offsite",
    category: "Plan",
    title: "Plan a three-day team offsite",
    subtitle: "Twelve people near Lisbon, under €9k",
  },
  {
    id: "trace",
    category: "Code",
    title: "Explain this stack trace",
    subtitle: "A hydration error from the Fieldnotes web build",
  },
  {
    id: "launch",
    category: "Write",
    title: "Draft a launch note",
    subtitle: "For the Lumen Labs offline sync release",
  },
  {
    id: "vectors",
    category: "Research",
    title: "Compare vector databases",
    subtitle: "Latency and cost at ten million embeddings",
  },
];

/** A second starter set, for Shuffle. */
export const SAMPLE_STARTERS_ALT: SuggestedPrompt[] = [
  { id: "sql", category: "Data", title: "Write a cohort retention query", subtitle: "Weekly cohorts from the events table" },
  { id: "review", category: "Code", title: "Review a pull request", subtitle: "Spot race conditions in a sync worker" },
  { id: "email", category: "Write", title: "Reply to a tricky email", subtitle: "Decline a deadline without burning trust" },
  { id: "learn", category: "Learn", title: "Teach me CRDTs in ten minutes", subtitle: "With one worked example, no jargon" },
];

export const SAMPLE_FOLLOWUPS: SuggestedPrompt[] = [
  { id: "table", title: "Show it as a table" },
  { id: "tradeoffs", title: "What are the trade-offs?" },
  { id: "shorter", title: "Make it shorter" },
  { id: "tests", title: "Write tests for this" },
  { id: "sources", title: "Which sources did you use?" },
];

const COLS = { 1: "", 2: "@[480px]:grid-cols-2", 3: "@[480px]:grid-cols-2 @[680px]:grid-cols-3" } as const;

/**
 * Starter prompts for an empty chat and follow-ups after an answer. Cards or chips, arrow-key navigation, a quick
 * staggered entrance, skeletons while suggestions load, and an optional Shuffle that crossfades to a new set.
 */
export function SuggestedPrompts({
  prompts,
  variant = "cards",
  onSelect,
  loading = false,
  columns = 2,
  label,
  onShuffle,
  tone: toneProp,
  className,
}: SuggestedPromptsProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const cards = variant === "cards";
  const setKey = prompts.map((p) => p.id).join("|");

  // Roving tabindex: one stop for the whole set, arrows move within it. Reset when the set changes.
  const [active, setActive] = useState({ key: setKey, index: 0 });
  const activeIndex = active.key === setKey ? Math.min(active.index, Math.max(0, prompts.length - 1)) : 0;

  const [announce, setAnnounce] = useState({ loading, key: setKey, message: "" });
  if (announce.loading !== loading || announce.key !== setKey) {
    setAnnounce({
      loading,
      key: setKey,
      message: loading ? "Loading suggestions" : `${prompts.length} suggestions`,
    });
  }

  const focusAt = (index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-prompt]");
    if (!items || items.length === 0) return;
    const next = (index + items.length) % items.length;
    setActive({ key: setKey, index: next });
    items[next].focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-prompt]");
    if (!items || items.length === 0) return;
    const from = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
    if (from === -1) return;
    // Columns as laid out right now, so Up and Down follow the real grid at any container width.
    const top = items[0].offsetTop;
    let perRow = 0;
    while (perRow < items.length && items[perRow].offsetTop === top) perRow++;
    const vertical = cards ? Math.max(1, perRow) : 1;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: vertical,
      ArrowUp: -vertical,
    };
    if (e.key in moves) {
      e.preventDefault();
      const target = from + moves[e.key];
      if (cards && (target < 0 || target >= items.length) && vertical > 1) return;
      focusAt(target);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(items.length - 1);
    }
  };

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : Math.min(0.04, 0.16 / Math.max(1, prompts.length)) } },
    exit: { opacity: 0, transition: { duration: 0.12, ease: ease.out } },
  };
  const itemVariants: Variants = reduce
    ? {
        hidden: { opacity: 0, filter: "blur(0px)" },
        show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.15, ease: ease.out } },
      }
    : {
        hidden: { opacity: 0, y: 6, filter: "blur(4px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.22, ease: ease.out } },
      };

  const skeletonCount = cards ? Math.max(2, columns * 2) : 4;

  return (
    <div
      aria-busy={loading || undefined}
      className={cn("@container w-full font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      <style href="bjork-suggested-prompts" precedence="default">
        {SKELETON_CSS}
      </style>

      {(label || onShuffle) && (
        <div className="mb-2.5 flex min-h-7 items-center justify-between gap-3">
          {label ? (
            <h3 className="font-mono text-[10px] font-normal uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
              {label}
            </h3>
          ) : (
            <span />
          )}
          {onShuffle && (
            <button
              type="button"
              onClick={onShuffle}
              disabled={loading}
              className={cn(
                "-mr-1.5 flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] px-1.5 text-[12px] font-medium text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:opacity-40",
                FOCUS_RING,
                PRESS,
              )}
            >
              <Shuffle size={13} strokeWidth={1.75} aria-hidden="true" />
              Shuffle
            </button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait" initial={true}>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            aria-hidden="true"
            className={cn(cards ? cn("grid grid-cols-1 gap-2", COLS[columns]) : "flex flex-wrap gap-2")}
          >
            {Array.from({ length: skeletonCount }, (_, i) =>
              cards ? (
                <div key={i} className={cn(AI_TILE, "h-[86px] p-3")}>
                  <div className="bjork-sp-skel h-2 w-10 rounded-full" />
                  <div className="bjork-sp-skel mt-3 h-3 w-[72%] rounded-full" />
                  <div className="bjork-sp-skel mt-2.5 h-2.5 w-[54%] rounded-full" />
                </div>
              ) : (
                <div
                  key={i}
                  className="bjork-sp-skel h-8 rounded-full"
                  style={{ width: [148, 112, 176, 128][i % 4] }}
                />
              ),
            )}
          </motion.div>
        ) : (
          <motion.div
            key={setKey}
            ref={listRef}
            role="group"
            aria-label={label ?? (cards ? "Suggested prompts" : "Suggested follow-ups")}
            onKeyDown={onKeyDown}
            variants={container}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(cards ? cn("grid grid-cols-1 gap-2", COLS[columns]) : "flex flex-wrap gap-2")}
          >
            {prompts.map((p, i) => (
              <motion.button
                key={p.id}
                type="button"
                data-prompt=""
                variants={itemVariants}
                tabIndex={i === activeIndex ? 0 : -1}
                onFocus={() => setActive({ key: setKey, index: i })}
                onClick={() => onSelect?.(p)}
                className={cn(
                  "group relative min-w-0 cursor-pointer text-left transition-[background-color,border-color,color] duration-150",
                  cards
                    ? cn(AI_TILE, "flex min-h-[86px] flex-col p-3 pr-8 hover:border-[color:var(--bjork-border)] hover:bg-[color:var(--bjork-surface-hover)]")
                    : "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-[color:var(--bjork-border)] pl-3 pr-2.5 text-[13px] font-medium text-[color:var(--bjork-text-medium)] hover:border-[color:var(--bjork-border-strong)] hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                {cards ? (
                  <>
                    {p.category && (
                      <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
                        {p.category}
                      </span>
                    )}
                    <span className="mt-1.5 text-[14px] font-medium leading-5 text-[color:var(--bjork-text)]">
                      {p.title}
                    </span>
                    {p.subtitle && (
                      <span className="mt-0.5 truncate text-[12px] leading-[18px] text-[color:var(--bjork-text-soft)]">
                        {p.subtitle}
                      </span>
                    )}
                    <ArrowUpRight
                      aria-hidden="true"
                      size={14}
                      strokeWidth={1.75}
                      className="absolute right-3 top-3 text-[color:var(--bjork-text-faint)] opacity-0 transition-[opacity,transform,color] duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-[color:var(--bjork-accent-ink)] group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                    />
                  </>
                ) : (
                  <>
                    <span className="truncate">{p.title}</span>
                    <ArrowUpRight
                      aria-hidden="true"
                      size={13}
                      strokeWidth={1.75}
                      className="shrink-0 text-[color:var(--bjork-text-faint)] transition-[transform,color] duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-[color:var(--bjork-accent-ink)] motion-reduce:transition-none"
                    />
                  </>
                )}
                {p.prompt && p.prompt !== p.title && <VisuallyHidden>{`, sends: ${p.prompt}`}</VisuallyHidden>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <LiveRegion message={announce.message} />
    </div>
  );
}

const SKELETON_CSS =
  "@keyframes bjork-sp-skel{from{background-position:100% 0}to{background-position:0% 0}}" +
  ".bjork-sp-skel{background-image:linear-gradient(90deg,var(--bjork-surface-active) 0%,var(--bjork-surface-active) 35%,var(--bjork-border-strong) 50%,var(--bjork-surface-active) 65%,var(--bjork-surface-active) 100%);background-size:300% 100%;animation:bjork-sp-skel 1.5s linear infinite}" +
  "@media (prefers-reduced-motion: reduce){.bjork-sp-skel{animation:none;background:var(--bjork-surface-active)}}";
