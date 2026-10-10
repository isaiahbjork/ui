"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { HyperText } from "@/components/ui/hyper-text";
import { BJORK_PALETTE } from "@/components/bjork-ui/_core/palette";
import { BJORK_SURFACE } from "@/components/bjork-ui/_core/surface";
import { useIsDarkTheme } from "@/hooks/use-is-dark-theme";
import type { CSSProperties } from "react";

interface StatusProps {
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "warning";
  scale?: number;
  text?: string;
  customColors?: {
    gradientStart?: string;
    gradientEnd?: string;
    stroke?: string;
    text?: string;
  };
}

export function Status({
  className,
  variant = "primary",
  scale = 1,
  text = "ACTIVE",
  customColors
}: StatusProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();

  // Prevent hydration mismatch by waiting for client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme !== "light" : true; // Default to dark mode during SSR

  // Theme-aware color system matching HudButton.
  // Light mode: strokes use the _core palette tones (>= 3:1 on white), labels use
  // deep shades (>= 4.5:1 over the light fill), and the fill is a light tint so
  // the label is not sitting on a solid colour that washes it out.
  const getColors = () => {
    if (customColors) {
      return {
        gradientStart: customColors.gradientStart || (isDark ? "#4ade80" : BJORK_PALETTE.light.success),
        gradientEnd: customColors.gradientEnd || (isDark ? "#15803d" : "#166534"),
        stroke: customColors.stroke || (isDark ? "#4ade80" : BJORK_PALETTE.light.success),
        text: customColors.text || (isDark ? "text-green-300" : "text-green-900")
      };
    }

    switch (variant) {
      case "primary":
        return {
          gradientStart: isDark ? "#4ade80" : BJORK_PALETTE.light.success,
          gradientEnd: isDark ? "#15803d" : "#166534",
          stroke: isDark ? "#4ade80" : BJORK_PALETTE.light.success,
          text: isDark ? "text-green-300" : "text-green-900"
        };
      case "secondary":
        return {
          gradientStart: isDark ? "#64748b" : "#374151", // slate-500 for dark, gray-700 for light
          gradientEnd: isDark ? "#334155" : "#1f2937",   // slate-700 for dark, gray-800 for light
          stroke: isDark ? "#64748b" : "#374151",        // slate-500 for dark, gray-700 for light
          text: isDark ? "text-slate-300" : "text-gray-800"
        };
      case "danger":
        return {
          gradientStart: isDark ? "#f87171" : BJORK_PALETTE.light.error,
          gradientEnd: isDark ? "#b91c1c" : "#991b1b",
          stroke: isDark ? "#f87171" : BJORK_PALETTE.light.error,
          text: isDark ? "text-red-300" : "text-red-900"
        };
      case "warning":
        return {
          gradientStart: isDark ? "#fbbf24" : BJORK_PALETTE.light.warning,
          gradientEnd: isDark ? "#b45309" : "#92400e",
          stroke: isDark ? "#fbbf24" : BJORK_PALETTE.light.warning,
          text: isDark ? "text-amber-300" : "text-amber-900"
        };
      default:
        return {
          gradientStart: isDark ? "#4ade80" : BJORK_PALETTE.light.success,
          gradientEnd: isDark ? "#15803d" : "#166534",
          stroke: isDark ? "#4ade80" : BJORK_PALETTE.light.success,
          text: isDark ? "text-green-300" : "text-green-900"
        };
    }
  };

  const colors = getColors();
  // Dark keeps the original 0.9 -> 0.1 fill; light uses a tint so dark labels read.
  const fillOpacity = isDark ? { start: "0.9", end: "0.1" } : { start: "0.22", end: "0.03" };

  const containerVariants = {
    hidden: {
      opacity: 0,
      x: -100,
      scale: scale
    },
    visible: {
      opacity: 1,
      x: 0,
      scale: scale,
      transition: {
        duration: 0.8,
        ease: "easeOut"
      }
    }
  };

  return (
    <motion.div
      className={`relative ${className}`}
      variants={containerVariants}
      initial={reduce ? false : "hidden"}
      animate="visible"
      style={{ transformOrigin: "left center" }}
    >
      <div className="relative">
        <svg
          width="180"
          height="36"
          viewBox="0 0 180 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="activeSystemsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.gradientStart} stopOpacity={fillOpacity.start} />
              <stop offset="100%" stopColor={colors.gradientEnd} stopOpacity={fillOpacity.end} />
            </linearGradient>
          </defs>
          <path
            d="M0 0H180V24H8L0 16V0Z"
            fill="url(#activeSystemsGradient)"
            stroke={colors.stroke}
            strokeWidth="1.5"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-start pl-4 pb-3">
          <HyperText
            text={text}
            className={`${colors.text} text-sm font-mono tracking-wider font-semibold`}
            duration={1000}
            animateOnLoad={true}
            trigger={true}
          />
        </div>
      </div>
    </motion.div>
  );
}

export type StatusState = "ok" | "waiting" | "fault";

export interface StatusRow {
  label: string;
  value: string;
  state: StatusState;
}

export const DEFAULT_STATUS_ROWS: StatusRow[] = [
  { label: "System", value: "NOMINAL", state: "ok" },
  { label: "Link", value: "14 MS", state: "ok" },
  { label: "Power", value: "82%", state: "ok" },
  { label: "Sync", value: "PENDING", state: "waiting" },
];

interface StatusPanelProps {
  className?: string;
  title?: string;
  rows?: StatusRow[];
  /** Soft halo on each state dot. Ignored under reduced motion. */
  pulse?: boolean;
  enableAnimations?: boolean;
}

// Status colours mirror the palette tones: ok, waiting and fault only.
const STATE_COLOR = {
  dark: { ok: "#4cc38a", waiting: "#f2b544", fault: "#ff5c4d" },
  light: { ok: "#1f8a55", waiting: "#a86b00", fault: "#c8361f" },
} as const;

const STATE_WORD: Record<StatusState, string> = { ok: "Nominal", waiting: "Waiting", fault: "Fault" };

const PULSE_PERIOD = 2.4;

export function StatusPanel({
  className,
  title = "System status",
  rows = DEFAULT_STATUS_ROWS,
  pulse = true,
  enableAnimations = true,
}: StatusPanelProps) {
  const reduce = useReducedMotion();
  const animate = enableAnimations && !reduce;
  const showPulse = pulse && animate;
  const isDark = useIsDarkTheme();
  const surface = isDark ? BJORK_SURFACE.dark : BJORK_SURFACE.light;
  const colors = isDark ? STATE_COLOR.dark : STATE_COLOR.light;
  const ink = isDark ? "#ededed" : "#171717";
  const muted = isDark ? "rgba(237, 237, 237, 0.5)" : "rgba(23, 23, 23, 0.56)";
  const hair = isDark ? "#1c1c1c" : "#f0e8dc";

  const overall: StatusState = rows.some((r) => r.state === "fault")
    ? "fault"
    : rows.some((r) => r.state === "waiting")
      ? "waiting"
      : "ok";
  const overallLabel = overall === "ok" ? "All systems" : STATE_WORD[overall];

  const panelStyle: CSSProperties = {
    background: surface.surface,
    border: `1px solid ${surface.border}`,
    boxShadow: surface.shadowSurface,
    borderRadius: 16,
    color: ink,
  };

  return (
    <motion.div
      role="status"
      aria-label={`${title}: ${overallLabel}`}
      className={`w-[300px] p-4 font-mono ${className ?? ""}`}
      style={panelStyle}
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
    >
      <div className="flex items-center justify-between pb-3">
        <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: muted }}>
          {title}
        </span>
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em]" style={{ color: colors[overall] }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: colors[overall] }} />
          {overallLabel}
        </span>
      </div>

      <ul className="flex flex-col">
        {rows.map((row, index) => {
          const color = colors[row.state];
          return (
            <motion.li
              key={row.label}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: `1px solid ${hair}` }}
              initial={animate ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30, delay: animate ? 0.12 + index * 0.06 : 0 }}
            >
              <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
                {showPulse && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: color }}
                    animate={{ scale: [1, 2.6], opacity: [0.45, 0] }}
                    transition={{ duration: PULSE_PERIOD, repeat: Infinity, ease: "easeOut", delay: index * 0.3 }}
                  />
                )}
                <span className="relative h-2 w-2 rounded-full" style={{ background: color }} />
              </span>
              <span className="flex-1 text-[11px] uppercase tracking-[0.12em]" style={{ color: muted }}>
                {row.label}
              </span>
              <span className="text-[13px] tabular-nums tracking-[0.02em]" style={{ color: ink }}>
                {row.value}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
}
