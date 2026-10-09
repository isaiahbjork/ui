"use client";

import { Fragment, useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  blockFrame,
  blockToneProps,
  CtaLink,
  Reveal,
  SectionHeader,
  useBlockReducedMotion,
  type BlockLink,
  type BlockTone,
} from "@/components/bjork-ui/blocks/marketing-kit";
import { cn } from "@/lib/utils";

export interface BentoSpan {
  label: string;
  /** Start offset, in the same unit as `total`. */
  start: number;
  duration: number;
  /** Marks the span as the slow one: accent bar and a duration tag. */
  slow?: boolean;
}

export type BentoVisual =
  | { type: "waterfall"; spans: BentoSpan[]; total: number; unit?: string }
  | { type: "replay"; markers: number[]; position: number; timecode: string; label: string }
  | { type: "alerts"; alerts: { title: string; meta: string }[] }
  | { type: "cost"; value: string; caption: string; bars: number[]; highlight?: number }
  | { type: "code"; filename: string; lines: string[] }
  | { type: "keys"; shortcuts: { keys: string[]; label: string }[] }
  | { type: "redact"; segments: (string | { redacted: string })[]; badge: string }
  | { type: "custom"; node: ReactNode };

export interface BentoFeature {
  id: string;
  title: string;
  description: string;
  visual: BentoVisual;
  /** Width on the six-column grid: sm is a third, md a half, lg two thirds, full the whole row. */
  size?: "sm" | "md" | "lg" | "full";
  /** Turns the whole card into a link. */
  href?: string;
}

export interface MarketingFeatureBentoProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  cta?: BlockLink;
  features: BentoFeature[];
  tone?: BlockTone;
  /** Play the in-view motion. Turn off for screenshots. */
  animate?: boolean;
  className?: string;
}

export const MARKETING_BENTO_SAMPLE: MarketingFeatureBentoProps = {
  eyebrow: "Platform",
  title: "Everything between the prompt and the answer.",
  description:
    "One trace per run, from the first token to the last tool call. Find the slow step, replay it, and fix it before the next deploy.",
  cta: { label: "Explore the platform", href: "#platform" },
  features: [
    {
      id: "traces",
      size: "lg",
      title: "Live traces, span by span",
      description: "Every model call, tool and retry lands on one timeline while the run is still going.",
      visual: {
        type: "waterfall",
        total: 10,
        unit: "s",
        spans: [
          { label: "read_request", start: 0, duration: 0.7 },
          { label: "lookup_order", start: 0.7, duration: 1.2 },
          { label: "search_policy", start: 1.9, duration: 1.6 },
          { label: "issue_refund", start: 3.5, duration: 4.6, slow: true },
          { label: "draft_reply", start: 8.1, duration: 1.2 },
          { label: "send_reply", start: 9.3, duration: 0.6 },
        ],
      },
    },
    {
      id: "replay",
      size: "sm",
      title: "Replay from any step",
      description: "Rewind a failed run to the step before it broke and run it again with a new prompt.",
      visual: { type: "replay", markers: [0, 0.08, 0.2, 0.36, 0.82, 0.94], position: 0.36, timecode: "00:03.5", label: "issue_refund" },
    },
    {
      id: "alerts",
      size: "sm",
      title: "Alerts that read like sentences",
      description: "Thresholds on any span, routed to the people who own it.",
      visual: {
        type: "alerts",
        alerts: [
          { title: "issue_refund p95 crossed 4s", meta: "support-agent · 2m ago" },
          { title: "Retry rate up 3x on lookup_order", meta: "support-agent · 18m ago" },
          { title: "Token spend 40% over budget", meta: "research-agent · 1h ago" },
        ],
      },
    },
    {
      id: "cost",
      size: "sm",
      title: "Cost per run, not per month",
      description: "Tokens and tool fees priced on every trace, so a costly prompt shows up the day it ships.",
      visual: {
        type: "cost",
        value: "$0.031",
        caption: "median cost per run",
        bars: [3, 5, 8, 12, 15, 13, 9, 6, 4, 3, 2, 5],
        highlight: 11,
      },
    },
    {
      id: "install",
      size: "sm",
      title: "Two lines to install",
      description: "Wraps the SDK you already use. OpenTelemetry in, OpenTelemetry out.",
      visual: {
        type: "code",
        filename: "agent.ts",
        // The quote is escaped so registry tooling does not read this sample line as a real import.
        lines: ["import { trace } from \u0022@tracewell/sdk\u0022;", "", 'trace.init({ project: "support" });'],
      },
    },
    {
      id: "keys",
      size: "md",
      title: "Built for the keyboard",
      description: "Jump between runs and steps without reaching for the mouse.",
      visual: {
        type: "keys",
        shortcuts: [
          { keys: ["⌘", "K"], label: "Jump to a run" },
          { keys: ["J"], label: "Next step" },
          { keys: ["K"], label: "Previous step" },
          { keys: ["R"], label: "Replay from here" },
        ],
      },
    },
    {
      id: "private",
      size: "md",
      title: "Private by default",
      description: "Emails, card numbers and keys are masked in the SDK, before anything leaves your servers.",
      visual: {
        type: "redact",
        badge: "3 fields masked",
        segments: [
          "Customer ",
          { redacted: "maya.okafor@" },
          " asked to refund the order paid with the card ending ",
          { redacted: "4242" },
          ", and to ship the replacement to ",
          { redacted: "18 Alder Row" },
          ".",
        ],
      },
    },
  ],
};

const SIZE_CLASS: Record<NonNullable<BentoFeature["size"]>, string> = {
  sm: "@2xl:col-span-1 @5xl:col-span-2",
  md: "@2xl:col-span-1 @5xl:col-span-3",
  lg: "@2xl:col-span-2 @5xl:col-span-4",
  full: "@2xl:col-span-2 @5xl:col-span-6",
};

/**
 * A feature section on a bento grid. Each card carries a small working illustration (trace waterfall,
 * replay scrubber, alert stack, cost histogram, install snippet, shortcuts, redaction) built from the
 * content you pass, so the grid explains the product instead of decorating it.
 */
export function MarketingFeatureBento({
  eyebrow,
  title,
  description,
  cta,
  features,
  tone = "auto",
  animate = true,
  className,
}: MarketingFeatureBentoProps) {
  const titleId = useId();
  const toneProps = blockToneProps(tone);

  return (
    <section
      aria-labelledby={titleId}
      {...toneProps}
      className={cn(
        "@container w-full bg-[var(--bjork-bg)] py-20 font-bjork-alpha text-[color:var(--bjork-text)] @3xl:py-28",
        toneProps.className,
        className,
      )}
    >
      <div className={blockFrame}>
        <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] @4xl:items-end @4xl:gap-16">
          <SectionHeader id={titleId} eyebrow={eyebrow} title={title} />
          <div className="flex flex-col items-start gap-6">
            {description ? (
              <p className="max-w-[46ch] text-pretty text-[16px] leading-7 text-[color:var(--bjork-text-medium)] @xl:text-[17px]">
                {description}
              </p>
            ) : null}
            {cta ? <CtaLink link={cta} variant="secondary" arrow /> : null}
          </div>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-3 @2xl:grid-cols-2 @3xl:mt-16 @5xl:grid-cols-6">
          {features.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} animate={animate} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index, animate }: { feature: BentoFeature; index: number; animate: boolean }) {
  const titleId = useId();
  const body = (
    <>
      <div aria-hidden className="relative flex min-h-[190px] flex-1 items-center justify-center overflow-hidden px-5 pt-5 @xl:min-h-[210px]">
        <Visual visual={feature.visual} animate={animate} />
      </div>
      <div className="px-6 pb-6 pt-5">
        <h3 id={titleId} className="text-[16px] font-semibold tracking-[-0.02em] text-[color:var(--bjork-text)]">
          {feature.title}
        </h3>
        <p className="mt-1.5 max-w-[48ch] text-[14px] leading-6 text-[color:var(--bjork-text-muted)]">
          {feature.description}
        </p>
      </div>
    </>
  );

  const shell =
    "group/card relative flex h-full flex-col overflow-hidden rounded-[22px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-panel)] transition-colors duration-200";

  const content = feature.href ? (
    <a
      href={feature.href}
      aria-labelledby={titleId}
      className={cn(
        shell,
        "hover:border-[color:var(--bjork-border-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]",
      )}
    >
      {body}
    </a>
  ) : (
    <article aria-labelledby={titleId} className={shell}>
      {body}
    </article>
  );

  const size = SIZE_CLASS[feature.size ?? "sm"];
  if (!animate) return <li className={size}>{content}</li>;
  return (
    <Reveal as="li" delay={Math.min(index, 4) * 0.05} className={size}>
      {content}
    </Reveal>
  );
}

function Visual({ visual, animate }: { visual: BentoVisual; animate: boolean }) {
  switch (visual.type) {
    case "waterfall":
      return <Waterfall {...visual} animate={animate} />;
    case "replay":
      return <Replay {...visual} />;
    case "alerts":
      return <Alerts alerts={visual.alerts} />;
    case "cost":
      return <Cost {...visual} animate={animate} />;
    case "code":
      return <Code filename={visual.filename} lines={visual.lines} />;
    case "keys":
      return <Keys shortcuts={visual.shortcuts} />;
    case "redact":
      return <Redact segments={visual.segments} badge={visual.badge} />;
    case "custom":
      return <>{visual.node}</>;
  }
}

/* Visuals. All decorative (the card hides them from assistive tech); the card text carries the meaning. */

function useGrow(animate: boolean) {
  const reduce = useBlockReducedMotion();
  return (delay: number) =>
    animate && !reduce
      ? {
          initial: { scaleX: 0 },
          whileInView: { scaleX: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: { type: "spring" as const, stiffness: 180, damping: 26, mass: 0.9, delay },
        }
      : {};
}

function Waterfall({ spans, total, unit = "s", animate }: { spans: BentoSpan[]; total: number; unit?: string; animate: boolean }) {
  const grow = useGrow(animate);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="w-full max-w-[640px] self-stretch rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] p-4">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 @md:grid-cols-[116px_minmax(0,1fr)]">
        <span />
        <div className="relative mb-2 h-4 font-mono text-[9.5px] text-[color:var(--bjork-text-soft)]">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute top-0 -translate-x-1/2 tabular-nums first:translate-x-0 last:-translate-x-full"
              style={{ left: `${tick * 100}%` }}
            >
              {(tick * total).toFixed(tick * total % 1 ? 1 : 0)}
              {unit}
            </span>
          ))}
        </div>
        {spans.map((span, index) => (
          <Fragment key={span.label}>
            <span
              className={cn(
                "truncate py-[5px] font-mono text-[10.5px] leading-4",
                span.slow ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)]",
              )}
            >
              {span.label}
            </span>
            <div className="relative py-[5px]">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: "linear-gradient(to right, var(--bjork-border) 1px, transparent 1px)",
                  backgroundSize: "25% 100%",
                }}
              />
              <div className="relative h-4" style={{ marginLeft: `${(span.start / total) * 100}%`, width: `${(span.duration / total) * 100}%` }}>
                <motion.div
                  {...grow(0.1 + index * 0.08)}
                  className={cn(
                    "h-full origin-left rounded-[4px]",
                    span.slow
                      ? "bg-[color:var(--bjork-accent)] shadow-[0_0_0_3px_var(--bjork-accent-soft)]"
                      : "bg-[color:var(--bjork-text-faint)] transition-colors duration-200 group-hover/card:bg-[color:var(--bjork-text-soft)]",
                  )}
                />
                {span.slow ? (
                  <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[var(--bjork-accent-soft)] px-1.5 py-px font-mono text-[9.5px] tabular-nums text-[color:var(--bjork-accent)]">
                    {span.duration}
                    {unit}
                  </span>
                ) : null}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Replay({ markers, position, timecode, label }: { markers: number[]; position: number; timecode: string; label: string }) {
  return (
    <div className="w-full max-w-[300px]">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-full border border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] py-1 pl-1 pr-2.5 font-mono text-[10.5px] text-[color:var(--bjork-text-medium)]">
          <span className="grid size-5 place-items-center rounded-full bg-[color:var(--bjork-text)] text-[color:var(--bjork-bg)]">
            <svg viewBox="0 0 10 10" className="ml-px size-2.5">
              <path d="M2.5 1.5v7l6-3.5z" fill="currentColor" />
            </svg>
          </span>
          Replay
        </span>
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-muted)]">{timecode}</span>
      </div>
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[color:var(--bjork-border-strong)]" />
        <div
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[color:var(--bjork-accent)]"
          style={{ width: `${position * 100}%` }}
        />
        {markers.map((marker) => (
          <span
            key={marker}
            className={cn(
              "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--bjork-surface)]",
              marker <= position ? "bg-[color:var(--bjork-accent)]" : "bg-[color:var(--bjork-text-faint)]",
            )}
            style={{ left: `${marker * 100}%` }}
          />
        ))}
        <div
          className="absolute top-0 h-full transition-transform duration-500 ease-[cubic-bezier(0.77,0,0.175,1)] group-hover/card:translate-x-3 motion-reduce:transition-none"
          style={{ left: `${position * 100}%` }}
        >
          <span className="absolute left-0 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-[color:var(--bjork-text)]" />
          <span className="absolute -top-6 left-0 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-[color:var(--bjork-text)] px-1.5 py-0.5 font-mono text-[9.5px] text-[color:var(--bjork-bg)]">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

function Alerts({ alerts }: { alerts: { title: string; meta: string }[] }) {
  const stack = alerts.slice(0, 3);
  return (
    <div className="relative h-[104px] w-full max-w-[300px]">
      {stack.map((alert, index) => {
        const depth = index;
        return (
          <div
            key={alert.title}
            className="absolute inset-x-0 top-0 rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] p-3 shadow-[var(--bjork-shadow-menu)] transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] [transform:translateY(calc(var(--depth)*14px))_scale(calc(1-var(--depth)*0.06))] group-hover/card:[transform:translateY(calc(var(--depth)*40px))_scale(calc(1-var(--depth)*0.03))] motion-reduce:transition-none"
            style={{
              zIndex: stack.length - depth,
              opacity: 1 - depth * 0.2,
              background: depth === 0 ? undefined : "var(--bjork-surface-active)",
              ["--depth" as string]: depth,
            }}
          >
            <div
              className={cn(
                "flex items-start gap-2.5",
                depth > 0 &&
                  "opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 motion-reduce:transition-none",
              )}
            >
              <span
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  depth === 0 ? "bg-[color:var(--bjork-accent)]" : "bg-[color:var(--bjork-text-faint)]",
                )}
              />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium text-[color:var(--bjork-text)]">{alert.title}</span>
                <span className="block truncate font-mono text-[10px] text-[color:var(--bjork-text-soft)]">{alert.meta}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cost({ value, caption, bars, highlight, animate }: { value: string; caption: string; bars: number[]; highlight?: number; animate: boolean }) {
  const reduce = useBlockReducedMotion();
  const max = Math.max(...bars);
  return (
    <div className="flex w-full max-w-[300px] flex-col gap-4">
      <div>
        <p className="font-bjork-display text-[40px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[color:var(--bjork-text)]">
          {value}
        </p>
        <p className="mt-1.5 font-mono text-[10.5px] text-[color:var(--bjork-text-soft)]">{caption}</p>
      </div>
      <div className="flex h-14 items-end gap-[3px]">
        {bars.map((bar, index) => (
          <motion.span
            key={index}
            initial={animate && !reduce ? { scaleY: 0 } : false}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.1 + index * 0.03 }}
            className={cn(
              "flex-1 origin-bottom rounded-t-[3px]",
              index === highlight ? "bg-[color:var(--bjork-accent)]" : "bg-[color:var(--bjork-border-strong)]",
            )}
            style={{ height: `${(bar / max) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const CODE_TOKEN = /("[^"]*"|\b(?:import|from|const|await|export)\b)/g;

function Code({ filename, lines }: { filename: string; lines: string[] }) {
  return (
    <div className="w-full max-w-[320px] overflow-hidden rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-panel)]">
      <div className="flex items-center justify-between border-b border-[color:var(--bjork-border)] px-3 py-2">
        <span className="font-mono text-[10px] text-[color:var(--bjork-text-soft)]">{filename}</span>
        <span className="flex gap-1">
          <span className="size-1.5 rounded-full bg-[color:var(--bjork-border-strong)]" />
          <span className="size-1.5 rounded-full bg-[color:var(--bjork-border-strong)]" />
        </span>
      </div>
      <pre className="overflow-hidden px-3 py-3 font-mono text-[11px] leading-[1.7] text-[color:var(--bjork-text-medium)]">
        {lines.map((line, index) => (
          <div key={index} className="flex gap-3">
            <span className="w-3 select-none text-right tabular-nums text-[color:var(--bjork-text-faint)]">{index + 1}</span>
            <span className="whitespace-pre">
              {line.split(CODE_TOKEN).map((part, partIndex) =>
                part.startsWith('"') ? (
                  <span key={partIndex} className="text-[color:var(--bjork-accent)]">
                    {part}
                  </span>
                ) : /^(import|from|const|await|export)$/.test(part) ? (
                  <span key={partIndex} className="text-[color:var(--bjork-text-soft)]">
                    {part}
                  </span>
                ) : (
                  <span key={partIndex}>{part}</span>
                ),
              )}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

function Keys({ shortcuts }: { shortcuts: { keys: string[]; label: string }[] }) {
  return (
    <div className="grid w-full max-w-[420px] grid-cols-1 gap-2 @5xl:grid-cols-2">
      {shortcuts.map((shortcut, index) => (
        <div
          key={shortcut.label}
          className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] px-3 py-2.5"
        >
          <span className="truncate text-[12.5px] text-[color:var(--bjork-text-medium)]">{shortcut.label}</span>
          <span className="flex gap-1">
            {shortcut.keys.map((key) => (
              <kbd
                key={key}
                className={cn(
                  "grid h-6 min-w-6 place-items-center rounded-[6px] border border-b-2 border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] px-1.5 font-mono text-[11px] text-[color:var(--bjork-text)] transition-transform duration-150 motion-reduce:transition-none",
                  index === 0 && "group-hover/card:translate-y-px group-hover/card:border-b",
                )}
              >
                {key}
              </kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Redact({ segments, badge }: { segments: (string | { redacted: string })[]; badge: string }) {
  return (
    <div className="w-full max-w-[440px] rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--bjork-text-soft)]">span input</span>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--bjork-accent-soft)] px-2 py-0.5 font-mono text-[10px] text-[color:var(--bjork-accent)]">
          <svg viewBox="0 0 12 12" className="size-3">
            <rect x="2.5" y="5.5" width="7" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          {badge}
        </span>
      </div>
      <p className="text-[13px] leading-[1.9] text-[color:var(--bjork-text-medium)]">
        {segments.map((segment, index) =>
          typeof segment === "string" ? (
            <span key={index}>{segment}</span>
          ) : (
            <span
              key={index}
              className="relative mx-px inline-block rounded-[4px] align-middle leading-none"
            >
              <span className="invisible px-1 font-mono text-[12px]">{segment.redacted}</span>
              <span
                className="absolute inset-0 rounded-[4px] bg-[color:var(--bjork-text)] opacity-85"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--bjork-bg) 18%, transparent) 4px 5px)",
                }}
              />
            </span>
          ),
        )}
      </p>
    </div>
  );
}
