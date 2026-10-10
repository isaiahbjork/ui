"use client"

import { motion, useReducedMotion } from "framer-motion"
import type React from "react"
import type { CSSProperties } from "react"
import { useState } from "react"
import { useIsDarkTheme } from "@/hooks/use-is-dark-theme"
import { BJORK_SURFACE } from "@/components/bjork-ui/_core/surface"

export type HudButtonVariant = "primary" | "secondary" | "ghost"

interface HudButtonProps {
  children: React.ReactNode
  /**
   * primary: ember fill (deep rust with light labels in light mode).
   * secondary: the canon surface with a #232323 border and inset light.
   * ghost: text only, lifts onto a surface on hover.
   */
  variant?: HudButtonVariant
  /** Kept for existing call sites. Both values now draw the same shape family. */
  style?: "style1" | "style2"
  size?: "small" | "default" | "large"
  onClick?: () => void
  delay?: number
  enableAnimations?: boolean
}

const SIZES = {
  small: { height: 32, padX: 12, fontSize: 11, tracking: "0.12em" },
  default: { height: 40, padX: 18, fontSize: 12, tracking: "0.14em" },
  large: { height: 52, padX: 26, fontSize: 13, tracking: "0.16em" },
} as const

const RADIUS = 12

interface Tokens {
  ink: string
  bg: string
  hoverBg: string
  border: string
  hoverBorder: string
  shadow: string
  hoverShadow: string
  tick: string
  tickHover: string
  scan: string
}

function tokensFor(variant: HudButtonVariant, isDark: boolean): Tokens {
  if (isDark) {
    const surface = BJORK_SURFACE.dark
    if (variant === "primary") {
      return {
        ink: "#140803",
        bg: "#ec5c13",
        hoverBg: "#f36b24",
        border: "#f47a3d",
        hoverBorder: "#ff8a52",
        shadow: "inset 0 1px 0 rgba(255, 255, 255, 0.26), 0 12px 24px -14px rgba(236, 92, 19, 0.75)",
        hoverShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 16px 30px -14px rgba(236, 92, 19, 0.85)",
        tick: "rgba(20, 8, 3, 0.5)",
        tickHover: "rgba(20, 8, 3, 0.9)",
        scan: "rgba(20, 8, 3, 0.1)",
      }
    }
    if (variant === "secondary") {
      return {
        ink: "#ededed",
        bg: surface.surfaceHover,
        hoverBg: surface.surfaceActive,
        border: surface.border,
        hoverBorder: surface.borderStrong,
        shadow: surface.shadowSurface,
        hoverShadow: surface.shadowSurface,
        tick: "rgba(237, 237, 237, 0.34)",
        tickHover: "#ec5c13",
        scan: "rgba(237, 237, 237, 0.035)",
      }
    }
    return {
      ink: "rgba(237, 237, 237, 0.72)",
      bg: "transparent",
      hoverBg: surface.surfaceHover,
      border: "transparent",
      hoverBorder: surface.border,
      shadow: "none",
      hoverShadow: surface.shadowSoft,
      tick: "transparent",
      tickHover: "#ec5c13",
      scan: "rgba(237, 237, 237, 0.03)",
    }
  }

  const surface = BJORK_SURFACE.light
  if (variant === "primary") {
    return {
      ink: "#fff8f0",
      bg: "#b84a12",
      hoverBg: "#a8430f",
      border: "#a4420f",
      hoverBorder: "#963a0c",
      shadow: "inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 12px 22px -14px rgba(120, 60, 20, 0.55)",
      hoverShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 16px 26px -14px rgba(120, 60, 20, 0.6)",
      tick: "rgba(255, 248, 240, 0.6)",
      tickHover: "#fff8f0",
      scan: "rgba(255, 248, 240, 0.09)",
    }
  }
  if (variant === "secondary") {
    return {
      ink: "#171717",
      bg: surface.surface,
      hoverBg: surface.surfaceHover,
      border: surface.borderStrong,
      hoverBorder: "#d6c9b5",
      shadow: surface.shadowSurface,
      hoverShadow: surface.shadowSurface,
      tick: "rgba(23, 23, 23, 0.3)",
      tickHover: "#b84a12",
      scan: "rgba(88, 72, 49, 0.05)",
    }
  }
  return {
    ink: "rgba(23, 23, 23, 0.72)",
    bg: "transparent",
    hoverBg: surface.surfaceHover,
    border: "transparent",
    hoverBorder: surface.border,
    shadow: "none",
    hoverShadow: surface.shadowSoft,
    tick: "transparent",
    tickHover: "#b84a12",
    scan: "rgba(88, 72, 49, 0.04)",
  }
}

type Corner = "tl" | "tr" | "bl" | "br"

// Corner ticks sit inside the 1px border and draw the HUD bracket.
const TICKS: Record<Corner, CSSProperties> = {
  tl: { top: 4, left: 4, borderWidth: "1px 0 0 1px" },
  tr: { top: 4, right: 4, borderWidth: "1px 1px 0 0" },
  bl: { bottom: 4, left: 4, borderWidth: "0 0 1px 1px" },
  br: { bottom: 4, right: 4, borderWidth: "0 1px 1px 0" },
}

export function HudButton({
  children,
  variant = "primary",
  size = "default",
  onClick,
  delay = 0,
  enableAnimations = true,
}: HudButtonProps) {
  const shouldReduceMotion = useReducedMotion()
  const shouldAnimate = enableAnimations && !shouldReduceMotion
  const [isHovered, setIsHovered] = useState(false)
  const isDark = useIsDarkTheme()

  const t = tokensFor(variant, isDark)
  const s = SIZES[size]
  const ease = shouldAnimate ? "200ms ease-out" : "0ms"

  const buttonStyle: CSSProperties = {
    height: s.height,
    padding: `0 ${s.padX}px`,
    borderRadius: RADIUS,
    fontSize: s.fontSize,
    letterSpacing: s.tracking,
    color: t.ink,
    background: isHovered ? t.hoverBg : t.bg,
    border: `1px solid ${isHovered ? t.hoverBorder : t.border}`,
    boxShadow: isHovered ? t.hoverShadow : t.shadow,
    transition: `background-color ${ease}, border-color ${ease}, box-shadow ${ease}, color ${ease}`,
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      initial={shouldAnimate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8, delay: shouldAnimate ? delay : 0 }}
      whileHover={shouldAnimate ? { y: -1 } : undefined}
      whileTap={shouldAnimate ? { scale: 0.98 } : undefined}
      className="relative inline-flex cursor-pointer select-none items-center justify-center overflow-hidden whitespace-nowrap font-mono uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ec5c13]"
      style={buttonStyle}
    >
      {(Object.keys(TICKS) as Corner[]).map((corner) => (
        <span
          key={corner}
          aria-hidden
          className="pointer-events-none absolute h-[5px] w-[5px] border-solid"
          style={{
            ...TICKS[corner],
            borderColor: isHovered ? t.tickHover : t.tick,
            transition: `border-color ${ease}`,
          }}
        />
      ))}

      {/* Scanline detail: fades in on hover. Static under reduced motion. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, ${t.scan} 0 1px, transparent 1px 3px)`,
          opacity: isHovered ? 1 : 0,
          transition: `opacity ${shouldAnimate ? "240ms ease-out" : "0ms"}`,
        }}
      />

      <span className="relative z-[1]">{children}</span>
    </motion.button>
  )
}
