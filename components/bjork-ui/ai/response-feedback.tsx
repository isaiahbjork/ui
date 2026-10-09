"use client";

import { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss, springs } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

export type FeedbackRating = "up" | "down";

export interface FeedbackPayload {
  rating: FeedbackRating;
  reasons: string[];
  comment: string;
}

export interface ResponseFeedbackProps {
  /** Controlled rating. `null` is no rating. */
  value?: FeedbackRating | null;
  defaultValue?: FeedbackRating | null;
  onValueChange?: (value: FeedbackRating | null) => void;
  /** Reason chips per polarity. Defaults to `SAMPLE_FEEDBACK_REASONS`. */
  reasons?: Partial<Record<FeedbackRating, string[]>>;
  onSubmit?: (feedback: FeedbackPayload) => void;
  /** Called when a sent rating is undone. */
  onUndo?: () => void;
  /** Show the optional comment field. Default true. */
  allowComment?: boolean;
  /** Initial panel state, for a rating that should open with its panel. Default false. */
  defaultOpen?: boolean;
  /** Initially selected reasons. */
  defaultReasons?: string[];
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_FEEDBACK_REASONS: Record<FeedbackRating, string[]> = {
  up: ["Accurate", "Clear", "Well sourced", "Right length"],
  down: ["Inaccurate", "Didn't follow instructions", "Too long", "Outdated sources", "Unsafe or harmful"],
};

const PROMPT: Record<FeedbackRating, string> = {
  up: "What worked?",
  down: "What went wrong?",
};

/**
 * Thumbs up and down for an AI answer. A rating opens a short panel of reasons and an optional comment, then folds
 * into a quiet receipt with Undo.
 */
export function ResponseFeedback({
  value,
  defaultValue = null,
  onValueChange,
  reasons = SAMPLE_FEEDBACK_REASONS,
  onSubmit,
  onUndo,
  allowComment = true,
  defaultOpen = false,
  defaultReasons = [],
  tone: toneProp,
  className,
}: ResponseFeedbackProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const [rating, setRating] = useControllable<FeedbackRating | null>(value, defaultValue, onValueChange);
  const [open, setOpen] = useState(defaultOpen && defaultValue !== null);
  const [sent, setSent] = useState(false);
  const [picked, setPicked] = useState<string[]>(defaultReasons);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [bump, setBump] = useState(0); // replays the press flourish on the chosen thumb
  const panelId = useId();
  const commentId = useId();
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);

  const reset = () => {
    setPicked([]);
    setComment("");
  };

  const choose = (next: FeedbackRating) => {
    if (sent) return;
    if (rating === next) {
      setRating(null);
      setOpen(false);
      reset();
      return;
    }
    reset();
    setRating(next);
    setOpen(true);
    setBump((b) => b + 1);
  };

  const focusThumb = (which: FeedbackRating | null) =>
    requestAnimationFrame(() => (which === "down" ? downRef : upRef).current?.focus());

  const cancel = () => {
    const was = rating;
    setOpen(false);
    setRating(null);
    reset();
    focusThumb(was);
  };

  const submit = () => {
    if (!rating) return;
    onSubmit?.({ rating, reasons: picked, comment: comment.trim() });
    setOpen(false);
    setSent(true);
    setMessage("Thanks, feedback sent");
    focusThumb(rating);
  };

  const undo = () => {
    const was = rating;
    setSent(false);
    setRating(null);
    reset();
    onUndo?.();
    setMessage("Feedback removed");
    focusThumb(was);
  };

  const toggle = (reason: string) =>
    setPicked((list) => (list.includes(reason) ? list.filter((r) => r !== reason) : [...list, reason]));

  const list = rating ? (reasons[rating] ?? []) : [];
  const panelOpen = open && rating !== null && !sent;

  return (
    <div
      role="group"
      aria-label="Rate this response"
      className={cn("@container w-full max-w-[460px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      <div className="flex min-h-8 items-center gap-0.5">
        {(["up", "down"] as const).map((kind) => {
          const selected = rating === kind;
          const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
          return (
            <button
              key={kind}
              ref={kind === "up" ? upRef : downRef}
              type="button"
              aria-pressed={selected}
              aria-label={kind === "up" ? "Good response" : "Bad response"}
              aria-expanded={selected ? panelOpen : undefined}
              aria-controls={selected ? panelId : undefined}
              onClick={() => choose(kind)}
              className={cn(
                "grid size-8 cursor-pointer place-items-center rounded-[8px] transition-colors",
                selected
                  ? "text-[color:var(--bjork-accent-ink)]"
                  : "text-[color:var(--bjork-text-faint)] hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                sent && !selected && "pointer-events-none opacity-40",
                FOCUS_RING,
                PRESS,
              )}
            >
              <motion.span
                key={selected ? `on-${bump}` : "off"}
                className="grid place-items-center"
                initial={reduce || !selected ? false : { rotate: kind === "up" ? -14 : 14, y: kind === "up" ? -1.5 : 1.5 }}
                animate={{ rotate: 0, y: 0 }}
                transition={springs.press}
              >
                <Icon
                  size={15}
                  strokeWidth={1.75}
                  fill={selected ? "currentColor" : "none"}
                  fillOpacity={selected ? 0.18 : 0}
                />
              </motion.span>
            </button>
          );
        })}

        <span
          className={cn(
            "ml-2 flex min-w-0 items-center gap-2 text-[13px] leading-5 text-[color:var(--bjork-text-muted)] transition-opacity duration-200",
            sent ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!sent || undefined}
          inert={!sent}
        >
          <span className="truncate">Thanks — feedback sent</span>
          <button
            type="button"
            onClick={undo}
            className={cn(
              "-my-1 h-7 shrink-0 cursor-pointer rounded-[6px] px-1.5 font-medium text-[color:var(--bjork-text)] underline decoration-[color:var(--bjork-border-strong)] underline-offset-[3px] transition-colors hover:decoration-[color:var(--bjork-text)]",
              FOCUS_RING,
            )}
          >
            Undo
          </button>
        </span>
      </div>

      <div
        id={panelId}
        aria-hidden={!panelOpen || undefined}
        inert={!panelOpen}
        className="grid"
        style={{
          gridTemplateRows: panelOpen ? "1fr" : "0fr",
          opacity: panelOpen ? 1 : 0,
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 220ms ${easeCss.drawer}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <form
            aria-label="Feedback details"
            className="mt-2 rounded-[12px] border border-[color:var(--bjork-border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
          >
            <p className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
              {rating ? PROMPT[rating] : ""}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {list.map((reason) => {
                const on = picked.includes(reason);
                return (
                  <button
                    key={reason}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(reason)}
                    className={cn(
                      "h-7 cursor-pointer rounded-full border px-2.5 text-[12px] font-medium leading-none transition-colors duration-150",
                      on
                        ? "border-[color:var(--bjork-accent-muted)] bg-[var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)]"
                        : "border-[color:var(--bjork-border)] text-[color:var(--bjork-text-muted)] hover:border-[color:var(--bjork-border-strong)] hover:text-[color:var(--bjork-text)]",
                      FOCUS_RING,
                      PRESS,
                    )}
                  >
                    {reason}
                  </button>
                );
              })}
            </div>
            {allowComment && (
              <>
                <label htmlFor={commentId} className="sr-only">
                  Comment (optional)
                </label>
                <textarea
                  id={commentId}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={2}
                  maxLength={600}
                  placeholder="Add a comment (optional)"
                  className={cn(
                    "mt-3 block min-h-[56px] w-full resize-none rounded-[9px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] px-2.5 py-2 text-[13px] leading-5 text-[color:var(--bjork-text)] transition-colors [field-sizing:content] placeholder:text-[color:var(--bjork-text-faint)] hover:border-[color:var(--bjork-border-strong)]",
                    FOCUS_RING,
                  )}
                />
              </>
            )}
            <div className="mt-3 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={cancel}
                className={cn(
                  "h-8 cursor-pointer rounded-[9px] px-3 text-[13px] font-medium text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={cn(
                  "h-8 cursor-pointer rounded-[9px] bg-[color:var(--bjork-accent)] px-3 text-[13px] font-medium text-[color:var(--bjork-accent-foreground)] transition-opacity hover:opacity-90",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>

      <LiveRegion message={message} />
    </div>
  );
}
