"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { useReducedMotion } from "framer-motion";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { cn } from "@/lib/utils";

// Shared plumbing for the application blocks (app-*). Every block is a full layout that sizes itself to its
// container, not the viewport, so it behaves the same pasted into a page, a dialog or a docs preview.

export type AppBlockTheme = "light" | "dark" | "auto";

// The library tokens, so a forced theme works even when the page itself is in the other mode.
const TOKENS: Record<BjorkTone, Record<string, string>> = {
  light: {
    "--bjork-bg": "#f7f3ea",
    "--bjork-surface": "#fffcf6",
    "--bjork-surface-muted": "rgba(250, 246, 237, 0.94)",
    "--bjork-surface-hover": "#f5efe3",
    "--bjork-surface-active": "#efe7d8",
    "--bjork-panel": "#f8f2e7",
    "--bjork-menu": "rgba(255, 252, 246, 0.98)",
    "--bjork-field": "rgba(255, 252, 246, 0.96)",
    "--bjork-field-muted": "rgba(248, 242, 231, 0.82)",
    "--bjork-field-inset": "rgba(239, 231, 216, 0.72)",
    "--bjork-error-bg": "#fff0e8",
    "--bjork-text": "#171717",
    "--bjork-text-strong": "rgba(23, 23, 23, 0.9)",
    "--bjork-text-medium": "rgba(23, 23, 23, 0.72)",
    "--bjork-text-muted": "rgba(23, 23, 23, 0.56)",
    "--bjork-text-soft": "rgba(23, 23, 23, 0.46)",
    "--bjork-text-faint": "rgba(23, 23, 23, 0.22)",
    "--bjork-inverted-text": "#fff8f0",
    "--bjork-border": "#eee6db",
    "--bjork-border-muted": "#f5ede2",
    "--bjork-border-strong": "#e1d7c8",
    "--bjork-thumb": "#a49b8e",
    "--bjork-track": "#ded6ca",
    "--bjork-accent": "#ec7d43",
    "--bjork-accent-hover": "#f0935f",
    "--bjork-accent-soft": "rgba(236, 125, 67, 0.1)",
    "--bjork-accent-muted": "rgba(236, 125, 67, 0.2)",
    "--bjork-accent-foreground": "#3f2112",
    "--bjork-shadow-surface":
      "inset 0 7px 14px rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.92), inset 1px 0 0 rgba(88, 72, 49, 0.026), inset -1px 0 0 rgba(255, 255, 255, 0.68), 0 14px 22px -9px rgba(66, 52, 33, 0.11)",
    "--bjork-shadow-soft": "inset 0 1px 0 rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.86)",
    "--bjork-shadow-panel":
      "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.64), 0 18px 38px -30px rgba(66, 52, 33, 0.2)",
    "--bjork-shadow-menu":
      "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 0 12px 24px rgba(88, 72, 49, 0.022), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.62), 0 22px 44px -26px rgba(66, 52, 33, 0.22)",
    "--bjork-shadow-inset": "inset 0 1px 10px rgba(88, 72, 49, 0.12), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.72)",
    "--bjork-ring-offset": "#f7f3ea",
  },
  dark: {
    "--bjork-bg": "#111111",
    "--bjork-surface": "#121212",
    "--bjork-surface-muted": "rgba(22, 22, 22, 0.92)",
    "--bjork-surface-hover": "#181818",
    "--bjork-surface-active": "#202020",
    "--bjork-panel": "#0d0d0d",
    "--bjork-menu": "rgba(18, 18, 18, 0.98)",
    "--bjork-field": "rgba(18, 18, 18, 0.95)",
    "--bjork-field-muted": "rgba(18, 18, 18, 0.55)",
    "--bjork-field-inset": "rgba(9, 9, 9, 0.75)",
    "--bjork-error-bg": "#130d0a",
    "--bjork-text": "#ededed",
    "--bjork-text-strong": "rgba(237, 237, 237, 0.9)",
    "--bjork-text-medium": "rgba(237, 237, 237, 0.72)",
    "--bjork-text-muted": "rgba(237, 237, 237, 0.52)",
    "--bjork-text-soft": "rgba(237, 237, 237, 0.4)",
    "--bjork-text-faint": "rgba(237, 237, 237, 0.22)",
    "--bjork-inverted-text": "#080808",
    "--bjork-border": "#232323",
    "--bjork-border-muted": "#1c1c1c",
    "--bjork-border-strong": "#343434",
    "--bjork-thumb": "#626262",
    "--bjork-track": "#090909",
    "--bjork-accent": "#ec5c13",
    "--bjork-accent-hover": "#f07832",
    "--bjork-accent-soft": "rgba(236, 92, 19, 0.12)",
    "--bjork-accent-muted": "rgba(236, 92, 19, 0.24)",
    "--bjork-accent-foreground": "#fff2ea",
    "--bjork-shadow-surface":
      "inset 0 7px 14px rgba(255, 255, 255, 0.03), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.06), 0 14px 20px -6px rgba(0, 0, 0, 0.45)",
    "--bjork-shadow-soft": "inset 0 1px 0 rgba(255, 255, 255, 0.045)",
    "--bjork-shadow-panel": "inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 18px 36px -28px rgba(0, 0, 0, 0.9)",
    "--bjork-shadow-menu":
      "inset 0 1px 0 rgba(255, 255, 255, 0.055), inset 0 12px 24px rgba(255, 255, 255, 0.018), inset 0 -18px 26px rgba(0, 0, 0, 0.24), 0 22px 42px -22px rgba(0, 0, 0, 0.9)",
    "--bjork-shadow-inset": "inset 0 1px 10px rgba(0, 0, 0, 0.45)",
    "--bjork-ring-offset": "#080808",
  },
};

// Block-only tokens the global sheet does not carry: status inks, a readable accent ink and the scrim.
const EXTRAS: Record<BjorkTone, Record<string, string>> = {
  light: {
    "--blk-accent-ink": "#b4531f",
    "--blk-accent-fill": "#e0692c",
    "--blk-accent-fill-ink": "#fffaf5",
    "--blk-success": "#1f8a55",
    "--blk-success-soft": "rgba(31, 138, 85, 0.1)",
    "--blk-warning": "#9a6200",
    "--blk-warning-soft": "rgba(168, 107, 0, 0.1)",
    "--blk-error": "#c8361f",
    "--blk-error-soft": "rgba(200, 54, 31, 0.08)",
    "--blk-scrim": "rgba(40, 32, 22, 0.28)",
    "--blk-chart-ghost": "rgba(23, 23, 23, 0.28)",
  },
  dark: {
    "--blk-accent-ink": "#f07832",
    "--blk-accent-fill": "#c94f12",
    "--blk-accent-fill-ink": "#fff2ea",
    "--blk-success": "#4cc38a",
    "--blk-success-soft": "rgba(76, 195, 138, 0.12)",
    "--blk-warning": "#f2b544",
    "--blk-warning-soft": "rgba(242, 181, 68, 0.12)",
    "--blk-error": "#ff6a5c",
    "--blk-error-soft": "rgba(255, 92, 77, 0.1)",
    "--blk-scrim": "rgba(0, 0, 0, 0.55)",
    "--blk-chart-ghost": "rgba(237, 237, 237, 0.3)",
  },
};

const subscribeNoop = () => () => {};

/** True after hydration. Server and first client render agree on false. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/** Reduced motion, read only after hydration so the first render matches the server. */
export function useBlockReducedMotion() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  return hydrated && reduced === true;
}

/**
 * Resolves a block's theme to inline custom properties. "auto" leaves the library tokens to the page
 * (no flash on load) and only adds the block extras for the resolved tone; "light" and "dark" pin every token.
 */
export function useAppBlockTheme(theme: AppBlockTheme = "auto") {
  const forced = theme === "auto" ? undefined : theme;
  const tone = useBjorkTone(forced);
  const style = {
    ...(forced ? TOKENS[forced] : {}),
    ...EXTRAS[tone],
    colorScheme: tone,
  } as CSSProperties;
  return { tone, style };
}

/** Width of an element, tracked with ResizeObserver. 0 until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]";

export const blockRoot =
  "@container relative isolate flex min-h-0 w-full overflow-hidden bg-[var(--bjork-bg)] font-bjork-alpha text-[color:var(--bjork-text)] antialiased selection:bg-[color:var(--bjork-accent-muted)]";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--blk-accent-fill)] text-[color:var(--blk-accent-fill-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.18)] hover:brightness-[1.08]",
  secondary:
    "border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] hover:bg-[var(--bjork-surface-hover)]",
  outline:
    "border border-[color:var(--bjork-border-strong)] bg-transparent text-[color:var(--bjork-text)] hover:bg-[var(--bjork-surface-hover)]",
  ghost:
    "bg-transparent text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
  danger:
    "bg-[var(--blk-error)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:brightness-[1.08]",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-[9px] px-2.5 text-[12.5px]",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px]",
  lg: "h-11 gap-2 rounded-[12px] px-4 text-[14px]",
};

export interface BlockButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const BlockButton = forwardRef<HTMLButtonElement, BlockButtonProps>(function BlockButton(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em] transition-[background-color,color,filter,transform,border-color] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0",
        focusRing,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name. Also used as the native tooltip. */
  label: string;
  size?: "sm" | "md";
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", pressed, className, type = "button", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-grid shrink-0 cursor-pointer place-items-center rounded-[9px] text-[color:var(--bjork-text-muted)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 aria-pressed:text-[color:var(--blk-accent-ink)] [&_svg]:shrink-0",
        size === "sm" ? "size-7 [&_svg]:size-[15px]" : "size-9 [&_svg]:size-[17px]",
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] px-1 font-mono text-[10.5px] font-medium leading-none text-[color:var(--bjork-text-muted)] shadow-[0_1px_0_var(--bjork-border-strong)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export const inputClass =
  "h-10 w-full min-w-0 rounded-[10px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] px-3 text-[13.5px] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[color:var(--bjork-text-soft)] hover:border-[color:var(--bjork-border-strong)] focus-visible:border-[color:var(--bjork-accent)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--bjork-accent-soft)] aria-[invalid=true]:border-[color:var(--blk-error)] aria-[invalid=true]:focus-visible:ring-[color:var(--blk-error-soft)] disabled:cursor-not-allowed disabled:opacity-50";

export interface BlockFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered at the right of the label row, e.g. a "Forgot?" link. */
  labelAside?: ReactNode;
  /** Rendered inside the field on the right, e.g. a show/hide toggle. */
  trailing?: ReactNode;
  className?: string;
  inputClassName?: string;
}

/** Label, input, hint and error wired together with ids. The error replaces the hint and is announced. */
export const BlockField = forwardRef<HTMLInputElement, BlockFieldProps>(function BlockField(
  { label, hint, error, labelAside, trailing, className, inputClassName, id, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const hasNote = Boolean(error) || hint !== undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasNote ? noteId : undefined}
          className={cn(inputClass, trailing ? "pr-10" : undefined, inputClassName)}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hasNote && (
        <p
          id={noteId}
          role={error ? "alert" : undefined}
          className={cn(
            "flex items-start gap-1.5 text-[12px] leading-[1.45]",
            error ? "text-[color:var(--blk-error)]" : "text-[color:var(--bjork-text-soft)]",
          )}
        >
          {error ? (
            <>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-[2px] size-3 shrink-0">
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 4.75v3.75M8 10.9v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {error}
            </>
          ) : (
            hint
          )}
        </p>
      )}
    </div>
  );
});

/** Initials avatar on a quiet tinted disc. Hue comes from the name so a person keeps their colour. */
export function InitialsAvatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = [22, 38, 150, 200, 260, 330][hash % 6];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-[-0.02em] text-[color:var(--bjork-text)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.38)),
        background: `color-mix(in oklab, hsl(${hue} 70% 55%) 22%, var(--bjork-surface-active))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, hsl(${hue} 70% 55%) 24%, transparent)`,
      }}
    >
      {initials}
    </span>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps focus inside `ref` while `active`, closes on Escape, and hands focus back to whatever had it
 * before. Used by the in-block drawers and dialogs, which are positioned inside the block rather than portalled,
 * so a forced theme reaches them.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) {
  const escapeRef = useRef(onEscape);
  useLayoutEffect(() => {
    escapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

export interface BlockDrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A modal drawer anchored to the block, not the viewport. Under reduced motion it fades instead of sliding.
 * The block's own content should be marked `inert` while it is open.
 */
export function BlockDrawer({ open, onClose, side = "left", label, children, className }: BlockDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useBlockReducedMotion();
  useFocusTrap(panelRef, open, onClose);
  const hidden = side === "left" ? "-translate-x-full" : "translate-x-full";
  return (
    <div className={cn("absolute inset-0 z-40", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn(
          "absolute inset-0 bg-[var(--blk-scrim)] transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        inert={!open}
        className={cn(
          "absolute inset-y-0 flex w-[min(300px,86%)] flex-col bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-menu)] outline-none",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          "border-[color:var(--bjork-border)]",
          reduce
            ? cn("transition-opacity duration-150", open ? "opacity-100" : "opacity-0")
            : cn(
                "transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                open ? "translate-x-0" : hidden,
              ),
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Polite status text for screen readers; changes are announced once. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => {
    // Clearing first makes a repeated message announce again.
    setMessage("");
    window.requestAnimationFrame(() => setMessage(next));
  }, []);
  const region = (
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </span>
  );
  return { announce, region };
}

/** A small toast pinned to the bottom of the block. Purely visual; pair it with `useAnnouncer`. */
export function BlockToast({ message, tone = "neutral" }: { message: string | null; tone?: "neutral" | "success" | "error" }) {
  const reduce = useBlockReducedMotion();
  const dot =
    tone === "success" ? "var(--blk-success)" : tone === "error" ? "var(--blk-error)" : "var(--bjork-accent)";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-4" aria-hidden="true">
      <div
        className={cn(
          "flex max-w-full items-center gap-2.5 rounded-full border border-[color:var(--bjork-border)] bg-[var(--bjork-menu)] py-2 pl-3 pr-4 text-[12.5px] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl",
          reduce ? "transition-opacity duration-150" : "transition-[opacity,transform] duration-200 ease-out",
          message ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} />
        <span className="truncate">{message}</span>
      </div>
    </div>
  );
}

/** Shows a toast for `ms` and announces it. */
export function useBlockToast(ms = 2600) {
  const { announce, region } = useAnnouncer();
  const [toast, setToast] = useState<{ message: string; tone: "neutral" | "success" | "error" } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (message: string, tone: "neutral" | "success" | "error" = "neutral") => {
      window.clearTimeout(timer.current);
      setToast({ message, tone });
      announce(message);
      timer.current = window.setTimeout(() => setToast(null), ms);
    },
    [announce, ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node = (
    <>
      <BlockToast message={toast?.message ?? null} tone={toast?.tone} />
      {region}
    </>
  );
  return { show, node };
}
