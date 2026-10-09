"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Copy } from "lucide-react";
import {
  blockFrame,
  blockToneProps,
  CtaLink,
  focusRing,
  Reveal,
  SampleMark,
  useBlockReducedMotion,
  type BlockLink,
  type BlockTone,
} from "@/components/bjork-ui/blocks/marketing-kit";
import { cn } from "@/lib/utils";

export interface FooterColumn {
  title: string;
  links: BlockLink[];
}

export interface MarketingCtaFooterProps {
  cta: {
    title: ReactNode;
    description?: ReactNode;
    primary: BlockLink;
    secondary?: BlockLink;
    /** A shell command with a copy button, such as an install line. */
    command?: string;
  };
  brand: { name: string; href: string; logo?: ReactNode; tagline?: string };
  columns: FooterColumn[];
  newsletter?: {
    label: string;
    description?: string;
    placeholder?: string;
    submitLabel?: string;
    successMessage?: string;
    /** Resolve to confirm, throw to show `error.message`. Without it the form only validates. */
    onSubscribe?: (email: string) => Promise<void> | void;
  };
  /** Status pill in the bottom bar. */
  status?: { label: string; href: string; state?: "ok" | "degraded" | "down" };
  legal: string;
  legalLinks?: BlockLink[];
  /** Draw the brand name large across the bottom edge. */
  wordmark?: boolean;
  tone?: BlockTone;
  /** Play the in-view motion. Turn off for screenshots. */
  animate?: boolean;
  className?: string;
}

export const MARKETING_CTA_FOOTER_SAMPLE: MarketingCtaFooterProps = {
  cta: {
    title: "Your next incident is already in a trace.",
    description: "Install the SDK, ship one run, and see every step it took. Free up to 10,000 traces a month.",
    primary: { label: "Start tracing free", href: "#signup" },
    secondary: { label: "Talk to an engineer", href: "#contact" },
    command: "npm install @tracewell/sdk",
  },
  brand: {
    name: "Tracewell",
    href: "#",
    tagline: "Traces, replays and alerts for AI agents in production.",
  },
  columns: [
    {
      title: "Product",
      links: [
        { label: "Traces", href: "#traces" },
        { label: "Replay", href: "#replay" },
        { label: "Alerts", href: "#alerts" },
        { label: "Pricing", href: "#pricing" },
        { label: "Changelog", href: "#changelog" },
      ],
    },
    {
      title: "Developers",
      links: [
        { label: "Documentation", href: "#docs" },
        { label: "SDK reference", href: "#sdk" },
        { label: "OpenTelemetry", href: "#otel" },
        { label: "Examples", href: "#examples" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#about" },
        { label: "Customers", href: "#customers" },
        { label: "Careers", href: "#careers" },
        { label: "Contact", href: "#contact" },
      ],
    },
  ],
  newsletter: {
    label: "Field notes",
    description: "One email a month on running agents in production. No launches dressed up as advice.",
    placeholder: "you@company.com",
    submitLabel: "Subscribe",
    successMessage: "You are on the list. The next issue goes out on the first Tuesday.",
  },
  status: { label: "All systems normal", href: "#status", state: "ok" },
  legal: "© 2026 Tracewell Labs, Inc.",
  legalLinks: [
    { label: "Privacy", href: "#privacy" },
    { label: "Terms", href: "#terms" },
    { label: "Security", href: "#security" },
  ],
  wordmark: true,
};

const STATUS_DOT = {
  ok: "bg-[#3fa774]",
  degraded: "bg-[#f2b544]",
  down: "bg-[#ff5c4d]",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The end of a landing page: a closing call to action with an install command you can copy, then the
 * site footer with link columns, a newsletter form, a status pill, legal links and an oversized wordmark.
 */
export function MarketingCtaFooter({
  cta,
  brand,
  columns,
  newsletter,
  status,
  legal,
  legalLinks,
  wordmark = true,
  tone = "auto",
  animate = true,
  className,
}: MarketingCtaFooterProps) {
  const ctaTitleId = useId();
  const toneProps = blockToneProps(tone);

  const ctaCard = (
    <section
      aria-labelledby={ctaTitleId}
      className="relative isolate overflow-hidden rounded-[28px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] px-6 py-14 shadow-[var(--bjork-shadow-panel)] @2xl:px-12 @2xl:py-20"
    >
      <CtaBackdrop />
      <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
        <h2
          id={ctaTitleId}
          className="text-balance font-bjork-display text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] @xl:text-[48px] @4xl:text-[56px]"
        >
          {cta.title}
        </h2>
        {cta.description ? (
          <p className="mt-5 max-w-[50ch] text-pretty text-[16px] leading-7 text-[color:var(--bjork-text-medium)] @xl:text-[17px]">
            {cta.description}
          </p>
        ) : null}
        <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 @md:w-auto @md:flex-row @md:items-center">
          <CtaLink link={cta.primary} arrow />
          {cta.secondary ? <CtaLink link={cta.secondary} variant="secondary" /> : null}
        </div>
        {cta.command ? <CommandCopy command={cta.command} /> : null}
      </div>
    </section>
  );

  return (
    <div
      {...toneProps}
      className={cn(
        "@container w-full bg-[var(--bjork-bg)] font-bjork-alpha text-[color:var(--bjork-text)]",
        toneProps.className,
        className,
      )}
    >
      <div className={cn(blockFrame, "pt-16 @3xl:pt-24")}>{animate ? <Reveal>{ctaCard}</Reveal> : ctaCard}</div>

      <footer className="relative mt-20 overflow-hidden border-t border-[color:var(--bjork-border)] @3xl:mt-28">
        <h2 className="sr-only">Site footer</h2>
        <div className={cn(blockFrame, "grid gap-12 py-14 @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)] @4xl:gap-16 @4xl:py-16")}>
          <div className="flex flex-col gap-8">
            <div>
              <a
                href={brand.href}
                className={cn("inline-flex items-center gap-2.5 rounded-[8px] text-[16px] font-semibold tracking-[-0.02em]", focusRing)}
              >
                {brand.logo ?? <SampleMark />}
                {brand.name}
              </a>
              {brand.tagline ? (
                <p className="mt-3 max-w-[36ch] text-[14px] leading-6 text-[color:var(--bjork-text-muted)]">{brand.tagline}</p>
              ) : null}
            </div>
            {newsletter ? <Newsletter {...newsletter} /> : null}
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 @xl:grid-cols-3">
            {columns.map((column) => (
              <FooterLinks key={column.title} column={column} />
            ))}
          </nav>
        </div>

        <div className={blockFrame}>
        <div className="flex flex-col gap-4 border-t border-[color:var(--bjork-border-muted)] py-6 @2xl:flex-row @2xl:items-center @2xl:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[color:var(--bjork-text-muted)]">
            <p>{legal}</p>
            {legalLinks && legalLinks.length > 0 ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={link.onClick}
                      className={cn("rounded-[4px] transition-colors duration-150 hover:text-[color:var(--bjork-text)]", focusRing)}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {status ? (
            <a
              href={status.href}
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] px-3 py-1.5 text-[12.5px] text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:text-[color:var(--bjork-text)]",
                focusRing,
              )}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_DOT[status.state ?? "ok"])} />
              {status.label}
            </a>
          ) : null}
        </div>
        </div>

        {wordmark ? (
          <div aria-hidden className="pointer-events-none select-none overflow-hidden">
            <p
              className="-mb-[0.22em] text-center font-bjork-display font-semibold leading-[0.8] tracking-[-0.06em] text-transparent"
              style={{
                fontSize: "clamp(72px, 19cqw, 280px)",
                WebkitTextStroke: "1px var(--bjork-border-strong)",
                backgroundImage: "linear-gradient(to bottom, var(--bjork-border-muted), transparent 85%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
              }}
            >
              {brand.name}
            </p>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

function CtaBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(var(--bjork-border-strong) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(ellipse 70% 80% at 50% 100%, #000 10%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 80% at 50% 100%, #000 10%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-[-40%] left-1/2 h-[80%] w-[80%] -translate-x-1/2 rounded-[50%] blur-[70px]"
        style={{ background: "radial-gradient(closest-side, var(--bjork-accent-soft), transparent)" }}
      />
    </div>
  );
}

function CommandCopy({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const reduce = useBlockReducedMotion();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-8 flex w-full max-w-[420px] items-center gap-2 rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] py-1.5 pl-4 pr-1.5 shadow-[var(--bjork-shadow-inset)]">
      <span aria-hidden className="font-mono text-[13px] text-[color:var(--bjork-text-faint)]">
        $
      </span>
      <code className="min-w-0 flex-1 truncate text-left font-mono text-[13px] text-[color:var(--bjork-text-strong)]">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy command: ${command}`}
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-[9px] text-[color:var(--bjork-text-muted)] transition-[transform,color,background-color] duration-150 hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] active:scale-[0.94] motion-reduce:transition-none",
          focusRing,
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copied ? "done" : "copy"}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: "blur(2px)" }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className="grid place-items-center"
          >
            {copied ? (
              <Check aria-hidden className="size-4 text-[color:var(--bjork-accent)]" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Command copied to clipboard" : ""}
      </span>
    </div>
  );
}

function FooterLinks({ column }: { column: FooterColumn }) {
  const headingId = useId();
  return (
    <div>
      <h3 id={headingId} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--bjork-text-soft)]">
        {column.title}
      </h3>
      <ul aria-labelledby={headingId} className="mt-4 flex flex-col gap-2.5">
        {column.links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              onClick={link.onClick}
              className={cn(
                "rounded-[4px] text-[14px] text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:text-[color:var(--bjork-text)]",
                focusRing,
              )}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

type FormState = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

function Newsletter({
  label,
  description,
  placeholder = "you@company.com",
  submitLabel = "Subscribe",
  successMessage = "Thanks, you are subscribed.",
  onSubscribe,
}: NonNullable<MarketingCtaFooterProps["newsletter"]>) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const inputId = useId();
  const descriptionId = useId();
  const messageId = useId();
  const reduce = useBlockReducedMotion();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setState({ kind: "error", message: "Enter an email address like name@company.com." });
      return;
    }
    setState({ kind: "sending" });
    try {
      await onSubscribe?.(value);
      setState({ kind: "done" });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "That did not go through. Try again." });
    }
  };

  const invalid = state.kind === "error";

  return (
    <form onSubmit={submit} noValidate className="max-w-[420px]">
      <label htmlFor={inputId} className="text-[14px] font-medium text-[color:var(--bjork-text)]">
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="mt-1 text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">
          {description}
        </p>
      ) : null}
      <AnimatePresence mode="wait" initial={false}>
        {state.kind === "done" ? (
          <motion.p
            key="done"
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="mt-3 flex items-start gap-2 rounded-[13px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] px-3.5 py-3 text-[13.5px] leading-5 text-[color:var(--bjork-text-medium)]"
          >
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[color:var(--bjork-accent)]" />
            {successMessage}
          </motion.p>
        ) : (
          <motion.div key="form" exit={{ opacity: 0, transition: { duration: 0.12 } }} className="mt-3 flex gap-2">
            <input
              id={inputId}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder={placeholder}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              aria-invalid={invalid || undefined}
              aria-describedby={[description ? descriptionId : null, invalid ? messageId : null].filter(Boolean).join(" ") || undefined}
              className={cn(
                "h-11 min-w-0 flex-1 rounded-[13px] border bg-[var(--bjork-field)] px-3.5 text-[14px] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-inset)] transition-colors duration-150 placeholder:text-[color:var(--bjork-text-soft)]",
                invalid ? "border-[#d9634f]" : "border-[color:var(--bjork-border)]",
                focusRing,
              )}
            />
            <button
              type="submit"
              disabled={state.kind === "sending"}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[13px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] px-4 text-[14px] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] transition-[transform,background-color] duration-150 hover:bg-[var(--bjork-surface-hover)] active:scale-[0.97] disabled:opacity-60 motion-reduce:transition-none",
                focusRing,
              )}
            >
              {state.kind === "sending" ? "Sending" : submitLabel}
              <ArrowRight aria-hidden className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <p id={messageId} role="status" aria-live="polite" className={cn("mt-2 min-h-5 text-[12.5px]", invalid ? "text-[#d9634f]" : "sr-only")}>
        {invalid ? state.message : state.kind === "done" ? successMessage : ""}
      </p>
    </form>
  );
}
