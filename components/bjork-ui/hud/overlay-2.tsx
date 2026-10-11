"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useIsDarkTheme } from "@/hooks/use-is-dark-theme";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE } from "@/components/bjork-ui/_core/palette";
import { surfaceVars } from "@/components/bjork-ui/_core/surface";

interface Overlay2Props {
  className?: string;
  compact?: boolean;
}

const readouts = [
  { label: "Latency p95", value: "38", unit: "ms" },
  { label: "Queue depth", value: "124", unit: "jobs" },
  { label: "Error rate", value: "0.02", unit: "%" },
  { label: "Uptime, 30 days", value: "99.97", unit: "%" },
];

// Ten-second throughput samples, GB/s. Static, so the overlay renders the same on every load.
const samples = [1.62, 1.7, 1.66, 1.81, 1.92, 1.88, 2.02, 2.11, 2.07, 2.19, 2.14, 2.26, 2.31, 2.28, 2.4, 2.37, 2.44, 2.48];

const WIDTH = 320;
const HEIGHT = 84;

function sparkPath(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = WIDTH / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = HEIGHT - 6 - ((v - min) / span) * (HEIGHT - 12);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

const panelVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.07, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export function Overlay2({ className, compact = false }: Overlay2Props) {
  const reduce = useReducedMotion();
  const fillId = `overlay2-fill-${useId().replace(/:/g, "")}`;
  const isDark = useIsDarkTheme();
  const pal = BJORK_PALETTE[isDark ? "dark" : "light"];
  const motionProps = reduce
    ? { initial: false as const, animate: "show" as const }
    : { initial: "hidden" as const, animate: "show" as const };

  const path = sparkPath(samples);
  const latest = samples[samples.length - 1].toFixed(2);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[420px] w-full items-center justify-center overflow-hidden bg-transparent p-6",
        className,
      )}
      style={{ color: pal.text }}
    >
      <motion.section
        aria-label="Line 04 telemetry"
        className={cn(
          "w-full rounded-[18px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]",
          compact ? "max-w-[420px] p-4" : "max-w-[480px] p-5",
        )}
        style={surfaceVars(isDark ? "dark" : "light")}
        variants={panelVariants}
        {...motionProps}
      >
        <motion.header variants={itemVariants} className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: pal.textMuted }}>
            Line 04 · Telemetry
          </p>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: pal.textMedium }}>
            <span className="relative flex size-1.5">
              {!reduce && (
                <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: pal.accent }} />
              )}
              <span className="relative inline-flex size-1.5 rounded-full" style={{ background: pal.accent }} />
            </span>
            Live
          </p>
        </motion.header>

        <motion.div variants={itemVariants} className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: pal.textMuted }}>
              Throughput
            </p>
            <p className={cn("mt-1 font-semibold tabular-nums tracking-tight", compact ? "text-3xl" : "text-4xl")}>
              {latest}
              <span className="ml-1.5 font-mono text-[13px] font-normal" style={{ color: pal.textMuted }}>
                GB/s
              </span>
            </p>
          </div>
          <p className="font-mono text-[11px] tabular-nums" style={{ color: pal.textMuted }}>
            +6.4% vs 1h
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-3">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Throughput over the last ten minutes">
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pal.accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={pal.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={WIDTH}
                y1={HEIGHT * f}
                y2={HEIGHT * f}
                stroke={pal.border}
                strokeWidth={1}
              />
            ))}
            <motion.path
              d={`${path} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`}
              fill={`url(#${fillId})`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.5, duration: reduce ? 0 : 0.6 }}
            />
            <motion.path
              d={path}
              fill="none"
              stroke={pal.accent}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
        </motion.div>

        <motion.dl variants={itemVariants} className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4" style={{ borderColor: pal.border }}>
          {readouts.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.06em]" style={{ color: pal.textMuted }}>
                {row.label}
              </dt>
              <dd className="font-mono text-[13px] tabular-nums" style={{ color: pal.text }}>
                {row.value}
                <span className="ml-1 text-[11px]" style={{ color: pal.textMuted }}>
                  {row.unit}
                </span>
              </dd>
            </div>
          ))}
        </motion.dl>

        <motion.footer variants={itemVariants} className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: pal.border }}>
          <p className="font-mono text-[11px] tabular-nums" style={{ color: pal.textSoft }}>
            Sampled every 10 s
          </p>
          <p className="font-mono text-[11px] tabular-nums" style={{ color: pal.textSoft }}>
            Updated 14:32:08 UTC
          </p>
        </motion.footer>
      </motion.section>
    </div>
  );
}
