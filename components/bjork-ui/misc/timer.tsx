"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { motion } from "framer-motion"
import { Pause, Play, RotateCcw } from "lucide-react"
import { BJORK_PALETTE } from "@/components/bjork-ui/_core/palette"
import { BJORK_SURFACE } from "@/components/bjork-ui/_core/surface"
import { useBjorkTone } from "@/components/bjork-ui/_core/tone"
import { cn } from "@/lib/utils"

export interface TimerProps {
  /** Countdown length in seconds. Default 25 minutes. */
  duration?: number
  /** Quick-set chips, in seconds. */
  presets?: number[]
  /** Accent for the progress arc, status and completion pulse. Defaults to the Bjork orange for the tone. */
  accent?: string
  /** Digit size. */
  size?: "sm" | "md" | "lg"
  /** Show the hairline dial. When false the digits stand alone. */
  showRing?: boolean
  /** Fires once when the countdown reaches zero. */
  onComplete?: () => void
  /** Play a soft two-note chime on completion. Off by default. */
  sound?: boolean
  /** Force a tone. Follows the site theme when omitted. */
  tone?: "dark" | "light"
  /** Small label above the readout. */
  title?: string
  className?: string
  /** @deprecated Kept for older call sites. Ignored. Colours now come from the tone. */
  initialTime?: number
  /** @deprecated Ignored. */
  strokeWidth?: number
  /** @deprecated Ignored. */
  tickLength?: number
  /** @deprecated Ignored. Use `accent`. */
  tickColor?: string
  /** @deprecated Ignored. */
  textColor?: string
  /** @deprecated Ignored. */
  titleColor?: string
  /** @deprecated Ignored. */
  gradientFrom?: string
  /** @deprecated Ignored. */
  gradientVia?: string
  /** @deprecated Ignored. */
  gradientTo?: string
  /** @deprecated Ignored. */
  primaryButtonColor?: string
  /** @deprecated Ignored. */
  primaryButtonHover?: string
  /** @deprecated Ignored. */
  secondaryButtonColor?: string
  /** @deprecated Ignored. */
  secondaryButtonHover?: string
}

type Status = "idle" | "running" | "paused" | "done"

const DEFAULT_DURATION = 25 * 60
const DEFAULT_PRESETS = [60, 5 * 60, 25 * 60]
const MIN_DURATION = 60
const MAX_DURATION = 99 * 60
// The dial always spans at least an hour, one tick per minute.
const MIN_DIAL = 60 * 60
const DIGIT_CQW = { sm: 17, md: 21, lg: 25 } as const
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const DIGIT_NUDGE = 0.012

// Dial geometry in viewBox units (300 x 300).
const C = 150
const R = 128
const PATH = 1000

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clampDuration = (seconds: number) =>
  Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(seconds)))
const dialSpanFor = (duration: number) => Math.max(MIN_DIAL, Math.ceil(duration / 60) * 60)
const dashFor = (ms: number, span: number) => PATH * (1 - clamp01(ms / 1000 / span))
const sweepFor = (ms: number, span: number) => 360 * clamp01(ms / 1000 / span)
const pad = (n: number) => String(n).padStart(2, "0")

function spoken(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  const parts: string[] = []
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`)
  if (s || !m) parts.push(`${s} second${s === 1 ? "" : "s"}`)
  return parts.join(" ")
}

function presetLabel(seconds: number) {
  return seconds % 60 === 0 ? `${seconds / 60}m` : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`
}

function playChime(ctx: AudioContext) {
  const t = ctx.currentTime
  // Two soft sine partials a fifth apart, staggered, with a long fade.
  ;[880, 1320].forEach((frequency, i) => {
    const start = t + i * 0.18
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 1.7)
  })
}

// Reads the media query directly. Framer's hook can keep its first-render value, so the digit rolls would ignore the setting.
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduce(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return reduce
}

// One digit as a vertical strip of 0-9. Only the digit that changes moves; the cell width is fixed, so nothing reflows.
function RollDigit({ value, instant }: { value: number; instant: boolean }) {
  return (
    <span aria-hidden className="relative inline-block overflow-hidden" style={{ width: "0.62em", height: "1em" }}>
      <span
        className="block will-change-transform"
        style={{
          // Ink test (cap-centre of each digit, Bjork Display at line-height 1) averages ~0.012em high; nudge down.
          transform: `translate3d(0, calc(${-value}em + ${DIGIT_NUDGE}em), 0)`,
          transition: instant ? "none" : `transform 180ms ${EASE_OUT}`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block text-center" style={{ height: "1em", lineHeight: 1 }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

// Two dots centred on the digit cap-height (0.5em), so the separator does not depend on the font's colon glyph.
function Colon() {
  return (
    <span aria-hidden className="relative inline-block" style={{ width: "0.3em", height: "1em", opacity: 0.5 }}>
      {[-0.19, 0.19].map((offset) => (
        <span
          key={offset}
          className="absolute rounded-full"
          style={{
            left: "50%",
            top: `calc(50% + ${offset}em)`,
            width: "0.1em",
            height: "0.1em",
            background: "currentColor",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </span>
  )
}

export function Timer({
  duration: durationProp = DEFAULT_DURATION,
  presets = DEFAULT_PRESETS,
  accent,
  size = "md",
  showRing = true,
  onComplete,
  sound = false,
  tone,
  title = "Timer",
  className,
}: TimerProps) {
  const resolvedTone = useBjorkTone(tone)
  const isDark = resolvedTone === "dark"
  const palette = BJORK_PALETTE[resolvedTone]
  const ink = palette.text
  const muted = palette.textMuted
  const soft = palette.textSoft
  const accentColor = accent ?? palette.accent
  const accentText = isDark ? accentColor : palette.accentInk
  const surface = isDark ? "#080808" : palette.surface
  const frameColor = palette.border
  const hair = palette.hair
  const instant = usePrefersReducedMotion()

  const [duration, setDuration] = useState(() => clampDuration(durationProp))
  const [status, setStatus] = useState<Status>("idle")
  const [remainingMs, setRemainingMs] = useState(() => clampDuration(durationProp) * 1000)
  const [shownSec, setShownSec] = useState(() => clampDuration(durationProp))
  const [dragging, setDragging] = useState(false)
  const [pulse, setPulse] = useState(0)
  const [announcement, setAnnouncement] = useState("")

  const running = status === "running"
  const dialSpan = dialSpanFor(duration)

  const arcRef = useRef<SVGCircleElement>(null)
  const knobRef = useRef<SVGGElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const runRef = useRef<{ startedAt: number; base: number; span: number } | null>(null)
  const lastSecRef = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const ringDragRef = useRef(false)
  const lastDragRef = useRef(duration)
  const dragStartRef = useRef<{ y: number; sec: number } | null>(null)
  const wheelAccRef = useRef(0)
  const onCompleteRef = useRef(onComplete)
  const mountedRef = useRef(false)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const announce = useCallback((text: string) => setAnnouncement(text), [])

  // Every change to the set time goes through here. It is only reached while the timer is not counting down.
  const setTotal = useCallback(
    (seconds: number, message?: string) => {
      const next = clampDuration(seconds)
      runRef.current = null
      lastDragRef.current = next
      setDuration(next)
      setStatus("idle")
      setRemainingMs(next * 1000)
      setShownSec(next)
      if (message) announce(message)
    },
    [announce]
  )

  // A prop change re-seeds the timer. The first mount is skipped so it does not clobber user edits.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    setTotal(durationProp)
  }, [durationProp, setTotal])

  const complete = useCallback(() => {
    runRef.current = null
    setRemainingMs(0)
    setShownSec(0)
    setStatus("done")
    setPulse((n) => n + 1)
    announce("Time is up")
    if (sound && audioRef.current) playChime(audioRef.current)
    try {
      navigator.vibrate?.([30, 80, 30])
    } catch {
      // Haptics are unsupported on this device.
    }
    onCompleteRef.current?.()
  }, [announce, sound])

  const start = () => {
    const base = remainingMs > 0 ? remainingMs : duration * 1000
    if (sound && typeof window !== "undefined") {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        audioRef.current ??= new Ctx()
        void audioRef.current.resume()
      }
    }
    lastSecRef.current = Math.ceil(base / 1000)
    runRef.current = { startedAt: performance.now(), base, span: dialSpan }
    setRemainingMs(base)
    setShownSec(Math.ceil(base / 1000))
    setStatus("running")
    announce(`Started, ${spoken(Math.ceil(base / 1000))} left`)
  }

  const pause = () => {
    const run = runRef.current
    if (!run) return
    const rem = Math.max(0, run.base - (performance.now() - run.startedAt))
    runRef.current = null
    setRemainingMs(rem)
    setShownSec(Math.ceil(rem / 1000))
    setStatus("paused")
    announce(`Paused, ${spoken(Math.ceil(rem / 1000))} left`)
  }

  const toggle = () => (running ? pause() : start())

  const reset = () => {
    runRef.current = null
    setStatus("idle")
    setRemainingMs(duration * 1000)
    setShownSec(duration)
    announce(`Reset to ${spoken(duration)}`)
  }

  const nudge = (deltaSeconds: number) => {
    if (running) return false
    const next = clampDuration(duration + deltaSeconds)
    setTotal(next, spoken(next))
    return true
  }

  // Idle and paused: a layout effect writes the arc and knob, so the fill can ease with a CSS transition.
  // Running: the frame loop below writes the same properties directly and transitions are off.
  useLayoutEffect(() => {
    if (status === "running") return
    const arc = arcRef.current
    const knob = knobRef.current
    const frac = clamp01(remainingMs / 1000 / dialSpan)
    if (arc) {
      arc.style.transition = dragging ? "none" : `stroke-dashoffset 420ms ${EASE_OUT}`
      arc.style.strokeDashoffset = String(PATH * (1 - frac))
      arc.style.opacity = frac > 0 ? "1" : "0"
    }
    if (knob) {
      knob.style.transition = dragging ? "none" : `transform 420ms ${EASE_OUT}`
      knob.style.transform = `rotate(${frac * 360}deg)`
      knob.style.opacity = frac > 0 ? "1" : "0"
    }
  }, [status, remainingMs, dialSpan, dragging])

  // Count-down loop. Time comes from performance.now(), so it stays correct when the tab was hidden.
  useEffect(() => {
    if (status !== "running") return
    const run = runRef.current
    if (!run) return
    const arc = arcRef.current
    const knob = knobRef.current
    if (arc) arc.style.transition = "none"
    if (knob) knob.style.transition = "none"

    let frame = 0
    const loop = (now: number) => {
      const rem = Math.max(0, run.base - (now - run.startedAt))
      if (arc) arc.style.strokeDashoffset = String(dashFor(rem, run.span))
      if (knob) knob.style.transform = `rotate(${sweepFor(rem, run.span)}deg)`

      const sec = Math.ceil(rem / 1000)
      if (sec !== lastSecRef.current) {
        lastSecRef.current = sec
        setShownSec(sec)
        // Announce on whole minutes only, so screen readers are not flooded every second.
        if (sec > 0 && sec % 60 === 0) {
          announce(`${sec / 60} ${sec === 60 ? "minute" : "minutes"} remaining`)
        }
      }
      if (rem <= 0) {
        complete()
        return
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [status, complete, announce])

  // Wheel over the readout steps by minutes. Non-passive so the page does not scroll under it.
  useEffect(() => {
    const el = readoutRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (status === "running") return
      event.preventDefault()
      wheelAccRef.current += event.deltaY
      if (Math.abs(wheelAccRef.current) < 40) return
      const step = wheelAccRef.current < 0 ? 60 : -60
      wheelAccRef.current = 0
      setTotal(duration + step)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [duration, status, setTotal])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Native buttons already turn Space into a click, so only handle Space elsewhere.
    const onButton = (event.target as HTMLElement).tagName === "BUTTON"
    switch (event.key) {
      case " ":
      case "Spacebar":
        if (onButton) return
        event.preventDefault()
        toggle()
        return
      case "r":
      case "R":
        event.preventDefault()
        reset()
        return
      case "ArrowUp":
      case "ArrowRight":
        if (nudge(event.shiftKey ? 300 : 60)) event.preventDefault()
        return
      case "ArrowDown":
      case "ArrowLeft":
        if (nudge(event.shiftKey ? -300 : -60)) event.preventDefault()
        return
      default:
        return
    }
  }

  const onReadoutDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (running) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = { y: event.clientY, sec: duration }
  }
  const onReadoutMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start) return
    // 14px of vertical travel per minute.
    const steps = Math.round((start.y - event.clientY) / 14)
    const next = clampDuration(start.sec + steps * 60)
    if (next !== duration) setTotal(next)
  }
  const onReadoutUp = () => {
    if (dragStartRef.current) announce(spoken(lastDragRef.current))
    dragStartRef.current = null
  }

  const ringSeconds = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return duration
    const rect = svg.getBoundingClientRect()
    const x = clientX - (rect.left + rect.width / 2)
    const y = clientY - (rect.top + rect.height / 2)
    let angle = Math.atan2(x, -y) // 0 at 12 o'clock, clockwise
    if (angle < 0) angle += Math.PI * 2
    return Math.round((angle / (Math.PI * 2)) * dialSpan / 60) * 60
  }
  const onRingDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (running) return
    event.currentTarget.setPointerCapture(event.pointerId)
    ringDragRef.current = true
    setDragging(true)
    setTotal(ringSeconds(event.clientX, event.clientY))
  }
  const onRingMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!ringDragRef.current) return
    setTotal(ringSeconds(event.clientX, event.clientY))
  }
  const onRingUp = () => {
    if (!ringDragRef.current) return
    ringDragRef.current = false
    setDragging(false)
    announce(spoken(lastDragRef.current))
  }

  const ticks = useMemo(() => {
    const count = dialSpan / 60
    return Array.from({ length: count }, (_, i) => ({
      i,
      major: i % 5 === 0,
      angle: (i / count) * 360,
    }))
  }, [dialSpan])

  const mm = Math.floor(shownSec / 60)
  const ss = shownSec % 60
  const statusLabel = { idle: "Ready", running: "Running", paused: "Paused", done: "Complete" }[status]
  const statusColor = status === "running" || status === "done" ? accentText : soft
  const primaryFg = isDark ? palette.bg : palette.surface

  return (
    <div
      role="group"
      aria-label={title}
      onKeyDown={onKeyDown}
      className={cn(
        "mx-auto flex w-full max-w-[360px] flex-col items-center gap-7 rounded-[24px] border px-6 py-7 sm:px-8",
        className
      )}
      style={{ background: surface, borderColor: frameColor, color: ink, boxShadow: BJORK_SURFACE[resolvedTone].shadowSurface }}
    >
      <div className="flex w-full items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
        <span style={{ color: muted }}>{title}</span>
        <span className="flex items-center gap-2" style={{ color: statusColor }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
          {statusLabel}
        </span>
      </div>

      <div
        className={cn("relative w-full", showRing ? "aspect-square max-w-[300px]" : "h-[120px]")}
        style={{ containerType: "inline-size" }}
      >
        {showRing && (
          <svg
            ref={svgRef}
            viewBox="0 0 300 300"
            aria-hidden
            className="absolute inset-0 h-full w-full touch-none select-none"
            style={{ cursor: running ? "default" : "pointer" }}
            onPointerDown={onRingDown}
            onPointerMove={onRingMove}
            onPointerUp={onRingUp}
            onPointerCancel={onRingUp}
          >
            {ticks.map((t) => (
              <line
                key={t.i}
                x1={C}
                y1={C - 138}
                x2={C}
                y2={C - (t.major ? 146 : 142)}
                stroke={t.major ? soft : hair}
                strokeWidth={1}
                transform={`rotate(${t.angle} ${C} ${C})`}
              />
            ))}
            <circle cx={C} cy={C} r={R} fill="none" stroke={hair} strokeWidth={1} />
            <circle
              ref={arcRef}
              cx={C}
              cy={C}
              r={R}
              fill="none"
              stroke={accentColor}
              strokeWidth={2}
              strokeLinecap="round"
              pathLength={PATH}
              strokeDasharray={`${PATH} ${PATH}`}
              transform={`rotate(-90 ${C} ${C})`}
            />
            <g ref={knobRef} style={{ transformOrigin: `${C}px ${C}px` }}>
              <circle cx={C} cy={C - R} r={4.5} fill={accentColor} stroke={surface} strokeWidth={2} />
            </g>
          </svg>
        )}

        {showRing && pulse > 0 && !instant && (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute inset-[4%] rounded-full"
            style={{ border: `1px solid ${accentColor}` }}
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.12 }}
            transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1] }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            ref={readoutRef}
            role="timer"
            aria-label="Time remaining"
            tabIndex={0}
            onPointerDown={onReadoutDown}
            onPointerMove={onReadoutMove}
            onPointerUp={onReadoutUp}
            onPointerCancel={onReadoutUp}
            className={cn(
              "pointer-events-auto touch-none select-none rounded-xl font-display leading-none outline-none focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-[12px]",
              running ? "cursor-default" : "cursor-ns-resize"
            )}
            style={{
              fontSize: `${DIGIT_CQW[size]}cqw`,
              fontFamily:
                '"Bjork Grotesk Display", "Bjork Grotesk Alpha", var(--font-geist-sans), sans-serif',
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              color: ink,
              outlineColor: accentColor,
            }}
          >
            <span className="flex items-center justify-center">
              <RollDigit value={Math.floor(mm / 10)} instant={instant} />
              <RollDigit value={mm % 10} instant={instant} />
              <Colon />
              <RollDigit value={Math.floor(ss / 10)} instant={instant} />
              <RollDigit value={ss % 10} instant={instant} />
            </span>
            <span className="sr-only">{spoken(shownSec)}</span>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Quick durations" className="flex items-center justify-center gap-2">
        {presets.map((seconds) => {
          const active = duration === seconds
          return (
            <button
              key={seconds}
              type="button"
              aria-pressed={active}
              disabled={running}
              onClick={() => setTotal(seconds, `Set to ${spoken(seconds)}`)}
              className="h-7 rounded-full border px-3 font-mono text-[11px] tabular-nums tracking-[0.04em] transition-[transform,color,background-color,border-color] duration-150 ease-out enabled:active:scale-[0.97] disabled:opacity-35"
              style={{
                borderColor: active ? accentColor : hair,
                color: active ? accentText : muted,
                background: active ? (isDark ? "rgba(236,92,19,0.12)" : palette.accentSoft) : "transparent",
              }}
            >
              {presetLabel(seconds)}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={reset}
          aria-label="Reset timer"
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-transform duration-[120ms] ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4"
          style={{ borderColor: hair, color: muted, outlineColor: accentColor }}
        >
          <RotateCcw className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </button>

        <button
          type="button"
          onClick={toggle}
          aria-label={running ? "Pause timer" : "Start timer"}
          className="flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-[120ms] ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4"
          style={{ background: ink, color: primaryFg, outlineColor: accentColor }}
        >
          <motion.span
            key={running ? "pause" : "play"}
            initial={instant ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: instant ? 0 : 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="flex"
          >
            {running ? (
              <Pause className="h-[22px] w-[22px]" fill="currentColor" strokeWidth={0} aria-hidden />
            ) : (
              // Blur test: the play triangle's weight sits left of its box centre; nudge 1px right.
              <Play className="h-[22px] w-[22px] translate-x-px" fill="currentColor" strokeWidth={0} aria-hidden />
            )}
          </motion.span>
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}
