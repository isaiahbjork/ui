"use client";

import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { HyperText } from "@/components/ui/hyper-text";
import { BJORK_PALETTE } from "@/components/bjork-ui/_core/palette";

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
      initial="hidden"
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
