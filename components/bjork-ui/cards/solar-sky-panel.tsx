"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { animate, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { springs } from "@/components/bjork-ui/_core/motion";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { mulberry32 } from "@/components/bjork-ui/_core/random";

const MS_MIN = 60_000;
const MS_DAY = 86_400_000;
const DEG = Math.PI / 180;

// Horizon position as a fraction of the sky height. Elevation maps piecewise around it.
const HORIZON = 0.68;
const TOP_PAD = 12;
const SCRUB_PX_TO_MIN = 4;
const SCRUB_LIMIT = 720; // minutes, +/- 12h
const KEY_STEP = 15;
const KEY_STEP_LARGE = 60;
const ATTRACT_MIN_PER_S = 120; // a full 24h sweep takes 12s
const ATTRACT_IDLE_MS = 4000;

const MOON_SYNODIC = 29.530588853;
const MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const MOON_RADIUS = 6; // half of the 12px disc

const SKY_STOPS: ReadonlyArray<readonly [number, string, string, string]> = [
  [-18, "#04060c", "#080c18", "#0f1424"],
  [-12, "#070b1a", "#141a36", "#2a2a4a"],
  [-6, "#0f1638", "#3a2f5c", "#a0566a"],
  [0, "#1d2b55", "#b8634e", "#f2a560"],
  [6, "#2f5a9a", "#d68a5c", "#f6c88a"],
  [20, "#3d78c4", "#86b3e6", "#d3e4f2"],
  [45, "#2f6fbf", "#6fa6e3", "#cfe3f5"],
];

const STARS = (() => {
  const rnd = mulberry32(1729);
  return Array.from({ length: 40 }, () => ({ x: rnd(), y: rnd() * 0.62, s: rnd() }));
})();

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const warnedZones = new Set<string>();

export interface SolarSkyPanelProps {
  latitude: number;
  longitude: number;
  locationLabel?: string;
  date?: Date;
  timeZone?: string;
  scrubbable?: boolean;
  returnToNow?: boolean;
  showLabels?: boolean;
  onTimeChange?: (d: Date) => void;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

export interface SolarTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Start of the evening golden hour: the moment the sun drops to 6 degrees. */
  goldenStart: Date | null;
}

export interface MoonPhase {
  /** Days since the new moon, 0 to 29.53. */
  age: number;
  /** Illuminated fraction, 0 to 1. */
  illumination: number;
  waxing: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mod = (v: number, m: number) => ((v % m) + m) % m;

interface SunState {
  /** Declination in radians. */
  decl: number;
  /** Equation of time in minutes. */
  eqTime: number;
}

// NOAA solar equations: mean anomaly, equation of centre, apparent longitude, obliquity, declination and equation of time.
function sunState(ms: number): SunState {
  const T = (ms / MS_DAY + 2440587.5 - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360) * DEG;
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * DEG;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    (Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(2 * M) * (0.019993 - 0.000101 * T) +
      Math.sin(3 * M) * 0.000289) *
    DEG;
  const trueLong = L0 + C;
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lambda = trueLong - (0.00569 + 0.00478 * Math.sin(omega)) * DEG;
  const meanObl = (23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60) * DEG;
  const obl = meanObl + 0.00256 * Math.cos(omega) * DEG;
  const decl = Math.asin(Math.sin(obl) * Math.sin(lambda));
  const y = Math.tan(obl / 2) ** 2;
  const eqRad =
    y * Math.sin(2 * L0) -
    2 * e * Math.sin(M) +
    4 * e * y * Math.sin(M) * Math.cos(2 * L0) -
    0.5 * y * y * Math.sin(4 * L0) -
    1.25 * e * e * Math.sin(2 * M);
  return { decl, eqTime: (4 * eqRad) / DEG };
}

/** Sun elevation (refraction-free, degrees above the horizon) and azimuth (degrees clockwise from north). */
export function solarPosition(date: Date, lat: number, lon: number): { elevation: number; azimuth: number } {
  const ms = date.getTime();
  const { decl, eqTime } = sunState(ms);
  const utcMinutes = mod(ms, MS_DAY) / MS_MIN;
  const trueSolarMinutes = utcMinutes + eqTime + 4 * lon;
  const ha = (mod(trueSolarMinutes, 1440) / 4 - 180) * DEG;
  const phi = lat * DEG;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const elevation = 90 - Math.acos(clamp(cosZ, -1, 1)) / DEG;
  const azimuth = mod(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / DEG + 180, 360);
  return { elevation, azimuth };
}

/**
 * Sunrise, sunset, solar noon and the evening golden-hour start for the calendar day of `date`
 * at mean solar time for `lon`. Sunrise and sunset use h0 = -0.833 degrees. Polar day and night return null.
 */
export function solarTimes(date: Date, lat: number, lon: number): SolarTimes {
  const local = new Date(date.getTime() + (lon / 15) * 60 * MS_MIN);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let noon = dayStart + (720 - 4 * lon) * MS_MIN;
  for (let i = 0; i < 3; i++) {
    noon = dayStart + (720 - 4 * lon - sunState(noon).eqTime) * MS_MIN;
  }
  const { decl } = sunState(noon);
  const phi = lat * DEG;
  const cosLatDecl = Math.cos(phi) * Math.cos(decl);
  const sinLatDecl = Math.sin(phi) * Math.sin(decl);
  const halfArc = (cosH: number) => (cosH < -1 || cosH > 1 ? null : (Math.acos(cosH) / DEG) * 4 * MS_MIN);

  const riseSet = halfArc((Math.sin(-0.833 * DEG) - sinLatDecl) / cosLatDecl);
  const golden = halfArc((Math.sin(6 * DEG) - sinLatDecl) / cosLatDecl);

  return {
    sunrise: riseSet === null ? null : new Date(noon - riseSet),
    sunset: riseSet === null ? null : new Date(noon + riseSet),
    solarNoon: new Date(noon),
    goldenStart: golden === null ? null : new Date(noon + golden),
  };
}

/** Moon age from the new moon at 2000-01-06 18:14 UTC, and the illuminated fraction. */
export function moonPhase(date: Date): MoonPhase {
  const days = (date.getTime() - MOON_EPOCH) / MS_DAY;
  const age = mod(days, MOON_SYNODIC);
  return {
    age,
    illumination: (1 - Math.cos((2 * Math.PI * age) / MOON_SYNODIC)) / 2,
    waxing: age < MOON_SYNODIC / 2,
  };
}

// Overlap fraction of two discs of MOON_RADIUS whose centres are `d` apart.
function discOverlap(d: number) {
  const r = MOON_RADIUS;
  if (d >= 2 * r) return 0;
  const area = 2 * r * r * Math.acos(d / (2 * r)) - (d / 2) * Math.sqrt(4 * r * r - d * d);
  return area / (Math.PI * r * r);
}

// Shadow offset that leaves exactly `illumination` of the disc lit. Negative shifts the shadow left (waxing: lit on the right).
function shadowOffset(illumination: number, waxing: boolean) {
  const dark = 1 - illumination;
  let lo = 0;
  let hi = 2 * MOON_RADIUS;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (discOverlap(mid) > dark) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  return waxing ? -d : d;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbText([r, g, b]: [number, number, number]) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function skyAt(elevation: number) {
  const first = SKY_STOPS[0];
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  const x = clamp(elevation, first[0], last[0]);
  let i = 0;
  while (i < SKY_STOPS.length - 2 && x > SKY_STOPS[i + 1][0]) i++;
  const a = SKY_STOPS[i];
  const b = SKY_STOPS[i + 1];
  const k = (x - a[0]) / (b[0] - a[0]);
  const mix = (ca: string, cb: string): [number, number, number] => {
    const A = hexRgb(ca);
    const B = hexRgb(cb);
    return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k];
  };
  const horizon = mix(a[3], b[3]);
  return {
    top: rgbText(mix(a[1], b[1])),
    mid: rgbText(mix(a[2], b[2])),
    horizon: rgbText(horizon),
    ground: rgbText([horizon[0] * 0.92, horizon[1] * 0.92, horizon[2] * 0.92]),
  };
}

// Piecewise map of elevation to a y pixel: [-20, 0] fills the ground to the horizon, [0, maxNoon + 5] fills the sky up to 12px.
function elevationY(elevation: number, height: number, maxNoon: number) {
  const horizonY = height * HORIZON;
  if (elevation <= 0) {
    const k = clamp(-elevation / 20, 0, 1);
    return horizonY + k * (height - horizonY);
  }
  const top = Math.max(maxNoon + 5, 1);
  const k = clamp(elevation / top, 0, 1);
  return horizonY - k * (horizonY - TOP_PAD);
}

function isValidZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Server and first client render use the given zone or UTC, so hydration text matches. The browser zone applies after mount.
function resolveZone(timeZone: string | undefined, mounted: boolean) {
  if (!mounted) return timeZone && isValidZone(timeZone) ? timeZone : "UTC";
  if (!timeZone) return browserZone();
  if (isValidZone(timeZone)) return timeZone;
  if (!warnedZones.has(timeZone)) {
    warnedZones.add(timeZone);
    console.warn(`SolarSkyPanel: invalid timeZone "${timeZone}", falling back to the local zone.`);
  }
  return browserZone();
}

interface ZoneParts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
}

function zoneParts(ms: number, zone: string): ZoneParts {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatterCache.set(zone, formatter);
  }
  const out: Record<string, number> = {};
  for (const part of formatter.formatToParts(ms)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, min: out.minute };
}

function zoneOffset(ms: number, zone: string) {
  const p = zoneParts(ms, zone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / MS_MIN) * MS_MIN;
}

function zoneMidnight(ms: number, zone: string) {
  const p = zoneParts(ms, zone);
  const guess = Date.UTC(p.y, p.m - 1, p.d);
  const first = guess - zoneOffset(guess, zone);
  return guess - zoneOffset(first, zone);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatClock(ms: number, zone: string) {
  const p = zoneParts(ms, zone);
  return `${pad2(p.h)}:${pad2(p.min)}`;
}

function formatCoordinates(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}  ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;
}

const noopSubscribe = () => () => {};
const mountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, MS_MIN);
  return () => window.clearInterval(id);
}

// The minute bucket changes once a minute, so the value is stable between renders.
function clockSnapshot() {
  return Math.floor(Date.now() / MS_MIN) * MS_MIN;
}

function serverClockSnapshot() {
  return 0;
}

function wrapOffset(v: number) {
  return mod(v + SCRUB_LIMIT, 2 * SCRUB_LIMIT) - SCRUB_LIMIT;
}

// The day's dashed elevation curve. Memoised on primitives, so scrubbing within a day does not recompute it.
const SunPath = memo(function SunPath({
  dayStart,
  latitude,
  longitude,
  noonElevation,
  width,
  height,
}: {
  dayStart: number;
  latitude: number;
  longitude: number;
  noonElevation: number;
  width: number;
  height: number;
}) {
  if (width <= 0 || height <= 0) return null;
  const points: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const elevation = solarPosition(new Date(dayStart + i * 30 * MS_MIN), latitude, longitude).elevation;
    const x = (i / 48) * width;
    const y = elevationY(elevation, height, noonElevation);
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return <path d={points.join(" ")} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="2 4" />;
});

export function SolarSkyPanel({
  latitude,
  longitude,
  locationLabel,
  date,
  timeZone,
  scrubbable = true,
  returnToNow = true,
  showLabels = true,
  onTimeChange,
  tone,
  attract = false,
  className,
}: SolarSkyPanelProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const reduceMotion = useReducedMotion() ?? false;
  const mounted = useSyncExternalStore(noopSubscribe, mountedSnapshot, serverMountedSnapshot);
  const clock = useSyncExternalStore(subscribeClock, clockSnapshot, serverClockSnapshot);
  const zone = resolveZone(timeZone, mounted);
  const baseMs = date ? date.getTime() : clock;

  const [offset, setOffsetState] = useState(0);
  const offsetRef = useRef(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [returning, setReturning] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(surfaceRef);
  const dragRef = useRef<{ id: number; x: number; start: number; moved: boolean } | null>(null);
  const returnRef = useRef<{ stop: () => void } | null>(null);
  const idleTimerRef = useRef(0);
  const onTimeChangeRef = useRef(onTimeChange);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useEffect(() => {
    const timer = idleTimerRef;
    return () => window.clearTimeout(timer.current);
  }, []);

  const setOffset = (v: number) => {
    offsetRef.current = v;
    setOffsetState(v);
  };

  const commit = (v: number) => {
    setOffset(v);
    onTimeChangeRef.current?.(new Date(baseMs + v * MS_MIN));
  };

  const markInteracting = () => {
    setInteracting(true);
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setInteracting(false), ATTRACT_IDLE_MS);
  };

  const stopReturn = () => {
    returnRef.current?.stop();
    returnRef.current = null;
    setReturning(false);
  };

  const springBack = () => {
    if (offsetRef.current === 0) return;
    if (reduceMotion) {
      commit(0);
      return;
    }
    setReturning(true);
    returnRef.current = animate(offsetRef.current, 0, {
      ...springs.soft,
      onUpdate: (v) => commit(v),
      onComplete: () => {
        returnRef.current = null;
        setReturning(false);
      },
    });
  };

  const attractOn = attract && !reduceMotion && !interacting;
  const loopOn = attractOn || scrubbing || returning;

  useVisibleLoop(
    rootRef,
    (dt) => {
      if (attractOn) {
        setOffset(wrapOffset(offsetRef.current + dt * ATTRACT_MIN_PER_S));
        return true;
      }
      return scrubbing || returning;
    },
    { enabled: loopOn },
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!scrubbable || e.button !== 0) return;
    markInteracting();
    stopReturn();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId, x: e.clientX, start: offsetRef.current, moved: false };
    setScrubbing(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    if (e.clientX !== drag.x) drag.moved = true;
    commit(clamp(drag.start + (e.clientX - drag.x) * SCRUB_PX_TO_MIN, -SCRUB_LIMIT, SCRUB_LIMIT));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    setScrubbing(false);
    // A tap without a drag leaves the time alone. Only a scrub springs back.
    if (returnToNow && drag.moved) springBack();
  };

  // Arrow right and up move later, the same direction as dragging right.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!scrubbable) return;
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = offsetRef.current + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = offsetRef.current - step;
        break;
      case "Home":
        next = 0;
        break;
      default:
        return;
    }
    e.preventDefault();
    markInteracting();
    stopReturn();
    commit(clamp(next, -SCRUB_LIMIT, SCRUB_LIMIT));
  };

  const instantMs = baseMs + offset * MS_MIN;
  const instant = new Date(instantMs);
  const sun = solarPosition(instant, latitude, longitude);
  const times = solarTimes(instant, latitude, longitude);
  const noonElevation = solarPosition(times.solarNoon, latitude, longitude).elevation;
  const polarLabel = times.sunrise === null ? (noonElevation > 0 ? "Polar day" : "Polar night") : null;

  const parts = zoneParts(instantMs, zone);
  const minutesOfDay = parts.h * 60 + parts.min;
  const clockText = `${pad2(parts.h)}:${pad2(parts.min)}`;
  const sky = skyAt(sun.elevation);
  const sunriseText = times.sunrise ? formatClock(times.sunrise.getTime(), zone) : "";
  const sunsetText = times.sunset ? formatClock(times.sunset.getTime(), zone) : "";

  const sunX = (minutesOfDay / 1440) * width;
  const sunY = elevationY(sun.elevation, height, noonElevation);
  const moonX = ((((minutesOfDay + 720) % 1440) / 1440) * width);
  const moonY = elevationY(-sun.elevation, height, noonElevation);
  const phase = moonPhase(instant);
  const moonShift = shadowOffset(phase.illumination, phase.waxing);
  const horizonY = height * HORIZON;

  const dayStart = zoneMidnight(instantMs, zone);

  const glowAlpha = 0.6 * Math.max(0, 1 - Math.abs(sun.elevation) / 12);
  const valueText = `${clockText}, sun ${Math.abs(Math.round(sun.elevation))} degrees ${sun.elevation >= 0 ? "above" : "below"} the horizon`;
  const stripBackground = resolvedTone === "dark" ? "rgba(5,5,5,0.45)" : "rgba(255,252,246,0.65)";
  const borderColor = resolvedTone === "dark" ? "rgba(255,255,255,0.06)" : palette.borderStrong;

  const surfaceStyle = {
    background: `linear-gradient(to bottom, ${sky.top} 0%, ${sky.mid} 34%, ${sky.horizon} ${HORIZON * 100}%, ${sky.ground} ${HORIZON * 100}%, ${sky.ground} 100%)`,
    borderColor,
    cursor: scrubbable ? (scrubbing ? "grabbing" : "grab") : "default",
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Sky over ${locationLabel ?? formatCoordinates(latitude, longitude)}`}
      className={cn("w-[360px] max-w-full", className)}
    >
      <div
        ref={surfaceRef}
        role="slider"
        tabIndex={scrubbable ? 0 : -1}
        aria-label="Time of day"
        aria-valuemin={-720}
        aria-valuemax={720}
        aria-valuenow={Math.round(offset)}
        aria-valuetext={valueText}
        aria-disabled={scrubbable ? undefined : true}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative aspect-[3/2] w-full touch-none select-none overflow-hidden rounded-[20px] border outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]"
        style={surfaceStyle}
      >
        {STARS.map((star, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute h-px w-px rounded-full bg-white"
            style={{
              left: `${star.x * 100}%`,
              top: `${star.y * HORIZON * 100}%`,
              opacity: clamp(-sun.elevation / 12, 0, 1) * 0.8 * (0.5 + star.s * 0.5),
            }}
          />
        ))}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-px w-full bg-white/[0.22]"
          style={{ transform: `translate3d(0, ${horizonY}px, 0)` }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-[60px] w-[240px]"
          style={{
            transform: `translate3d(${sunX - 120}px, ${horizonY - 30}px, 0)`,
            background: `radial-gradient(closest-side, rgba(255,190,120,${glowAlpha.toFixed(3)}), rgba(255,190,120,0))`,
          }}
        />

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0"
          width={width}
          height={height}
        >
          <SunPath
            dayStart={dayStart}
            latitude={latitude}
            longitude={longitude}
            noonElevation={noonElevation}
            width={width}
            height={height}
          />
        </svg>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-[14px] w-[14px] rounded-full bg-[#fff6e0] transition-opacity duration-300"
          style={{
            transform: `translate3d(${sunX - 7}px, ${sunY - 7}px, 0)`,
            opacity: sun.elevation < -2 ? 0 : 1,
            boxShadow: "0 0 24px 6px rgba(255,200,120,0.55)",
          }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-3 w-3 transition-opacity duration-300"
          style={{
            transform: `translate3d(${moonX - 6}px, ${moonY - 6}px, 0)`,
            opacity: sun.elevation < -4 ? 1 : 0,
          }}
        >
          <div className="absolute inset-0 overflow-hidden rounded-full bg-[#e9edf5]">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: sky.mid, transform: `translate3d(${moonShift}px, 0, 0)` }}
            />
          </div>
        </div>

        {showLabels && (
          <div
            className="pointer-events-none absolute left-4 top-3.5 text-white"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,.35)" }}
          >
            {locationLabel && <div className="font-bjork-alpha text-[12px] font-medium leading-none">{locationLabel}</div>}
            <div className="mt-1.5 font-mono text-[10px] leading-none tabular-nums text-white/70">
              {formatCoordinates(latitude, longitude)}
            </div>
          </div>
        )}

        {showLabels && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 font-mono text-[12px] tabular-nums whitespace-nowrap backdrop-blur-[10px]"
            style={{ background: stripBackground, color: palette.text }}
          >
            <span className="justify-self-start">{polarLabel ?? `↑ ${sunriseText}`}</span>
            <span>
              {`${clockText} · ${Math.round(sun.elevation)}°`}
              {scrubbing ? " · scrubbing" : ""}
            </span>
            <span className="justify-self-end">{polarLabel ? "—" : `↓ ${sunsetText}`}</span>
          </div>
        )}
      </div>
    </div>
  );
}
