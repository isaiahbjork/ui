"use client";

import {
  useSyncExternalStore,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared pieces for the marketing blocks: tone scoping, hydration-safe reduced motion,
 * the section heading, call-to-action links and the in-view reveal.
 */

export type BlockTone = "light" | "dark" | "auto";

const subscribeNoop = () => () => {};

/** `true` once hydrated and the visitor asked for reduced motion. The server and first client render agree on `false`. */
export function useBlockReducedMotion(): boolean {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const prefers = useReducedMotion();
  return hydrated && prefers === true;
}

/**
 * Scopes the library tokens to one block. "light" and "dark" re-declare every `--bjork-*` token on the
 * section through the `.light` / `.dark` classes; "auto" inherits whatever the page sets.
 * Blocks only colour through these tokens, never through `dark:` variants, so a forced tone holds.
 */
export function blockToneProps(tone: BlockTone): { className?: string; style?: CSSProperties } {
  if (tone === "auto") return {};
  return { className: tone, style: { colorScheme: tone } };
}

/** Focus ring used by every interactive element in the blocks. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]";

/** Section padding and width that every block shares, so stacked blocks line up. */
export const blockFrame = "mx-auto w-full max-w-[1200px] px-5 @2xl:px-8 @5xl:px-10";

export interface BlockLink {
  label: string;
  href: string;
  /** Optional click handler; the link still navigates unless you call `preventDefault`. */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 font-mono text-[11px] uppercase leading-4 tracking-[0.12em] text-[color:var(--bjork-text-muted)]",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--bjork-accent)]" />
      {children}
    </p>
  );
}

export interface SectionHeaderProps {
  id: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "start" | "center";
  as?: "h1" | "h2" | "h3";
  className?: string;
  children?: ReactNode;
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  align = "start",
  as: Heading = "h2",
  className,
  children,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading
        id={id}
        className="max-w-[20ch] text-balance font-bjork-display text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] text-[color:var(--bjork-text)] @xl:text-[44px] @4xl:text-[52px]"
      >
        {title}
      </Heading>
      {description ? (
        <p className="max-w-[58ch] text-pretty text-[16px] leading-7 text-[color:var(--bjork-text-medium)] @xl:text-[17px]">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

type CtaVariant = "primary" | "secondary" | "ghost";

const ctaBase =
  "group/cta relative inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[13px] px-[18px] text-[14px] font-medium tracking-[-0.01em] transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

const ctaVariants: Record<CtaVariant, string> = {
  primary: "bjork-layered-button-accent text-white",
  secondary:
    "border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] hover:border-[color:var(--bjork-text-faint)] hover:bg-[var(--bjork-surface-hover)]",
  ghost:
    "px-2 text-[color:var(--bjork-text-medium)] hover:text-[color:var(--bjork-text)]",
};

export function CtaLink({
  link,
  variant = "primary",
  arrow = false,
  className,
}: {
  link: BlockLink;
  variant?: CtaVariant;
  arrow?: boolean;
  className?: string;
}) {
  return (
    <a
      href={link.href}
      onClick={link.onClick}
      className={cn(ctaBase, ctaVariants[variant], focusRing, className)}
    >
      <span>{link.label}</span>
      {arrow ? (
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform duration-200 ease-out group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
        />
      ) : null}
    </a>
  );
}

/**
 * Fades and lifts its children the first time they scroll into view. Under reduced motion only the
 * fade runs, with no movement.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const reduce = useBlockReducedMotion();
  const Component = as === "li" ? motion.li : motion.div;
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        opacity: { duration: reduce ? 0.2 : 0.5, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : delay },
        y: reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30, mass: 0.9, delay },
      }}
    >
      {children}
    </Component>
  );
}

/** A small product mark used by the sample content. Swap it for your logo. */
export function SampleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)}>
      <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--bjork-text)" />
      <path
        d="M6.5 15.5h3l2-7 2 7h4"
        fill="none"
        stroke="var(--bjork-bg)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="15.5" r="1.6" fill="var(--bjork-accent)" />
    </svg>
  );
}
