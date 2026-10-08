"use client";

// Shared plumbing for the bjork-ui AI components: tone tokens, reduced motion, controllable state and
// number formatting. Every AI component imports from here so they read as one family.

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "framer-motion";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";

export type { BjorkTone };
export type BjorkPalette = (typeof BJORK_PALETTE)[BjorkTone];

const noopSubscribe = () => () => {};

/** False on the server and the first client render, true after hydration. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Hydration-safe reduced motion: both sides report "not reduced" until mount, then the real value applies. */
export function useReduceMotion(): boolean {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  return hydrated && reduced === true;
}

/**
 * Resolves the tone and returns the CSS custom properties for it. Spread `style` on the component root so an
 * explicit `tone` prop wins over the page theme, and status colours (success, warning, error) are always defined.
 */
export function useAiTone(toneProp?: BjorkTone) {
  const tone = useBjorkTone(toneProp);
  const pal = BJORK_PALETTE[tone];
  const light = tone === "light";
  const style = {
    "--bjork-text": pal.text,
    "--bjork-text-medium": pal.textMedium,
    "--bjork-text-muted": pal.textMuted,
    "--bjork-text-soft": pal.textSoft,
    "--bjork-text-faint": pal.textFaint,
    "--bjork-hair": pal.hair,
    "--bjork-border": pal.border,
    "--bjork-border-strong": pal.borderStrong,
    "--bjork-surface": pal.surface,
    "--bjork-raised": pal.raised,
    "--bjork-surface-active": pal.active,
    "--bjork-accent": pal.accent,
    "--bjork-accent-ink": pal.accentInk,
    "--bjork-accent-fill": pal.accentFill,
    "--bjork-accent-soft": pal.accentSoft,
    "--bjork-accent-muted": pal.accentMuted,
    "--bjork-accent-foreground": pal.accentFg,
    "--bjork-success": pal.success,
    "--bjork-warning": pal.warning,
    "--bjork-error": pal.error,
    "--bjork-ring-offset": pal.bg,
    "--bjork-field": light ? "rgba(255, 252, 246, 0.96)" : "rgba(18, 18, 18, 0.95)",
    "--bjork-field-inset": light ? "rgba(239, 231, 216, 0.72)" : "rgba(9, 9, 9, 0.75)",
    "--bjork-menu": light ? "rgba(255, 252, 246, 0.98)" : "rgba(18, 18, 18, 0.98)",
    "--bjork-shadow-menu": light
      ? "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 0 12px 24px rgba(88, 72, 49, 0.022), 0 22px 44px -26px rgba(66, 52, 33, 0.22)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.055), inset 0 12px 24px rgba(255, 255, 255, 0.018), 0 22px 42px -22px rgba(0, 0, 0, 0.9)",
    "--bjork-shadow-surface": light
      ? "inset 0 7px 14px rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.92), 0 14px 22px -9px rgba(66, 52, 33, 0.11)"
      : "inset 0 7px 14px rgba(255, 255, 255, 0.03), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.06), 0 14px 20px -6px rgba(0, 0, 0, 0.45)",
    colorScheme: tone,
  } as CSSProperties;
  return { tone, pal, style };
}

/** Classes for the shared keyboard focus ring. */
export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]";

/** Classes for the shared press feedback. */
export const PRESS = "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none";

/**
 * Controlled-or-uncontrolled state. Pass `value` to control it; `onChange` fires for every change either way.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const current = controlled ? value : inner;
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChangeRef.current?.(next);
    },
    [controlled],
  );
  return [current, set];
}

/** 1234 -> "1,234", 18400 -> "18.4k", 1_200_000 -> "1.2M". */
export function formatTokens(n: number): string {
  if (n < 10_000) return Math.round(n).toLocaleString("en-US");
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1).replace(/\.?0+$/, "")}M`;
}

/** US dollars with sub-cent precision when it matters: 0.0042 -> "$0.0042", 12.5 -> "$12.50". */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (Math.abs(usd) < 0.01) return `$${usd.toFixed(4)}`;
  if (Math.abs(usd) < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 640 -> "640ms", 4200 -> "4.2s", 95000 -> "1m 35s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** 2_400_000 bytes -> "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Shimmer keyframes for "working" text. Mount once with <style href=... precedence="default">. */
export const SHIMMER_TEXT_CSS =
  "@keyframes bjork-ai-shimmer{from{background-position:100% 0}to{background-position:0% 0}}" +
  ".bjork-ai-shimmer{background-image:linear-gradient(90deg,var(--bjork-text-muted) 0%,var(--bjork-text-muted) 40%,var(--bjork-text) 50%,var(--bjork-text-muted) 60%,var(--bjork-text-muted) 100%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:bjork-ai-shimmer 1.8s linear infinite}" +
  "@media (prefers-reduced-motion: reduce){.bjork-ai-shimmer{animation:none;background:none;color:var(--bjork-text-muted)}}";
