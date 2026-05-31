"use client"

import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, animate } from "framer-motion"
import { useEffect, useId, useState } from "react"
import { cn } from "@/lib/utils"

interface AnimatedRadialChartProps {
  value?: number
  size?: number
  strokeWidth?: number
  className?: string
  showLabels?: boolean
  duration?: number
  tone?: "light" | "dark"
}

export function AnimatedRadialChart({ 
  value = 74, 
  size = 300,
  strokeWidth: customStrokeWidth,
  className,
  showLabels = true,
  duration = 2,
  tone,
}: AnimatedRadialChartProps) {
  const shouldReduceMotion = useReducedMotion()
  const id = useId().replace(/:/g, "")
  const [displayValue, setDisplayValue] = useState(() =>
    duration <= 0 ? Math.round(value) : 0
  )
  const [isLight, setIsLight] = useState(false)
  const animationDuration = shouldReduceMotion ? 0.25 : duration
  // Dynamic stroke width based on size if not provided
  const strokeWidth = customStrokeWidth ?? Math.max(12, size * 0.06)
  const radius = size * 0.35
  const center = size / 2
  const circumference = Math.PI * radius

  // Calculate inner line radius (4px inside the main arc)
  const innerLineRadius = radius - strokeWidth - 4

  // Motion values for animation
  const animatedValue = useMotionValue(duration <= 0 ? value : 0)
  const offset = useTransform(animatedValue, [0, 100], [circumference, 0])

  useMotionValueEvent(animatedValue, "change", (latest) => {
    setDisplayValue(Math.round(latest))
  })

  useEffect(() => {
    if (tone) {
      setIsLight(tone === "light")
      return
    }

    const updateTheme = () => {
      setIsLight(document.documentElement.classList.contains("light"))
    }

    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [tone])

  const isLightTone = tone ? tone === "light" : isLight

  // Calculate animated positions
  const progressAngle = useTransform(animatedValue, [0, 100], [-Math.PI, 0])
  const innerRadius = radius - strokeWidth / 2

  // Animate to the target value on mount or when value changes
  useEffect(() => {
    if (animationDuration <= 0) {
      animatedValue.set(value)
      setDisplayValue(Math.round(value))
      return
    }

    const controls = animate(animatedValue, value, {
      duration: animationDuration,
      ease: "easeOut",
    })

    return controls.stop
  }, [value, animatedValue, animationDuration])

  // Calculate responsive font size
  const fontSize = Math.max(16, size * 0.1)
  const labelFontSize = Math.max(12, size * 0.04)
  const baseStops = isLightTone
    ? {
        start: "#f7f5ef",
        mid: "#c8c3b8",
        end: "#7f858c",
        inner: "#a8a298",
        label: "#7c8794",
        textStart: "#1d1d1d",
        textMid: "#4b5563",
        textEnd: "#9ca3af",
        shadow: "#6f675d",
        shadowOpacity: "0.18",
      }
    : {
        start: "#ffffff",
        mid: "#d1d5db",
        end: "#6b7280",
        inner: "#6b7280",
        label: "#9ca3af",
        textStart: "#ffffff",
        textMid: "#d1d5db",
        textEnd: "#6b7280",
        shadow: "#000000",
        shadowOpacity: "0.3",
      }

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size * 0.7 }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`} className="overflow-visible">
        <defs>
          {/* Base track gradient - white to silver/gray */}
          <linearGradient id={`baseGradient-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={baseStops.start} stopOpacity="0.9" />
            <stop offset="50%" stopColor={baseStops.mid} stopOpacity="0.72" />
            <stop offset="100%" stopColor={baseStops.end} stopOpacity="0.62" />
          </linearGradient>

          {/* Progress gradient - orange */}
          <linearGradient id={`progressGradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>

          {/* Text gradient - white to gray */}
          <linearGradient id={`textGradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={baseStops.textStart} stopOpacity="0.78" />
            <stop offset="50%" stopColor={baseStops.textMid} stopOpacity="0.62" />
            <stop offset="100%" stopColor={baseStops.textEnd} stopOpacity="0.46" />
          </linearGradient>

          {/* Drop shadow filter */}
          <filter id={`dropshadow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={baseStops.shadow} floodOpacity={baseStops.shadowOpacity} />
          </filter>
        </defs>

        {/* Inner thin line (1px light gray) */}
        <path
          d={`M ${center - innerLineRadius} ${center} A ${innerLineRadius} ${innerLineRadius} 0 0 1 ${center + innerLineRadius} ${center}`}
          fill="none"
          stroke={baseStops.inner}
          strokeWidth="1"
          strokeLinecap="butt"
          opacity="0.6"
        />

        {/* Base track */}
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke={`url(#baseGradient-${id})`}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          filter={`url(#dropshadow-${id})`}
        />

        {/* Animated Progress track */}
        <motion.path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke={`url(#progressGradient-${id})`}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#dropshadow-${id})`}
        />

        {/* Animated extending line */}
        <motion.line
          x1={useTransform(progressAngle, (angle) => center + Math.cos(angle) * innerRadius)}
          y1={useTransform(progressAngle, (angle) => center + Math.sin(angle) * innerRadius)}
          x2={useTransform(progressAngle, (angle) => center + Math.cos(angle) * innerRadius - Math.cos(angle) * 30)}
          y2={useTransform(progressAngle, (angle) => center + Math.sin(angle) * innerRadius - Math.sin(angle) * 30)}
          stroke={`url(#textGradient-${id})`}
          strokeWidth="1"
          strokeLinecap="butt"
        />
      </svg>

      {/* Animated center percentage display with gradient text */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <motion.div
          className="font-bold tracking-tight mt-10"
          style={{ fontSize: `${fontSize}px` }}
          initial={false}
          animate={{ scale: 1 }}
          transition={{ duration: shouldReduceMotion ? 0.15 : 0.5, delay: shouldReduceMotion ? 0 : animationDuration * 0.75 }}
        >
          {isLightTone ? (
            <span className="text-[#242424]">
              <span>{displayValue}</span>%
            </span>
          ) : (
            <span
              style={{
                background: "linear-gradient(to right, #ffffff, #9ca3af)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              <span>{displayValue}</span>%
            </span>
          )}
        </motion.div>
      </div>

      {/* 0% and 100% labels */}
      {showLabels && (
        <>
          <motion.div
            className="absolute font-medium"
            style={{
              fontSize: `${labelFontSize}px`,
              left: center - radius - 5,
              top: center + strokeWidth / 2,
              color: baseStops.label,
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.15 : 0.5, delay: shouldReduceMotion ? 0 : animationDuration * 0.25 }}
          >
            0%
          </motion.div>
          <motion.div
            className="absolute font-medium"
            style={{
              fontSize: `${labelFontSize}px`,
              left: center + radius - 20,
              top: center + strokeWidth / 2,
              color: baseStops.label,
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.15 : 0.5, delay: shouldReduceMotion ? 0 : animationDuration * 0.25 }}
          >
            100%
          </motion.div>
        </>
      )}
    </div>
  )
}
