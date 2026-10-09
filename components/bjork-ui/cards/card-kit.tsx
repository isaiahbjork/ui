"use client";

import {
  forwardRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { surfaceVars } from "@/components/bjork-ui/_core/surface";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { cn } from "@/lib/utils";

/** "auto" follows the site theme (next-themes). "light" and "dark" pin the card. */
export type CardTheme = "light" | "dark" | "auto";

/**
 * Card tokens. They are written onto the card root as the library's `--bjork-*` custom properties,
 * so a pinned theme wins over the page theme, and the status colours the global sheet lacks
 * (success, warning, error) are always defined.
 */
export const CARD_TOKENS = {
  dark: {
    card: "#141414",
    raised: "#1b1b1b",
    inset: "#0d0d0d",
    hover: "#1f1f1f",
    border: "#242424",
    borderStrong: "#363636",
    hair: "rgba(237,237,237,0.08)",
    text: "#ededed",
    textMedium: "rgba(237,237,237,0.74)",
    textMuted: "rgba(237,237,237,0.56)",
    textSoft: "rgba(237,237,237,0.4)",
    textFaint: "rgba(237,237,237,0.22)",
    accent: "#ec5c13",
    accentInk: "#f27a3c",
    accentFill: "#b84a12",
    accentFillHover: "#c95517",
    accentFg: "#fff2ea",
    accentSoft: "rgba(236,92,19,0.13)",
    accentMuted: "rgba(236,92,19,0.26)",
    success: "#4cc38a",
    successSoft: "rgba(76,195,138,0.13)",
    warning: "#f2b544",
    warningSoft: "rgba(242,181,68,0.13)",
    error: "#ff6b5c",
    errorSoft: "rgba(255,107,92,0.13)",
    track: "#262626",
    shadow:
      "inset 0 1px 0 rgba(255,255,255,0.045), 0 1px 0 rgba(0,0,0,0.5), 0 24px 48px -28px rgba(0,0,0,0.9)",
    raisedShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  light: {
    card: "#fffcf6",
    raised: "#f7f1e6",
    inset: "#f1eadd",
    hover: "#f3ecdf",
    border: "#ebe2d4",
    borderStrong: "#dbcfbd",
    hair: "rgba(23,23,23,0.07)",
    text: "#171717",
    textMedium: "rgba(23,23,23,0.76)",
    textMuted: "rgba(23,23,23,0.62)",
    textSoft: "rgba(23,23,23,0.46)",
    textFaint: "rgba(23,23,23,0.2)",
    accent: "#ec7d43",
    accentInk: "#a84a19",
    accentFill: "#ec7d43",
    accentFillHover: "#f0935f",
    accentFg: "#3f2112",
    accentSoft: "rgba(236,125,67,0.12)",
    accentMuted: "rgba(236,125,67,0.24)",
    success: "#1b7f4d",
    successSoft: "rgba(31,138,85,0.11)",
    warning: "#966000",
    warningSoft: "rgba(168,107,0,0.11)",
    error: "#c0331d",
    errorSoft: "rgba(200,54,31,0.1)",
    track: "#ebe3d6",
    shadow:
      "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(66,52,33,0.06), 0 22px 44px -28px rgba(66,52,33,0.26)",
    raisedShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
} as const;

export type CardTokens = (typeof CARD_TOKENS)[BjorkTone];

export function cardVars(tone: BjorkTone): CSSProperties {
  const t = CARD_TOKENS[tone];
  return {
    colorScheme: tone,
    ...surfaceVars(tone),
    "--bjork-card": t.card,
    "--bjork-card-raised": t.raised,
    "--bjork-card-inset": t.inset,
    "--bjork-card-hover": t.hover,
    "--bjork-border": t.border,
    "--bjork-border-strong": t.borderStrong,
    "--bjork-hair": t.hair,
    "--bjork-text": t.text,
    "--bjork-text-medium": t.textMedium,
    "--bjork-text-muted": t.textMuted,
    "--bjork-text-soft": t.textSoft,
    "--bjork-text-faint": t.textFaint,
    "--bjork-accent": t.accent,
    "--bjork-accent-ink": t.accentInk,
    "--bjork-accent-fill": t.accentFill,
    "--bjork-accent-fill-hover": t.accentFillHover,
    "--bjork-accent-foreground": t.accentFg,
    "--bjork-accent-soft": t.accentSoft,
    "--bjork-accent-muted": t.accentMuted,
    "--bjork-success": t.success,
    "--bjork-success-soft": t.successSoft,
    "--bjork-warning": t.warning,
    "--bjork-warning-soft": t.warningSoft,
    "--bjork-error": t.error,
    "--bjork-error-soft": t.errorSoft,
    "--bjork-track": t.track,
    "--bjork-card-shadow": t.shadow,
    "--bjork-raised-shadow": t.raisedShadow,
    "--bjork-ring-offset": t.card,
  } as CSSProperties;
}

/** Resolves the card tone and the CSS variables for it. */
export function useCardTheme(theme: CardTheme = "auto") {
  const tone = useBjorkTone(theme === "auto" ? undefined : theme);
  return { tone, tokens: CARD_TOKENS[tone], style: cardVars(tone) };
}

const noopSubscribe = () => () => {};

/** True after hydration. The server render and the first client render both see false. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Reduced-motion preference, hydration-safe: false until mounted. */
export function useReducedMotionSafe() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  return hydrated && reduced === true;
}

const clockStores = new Map<number, { subscribe: (cb: () => void) => () => void; get: () => number }>();

function clockStore(stepMs: number) {
  let store = clockStores.get(stepMs);
  if (!store) {
    store = {
      subscribe: (cb) => {
        const id = window.setInterval(cb, Math.min(stepMs, 1000));
        return () => window.clearInterval(id);
      },
      get: () => Math.floor(Date.now() / stepMs) * stepMs,
    };
    clockStores.set(stepMs, store);
  }
  return store;
}

/**
 * Wall clock rounded to `stepMs`. A fixed `now` (previews, tests) wins. Returns null during SSR and
 * hydration so server and client text agree; callers render a neutral fallback for that frame.
 */
export function useClock(now: number | undefined, stepMs = 60_000): number | null {
  const store = clockStore(stepMs);
  const live = useSyncExternalStore(store.subscribe, store.get, () => null);
  return now ?? live;
}

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]";

export interface CardFrameProps extends HTMLAttributes<HTMLElement> {
  style?: CSSProperties;
  /** Width in px, capped at the container width. Default 420. */
  maxWidth?: number;
  as?: "section" | "article" | "div";
}

/** The shared card surface: tokens, radius, border, shadow and a container query root. */
export const CardFrame = forwardRef<HTMLElement, CardFrameProps>(function CardFrame(
  { as: Tag = "section", maxWidth = 420, className, style, children, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={cn(
        "@container relative max-w-full overflow-hidden rounded-[20px] border border-[color:var(--bjork-border-muted)] bg-[color:var(--bjork-card)] font-bjork-alpha text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] [font-variant-numeric:tabular-nums]",
        className,
      )}
      // A fixed width capped at the container: fills narrow columns, and keeps its size inside
      // shrink-to-fit parents (flex centring, popovers) where a percentage width would collapse.
      style={{ width: maxWidth, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
});

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface CardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)] hover:bg-[color:var(--bjork-accent-fill-hover)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]",
  secondary:
    "border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] text-[color:var(--bjork-text)] shadow-[var(--bjork-raised-shadow)] hover:bg-[color:var(--bjork-card-hover)] hover:border-[color:var(--bjork-border-strong)]",
  ghost:
    "text-[color:var(--bjork-text-medium)] hover:bg-[color:var(--bjork-card-hover)] hover:text-[color:var(--bjork-text)]",
  danger:
    "border border-[color:var(--bjork-border)] bg-[color:var(--bjork-error-soft)] text-[color:var(--bjork-error)] hover:border-[color:var(--bjork-error)]",
};

export const CardButton = forwardRef<HTMLButtonElement, CardButtonProps>(function CardButton(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
        size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]",
        buttonVariants[variant],
        focusRing,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export type PillTone = "neutral" | "accent" | "success" | "warning" | "error";

const pillTones: Record<PillTone, string> = {
  neutral: "bg-[color:var(--bjork-hair)] text-[color:var(--bjork-text-medium)]",
  accent: "bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)]",
  success: "bg-[color:var(--bjork-success-soft)] text-[color:var(--bjork-success)]",
  warning: "bg-[color:var(--bjork-warning-soft)] text-[color:var(--bjork-warning)]",
  error: "bg-[color:var(--bjork-error-soft)] text-[color:var(--bjork-error)]",
};

/** Small status label. `dot` adds a leading status dot; `pulse` animates it (not under reduced motion). */
export function Pill({
  tone = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none",
        pillTones[tone],
        className,
      )}
    >
      {dot && (
        <span aria-hidden="true" className="relative inline-flex size-1.5">
          {pulse && (
            <span className="absolute inset-0 rounded-full bg-current opacity-60 motion-safe:animate-ping" />
          )}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

/** Loading placeholder. Shimmers unless reduced motion is on. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block rounded-[6px] bg-[color:var(--bjork-hair)] motion-safe:animate-pulse", className)}
      style={style}
    />
  );
}

/** Deterministic pseudo-random generator for sample data, so server and client agree. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}
