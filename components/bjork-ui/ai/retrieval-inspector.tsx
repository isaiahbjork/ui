"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  AI_PANEL,
  AI_WELL,
  FOCUS_RING,
  PRESS,
  formatDuration,
  formatTokens,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export interface RetrievedChunk {
  id: string;
  /** Final rank after reranking, 1-based. */
  rank: number;
  /** Rank from the vector search before reranking. The delta shows as ↑2 / ↓1. */
  retrievedRank?: number;
  /** File or collection, e.g. "handbook.pdf". */
  source: string;
  /** Where in the source, e.g. "p.12 · §3.2". */
  location?: string;
  /** Similarity, 0 to 1. */
  score: number;
  tokens: number;
  /** The chunk was cited or placed in the final prompt. */
  used?: boolean;
  text: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface RetrievalMeta {
  /** Embedding model. */
  model: string;
  topK: number;
  latencyMs: number;
  /** Reranker model, if any. */
  reranker?: string;
  /** Index or collection name. */
  index?: string;
}

export type RetrievalSort = "score" | "rank" | "source";

export interface RetrievalInspectorProps {
  query: string;
  chunks: RetrievedChunk[];
  meta: RetrievalMeta;
  /** Chunks scoring below this dim and get a "filtered" tag. 0 to 1. */
  threshold?: number;
  defaultThreshold?: number;
  onThresholdChange?: (threshold: number) => void;
  defaultSort?: RetrievalSort;
  /** Chunk id expanded on first render. */
  defaultExpandedId?: string;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_RETRIEVAL: { query: string; meta: RetrievalMeta; chunks: RetrievedChunk[] } = {
  query: "How many vacation days carry over to next year?",
  meta: { model: "lumen-embed-3", topK: 5, latencyMs: 142, reranker: "kestrel-rerank-2", index: "people-ops" },
  chunks: [
    {
      id: "c1",
      rank: 1,
      retrievedRank: 3,
      source: "handbook.pdf",
      location: "p.12 · §3.2",
      score: 0.874,
      tokens: 212,
      used: true,
      text:
        "Unused vacation days carry over to the next calendar year, up to a maximum of 5 days. Days above the cap are forfeited on January 1 unless your manager approves an exception in writing before December 15.",
      metadata: { section: "Time off", updated: "2026-02-03", owner: "people-ops", chunk: "12/48" },
    },
    {
      id: "c2",
      rank: 2,
      retrievedRank: 1,
      source: "pto-policy.md",
      location: "L40–58",
      score: 0.861,
      tokens: 168,
      used: true,
      text:
        "Carry-over requests above the cap go through the PTO form. Approved exceptions must be used by March 31 of the following year. Contractors do not accrue vacation days and nothing carries over.",
      metadata: { repo: "handbook", commit: "4f1c9e2", updated: "2026-01-19" },
    },
    {
      id: "c3",
      rank: 3,
      retrievedRank: 2,
      source: "faq-hr.html",
      location: "#carryover",
      score: 0.802,
      tokens: 94,
      used: false,
      text:
        "Q: Do sick days carry over? A: No. Sick days reset every year and are separate from vacation days, which carry over under the handbook policy.",
      metadata: { crawled: "2026-03-11", lang: "en" },
    },
    {
      id: "c4",
      rank: 4,
      retrievedRank: 5,
      source: "handbook.pdf",
      location: "p.31 · §7.1",
      score: 0.741,
      tokens: 186,
      used: false,
      text:
        "When you leave the company, accrued but unused vacation days are paid out at your final base rate. Carry-over days count toward the payout in states where the law requires it.",
      metadata: { section: "Leaving", updated: "2025-11-20", owner: "people-ops", chunk: "31/48" },
    },
    {
      id: "c5",
      rank: 5,
      retrievedRank: 4,
      source: "slack-export.json",
      location: "#people-ops · Dec 2",
      score: 0.618,
      tokens: 57,
      used: false,
      text: "reminder that the year-end freeze starts Dec 20, so get your vacation requests in before then 🌲",
      metadata: { channel: "people-ops", author: "imogen.h", reactions: 14 },
    },
  ],
};

const STOP = new Set(
  "the a an and or of to in on for with is are was were be do does did how many much what when where which who why next year this that it at by from".split(
    " ",
  ),
);

function termsOf(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length > 2 && !STOP.has(w)))];
}

function highlight(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const stems = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/s$/, ""));
  const re = new RegExp(`\\b((?:${stems.join("|")})[\\p{L}-]*)`, "giu");
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[3px] bg-[color:var(--bjork-accent-soft)] px-px text-[color:var(--bjork-text)] shadow-[inset_0_-1px_0_var(--bjork-accent-muted)]">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const SORTS: { id: RetrievalSort; label: string }[] = [
  { id: "score", label: "Score" },
  { id: "rank", label: "Rank" },
  { id: "source", label: "Source" },
];

/** A RAG debug view: what was retrieved for a query, how it scored and reranked, and what made it into the answer. */
export function RetrievalInspector({
  query,
  chunks,
  meta,
  threshold,
  defaultThreshold = 0.7,
  onThresholdChange,
  defaultSort = "rank",
  defaultExpandedId,
  tone: toneProp,
  className,
}: RetrievalInspectorProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const uid = useId();
  const [cut, setCut] = useControllable(threshold, defaultThreshold, onThresholdChange);
  const [sort, setSort] = useState<RetrievalSort>(defaultSort);
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultExpandedId ? [defaultExpandedId] : []));
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  const terms = useMemo(() => termsOf(query), [query]);
  const shown = useMemo(() => {
    const list = chunks.filter((c) => !onlyUsed || c.used);
    const by: Record<RetrievalSort, (a: RetrievedChunk, b: RetrievedChunk) => number> = {
      score: (a, b) => b.score - a.score,
      rank: (a, b) => a.rank - b.rank,
      source: (a, b) => a.source.localeCompare(b.source) || a.rank - b.rank,
    };
    return [...list].sort(by[sort]);
  }, [chunks, onlyUsed, sort]);

  const passing = chunks.filter((c) => c.score >= cut).length;
  const used = chunks.filter((c) => c.used).length;
  const usedTokens = chunks.reduce((n, c) => n + (c.used ? c.tokens : 0), 0);
  const focusIndex = Math.min(active, Math.max(0, shown.length - 1));

  // Announce how many chunks pass when the threshold settles on a new count.
  const [announce, setAnnounce] = useState({ passing, message: "" });
  if (announce.passing !== passing) {
    setAnnounce({ passing, message: `${passing} of ${chunks.length} chunks above ${cut.toFixed(2)}` });
  }

  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(shown.length - 1, focusIndex + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, focusIndex - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = shown.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    rows.current[next]?.focus();
  };

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section
      aria-labelledby={`${uid}-q`}
      style={style}
      className={cn(AI_PANEL, "@container w-full min-w-0 max-w-[680px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
    >
      <header className="pb-3">
        <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
          Retrieval
        </span>
        <h3 id={`${uid}-q`} className="mt-1 text-[15px] font-semibold leading-[22px] text-balance">
          “{query}”
        </h3>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] leading-4 text-[color:var(--bjork-text-muted)]">
          <span>{meta.model}</span>
          {meta.reranker && <span>→ {meta.reranker}</span>}
          {meta.index && <span className="text-[color:var(--bjork-text-faint)]">{meta.index}</span>}
          <span className="tabular-nums">top-k {meta.topK}</span>
          <span className="tabular-nums">{formatDuration(meta.latencyMs)}</span>
          <span className="tabular-nums text-[color:var(--bjork-text-faint)]">
            {used} used · {formatTokens(usedTokens)} tok
          </span>
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[color:var(--bjork-border)] py-2">
        <div role="radiogroup" aria-label="Sort by" className="flex items-center gap-0.5">
          <span aria-hidden="true" className="mr-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
            Sort
          </span>
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sort === s.id}
              tabIndex={sort === s.id ? 0 : -1}
              onClick={() => setSort(s.id)}
              onKeyDown={(e) => {
                const i = SORTS.findIndex((x) => x.id === sort);
                const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const next = SORTS[(i + d + SORTS.length) % SORTS.length];
                setSort(next.id);
                (e.currentTarget.parentElement?.querySelector(`[data-sort="${next.id}"]`) as HTMLElement | null)?.focus();
              }}
              data-sort={s.id}
              className={cn(
                "h-7 cursor-pointer rounded-[7px] px-2 text-[12px] font-medium transition-colors duration-150",
                sort === s.id
                  ? "bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text)]"
                  : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
                FOCUS_RING,
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="flex min-w-[180px] flex-1 items-center gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">Min</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={cut}
            onChange={(e) => setCut(Number(e.target.value))}
            aria-valuetext={`${cut.toFixed(2)}, ${passing} of ${chunks.length} chunks pass`}
            className={cn(
              "h-7 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent",
              "[&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[color:var(--bjork-border-strong)]",
              "[&::-webkit-slider-thumb]:-mt-[6.5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[color:var(--bjork-accent)] [&::-webkit-slider-thumb]:bg-[color:var(--bjork-surface)]",
              "[&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[color:var(--bjork-border-strong)]",
              "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[color:var(--bjork-accent)] [&::-moz-range-thumb]:bg-[color:var(--bjork-surface)]",
              "rounded-full outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-[color:var(--bjork-accent)] focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 focus-visible:[&::-webkit-slider-thumb]:ring-offset-[color:var(--bjork-ring-offset)]",
            )}
            aria-label="Similarity threshold"
          />
          <span className="min-w-[4ch] font-mono text-[12px] tabular-nums text-[color:var(--bjork-text)]">{cut.toFixed(2)}</span>
        </label>

        <button
          type="button"
          aria-pressed={onlyUsed}
          onClick={() => {
            setOnlyUsed((v) => !v);
            setActive(0);
          }}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] border px-2 text-[12px] font-medium transition-colors duration-150",
            onlyUsed
              ? "border-[color:var(--bjork-accent-muted)] bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)]"
              : "border-[color:var(--bjork-border)] text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
            FOCUS_RING,
            PRESS,
          )}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          Only used
        </button>
      </div>

      <ul aria-label="Retrieved chunks" onKeyDown={onListKey} className="divide-y divide-[color:var(--bjork-border)]">
        {shown.map((c, i) => {
          const isOpen = open.has(c.id);
          const filtered = c.score < cut;
          const delta = c.retrievedRank !== undefined ? c.retrievedRank - c.rank : 0;
          const bodyId = `${uid}-${c.id}`;
          return (
            <li key={c.id} className="relative">
              <button
                ref={(el) => {
                  rows.current[i] = el;
                }}
                type="button"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                tabIndex={i === focusIndex ? 0 : -1}
                onFocus={() => setActive(i)}
                onClick={() => toggle(c.id)}
                className={cn(
                  "group grid w-full cursor-pointer grid-cols-[3ch_minmax(0,1fr)] gap-x-3 rounded-[8px] py-3 text-left transition-opacity duration-200",
                  filtered && "opacity-45 hover:opacity-70 focus-visible:opacity-100",
                  FOCUS_RING,
                )}
              >
                <span className="pt-px font-mono text-[12px] leading-5 tabular-nums text-[color:var(--bjork-text-faint)]">
                  #{c.rank}
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-5 text-[color:var(--bjork-text-medium)]">
                      {c.source}
                      {c.location && <span className="text-[color:var(--bjork-text-faint)]"> · {c.location}</span>}
                    </span>
                    {filtered && (
                      <span className="shrink-0 rounded-[4px] border border-[color:var(--bjork-border)] px-1 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
                        filtered
                      </span>
                    )}
                    {delta !== 0 && (
                      <span
                        className="shrink-0 font-mono text-[11px] leading-5 tabular-nums"
                        style={{ color: delta > 0 ? "var(--bjork-success)" : "var(--bjork-text-faint)" }}
                        title={`Reranked from #${c.retrievedRank}`}
                      >
                        <span className="sr-only">Reranked </span>
                        {delta > 0 ? `↑${delta}` : `↓${-delta}`}
                      </span>
                    )}
                    <span className="hidden min-w-[6ch] shrink-0 text-right font-mono text-[11px] leading-5 tabular-nums text-[color:var(--bjork-text-faint)] @[420px]:inline">
                      {formatTokens(c.tokens)} tok
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase leading-5 tracking-[0.08em]",
                        c.used ? "text-[color:var(--bjork-accent-ink)]" : "invisible",
                      )}
                      aria-hidden={!c.used || undefined}
                    >
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-[color:var(--bjork-accent)]" />
                      used
                    </span>
                  </span>

                  <span className="mt-1.5 flex items-center gap-2.5">
                    <span aria-hidden="true" className="relative h-[3px] flex-1 rounded-full bg-[color:var(--bjork-hair)]">
                      <span
                        className="absolute inset-y-0 left-0 origin-left rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(1, c.score)) * 100}%`,
                          background: filtered ? "var(--bjork-text-faint)" : c.used ? "var(--bjork-accent)" : "var(--bjork-text-soft)",
                          transition: reduce ? "none" : "background-color 200ms ease-out",
                        }}
                      />
                      {/* The threshold as a tick on every bar, so the cut reads down the whole list. */}
                      <span
                        className="absolute -inset-y-[3px] w-px -translate-x-1/2 bg-[color:var(--bjork-text-muted)]"
                        style={{ left: `${Math.max(0, Math.min(1, cut)) * 100}%` }}
                      />
                    </span>
                    <span className="sr-only">Similarity </span>
                    <span className="min-w-[5ch] text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text)]">
                      {c.score.toFixed(3)}
                    </span>
                  </span>

                  <span
                    className={cn(
                      "mt-2 block text-[13px] leading-5 text-[color:var(--bjork-text-medium)]",
                      !isOpen && "line-clamp-2",
                    )}
                  >
                    {highlight(c.text, terms)}
                  </span>
                </span>
              </button>

              <div
                id={bodyId}
                className="grid"
                inert={!isOpen}
                style={{
                  gridTemplateRows: isOpen ? "1fr" : "0fr",
                  opacity: isOpen ? 1 : 0,
                  transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 280ms ${easeCss.drawer}`,
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  <dl className={cn(AI_WELL, "mb-3 ml-[calc(3ch+12px)] grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 @[560px]:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-y-0.5 px-3 py-2 font-mono text-[11px] leading-5")}>
                    <Meta k="id" v={c.id} />
                    <Meta k="retrieved" v={c.retrievedRank !== undefined ? `#${c.retrievedRank} → #${c.rank}` : `#${c.rank}`} />
                    <Meta k="tokens" v={c.tokens.toLocaleString("en-US")} />
                    {Object.entries(c.metadata ?? {}).map(([k, v]) => (
                      <Meta key={k} k={k} v={String(v)} />
                    ))}
                  </dl>
                </div>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="py-8 text-center text-[13px] text-[color:var(--bjork-text-faint)]">No chunks were used in the answer.</li>
        )}
      </ul>

      <p className="flex items-center gap-1.5 border-t border-[color:var(--bjork-border)] pt-2 font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-faint)]">
        <StrokeMorphIcon name="dot" size={12} strokeWidth={2} color="currentColor" />
        {passing} of {chunks.length} above {cut.toFixed(2)}
      </p>
      <LiveRegion message={announce.message} />
    </section>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[color:var(--bjork-text-faint)]">{k}</dt>
      <dd className="min-w-0 truncate text-[color:var(--bjork-text-medium)]">{v}</dd>
    </>
  );
}
