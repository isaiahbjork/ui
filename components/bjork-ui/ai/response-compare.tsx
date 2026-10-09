"use client";

import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  formatCost,
  formatDuration,
  formatTokens,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export interface CompareResponse {
  id: string;
  /** Model name. Hidden as "Response A/B" while `blind` until a vote is in. */
  model: string;
  /** Plain text (blank lines split paragraphs) or any node. */
  body: ReactNode;
  latencyMs?: number;
  tokens?: number;
  costUsd?: number;
}

export type CompareChoice = "a" | "tie" | "b" | "both-bad";

export interface CompareVote {
  choice: CompareChoice;
  /** Per criterion, whether each side did well. */
  rubric: Record<string, { a: boolean; b: boolean }>;
  comment?: string;
}

export interface ResponseCompareProps {
  prompt: ReactNode;
  responses: [CompareResponse, CompareResponse];
  /** Hide model names until the vote. Default true. */
  blind?: boolean;
  /** The submitted vote, or null while voting. */
  value?: CompareVote | null;
  defaultValue?: CompareVote | null;
  onVote?: (vote: CompareVote | null) => void;
  /** Criteria with per-side toggles, e.g. ["Accuracy", "Helpfulness", "Tone"]. */
  rubric?: string[];
  /** Offer a free-text comment. Default true. */
  allowComment?: boolean;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_COMPARISON: { prompt: string; responses: [CompareResponse, CompareResponse]; rubric: string[] } = {
  prompt: "My sourdough starter smells like nail polish remover. Is it ruined, and what should I do?",
  rubric: ["Accuracy", "Helpfulness", "Tone"],
  responses: [
    {
      id: "a",
      model: "Halcyon 3 Pro",
      latencyMs: 2140,
      tokens: 164,
      costUsd: 0.0031,
      body:
        "It isn't ruined. That acetone smell means the yeast and bacteria have run out of food and are producing more acetic acid and ethyl acetate.\n\nFeed it more often: discard all but 50 g, then feed 1:1:1 by weight twice a day for two or three days. Keep it somewhere around 24 °C. The sharp smell should fade into a mild, yogurt-like sourness.",
    },
    {
      id: "b",
      model: "Kestrel Mini",
      latencyMs: 860,
      tokens: 121,
      costUsd: 0.0004,
      body:
        "A nail polish smell usually means your starter is contaminated with bad bacteria. To be safe, throw it out and start a new one with fresh flour and filtered water.\n\nNext time, store it in the fridge between bakes so it does not spoil.",
    },
  ],
};

const CHOICES: { id: CompareChoice; label: string; short: string }[] = [
  { id: "a", label: "A is better", short: "A" },
  { id: "tie", label: "Tie", short: "Tie" },
  { id: "b", label: "B is better", short: "B" },
  { id: "both-bad", label: "Both bad", short: "Both bad" },
];

function renderBody(body: ReactNode): ReactNode {
  if (typeof body !== "string") return body;
  return body.split(/\n{2,}/).map((p, i) => (
    <p key={i} className={i > 0 ? "mt-3" : undefined}>
      {p}
    </p>
  ));
}

/** Side-by-side evaluation of two responses to one prompt, with a vote, an optional rubric and a blind reveal. */
export function ResponseCompare({
  prompt,
  responses,
  blind = true,
  value,
  defaultValue = null,
  onVote,
  rubric = [],
  allowComment = true,
  tone: toneProp,
  className,
}: ResponseCompareProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const uid = useId();
  const [vote, setVote] = useControllable<CompareVote | null>(value, defaultValue, onVote);
  const initial = value ?? defaultValue;
  const [choice, setChoice] = useState<CompareChoice | null>(initial?.choice ?? null);
  const [marks, setMarks] = useState<Record<string, { a: boolean; b: boolean }>>(
    () => initial?.rubric ?? Object.fromEntries(rubric.map((r) => [r, { a: false, b: false }])),
  );
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [commenting, setCommenting] = useState(Boolean(initial?.comment));
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const submitted = vote !== null;
  const revealed = !blind || submitted;

  const [announce, setAnnounce] = useState({ submitted, message: "" });
  if (announce.submitted !== submitted) {
    const msg =
      submitted && vote
        ? `Vote recorded: ${CHOICES.find((c) => c.id === vote.choice)?.label}. Response A was ${responses[0].model}, response B was ${responses[1].model}.`
        : "Vote cleared";
    setAnnounce({ submitted, message: msg });
  }

  const onRadioKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (submitted) return;
    const i = Math.max(0, CHOICES.findIndex((c) => c.id === choice));
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % CHOICES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + CHOICES.length) % CHOICES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CHOICES.length - 1;
    else return;
    e.preventDefault();
    setChoice(CHOICES[next].id);
    radios.current[next]?.focus();
  };

  const submit = () => {
    if (!choice) return;
    setVote({ choice, rubric: marks, comment: comment.trim() || undefined });
  };

  const winner = vote?.choice === "a" ? 0 : vote?.choice === "b" ? 1 : null;
  const focusable = Math.max(0, CHOICES.findIndex((c) => c.id === choice));

  return (
    <section
      aria-labelledby={`${uid}-prompt`}
      style={style}
      className={cn("@container w-full min-w-0 max-w-[720px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
    >
      <div className="pb-4">
        <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
          Prompt
        </span>
        <p id={`${uid}-prompt`} className="mt-1 text-[15px] font-medium leading-[22px] text-pretty">
          {prompt}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 @[560px]:grid-cols-2">
        {responses.map((r, i) => {
          const letter = i === 0 ? "A" : "B";
          const wins = winner === i;
          const loses = submitted && ((winner !== null && winner !== i) || vote?.choice === "both-bad");
          return (
            <article
              key={r.id}
              aria-labelledby={`${uid}-r${i}`}
              className={cn(
                "relative flex min-w-0 flex-col rounded-[12px] border bg-[color:var(--bjork-surface)] px-4 pb-4 pt-3 transition-[opacity,border-color] duration-300",
                wins ? "border-[color:var(--bjork-accent-muted)]" : "border-[color:var(--bjork-border)]",
                loses && "opacity-60",
              )}
              style={{ transitionTimingFunction: easeCss.out }}
            >
              {/* The winner's accent edge. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-4 -top-px h-[2px] origin-left rounded-full bg-[color:var(--bjork-accent)]"
                style={{
                  transform: `scaleX(${wins ? 1 : 0})`,
                  transition: reduce ? "none" : `transform 420ms ${easeCss.out}`,
                }}
              />
              <header className="flex min-h-8 items-start justify-between gap-3">
                <h4 id={`${uid}-r${i}`} className="grid min-w-0 text-[14px] font-semibold leading-5">
                  <span className="sr-only">Response {letter}{revealed ? `: ${r.model}` : ""}</span>
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-start-1 truncate"
                    style={{
                      opacity: revealed ? 0 : 1,
                      filter: revealed && !reduce ? "blur(4px)" : "blur(0px)",
                      transition: reduce ? "none" : `opacity 360ms ${easeCss.out}, filter 360ms ${easeCss.out}`,
                    }}
                  >
                    Response {letter}
                  </span>
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-start-1 flex min-w-0 items-baseline gap-2"
                    style={{
                      opacity: revealed ? 1 : 0,
                      filter: revealed || reduce ? "blur(0px)" : "blur(4px)",
                      transition: reduce ? "none" : `opacity 360ms ${easeCss.out} 120ms, filter 360ms ${easeCss.out} 120ms`,
                    }}
                  >
                    <span className="font-mono text-[11px] font-normal text-[color:var(--bjork-text-faint)]">{letter}</span>
                    <span className="truncate">{r.model}</span>
                  </span>
                </h4>
                {wins && (
                  <span className="shrink-0 font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-[color:var(--bjork-accent-ink)]">
                    Preferred
                  </span>
                )}
                {submitted && vote?.choice === "both-bad" && (
                  <span className="shrink-0 font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-[color:var(--bjork-error)]">
                    Bad
                  </span>
                )}
              </header>
              <p className="flex flex-wrap gap-x-3 font-mono text-[11px] leading-4 tabular-nums text-[color:var(--bjork-text-muted)]">
                {r.latencyMs !== undefined && <span>{formatDuration(r.latencyMs)}</span>}
                {r.tokens !== undefined && <span>{formatTokens(r.tokens)} tok</span>}
                {r.costUsd !== undefined && <span>{formatCost(r.costUsd)}</span>}
              </p>
              <div className="mt-3 text-[14px] leading-[22px] text-[color:var(--bjork-text-medium)]">{renderBody(r.body)}</div>
            </article>
          );
        })}
      </div>

      {/* Voting */}
      <div className="mt-4 flex flex-col gap-3">
        <div
          role="radiogroup"
          aria-label="Which response is better?"
          aria-disabled={submitted || undefined}
          onKeyDown={onRadioKey}
          className="grid grid-cols-2 gap-1 rounded-[11px] border border-[color:var(--bjork-border)] p-1 @[480px]:grid-cols-4"
        >
          {CHOICES.map((c, i) => {
            const on = (submitted ? vote?.choice : choice) === c.id;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  radios.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={submitted && !on}
                tabIndex={i === focusable ? 0 : -1}
                onClick={() => !submitted && setChoice(c.id)}
                className={cn(
                  "h-8 cursor-pointer rounded-[8px] px-2 text-[13px] font-medium transition-colors duration-150 disabled:cursor-default",
                  on
                    ? c.id === "both-bad"
                      ? "bg-[color:color-mix(in_srgb,var(--bjork-error)_12%,transparent)] text-[color:var(--bjork-error)]"
                      : "bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)] shadow-[inset_0_0_0_1px_var(--bjork-accent-muted)]"
                    : "text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:opacity-40 disabled:hover:bg-transparent",
                  FOCUS_RING,
                  !submitted && PRESS,
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {rubric.length > 0 && (
          <div role="group" aria-label="Rubric" className="flex flex-col">
            {rubric.map((criterion) => (
              <div key={criterion} className="flex min-h-9 items-center justify-between gap-3 border-b border-[color:var(--bjork-border)] last:border-b-0">
                <span className="text-[13px] text-[color:var(--bjork-text-medium)]">{criterion}</span>
                <span className="flex gap-1">
                  {(["a", "b"] as const).map((side) => {
                    const on = marks[criterion]?.[side] ?? false;
                    return (
                      <button
                        key={side}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${criterion}: response ${side.toUpperCase()} did well`}
                        disabled={submitted}
                        onClick={() =>
                          setMarks((m) => ({
                            ...m,
                            [criterion]: { a: m[criterion]?.a ?? false, b: m[criterion]?.b ?? false, [side]: !on },
                          }))
                        }
                        className={cn(
                          "inline-flex h-7 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-[7px] border px-2 font-mono text-[11px] transition-colors duration-150 disabled:cursor-default",
                          on
                            ? "border-[color:var(--bjork-accent-muted)] bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)]"
                            : "border-[color:var(--bjork-border)] text-[color:var(--bjork-text-faint)] enabled:hover:text-[color:var(--bjork-text)]",
                          FOCUS_RING,
                          !submitted && PRESS,
                        )}
                      >
                        <span aria-hidden="true" className="grid size-3 place-items-center">
                          <StrokeMorphIcon name={on ? "check" : "dot"} size={12} strokeWidth={2} color="currentColor" />
                        </span>
                        {side.toUpperCase()}
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        {allowComment && !submitted && (
          <div>
            {commenting ? (
              <textarea
                aria-label="Comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="What tipped it? (optional)"
                className={cn(
                  "block w-full resize-y rounded-[10px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-field)] px-3 py-2 text-[13px] leading-5 text-[color:var(--bjork-text)] placeholder:text-[color:var(--bjork-text-faint)]",
                  FOCUS_RING,
                )}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCommenting(true)}
                className={cn(
                  "-ml-1.5 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] px-1.5 text-[12px] text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
                  FOCUS_RING,
                )}
              >
                <StrokeMorphIcon name="plus" size={12} strokeWidth={1.75} color="currentColor" />
                Add a comment
              </button>
            )}
          </div>
        )}

        <div className="flex min-h-8 items-center justify-between gap-3">
          {submitted && vote ? (
            <>
              <span className="min-w-0 truncate text-[13px] text-[color:var(--bjork-text-muted)]">
                {winner !== null ? (
                  <>
                    You preferred <span className="text-[color:var(--bjork-text)]">{responses[winner].model}</span>
                  </>
                ) : vote.choice === "tie" ? (
                  "You called it a tie"
                ) : (
                  "You marked both as bad"
                )}
                {vote.comment && <span className="text-[color:var(--bjork-text-faint)]"> · “{vote.comment}”</span>}
              </span>
              <button
                type="button"
                onClick={() => setVote(null)}
                className={cn(
                  "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-[9px] px-3 text-[13px] font-medium text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                Change vote
              </button>
            </>
          ) : (
            <>
              <span className="font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
                {blind ? "Models are hidden until you vote" : ""}
              </span>
              <button
                type="button"
                disabled={!choice}
                onClick={submit}
                className={cn(
                  "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-[9px] bg-[color:var(--bjork-accent-fill)] px-3.5 text-[13px] font-medium text-[color:var(--bjork-accent-foreground)] hover:brightness-110 disabled:cursor-default disabled:bg-[color:var(--bjork-surface-active)] disabled:text-[color:var(--bjork-text-faint)] disabled:hover:brightness-100",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                Submit vote
              </button>
            </>
          )}
        </div>
      </div>

      <LiveRegion message={announce.message} />
    </section>
  );
}
