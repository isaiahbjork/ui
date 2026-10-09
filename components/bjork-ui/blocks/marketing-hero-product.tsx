"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { AgentTrace, type AgentStep } from "@/components/bjork-ui/ai/agent-trace";
import {
  blockFrame,
  blockToneProps,
  CtaLink,
  focusRing,
  SampleMark,
  useBlockReducedMotion,
  type BlockLink,
  type BlockTone,
} from "@/components/bjork-ui/blocks/marketing-kit";
import { cn } from "@/lib/utils";

export type HeroRunStatus = "ok" | "slow" | "failed" | "live";

export interface HeroRun {
  id: string;
  label: string;
  /** Short text on the right, such as "9.9s". */
  meta: string;
  status: HeroRunStatus;
}

export interface HeroScriptStep {
  id: string;
  kind: string;
  label: string;
  /** How long the step runs before it finishes. */
  seconds: number;
  detail?: string;
  /** Finish this step as failed. */
  fails?: boolean;
}

export interface HeroMetric {
  label: string;
  value: string;
  /** Change against the previous period, such as "-18%". */
  delta?: string;
  /** Whether the delta is good news. Colours it green or red. */
  deltaTone?: "good" | "bad";
}

export interface HeroProductShot {
  /** Breadcrumb in the window title bar. */
  path: string[];
  runs: HeroRun[];
  /** Index of the selected run in `runs`. */
  activeRun?: number;
  metrics: HeroMetric[];
  /** Points for the latency sparkline, any scale. */
  spark?: number[];
  /** Fixed steps for the trace. Wins over `script`. */
  steps?: AgentStep[];
  /** A run that plays through on a loop. Without `steps` or `script` the trace plays its own demo. */
  script?: HeroScriptStep[];
  traceTitle?: string;
  /** Frozen clock for screenshots. */
  now?: number;
}

export interface MarketingHeroProductProps {
  brand?: { name: string; href: string; logo?: ReactNode };
  /** Header links. Pass an empty array to hide the header. */
  nav?: BlockLink[];
  signIn?: BlockLink;
  /** Small button at the right of the header. Defaults to the primary call to action. */
  headerCta?: BlockLink;
  announcement?: { tag: string; label: string; href: string };
  title: ReactNode;
  description: ReactNode;
  primaryCta: BlockLink;
  secondaryCta?: BlockLink;
  /** Short reassurance notes under the buttons. */
  notes?: string[];
  /** The built-in product window. Ignored when `media` is set. */
  shot?: HeroProductShot;
  /** Replace the built-in product window with your own screenshot or video. */
  media?: ReactNode;
  tone?: BlockTone;
  /** Heading level of the title. Use "h2" when the hero is not the first section. */
  headingLevel?: "h1" | "h2";
  /** Play the entrance motion. Turn off for screenshots. */
  animate?: boolean;
  className?: string;
}

export const MARKETING_HERO_SAMPLE: MarketingHeroProductProps = {
  brand: { name: "Tracewell", href: "#" },
  nav: [
    { label: "Product", href: "#product" },
    { label: "Docs", href: "#docs" },
    { label: "Pricing", href: "#pricing" },
    { label: "Changelog", href: "#changelog" },
  ],
  signIn: { label: "Sign in", href: "#sign-in" },
  headerCta: { label: "Get started", href: "#start" },
  announcement: { tag: "New", label: "Replay any run from its trace", href: "#replay" },
  title: (
    <>
      See every step
      <br className="hidden @xl:block" /> your agents take.
    </>
  ),
  description:
    "Tracewell records each tool call, retry and handoff as a live trace, so you find the slow step before your users do.",
  primaryCta: { label: "Start tracing free", href: "#start" },
  secondaryCta: { label: "Book a walkthrough", href: "#demo" },
  notes: ["No card required", "SOC 2 Type II", "Two lines to install"],
  shot: {
    path: ["northbay", "support-agent", "run_8f2c41"],
    activeRun: 0,
    runs: [
      { id: "run_8f2c41", label: "Refund request #4471", meta: "live", status: "live" },
      { id: "run_8f2b07", label: "Plan downgrade", meta: "4.1s", status: "ok" },
      { id: "run_8f2a93", label: "Invoice lookup", meta: "11.8s", status: "slow" },
      { id: "run_8f2a10", label: "Address change", meta: "2.6s", status: "ok" },
      { id: "run_8f29c4", label: "Warranty claim", meta: "3.2s", status: "failed" },
      { id: "run_8f2911", label: "Order status", meta: "1.9s", status: "ok" },
    ],
    metrics: [
      { label: "p95 latency", value: "2.4s", delta: "-18%", deltaTone: "good" },
      { label: "Tokens per run", value: "18.2k", delta: "+4%", deltaTone: "bad" },
      { label: "Cost per run", value: "$0.031", delta: "-9%", deltaTone: "good" },
    ],
    spark: [5.1, 4.6, 4.9, 4.2, 3.8, 4.1, 3.4, 3.1, 3.3, 2.8, 2.6, 2.9, 2.4, 2.5, 2.4],
    traceTitle: "Refund request #4471",
    script: [
      { id: "read", kind: "think", label: "Read refund request", seconds: 0.7 },
      { id: "order", kind: "tool", label: "Look up order #4471", seconds: 1.2 },
      {
        id: "policy",
        kind: "search",
        label: 'Search policy: "damaged on arrival"',
        seconds: 1.6,
        detail: "2 matches: Returns policy section 4.2, Carrier claims playbook",
      },
      { id: "refund", kind: "tool", label: "Issue partial refund, $38.00", seconds: 4.6 },
      { id: "reply", kind: "think", label: "Draft reply to customer", seconds: 1.4 },
      { id: "send", kind: "tool", label: "Send reply and close ticket", seconds: 0.8 },
    ],
  },
};

const RUN_DOT: Record<HeroRunStatus, string> = {
  ok: "bg-[color:var(--bjork-text-faint)]",
  slow: "bg-[#f2b544]",
  failed: "bg-[#ff5c4d]",
  live: "bg-[color:var(--bjork-accent)]",
};

const RUN_WORD: Record<HeroRunStatus, string> = {
  ok: "finished",
  slow: "slow",
  failed: "failed",
  live: "running",
};

/**
 * A landing-page hero: header, announcement, headline and calls to action over a product window that
 * plays a live agent trace. The layout reads its own width, so it works full-bleed or inside a column.
 */
export function MarketingHeroProduct({
  brand = MARKETING_HERO_SAMPLE.brand,
  nav = MARKETING_HERO_SAMPLE.nav,
  signIn,
  headerCta,
  announcement,
  title,
  description,
  primaryCta,
  secondaryCta,
  notes,
  shot,
  media,
  tone = "auto",
  headingLevel = "h1",
  animate = true,
  className,
}: MarketingHeroProductProps) {
  const reduce = useBlockReducedMotion();
  const titleId = useId();
  const Heading = headingLevel;
  const toneProps = blockToneProps(tone);
  const play = animate && !reduce;

  const enter = (delay: number) =>
    animate
      ? {
          initial: { opacity: 0, y: play ? 16 : 0 },
          animate: { opacity: 1, y: 0 },
          transition: {
            opacity: { duration: reduce ? 0.2 : 0.6, ease: [0.23, 1, 0.32, 1] as const, delay: reduce ? 0 : delay },
            y: { type: "spring" as const, stiffness: 240, damping: 30, mass: 0.9, delay },
          },
        }
      : {};

  return (
    <section
      aria-labelledby={titleId}
      {...toneProps}
      className={cn(
        "@container relative isolate w-full overflow-hidden bg-[var(--bjork-bg)] font-bjork-alpha text-[color:var(--bjork-text)]",
        toneProps.className,
        className,
      )}
    >
      <HeroBackdrop />

      {brand && nav && nav.length > 0 ? (
        <HeroHeader brand={brand} nav={nav} signIn={signIn} cta={headerCta ?? primaryCta} />
      ) : null}

      <div className={cn(blockFrame, "relative pb-0 pt-14 @3xl:pt-20 @5xl:pt-24")}>
        <div className="flex flex-col items-center text-center">
          {announcement ? (
            <motion.div {...enter(0)}>
              <a
                href={announcement.href}
                className={cn(
                  "group/pill inline-flex max-w-full items-center gap-2.5 rounded-full border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] py-1 pl-1 pr-3 text-[13px] text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-soft)] transition-colors duration-150 hover:border-[color:var(--bjork-border-strong)] hover:text-[color:var(--bjork-text)]",
                  focusRing,
                )}
              >
                <span className="rounded-full bg-[var(--bjork-accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--bjork-accent)]">
                  {announcement.tag}
                </span>
                <span className="truncate">{announcement.label}</span>
                <ArrowRight
                  aria-hidden
                  className="size-3.5 shrink-0 transition-transform duration-200 ease-out group-hover/pill:translate-x-0.5 motion-reduce:transition-none"
                />
              </a>
            </motion.div>
          ) : null}

          <motion.div {...enter(0.06)}>
            <Heading
              id={titleId}
              className="mt-7 text-balance font-bjork-display text-[42px] font-semibold leading-[0.98] tracking-[-0.045em] text-[color:var(--bjork-text)] @xl:text-[60px] @4xl:text-[76px]"
            >
              {title}
            </Heading>
          </motion.div>

          <motion.p
            {...enter(0.12)}
            className="mt-6 max-w-[46ch] text-pretty text-[16px] leading-7 text-[color:var(--bjork-text-medium)] @xl:text-[18px] @xl:leading-8"
          >
            {description}
          </motion.p>

          <motion.div
            {...enter(0.18)}
            className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 @md:w-auto @md:flex-row @md:items-center"
          >
            <CtaLink link={primaryCta} arrow />
            {secondaryCta ? <CtaLink link={secondaryCta} variant="secondary" /> : null}
          </motion.div>

          {notes && notes.length > 0 ? (
            <motion.ul
              {...enter(0.22)}
              className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-[color:var(--bjork-text-muted)]"
            >
              {notes.map((note) => (
                <li key={note} className="flex items-center gap-2">
                  <svg viewBox="0 0 12 12" aria-hidden className="size-3 text-[color:var(--bjork-accent)]">
                    <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {note}
                </li>
              ))}
            </motion.ul>
          ) : null}
        </div>

        <motion.div
          initial={animate ? { opacity: 0, y: play ? 40 : 0, rotateX: play ? 10 : 0 } : false}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{
            opacity: { duration: reduce ? 0.2 : 0.8, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : 0.28 },
            y: { type: "spring", stiffness: 120, damping: 24, mass: 1.1, delay: 0.28 },
            rotateX: { type: "spring", stiffness: 120, damping: 24, mass: 1.1, delay: 0.28 },
          }}
          style={{ transformPerspective: 1600, transformOrigin: "50% 0%" }}
          className="relative mt-14 @3xl:mt-20"
        >
          {media ?? (shot ? <ProductWindow shot={shot} tone={tone} /> : null)}
        </motion.div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div
        className="absolute inset-x-0 top-0 h-[720px] opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--bjork-border-muted) 1px, transparent 1px), linear-gradient(to bottom, var(--bjork-border-muted) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          backgroundPosition: "center top",
          maskImage: "radial-gradient(ellipse 60% 70% at 50% 0%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 50% 0%, #000 30%, transparent 100%)",
        }}
      />
      <div
        className="absolute left-1/2 top-[560px] h-[420px] w-[min(1100px,120%)] -translate-x-1/2 rounded-[50%] opacity-70 blur-[90px]"
        style={{ background: "radial-gradient(closest-side, var(--bjork-accent-soft), transparent)" }}
      />
    </div>
  );
}

function HeroHeader({
  brand,
  nav,
  signIn,
  cta,
}: {
  brand: NonNullable<MarketingHeroProductProps["brand"]>;
  nav: BlockLink[];
  signIn?: BlockLink;
  cta: BlockLink;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reduce = useBlockReducedMotion();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <header className="relative z-20">
      <div className={cn(blockFrame, "flex h-16 items-center justify-between gap-6")}>
        <a
          href={brand.href}
          className={cn("flex items-center gap-2.5 rounded-[8px] text-[15px] font-semibold tracking-[-0.02em]", focusRing)}
        >
          {brand.logo ?? <SampleMark />}
          {brand.name}
        </a>

        <nav aria-label="Primary" className="hidden @3xl:block">
          <ul className="flex items-center gap-1">
            {nav.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={link.onClick}
                  className={cn(
                    "rounded-[9px] px-3 py-2 text-[14px] text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                    focusRing,
                  )}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {signIn ? (
            <a
              href={signIn.href}
              onClick={signIn.onClick}
              className={cn(
                "hidden rounded-[9px] px-3 py-2 text-[14px] text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:text-[color:var(--bjork-text)] @md:inline-flex",
                focusRing,
              )}
            >
              {signIn.label}
            </a>
          ) : null}
          <CtaLink link={cta} variant="secondary" className="hidden h-9 px-3.5 text-[13px] @md:inline-flex" />
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "grid size-9 place-items-center rounded-[10px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] text-[color:var(--bjork-text-medium)] transition-transform duration-150 active:scale-[0.95] motion-reduce:transition-none @3xl:hidden",
              focusRing,
            )}
          >
            {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.nav
            key="menu"
            id={menuId}
            aria-label="Primary"
            initial={{ opacity: 0, y: reduce ? 0 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-x-3 top-[60px] rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-menu)] p-2 shadow-[var(--bjork-shadow-menu)] backdrop-blur-md @3xl:hidden"
          >
            <ul className="flex flex-col">
              {[...nav, ...(signIn ? [signIn] : [])].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={(event) => {
                      link.onClick?.(event);
                      close(false);
                    }}
                    className={cn(
                      "flex h-11 items-center rounded-[10px] px-3 text-[15px] text-[color:var(--bjork-text-strong)] hover:bg-[var(--bjork-surface-hover)]",
                      focusRing,
                    )}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

const SCRIPT_HOLD_MS = 3200;

/** Plays a script step by step and starts over after a pause. Reduced motion shows the finished run. */
function useScriptedSteps(script: HeroScriptStep[] | undefined, enabled: boolean) {
  const reduce = useBlockReducedMotion();
  const [stage, setStage] = useState(0);
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);
  const [cycle, setCycle] = useState(0);
  const length = script?.length ?? 0;
  const playing = enabled && !reduce && length > 0;

  useEffect(() => {
    if (!playing || !script) return;
    const delay = stage < length ? script[stage].seconds * 1000 : SCRIPT_HOLD_MS;
    const id = window.setTimeout(() => {
      if (stage < length) {
        setStage(stage + 1);
        setStartedAt(Date.now());
      } else {
        setStage(0);
        setStartedAt(Date.now());
        setCycle((value) => value + 1);
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [playing, script, stage, length]);

  const at = playing ? stage : length;
  const steps: AgentStep[] | undefined = script?.map((step, index) => {
    const base = { id: step.id, kind: step.kind, label: step.label, detail: step.detail };
    if (index < at) {
      return { ...base, status: step.fails ? "error" : "done", durationMs: Math.round(step.seconds * 1000) };
    }
    if (index === at) return { ...base, status: "active", startedAt };
    return { ...base, status: "pending" };
  });

  return { steps, cycle };
}

function ProductWindow({ shot, tone }: { shot: HeroProductShot; tone: BlockTone }) {
  const active = shot.runs[shot.activeRun ?? 0];
  const scripted = useScriptedSteps(shot.script, !shot.steps);
  const steps = shot.steps ?? scripted.steps;
  return (
    <figure className="@container relative mx-auto max-w-[1120px]">
      <div className="relative overflow-hidden rounded-[18px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.35),var(--bjork-shadow-panel)] @2xl:rounded-[22px]">
        <div className="flex h-11 items-center gap-3 border-b border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] px-4">
          <div aria-hidden className="flex gap-1.5">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-2.5 rounded-full bg-[color:var(--bjork-border-strong)]" />
            ))}
          </div>
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--bjork-text-muted)]">
            {shot.path.map((part, index) => (
              <span key={part}>
                {index > 0 ? <span className="px-1.5 text-[color:var(--bjork-text-faint)]">/</span> : null}
                <span className={index === shot.path.length - 1 ? "text-[color:var(--bjork-text-medium)]" : undefined}>
                  {part}
                </span>
              </span>
            ))}
          </p>
          {active?.status === "live" ? (
            <span className="flex items-center gap-1.5 rounded-full border border-[color:var(--bjork-accent-muted)] bg-[var(--bjork-accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--bjork-accent)]">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--bjork-accent)] opacity-60 motion-reduce:hidden" />
                <span className="relative size-1.5 rounded-full bg-[color:var(--bjork-accent)]" />
              </span>
              Live
            </span>
          ) : null}
        </div>

        <div className="grid min-h-[420px] grid-cols-1 @2xl:grid-cols-[200px_minmax(0,1fr)] @5xl:grid-cols-[220px_minmax(0,1fr)_240px]">
          <aside aria-label="Recent runs" className="hidden border-r border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] p-3 @2xl:block">
            <p className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--bjork-text-soft)]">
              Runs · last hour
            </p>
            <ul className="flex flex-col gap-0.5">
              {shot.runs.map((run, index) => {
                const selected = index === (shot.activeRun ?? 0);
                return (
                  <li
                    key={run.id}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[9px] px-2 py-2",
                      selected ? "bg-[var(--bjork-surface-active)]" : undefined,
                    )}
                  >
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", RUN_DOT[run.status])} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[12.5px] leading-4",
                          selected ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-medium)]",
                        )}
                      >
                        {run.label}
                      </span>
                      <span className="block truncate font-mono text-[10px] leading-4 text-[color:var(--bjork-text-soft)]">
                        {run.id}
                      </span>
                    </span>
                    <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--bjork-text-soft)]">
                      <span className="sr-only">{RUN_WORD[run.status]}, </span>
                      {run.meta}
                    </span>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0 px-5 py-6 @2xl:px-8 @2xl:py-7">
            <AgentTrace
              key={scripted.cycle}
              steps={steps ?? []}
              attract={!steps}
              title={shot.traceTitle ?? "Trace"}
              autoCollapse={false}
              now={shot.now}
              tone={tone === "auto" ? undefined : tone}
              className="max-w-none"
            />
          </div>

          <aside
            aria-label="Run health"
            className="border-t border-[color:var(--bjork-border)] p-5 @2xl:col-span-2 @5xl:col-span-1 @5xl:border-l @5xl:border-t-0"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--bjork-text-soft)]">
              Support agent · 7 days
            </p>
            {shot.spark ? <Sparkline points={shot.spark} /> : null}
            <dl className="mt-1 grid grid-cols-3 gap-4 @5xl:grid-cols-1 @5xl:gap-0">
              {shot.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="flex flex-col gap-1 @5xl:flex-row @5xl:items-baseline @5xl:justify-between @5xl:border-b @5xl:border-[color:var(--bjork-border-muted)] @5xl:py-3 @5xl:last:border-b-0"
                >
                  <dt className="text-[12px] text-[color:var(--bjork-text-muted)]">{metric.label}</dt>
                  <dd className="flex items-baseline gap-2">
                    <span className="text-[17px] font-semibold tabular-nums tracking-[-0.02em] @5xl:text-[15px]">
                      {metric.value}
                    </span>
                    {metric.delta ? (
                      <span
                        className={cn(
                          "font-mono text-[10.5px] tabular-nums",
                          metric.deltaTone === "bad" ? "text-[#d9634f]" : "text-[#3fa774]",
                        )}
                      >
                        {metric.delta}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--bjork-bg)] to-transparent"
      />
    </figure>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const gradientId = useId();
  const width = 200;
  const height = 56;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const coords = points.map((value, index) => [
    (index / (points.length - 1)) * width,
    6 + (1 - (value - min) / span) * (height - 12),
  ]);
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className="mt-3 h-14 w-full overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--bjork-accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--bjork-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="var(--bjork-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
