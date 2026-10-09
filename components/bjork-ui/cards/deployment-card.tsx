"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, ChevronDown, GitBranch, RotateCw, X } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import {
  CardButton,
  CardFrame,
  Pill,
  focusRing,
  useCardTheme,
  useReducedMotionSafe,
  type CardTheme,
  type PillTone,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export type DeployStage = "queued" | "build" | "checks" | "deploy";
export type DeployStatus = "queued" | "building" | "ready" | "error" | "canceled";

export interface DeployLogLine {
  /** Seconds since the deployment started. */
  t: number;
  text: string;
  level?: "info" | "warn" | "error";
  stage: DeployStage;
}

export interface DeployCommit {
  sha: string;
  message: string;
  branch: string;
  author: string;
}

export interface DeploymentCardProps {
  project?: string;
  environment?: "Production" | "Preview";
  commit?: DeployCommit;
  url?: string;
  /** Controlled status. Pair with `logs` and `stage`. Omit both to run the built-in simulation. */
  status?: DeployStatus;
  stage?: DeployStage;
  logs?: DeployLogLine[];
  /** Seconds elapsed, for the controlled mode. */
  elapsed?: number;
  /** Simulation outcome. Default "ready". */
  simulateOutcome?: "ready" | "error";
  /** Start the simulation finished, e.g. for a static preview. */
  simulateFinished?: boolean;
  onCancel?: () => void;
  onRedeploy?: () => void;
  defaultLogsOpen?: boolean;
  theme?: CardTheme;
  className?: string;
}

export const DEPLOYMENT_SAMPLE = {
  project: "atlas-web",
  environment: "Production" as const,
  url: "atlas-web.fieldwork.app",
  commit: {
    sha: "a41f9c2",
    message: "Cache route segments and trim the hero bundle",
    branch: "main",
    author: "Rowan Ellis",
  } satisfies DeployCommit,
};

const STAGES: { id: DeployStage; label: string }[] = [
  { id: "queued", label: "Queue" },
  { id: "build", label: "Build" },
  { id: "checks", label: "Checks" },
  { id: "deploy", label: "Deploy" },
];

const SCRIPT: DeployLogLine[] = [
  { t: 0.0, stage: "queued", text: "Queued in iad1 behind 1 build" },
  { t: 1.1, stage: "queued", text: "Assigned builder 8 vCPU / 16 GB" },
  { t: 1.6, stage: "build", text: "Cloning github.com/fieldwork/atlas-web (main @ a41f9c2)" },
  { t: 2.4, stage: "build", text: "Restored build cache from previous deployment (412 MB)" },
  { t: 3.2, stage: "build", text: "Running \"pnpm install --frozen-lockfile\"" },
  { t: 4.6, stage: "build", text: "Packages: +1,284 resolved, 0 downloaded" },
  { t: 5.3, stage: "build", text: "Running \"pnpm build\"" },
  { t: 6.4, stage: "build", text: "Compiled 214 modules in 3.8s" },
  { t: 7.2, stage: "build", level: "warn", text: "Warning: /pricing exceeds the 250 kB first-load budget (268 kB)" },
  { t: 8.1, stage: "build", text: "Generated 46 static pages" },
  { t: 8.8, stage: "checks", text: "Running checks: types, lint, e2e smoke (3)" },
  { t: 10.2, stage: "checks", text: "✓ types  ✓ lint" },
  { t: 11.4, stage: "checks", text: "✓ e2e smoke — 18 passed" },
  { t: 12.0, stage: "deploy", text: "Uploading 1,932 files (38.4 MB)" },
  { t: 13.1, stage: "deploy", text: "Assigning domains" },
  { t: 13.6, stage: "deploy", text: "Ready — atlas-web.fieldwork.app" },
];

const FAIL_AT = 11.4;
const FAIL_LINES: DeployLogLine[] = [
  { t: 11.0, stage: "checks", level: "error", text: "✗ e2e smoke — checkout.spec.ts › applies a promo code" },
  { t: 11.2, stage: "checks", level: "error", text: "  Expected total $42.00, received $46.20" },
  { t: 11.4, stage: "checks", level: "error", text: "Error: Command \"pnpm test:smoke\" exited with 1" },
];
const END_AT = SCRIPT[SCRIPT.length - 1].t;

function mmss(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const STATUS: Record<DeployStatus, { label: string; tone: PillTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  building: { label: "Building", tone: "accent" },
  ready: { label: "Ready", tone: "success" },
  error: { label: "Failed", tone: "error" },
  canceled: { label: "Canceled", tone: "neutral" },
};

/**
 * A deployment as it happens: commit, a four-stage pipeline with a live timer, streaming logs that
 * follow the tail until you scroll away, and the right action for every outcome.
 */
export function DeploymentCard({
  project = DEPLOYMENT_SAMPLE.project,
  environment = DEPLOYMENT_SAMPLE.environment,
  commit = DEPLOYMENT_SAMPLE.commit,
  url = DEPLOYMENT_SAMPLE.url,
  status: statusProp,
  stage: stageProp,
  logs: logsProp,
  elapsed: elapsedProp,
  simulateOutcome = "ready",
  simulateFinished = false,
  onCancel,
  onRedeploy,
  defaultLogsOpen = false,
  theme = "auto",
  className,
}: DeploymentCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();
  const logId = useId();
  const controlled = statusProp !== undefined;

  // Simulation clock, in seconds. Only the interval writes it.
  const [simT, setSimT] = useState(simulateFinished ? 99 : 0);
  const [canceled, setCanceled] = useState(false);
  const [run, setRun] = useState(0);
  const endAt = simulateOutcome === "error" ? FAIL_AT : END_AT;
  const simRunning = !controlled && !canceled && simT < endAt;

  useEffect(() => {
    if (!simRunning) return;
    const started = performance.now() - simT * 1000;
    const id = window.setInterval(() => setSimT((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(id);
    // simT is read once per run; the interval owns it afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simRunning, run]);

  const simLogs = useMemo(() => {
    const base = simulateOutcome === "error" ? [...SCRIPT.filter((l) => l.t < 11), ...FAIL_LINES] : SCRIPT;
    return base.filter((l) => l.t <= simT);
  }, [simT, simulateOutcome]);

  const logs = controlled ? (logsProp ?? []) : simLogs;
  const elapsed = controlled ? (elapsedProp ?? 0) : Math.min(simT, endAt);
  const status: DeployStatus = controlled
    ? statusProp
    : canceled
      ? "canceled"
      : simT >= endAt
        ? simulateOutcome
        : simT < 1.6
          ? "queued"
          : "building";
  const stage: DeployStage = stageProp ?? logs[logs.length - 1]?.stage ?? "queued";
  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const active = status === "queued" || status === "building";

  const [logsOpen, setLogsOpen] = useState(defaultLogsOpen);
  const [message, setMessage] = useState("");
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current === status) return;
    lastStatus.current = status;
    const words: Record<DeployStatus, string> = {
      queued: "Deployment queued",
      building: "Building",
      ready: `Deployment ready at ${url}`,
      error: "Deployment failed during checks",
      canceled: "Deployment canceled",
    };
    const id = requestAnimationFrame(() => setMessage(words[status]));
    return () => cancelAnimationFrame(id);
  }, [status, url]);

  // Follow the tail unless the reader scrolled up.
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow && logsOpen) el.scrollTop = el.scrollHeight;
  }, [logs.length, follow, logsOpen]);
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 12);
  }, []);

  const cancel = () => {
    onCancel?.();
    if (!controlled) setCanceled(true);
  };
  const redeploy = () => {
    onRedeploy?.();
    if (!controlled) {
      setCanceled(false);
      setSimT(0);
      setFollow(true);
      setRun((r) => r + 1);
    }
  };

  const meta = STATUS[status];
  const failedStage = status === "error" ? stageIndex : -1;

  return (
    <CardFrame aria-labelledby={titleId} aria-busy={active || undefined} className={className} style={style} maxWidth={460}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 id={titleId} className="truncate text-[15px] font-semibold leading-5">
              {project}
            </h3>
            <span className="rounded-[5px] border border-[color:var(--bjork-border)] px-1.5 text-[11px] leading-[18px] text-[color:var(--bjork-text-muted)]">
              {environment}
            </span>
          </div>
          <Pill tone={meta.tone} dot pulse={active}>
            {meta.label}
          </Pill>
        </div>

        <div className="mt-3 flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[color:var(--bjork-card-raised)] text-[10px] font-semibold text-[color:var(--bjork-text-medium)] ring-1 ring-[color:var(--bjork-border)]"
          >
            {commit.author
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-[13px] leading-5">{commit.message}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
              <span className="inline-flex items-center gap-1">
                <GitBranch aria-hidden="true" className="size-3" />
                {commit.branch}
              </span>
              <span className="font-mono">{commit.sha}</span>
              <span>{commit.author}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="px-5 pt-4">
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Pipeline">
          {STAGES.map((s, i) => {
            const done = i < stageIndex || status === "ready";
            const current = i === stageIndex && active;
            const failed = i === failedStage;
            const halted = status === "canceled" && i === stageIndex;
            const state = failed ? "failed" : halted ? "canceled" : done ? "done" : current ? "running" : "pending";
            return (
              <li key={s.id} className="min-w-0">
                <span className="relative block h-1 overflow-hidden rounded-full bg-[color:var(--bjork-track)]">
                  <span
                    className="absolute inset-0 origin-left rounded-full"
                    style={{
                      background: failed
                        ? "var(--bjork-error)"
                        : halted
                          ? "var(--bjork-text-soft)"
                          : status === "ready"
                            ? "var(--bjork-success)"
                            : "var(--bjork-accent)",
                      transform: `scaleX(${done || failed || halted ? 1 : current ? (reduce ? 0.5 : 0) : 0})`,
                      transition: reduce ? "none" : "transform 360ms cubic-bezier(0.23,1,0.32,1), background-color 300ms",
                    }}
                  />
                  {current && !reduce && (
                    <span
                      className="absolute inset-y-0 w-1/2 rounded-full"
                      style={{
                        background: "linear-gradient(90deg, transparent, var(--bjork-accent), transparent)",
                        animation: "bjork-deploy-sweep 1.2s linear infinite",
                      }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block truncate text-[11px] leading-4",
                    failed
                      ? "text-[color:var(--bjork-error)]"
                      : current
                        ? "text-[color:var(--bjork-text)]"
                        : done
                          ? "text-[color:var(--bjork-text-medium)]"
                          : "text-[color:var(--bjork-text-muted)]",
                  )}
                >
                  {s.label}
                  <span className="sr-only">, {state}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <style href="bjork-deploy-sweep" precedence="default">
          {"@keyframes bjork-deploy-sweep { from { transform: translateX(-100%); } to { transform: translateX(200%); } }"}
        </style>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 pt-3 text-[12px] leading-4">
        <span className="text-[color:var(--bjork-text-muted)]">
          {status === "ready" ? "Deployed in" : status === "error" ? "Failed after" : status === "canceled" ? "Stopped after" : "Elapsed"}{" "}
          <span className="text-[color:var(--bjork-text)]">{mmss(elapsed)}</span>
        </span>
        {status === "ready" && (
          <a
            href={`https://${url}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex min-w-0 items-center gap-1 truncate rounded-[4px] text-[color:var(--bjork-text-medium)] underline-offset-2 hover:text-[color:var(--bjork-text)] hover:underline",
              focusRing,
            )}
          >
            <span className="truncate">{url}</span>
            <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
          </a>
        )}
      </div>

      {/* Logs */}
      <div className="mt-4 border-t border-[color:var(--bjork-border)]">
        <button
          type="button"
          aria-expanded={logsOpen}
          aria-controls={logId}
          onClick={() => setLogsOpen((o) => !o)}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between px-5 py-3 text-[12px] text-[color:var(--bjork-text-medium)] transition-colors hover:bg-[color:var(--bjork-card-hover)] hover:text-[color:var(--bjork-text)]",
            focusRing,
            "focus-visible:ring-inset focus-visible:ring-offset-0",
          )}
        >
          <span>
            Build logs <span className="text-[color:var(--bjork-text-muted)]">· {logs.length} lines</span>
            {logs.some((l) => l.level === "error") && <span className="ml-2 text-[color:var(--bjork-error)]">errors</span>}
            {!logs.some((l) => l.level === "error") && logs.some((l) => l.level === "warn") && (
              <span className="ml-2 text-[color:var(--bjork-warning)]">
                {logs.filter((l) => l.level === "warn").length === 1
                  ? "1 warning"
                  : `${logs.filter((l) => l.level === "warn").length} warnings`}
              </span>
            )}
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform motion-reduce:transition-none", logsOpen && "rotate-180")} />
        </button>
        {logsOpen && (
          <div className="relative px-3 pb-3">
            <div
              id={logId}
              ref={scroller}
              onScroll={onScroll}
              role="log"
              aria-live="off"
              aria-label="Build log"
              tabIndex={0}
              className={cn(
                "h-[168px] overflow-y-auto overscroll-contain rounded-[10px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-inset)] shadow-[var(--bjork-shadow-inset)] py-2 font-mono text-[11px] leading-[18px]",
                focusRing,
              )}
            >
              {logs.map((l, i) => (
                <div
                  key={`${l.t}-${i}`}
                  className={cn(
                    "flex gap-3 px-3",
                    l.level === "error" && "bg-[color:var(--bjork-error-soft)] text-[color:var(--bjork-error)]",
                    l.level === "warn" && "text-[color:var(--bjork-warning)]",
                  )}
                >
                  <span className="w-9 shrink-0 select-none text-right text-[color:var(--bjork-text-soft)]">{l.t.toFixed(1)}s</span>
                  <span className="min-w-0 whitespace-pre-wrap break-words">{l.text}</span>
                </div>
              ))}
              {active && (
                <div className="flex gap-3 px-3 text-[color:var(--bjork-text-soft)]">
                  <span className="w-9 shrink-0" />
                  <span className="motion-safe:animate-pulse">▍</span>
                </div>
              )}
            </div>
            {!follow && (
              <button
                type="button"
                onClick={() => {
                  setFollow(true);
                  scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
                }}
                className={cn(
                  "absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] px-2.5 py-1 text-[11px] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]",
                  focusRing,
                )}
              >
                <ArrowDown aria-hidden="true" className="size-3" />
                Latest
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] px-5 py-3">
        {active && (
          <CardButton size="sm" variant="ghost" onClick={cancel} icon={<X aria-hidden="true" className="size-3.5" />}>
            Cancel
          </CardButton>
        )}
        {!active && (
          <CardButton size="sm" variant={status === "ready" ? "ghost" : "primary"} onClick={redeploy} icon={<RotateCw aria-hidden="true" className="size-3.5" />}>
            Redeploy
          </CardButton>
        )}
        {status === "error" && !logsOpen && (
          <CardButton size="sm" onClick={() => setLogsOpen(true)}>
            View error
          </CardButton>
        )}
        {status === "ready" && (
          <a
            href={`https://${url}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[color:var(--bjork-accent-fill)] px-2.5 text-[12px] font-medium text-[color:var(--bjork-accent-foreground)] transition-[background-color,transform] hover:bg-[color:var(--bjork-accent-fill-hover)] active:scale-[0.97] motion-reduce:transition-none",
              focusRing,
            )}
          >
            Visit
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>
      <LiveRegion message={message} />
    </CardFrame>
  );
}
