"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, ChevronDown, Copy, Package } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Pill,
  Skeleton,
  focusRing,
  useCardTheme,
  useReducedMotionSafe,
  type CardTheme,
  type PillTone,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export type ShipmentStage = "ordered" | "shipped" | "out_for_delivery" | "delivered";

export interface ShipmentItem {
  id: string;
  name: string;
  quantity?: number;
  /** Swatch colour for the generated thumbnail. */
  color?: string;
  /** Replaces the generated thumbnail. */
  imageUrl?: string;
}

export interface ShipmentEvent {
  /** ISO date-time. */
  at: string;
  label: string;
  location?: string;
}

export interface ShipmentException {
  label: string;
  detail?: string;
}

export interface ShipmentCardProps {
  orderNumber?: string;
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  items?: ShipmentItem[];
  stage?: ShipmentStage;
  /** ISO date-time of the estimated delivery (end of window). */
  eta?: string;
  /** ISO date-time of the window start. Shown as "between … and …". */
  etaFrom?: string;
  /** ISO date-time, when delivered. */
  deliveredAt?: string;
  /** A delay or failed attempt. Keeps the stage, turns the rail amber. */
  exception?: ShipmentException;
  /** Newest last or newest first; the card sorts them. */
  events?: ShipmentEvent[];
  loading?: boolean;
  /** IANA zone for every date on the card. Default "UTC" so server and client agree. */
  timeZone?: string;
  locale?: string;
  theme?: CardTheme;
  className?: string;
}

export const SHIPMENT_SAMPLE = {
  orderNumber: "HX-20418",
  carrier: "Parcelline",
  service: "Ground",
  trackingNumber: "PL 7741 0952 3318",
  trackingUrl: "#",
  stage: "out_for_delivery" as ShipmentStage,
  etaFrom: "2026-10-08T16:00:00Z",
  eta: "2026-10-08T20:00:00Z",
  items: [
    { id: "i1", name: "Linen throw, oat", color: "#d8c7a6" },
    { id: "i2", name: "Stoneware mug", quantity: 2, color: "#6f7f86" },
    { id: "i3", name: "Walnut tray", color: "#7a4b2a" },
  ] satisfies ShipmentItem[],
  events: [
    { at: "2026-10-05T18:12:00Z", label: "Order placed" },
    { at: "2026-10-06T14:40:00Z", label: "Label created", location: "Reno, NV" },
    { at: "2026-10-06T22:05:00Z", label: "Picked up by carrier", location: "Reno, NV" },
    { at: "2026-10-07T09:31:00Z", label: "Arrived at sort facility", location: "Sacramento, CA" },
    { at: "2026-10-08T06:48:00Z", label: "Departed facility", location: "Oakland, CA" },
    { at: "2026-10-08T13:02:00Z", label: "Out for delivery", location: "San Francisco, CA" },
  ] satisfies ShipmentEvent[],
};

const STAGES: { id: ShipmentStage; label: string }[] = [
  { id: "ordered", label: "Ordered" },
  { id: "shipped", label: "Shipped" },
  { id: "out_for_delivery", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
];

/**
 * Order tracking at a glance: when it arrives, where it is on the way, what is inside, and the full
 * scan history on demand. Delays and failed attempts turn the rail amber without losing progress.
 */
export function ShipmentCard({
  orderNumber = SHIPMENT_SAMPLE.orderNumber,
  carrier = SHIPMENT_SAMPLE.carrier,
  service = SHIPMENT_SAMPLE.service,
  trackingNumber = SHIPMENT_SAMPLE.trackingNumber,
  trackingUrl,
  items = SHIPMENT_SAMPLE.items,
  stage = SHIPMENT_SAMPLE.stage,
  eta = SHIPMENT_SAMPLE.eta,
  etaFrom = SHIPMENT_SAMPLE.etaFrom,
  deliveredAt,
  exception,
  events = SHIPMENT_SAMPLE.events,
  loading = false,
  timeZone = "UTC",
  locale = "en-US",
  theme = "auto",
  className,
}: ShipmentCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();
  const historyId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const f = useMemo(
    () => ({
      weekday: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone }),
      date: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }),
      time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }),
      stamp: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }),
    }),
    [locale, timeZone],
  );

  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const delivered = stage === "delivered";
  const sorted = useMemo(() => [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [events]);
  const latest = sorted[0];

  const status: { label: string; tone: PillTone } = exception
    ? { label: exception.label, tone: "warning" }
    : delivered
      ? { label: "Delivered", tone: "success" }
      : { label: STAGES[stageIndex]?.label ?? "In transit", tone: "accent" };

  let headline = "";
  let sub = "";
  if (delivered && deliveredAt) {
    headline = `Delivered ${f.weekday.format(Date.parse(deliveredAt))}`;
    sub = `${f.date.format(Date.parse(deliveredAt))} at ${f.time.format(Date.parse(deliveredAt))}`;
  } else if (eta) {
    headline = `${exception ? "Now arriving" : "Arriving"} ${f.weekday.format(Date.parse(eta))}`;
    sub = etaFrom
      ? `${f.date.format(Date.parse(eta))}, ${f.time.format(Date.parse(etaFrom))} – ${f.time.format(Date.parse(eta))}`
      : `${f.date.format(Date.parse(eta))} by ${f.time.format(Date.parse(eta))}`;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackingNumber.replace(/\s/g, ""));
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const itemCount = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
  const progress = stageIndex / (STAGES.length - 1);
  const railColor = exception ? "var(--bjork-warning)" : delivered ? "var(--bjork-success)" : "var(--bjork-accent)";

  if (loading) {
    return (
      <CardFrame aria-busy="true" aria-label="Loading shipment" className={className} style={style}>
        <div className="space-y-3 p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-6 h-1.5 w-full rounded-full" />
          <div className="flex justify-between">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-3 w-12" />
            ))}
          </div>
        </div>
      </CardFrame>
    );
  }

  return (
    <CardFrame aria-labelledby={titleId} className={className} style={style}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
            Order <span className="text-[color:var(--bjork-text-medium)]">#{orderNumber}</span>
          </p>
          <Pill tone={status.tone} dot pulse={!delivered && !exception}>
            {status.label}
          </Pill>
        </div>
        <h3 id={titleId} className="mt-3 text-[22px] font-semibold leading-7 tracking-[-0.01em]">
          {headline}
        </h3>
        <p className="mt-0.5 text-[13px] leading-5 text-[color:var(--bjork-text-medium)]">{sub}</p>
        {exception?.detail && (
          <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-4 text-[color:var(--bjork-warning)]">
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {exception.detail}
          </p>
        )}
      </div>

      {/* Progress rail */}
      <div className="px-5 pt-5">
        <ol className="relative grid grid-cols-4" aria-label="Shipping progress">
          <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[5px] h-[2px] rounded-full bg-[color:var(--bjork-track)]">
            <motion.span
              className="absolute inset-y-0 left-0 origin-left rounded-full"
              style={{ width: `${progress * 100}%`, background: railColor }}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.15, ease: ease.out }}
            />
          </span>
          {STAGES.map((s, i) => {
            const done = i < stageIndex || (delivered && i === stageIndex);
            const current = i === stageIndex && !delivered;
            return (
              <li
                key={s.id}
                aria-current={i === stageIndex ? "step" : undefined}
                className="relative flex flex-col items-center gap-2 text-center"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative grid size-3 place-items-center rounded-full border-2 bg-[color:var(--bjork-card)] transition-colors",
                    done || current ? "" : "border-[color:var(--bjork-border-strong)]",
                  )}
                  style={done || current ? { borderColor: railColor, background: done ? railColor : undefined } : undefined}
                >
                  {current && !reduce && (
                    <span
                      className="absolute -inset-1 rounded-full opacity-40 motion-safe:animate-ping"
                      style={{ background: railColor }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-[14px]",
                    i <= stageIndex ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)]",
                  )}
                >
                  {s.label}
                  <span className="sr-only">{done ? ", complete" : current ? ", current" : ", upcoming"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {latest && (
        <p className="mx-5 mt-5 rounded-[12px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] px-3.5 py-2.5 text-[12px] shadow-[var(--bjork-shadow-soft)] leading-4">
          <span className="text-[color:var(--bjork-text)]">{latest.label}</span>
          {latest.location && <span className="text-[color:var(--bjork-text-muted)]"> · {latest.location}</span>}
          <span className="block text-[color:var(--bjork-text-muted)]">
            <time dateTime={latest.at}>{f.stamp.format(Date.parse(latest.at))}</time>
          </span>
        </p>
      )}

      {/* Items + tracking */}
      <div className="mt-4 flex items-center gap-3 border-t border-[color:var(--bjork-border)] px-5 py-3.5">
        <div className="flex -space-x-2" aria-hidden="true">
          {items.slice(0, 3).map((it) =>
            it.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={it.id} src={it.imageUrl} alt="" className="size-8 rounded-[8px] border-2 border-[color:var(--bjork-card)] object-cover" />
            ) : (
              <span
                key={it.id}
                className="grid size-8 place-items-center rounded-[8px] border-2 border-[color:var(--bjork-card)]"
                style={{ background: it.color ?? "var(--bjork-card-raised)" }}
              >
                <Package className="size-3.5 text-white/70" />
              </span>
            ),
          )}
        </div>
        <p className="min-w-0 flex-1 text-[12px] leading-4">
          <span className="block font-medium">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="block truncate text-[color:var(--bjork-text-muted)]" title={items.map((i) => i.name).join(", ")}>
            {items.map((i) => (i.quantity && i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(", ")}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-[color:var(--bjork-border)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] leading-4 text-[color:var(--bjork-text-muted)]">
            {carrier} · {service}
          </p>
          {trackingUrl ? (
            <a
              href={trackingUrl}
              className={cn("block truncate rounded-[4px] font-mono text-[12px] leading-5 underline-offset-2 hover:underline", focusRing)}
            >
              {trackingNumber}
            </a>
          ) : (
            <p className="truncate font-mono text-[12px] leading-5">{trackingNumber}</p>
          )}
        </div>
        <CardButton
          size="sm"
          variant="ghost"
          onClick={copy}
          aria-label={copied ? "Tracking number copied" : "Copy tracking number"}
          icon={copied ? <Check aria-hidden="true" className="size-3.5 text-[color:var(--bjork-success)]" /> : <Copy aria-hidden="true" className="size-3.5" />}
        >
          {copied ? "Copied" : "Copy"}
        </CardButton>
      </div>

      {sorted.length > 1 && (
        <div className="border-t border-[color:var(--bjork-border)]">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={historyId}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between px-5 py-3 text-[12px] text-[color:var(--bjork-text-medium)] transition-colors hover:bg-[color:var(--bjork-card-hover)] hover:text-[color:var(--bjork-text)]",
              focusRing,
              "focus-visible:ring-inset focus-visible:ring-offset-0",
            )}
          >
            {open ? "Hide" : "Show"} tracking history ({sorted.length})
            <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} />
          </button>
          <div
            id={historyId}
            className="grid"
            inert={!open}
            aria-hidden={!open || undefined}
            style={{
              gridTemplateRows: open ? "1fr" : "0fr",
              transition: reduce ? "none" : "grid-template-rows 280ms cubic-bezier(0.32,0.72,0,1)",
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <ol className="relative px-5 pb-4">
                {sorted.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
                    <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center pt-1">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          i === 0 ? "bg-[color:var(--bjork-accent)]" : "bg-[color:var(--bjork-border-strong)]",
                        )}
                      />
                      {i < sorted.length - 1 && (
                        <span className="absolute top-3.5 -bottom-1 w-px bg-[color:var(--bjork-border)]" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 text-[12px] leading-4">
                      <p className={i === 0 ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-medium)]"}>{e.label}</p>
                      <p className="text-[color:var(--bjork-text-muted)]">
                        <time dateTime={e.at}>{f.stamp.format(Date.parse(e.at))}</time>
                        {e.location && ` · ${e.location}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
      <LiveRegion message={copied ? "Tracking number copied" : ""} />
    </CardFrame>
  );
}
