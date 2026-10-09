"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CreditCard, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease, springs } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Pill,
  focusRing,
  useCardTheme,
  useClock,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export type CardFinish = "graphite" | "ember" | "sand" | "ink";

export interface PaymentMethod {
  id: string;
  /** Network label, e.g. "Orbit". Drawn as a neutral two-ring mark. */
  network: string;
  /** Issuer wordmark on the front of the card. */
  issuer: string;
  last4: string;
  holder: string;
  /** 1–12. */
  expMonth: number;
  /** Four-digit year. */
  expYear: number;
  finish?: CardFinish;
  billingPostal?: string;
  /** ISO date the card was added. */
  addedOn?: string;
}

export interface PaymentMethodCardProps {
  /** Starting list. The card manages selection, default and removal itself and reports each change. */
  defaultMethods?: PaymentMethod[];
  defaultDefaultId?: string;
  onDefaultChange?: (id: string) => void;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  title?: string;
  /** Epoch ms. Freezes the clock for previews and tests. */
  now?: number;
  locale?: string;
  theme?: CardTheme;
  className?: string;
}

export const PAYMENT_METHOD_SAMPLE: PaymentMethod[] = [
  {
    id: "pm_orbit_4821",
    network: "Orbit",
    issuer: "Halden",
    last4: "4821",
    holder: "Mara Okonjo",
    expMonth: 8,
    expYear: 2028,
    finish: "graphite",
    billingPostal: "94110",
    addedOn: "2025-03-12",
  },
  {
    id: "pm_lumen_0937",
    network: "Lumen",
    issuer: "Cobalt Credit Union",
    last4: "0937",
    holder: "Mara Okonjo",
    expMonth: 11,
    expYear: 2026,
    finish: "ember",
    billingPostal: "94110",
    addedOn: "2023-11-02",
  },
  {
    id: "pm_orbit_5502",
    network: "Orbit",
    issuer: "Northwind",
    last4: "5502",
    holder: "Mara Okonjo",
    expMonth: 4,
    expYear: 2026,
    finish: "sand",
    billingPostal: "10013",
    addedOn: "2022-04-19",
  },
];

const FINISHES: Record<CardFinish, { bg: string; ink: string; soft: string; chip: string }> = {
  graphite: {
    bg: "linear-gradient(135deg, #2b2b2e 0%, #18181a 55%, #0f0f10 100%)",
    ink: "#f2f0ec",
    soft: "rgba(242,240,236,0.6)",
    chip: "linear-gradient(135deg,#d9c89f,#a68f5f)",
  },
  ember: {
    bg: "linear-gradient(135deg, #f07a3a 0%, #c4470f 60%, #8f310a 100%)",
    ink: "#fff6ef",
    soft: "rgba(255,246,239,0.72)",
    chip: "linear-gradient(135deg,#f5dfb1,#c9a565)",
  },
  sand: {
    bg: "linear-gradient(135deg, #efe6d6 0%, #dccdb2 60%, #c7b391 100%)",
    ink: "#2a2218",
    soft: "rgba(42,34,24,0.62)",
    chip: "linear-gradient(135deg,#cfb27a,#9c7f4a)",
  },
  ink: {
    bg: "linear-gradient(135deg, #24324a 0%, #141c2b 60%, #0b1019 100%)",
    ink: "#eef2fa",
    soft: "rgba(238,242,250,0.62)",
    chip: "linear-gradient(135deg,#d9c89f,#a68f5f)",
  },
};

type ExpiryState = "valid" | "soon" | "expired";

function expiryState(m: PaymentMethod, now: number | null): ExpiryState {
  if (now === null) return "valid";
  const d = new Date(now);
  const months = (m.expYear - d.getUTCFullYear()) * 12 + (m.expMonth - (d.getUTCMonth() + 1));
  if (months < 0) return "expired";
  if (months <= 2) return "soon";
  return "valid";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Saved payment methods. A tilting card face shows the selected method and flips for billing details;
 * the list below picks, defaults and removes cards, with expiry warnings.
 */
export function PaymentMethodCard({
  defaultMethods = PAYMENT_METHOD_SAMPLE,
  defaultDefaultId,
  onDefaultChange,
  onRemove,
  onAdd,
  title = "Payment methods",
  now,
  locale = "en-US",
  theme = "auto",
  className,
}: PaymentMethodCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const clock = useClock(now, 3_600_000);
  const titleId = useId();
  const listId = useId();

  const [methods, setMethods] = useState(defaultMethods);
  const [defaultId, setDefaultId] = useState(defaultDefaultId ?? defaultMethods[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState(defaultDefaultId ?? defaultMethods[0]?.id ?? "");
  const [flipped, setFlipped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const optionRefs = useRef(new Map<string, HTMLDivElement>());

  const selected = methods.find((m) => m.id === selectedId) ?? methods[0];
  const label = (m: PaymentMethod) => `${m.network} ending ${m.last4}`;

  const select = (id: string, focus = false) => {
    setSelectedId(id);
    setFlipped(false);
    setConfirming(false);
    if (focus) optionRefs.current.get(id)?.focus();
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = methods.findIndex((m) => m.id === selected?.id);
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % methods.length;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + methods.length) % methods.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = methods.length - 1;
    if (next >= 0) {
      e.preventDefault();
      select(methods[next].id, true);
    }
  };

  const makeDefault = () => {
    if (!selected) return;
    setDefaultId(selected.id);
    onDefaultChange?.(selected.id);
    setMessage(`${label(selected)} is now your default payment method`);
  };

  const remove = () => {
    if (!selected) return;
    const i = methods.findIndex((m) => m.id === selected.id);
    const rest = methods.filter((m) => m.id !== selected.id);
    setMethods(rest);
    onRemove?.(selected.id);
    setConfirming(false);
    setMessage(`Removed ${label(selected)}`);
    const next = rest[Math.min(i, rest.length - 1)];
    if (next) {
      setSelectedId(next.id);
      requestAnimationFrame(() => optionRefs.current.get(next.id)?.focus());
    }
  };

  const fmtAdded = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    [locale],
  );

  return (
    <CardFrame aria-labelledby={titleId} className={className} style={style}>
      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <h3 id={titleId} className="text-[15px] font-semibold leading-5">
          {title}
        </h3>
        {onAdd && methods.length > 0 && (
          <CardButton size="sm" variant="ghost" onClick={onAdd} icon={<Plus aria-hidden="true" className="size-3.5" />} className="-mr-1.5">
            Add
          </CardButton>
        )}
      </header>

      {methods.length === 0 || !selected ? (
        <div className="px-5 pb-5 pt-4">
          <div className="grid aspect-[1.586] w-full place-items-center rounded-[14px] border border-dashed border-[color:var(--bjork-border-strong)] bg-[color:var(--bjork-card-inset)] p-6 text-center">
            <div>
              <CreditCard aria-hidden="true" className="mx-auto size-6 text-[color:var(--bjork-text-soft)]" />
              <p className="mt-2 text-[13px] font-medium">No saved payment method</p>
              <p className="mt-1 text-[12px] text-[color:var(--bjork-text-muted)]">Add a card to keep your subscription active.</p>
              {onAdd && (
                <CardButton variant="primary" size="sm" onClick={onAdd} className="mt-4" icon={<Plus aria-hidden="true" className="size-3.5" />}>
                  Add payment method
                </CardButton>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pt-4">
            <CardFace
              method={selected}
              flipped={flipped}
              reduce={reduce}
              addedLabel={selected.addedOn ? fmtAdded.format(Date.parse(selected.addedOn)) : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
            <CardButton
              size="sm"
              aria-pressed={flipped}
              onClick={() => setFlipped((f) => !f)}
              icon={<RefreshCcw aria-hidden="true" className="size-3.5" />}
            >
              {flipped ? "Show front" : "Billing details"}
            </CardButton>
            <CardButton
              size="sm"
              onClick={makeDefault}
              disabled={selected.id === defaultId || expiryState(selected, clock) === "expired"}
              icon={<Check aria-hidden="true" className="size-3.5" />}
            >
              {selected.id === defaultId ? "Default" : "Make default"}
            </CardButton>
            <CardButton
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(true)}
              disabled={selected.id === defaultId && methods.length > 1}
              title={selected.id === defaultId && methods.length > 1 ? "Make another card the default first" : undefined}
              icon={<Trash2 aria-hidden="true" className="size-3.5" />}
              className="ml-auto"
            >
              Remove
            </CardButton>
          </div>

          <AnimatePresence initial={false}>
            {confirming && (
              <motion.div
                key="confirm"
                initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: ease.out }}
                className="overflow-hidden"
              >
                <div
                  role="alertdialog"
                  aria-label={`Remove ${label(selected)}?`}
                  className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-error-soft)] px-3 py-2.5"
                >
                  <p className="text-[12px] leading-4 text-[color:var(--bjork-text-medium)]">
                    Remove <span className="font-medium text-[color:var(--bjork-text)]">•••• {selected.last4}</span>?
                  </p>
                  <div className="flex gap-1.5">
                    <CardButton size="sm" variant="ghost" onClick={() => setConfirming(false)} autoFocus>
                      Cancel
                    </CardButton>
                    <CardButton size="sm" variant="danger" onClick={remove}>
                      Remove
                    </CardButton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            id={listId}
            role="radiogroup"
            aria-label="Saved cards"
            onKeyDown={onListKey}
            className="mt-4 border-t border-[color:var(--bjork-border)] px-2 py-2"
          >
            {methods.map((m) => {
              const exp = expiryState(m, clock);
              const isSel = m.id === selected.id;
              return (
                <div
                  key={m.id}
                  ref={(el) => {
                    if (el) optionRefs.current.set(m.id, el);
                    else optionRefs.current.delete(m.id);
                  }}
                  role="radio"
                  aria-checked={isSel}
                  tabIndex={isSel ? 0 : -1}
                  onClick={() => select(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      select(m.id);
                    }
                  }}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors duration-150",
                    isSel ? "bg-[color:var(--bjork-card-raised)]" : "hover:bg-[color:var(--bjork-card-hover)]",
                    focusRing,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-6 w-9 shrink-0 rounded-[5px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                    style={{ background: FINISHES[m.finish ?? "graphite"].bg }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-5">
                      {m.network} •••• {m.last4}
                    </span>
                    <span
                      className={cn(
                        "block text-[12px] leading-4",
                        exp === "expired"
                          ? "text-[color:var(--bjork-error)]"
                          : exp === "soon"
                            ? "text-[color:var(--bjork-warning)]"
                            : "text-[color:var(--bjork-text-muted)]",
                      )}
                    >
                      {exp === "expired" ? "Expired" : "Expires"} {pad2(m.expMonth)}/{String(m.expYear).slice(-2)}
                    </span>
                  </span>
                  {m.id === defaultId && <Pill tone="accent">Default</Pill>}
                  {exp === "expired" && <Pill tone="error">Expired</Pill>}
                  {exp === "soon" && m.id !== defaultId && <Pill tone="warning">Expires soon</Pill>}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                      isSel
                        ? "border-[color:var(--bjork-accent)] bg-[color:var(--bjork-accent)]"
                        : "border-[color:var(--bjork-border-strong)]",
                    )}
                  >
                    {isSel && <span className="size-1.5 rounded-full bg-[color:var(--bjork-card)]" />}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      <LiveRegion message={message} />
    </CardFrame>
  );
}

function NetworkMark({ color }: { color: string }) {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
      <circle cx="12" cy="11" r="9" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="22" cy="11" r="9" fill="none" stroke={color} strokeWidth="1.6" opacity="0.65" />
    </svg>
  );
}

function CardFace({
  method,
  flipped,
  reduce,
  addedLabel,
}: {
  method: PaymentMethod;
  flipped: boolean;
  reduce: boolean;
  addedLabel?: string;
}) {
  const f = FINISHES[method.finish ?? "graphite"];
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 30 });

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 8, y: (px - 0.5) * 10, gx: px * 100, gy: py * 100 });
  };
  const onLeave = () => setTilt({ x: 0, y: 0, gx: 50, gy: 30 });

  const face: CSSProperties = {
    background: f.bg,
    color: f.ink,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };
  const sheen = (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light"
      style={{
        background: `radial-gradient(120% 90% at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.35), transparent 55%)`,
      }}
    />
  );
  const exp = `${pad2(method.expMonth)}/${String(method.expYear).slice(-2)}`;

  return (
    <div
      className="relative w-full [perspective:1100px]"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      role="group"
      aria-roledescription="payment card"
      aria-label={`${method.issuer} ${method.network} card ending ${method.last4}, ${method.holder}, expires ${exp}`}
    >
      <motion.div
        className="relative aspect-[1.586] w-full [transform-style:preserve-3d]"
        animate={{ rotateX: tilt.x, rotateY: (reduce ? 0 : flipped ? 180 : 0) + tilt.y }}
        transition={reduce ? { duration: 0 } : springs.soft}
      >
        {/* Front */}
        <motion.div
          aria-hidden={flipped}
          className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[14px] p-[6%] shadow-[0_18px_30px_-18px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          style={face}
          animate={reduce ? { opacity: flipped ? 0 : 1 } : undefined}
          transition={{ duration: 0.18 }}
        >
          {sheen}
          <div className="relative flex items-start justify-between">
            <span className="text-[13px] font-semibold tracking-[0.02em]">{method.issuer}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ color: f.soft }}>
              <path d="M8.5 7.5a6 6 0 0 1 0 9M12 5a9.5 9.5 0 0 1 0 14M15.5 2.5a13 13 0 0 1 0 19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <span
            aria-hidden="true"
            className="relative block h-[22%] w-[13%] rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
            style={{ background: f.chip }}
          />
          <div className="relative">
            <p className="font-mono text-[clamp(13px,4.6cqw,17px)] tracking-[0.14em]">
              •••• •••• •••• {method.last4}
            </p>
            <div className="mt-[3%] flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.14em]" style={{ color: f.soft }}>
                  Card holder
                </p>
                <p className="truncate text-[12px] font-medium uppercase tracking-[0.06em]">{method.holder}</p>
              </div>
              <div className="shrink-0">
                <p className="text-[9px] uppercase tracking-[0.14em]" style={{ color: f.soft }}>
                  Expires
                </p>
                <p className="text-[12px] font-medium">{exp}</p>
              </div>
              <div className="flex shrink-0 flex-col items-center">
                <NetworkMark color={f.ink} />
                <span className="text-[8px] uppercase tracking-[0.18em]" style={{ color: f.soft }}>
                  {method.network}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Back */}
        <motion.div
          aria-hidden={!flipped}
          className="absolute inset-0 flex flex-col overflow-hidden rounded-[14px] shadow-[0_18px_30px_-18px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{ ...face, transform: reduce ? undefined : "rotateY(180deg)" }}
          initial={false}
          animate={reduce ? { opacity: flipped ? 1 : 0 } : { opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          {sheen}
          <span aria-hidden="true" className="mt-[8%] block h-[18%] w-full bg-black/70" />
          <div className="relative flex flex-1 flex-col justify-between p-[6%] pt-[5%]">
            <div className="flex items-center gap-2">
              <span className="h-7 flex-1 rounded-[4px] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.75)_0_6px,rgba(255,255,255,0.6)_6px_12px)]" />
              <span className="rounded-[4px] bg-white/85 px-2 py-1 font-mono text-[11px] text-black/70">CVC •••</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <div>
                <dt style={{ color: f.soft }}>Billing postal code</dt>
                <dd className="font-medium">{method.billingPostal ?? "—"}</dd>
              </div>
              <div>
                <dt style={{ color: f.soft }}>Added</dt>
                <dd className="font-medium">{addedLabel ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt style={{ color: f.soft }}>Issued by</dt>
                <dd className="font-medium">{method.issuer}</dd>
              </div>
            </dl>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
