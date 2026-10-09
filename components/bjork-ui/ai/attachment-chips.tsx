"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { LiveRegion, VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { ease, easeCss, springs } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  SHIMMER_TEXT_CSS,
  formatBytes,
  useAiTone,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type AttachmentStatus = "queued" | "uploading" | "processing" | "ready" | "error";

export interface AttachmentItem {
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  status: AttachmentStatus;
  /** Upload progress from 0 to 1 while `status` is "uploading". */
  progress?: number;
  /** Shown when `status` is "error". Default "Upload failed". */
  error?: string;
  /**
   * A CSS background for image thumbnails, such as a gradient or a `url(blob:...)` from `URL.createObjectURL`.
   * Without it, images get a file tile like any other type.
   */
  thumbnail?: string;
  /** Label shown while processing. Default "Indexing…". */
  processingLabel?: string;
}

export interface AttachmentChipsProps {
  items: AttachmentItem[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  /** Called when a ready chip is activated. Without it, ready chips are not interactive. */
  onOpen?: (id: string) => void;
  /** "row" is compact chips that wrap, for a composer tray. "grid" is cards with larger thumbnails. Default "row". */
  layout?: "row" | "grid";
  /** Accessible name of the list. Default "Attachments". */
  label?: string;
  tone?: BjorkTone;
  className?: string;
}

// Thumbnails are drawn from the palette, so the sample never ships a borrowed image.
const DUSK =
  "radial-gradient(circle at 70% 34%, color-mix(in srgb, var(--bjork-warning) 90%, white) 0 9%, transparent 10%)," +
  "linear-gradient(172deg, transparent 0 58%, color-mix(in srgb, var(--bjork-text) 70%, var(--bjork-accent)) 58.5% 100%)," +
  "linear-gradient(160deg, transparent 0 66%, color-mix(in srgb, var(--bjork-text) 85%, transparent) 66.5% 100%)," +
  "linear-gradient(180deg, color-mix(in srgb, var(--bjork-accent) 55%, var(--bjork-surface)) 0%, color-mix(in srgb, var(--bjork-warning) 70%, var(--bjork-surface)) 100%)";
const GRID_SHOT =
  "linear-gradient(90deg, color-mix(in srgb, var(--bjork-text) 10%, transparent) 1px, transparent 1px) 0 0 / 8px 8px," +
  "linear-gradient(0deg, color-mix(in srgb, var(--bjork-text) 10%, transparent) 1px, transparent 1px) 0 0 / 8px 8px," +
  "linear-gradient(135deg, var(--bjork-raised) 0%, var(--bjork-surface-active) 100%)";
const BLOOM =
  "radial-gradient(circle at 30% 70%, color-mix(in srgb, var(--bjork-accent) 85%, transparent) 0 22%, transparent 48%)," +
  "radial-gradient(circle at 76% 28%, color-mix(in srgb, var(--bjork-success) 55%, transparent) 0 16%, transparent 42%)," +
  "linear-gradient(135deg, var(--bjork-surface-active), var(--bjork-raised))";

/** Image thumbnails for demos, built from palette variables only. */
export const SAMPLE_THUMBNAILS = { dusk: DUSK, gridShot: GRID_SHOT, bloom: BLOOM } as const;

export const SAMPLE_ATTACHMENTS: AttachmentItem[] = [
  { id: "a1", name: "harbor-dusk.png", size: 2_516_582, status: "ready", thumbnail: DUSK },
  { id: "a2", name: "q3-board-memo.pdf", size: 1_288_490, status: "processing" },
  { id: "a3", name: "retention-cohorts.csv", size: 348_160, status: "uploading", progress: 0.62 },
  { id: "a4", name: "wireframe-v4.jpg", size: 4_404_019, status: "error", error: "Connection lost", thumbnail: GRID_SHOT },
  { id: "a5", name: "use-session.ts", size: 6_350, status: "queued" },
  { id: "a6", name: "field-notes.md", size: 14_848, status: "ready" },
];

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "heic"]);

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function pct(p: number | undefined): string {
  return `${Math.round(Math.min(1, Math.max(0, p ?? 0)) * 100)}%`;
}

function statusText(item: AttachmentItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "uploading":
      return `Uploading ${pct(item.progress)}`;
    case "processing":
      return item.processingLabel ?? "Indexing…";
    case "error":
      return item.error ?? "Upload failed";
    default:
      return "Ready";
  }
}

/**
 * Files attached to a message, each with its upload state: queued, uploading with a progress ring, processing,
 * ready, or failed with a retry. Removing a chip closes the gap with a layout animation.
 */
export function AttachmentChips({
  items,
  onRemove,
  onRetry,
  onOpen,
  layout = "row",
  label = "Attachments",
  tone: toneProp,
  className,
}: AttachmentChipsProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();

  // Announce only ready and error transitions, derived during render.
  const [announce, setAnnounce] = useState<{ seen: AttachmentItem[]; message: string }>(() => ({
    seen: items,
    message: "",
  }));
  if (announce.seen !== items) {
    const before = new Map(announce.seen.map((i) => [i.id, i.status] as const));
    const message = items.reduce((msg, item) => {
      const prev = before.get(item.id);
      if (prev === item.status || prev === undefined) return msg;
      if (item.status === "ready") return `${item.name} is ready`;
      if (item.status === "error") return `${item.name} failed: ${statusText(item)}`;
      return msg;
    }, announce.message);
    setAnnounce({ seen: items, message });
  }

  const grid = layout === "grid";

  return (
    <div className={cn("w-full font-bjork-alpha text-[color:var(--bjork-text)]", className)} style={style}>
      <style href="bjork-ai-shimmer" precedence="default">
        {SHIMMER_TEXT_CSS}
      </style>
      <ul
        aria-label={label}
        className={cn(
          grid ? "grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5" : "flex flex-wrap gap-2",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout={reduce ? false : "position"}
              initial={reduce ? { opacity: 0, filter: "blur(0px)" } : { opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={reduce ? { opacity: 1, filter: "blur(0px)" } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={
                reduce
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { opacity: 0, scale: 0.94, filter: "blur(3px)", transition: { duration: 0.16, ease: ease.out } }
              }
              transition={reduce ? { duration: 0 } : { ...springs.blurIn, layout: springs.standard }}
              className={cn("min-w-0", !grid && "max-w-full")}
            >
              {grid ? (
                <GridCard item={item} onRemove={onRemove} onRetry={onRetry} onOpen={onOpen} />
              ) : (
                <RowChip item={item} onRemove={onRemove} onRetry={onRetry} onOpen={onOpen} />
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <LiveRegion message={announce.message} />
    </div>
  );
}

interface ChipProps {
  item: AttachmentItem;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  onOpen?: (id: string) => void;
}

function RowChip({ item, onRemove, onRetry, onOpen }: ChipProps) {
  const failed = item.status === "error";
  return (
    <div
      className={cn(
        "group relative flex h-12 w-[232px] max-w-full items-center gap-1 rounded-[11px] border pl-1.5 pr-1 transition-colors duration-150",
        failed
          ? "border-[color:color-mix(in_srgb,var(--bjork-error)_45%,transparent)]"
          : "border-[color:var(--bjork-border)]",
      )}
    >
      <OpenArea item={item} onOpen={onOpen} className="h-10 flex-1 gap-2.5 rounded-[8px] pr-1">
        <Tile item={item} size={36} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium leading-[18px]">{item.name}</span>
          <Meta item={item} />
        </span>
      </OpenArea>
      {failed && onRetry && <RetryButton item={item} onRetry={onRetry} />}
      {onRemove && <RemoveButton item={item} onRemove={onRemove} />}
      {item.status === "uploading" && <Hairline progress={item.progress} />}
    </div>
  );
}

function GridCard({ item, onRemove, onRetry, onOpen }: ChipProps) {
  const failed = item.status === "error";
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[12px] border",
        failed
          ? "border-[color:color-mix(in_srgb,var(--bjork-error)_45%,transparent)]"
          : "border-[color:var(--bjork-border)]",
      )}
    >
      <OpenArea item={item} onOpen={onOpen} className="w-full flex-col items-stretch rounded-[11px]">
        <span className="relative block aspect-[4/3] w-full border-b border-[color:var(--bjork-border)]">
          <Tile item={item} fill />
        </span>
        <span className="flex min-w-0 flex-col px-2.5 pb-2 pt-1.5">
          <span className="truncate text-[13px] font-medium leading-[18px]">{item.name}</span>
          <span className="flex min-w-0 items-center justify-between gap-2">
            <Meta item={item} />
          </span>
        </span>
      </OpenArea>
      {failed && onRetry && (
        <span className="absolute bottom-1 right-1">
          <RetryButton item={item} onRetry={onRetry} />
        </span>
      )}
      {onRemove && (
        <span className="absolute right-1 top-1 rounded-full bg-[color:var(--bjork-menu)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-md">
          <RemoveButton item={item} onRemove={onRemove} />
        </span>
      )}
      {item.status === "uploading" && <Hairline progress={item.progress} />}
    </div>
  );
}

function OpenArea({
  item,
  onOpen,
  className,
  children,
}: {
  item: AttachmentItem;
  onOpen?: (id: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const base = cn("flex min-w-0 items-center text-left", className);
  if (item.status === "ready" && onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        aria-label={`Open ${item.name}, ${formatBytes(item.size)}`}
        className={cn(base, "cursor-pointer transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)]", FOCUS_RING)}
      >
        {children}
      </button>
    );
  }
  return <span className={base}>{children}</span>;
}

function Meta({ item }: { item: AttachmentItem }) {
  const ext = extOf(item.name).toUpperCase();
  if (item.status === "processing") {
    return (
      <span className="truncate font-mono text-[11px] leading-4">
        <span className="bjork-ai-shimmer">{statusText(item)}</span>
      </span>
    );
  }
  if (item.status === "error") {
    return (
      <span className="truncate font-mono text-[11px] leading-4 text-[color:var(--bjork-error)]" title={statusText(item)}>
        {statusText(item)}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap font-mono text-[11px] leading-4 tabular-nums text-[color:var(--bjork-text-faint)]">
      <span>{formatBytes(item.size)}</span>
      {item.status === "uploading" ? (
        <span className="inline-block min-w-[4ch] text-[color:var(--bjork-accent-ink)]">
          <VisuallyHidden>Uploading </VisuallyHidden>
          {pct(item.progress)}
        </span>
      ) : item.status === "queued" ? (
        <span>Queued</span>
      ) : (
        ext && <span className="truncate">{ext}</span>
      )}
    </span>
  );
}

function Tile({ item, size, fill = false }: { item: AttachmentItem; size?: number; fill?: boolean }) {
  const ext = extOf(item.name);
  const image = IMAGE_EXT.has(ext) && item.thumbnail;
  const busy = item.status === "uploading" || item.status === "queued";
  const box: CSSProperties = fill ? {} : { width: size, height: size };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden",
        fill ? "absolute inset-0" : "rounded-[8px]",
        !image && "bg-[color:var(--bjork-surface-active)]",
        !fill && !image && "border border-[color:var(--bjork-border)]",
      )}
      style={{ ...box, background: image ? item.thumbnail : undefined }}
    >
      {!image && <DocGlyph ext={ext} big={fill} />}
      {busy && (
        <span
          className="absolute inset-0 grid place-items-center"
          style={{ background: "color-mix(in srgb, var(--bjork-surface) 62%, transparent)" }}
        >
          {item.status === "uploading" ? (
            <Ring progress={item.progress ?? 0} size={fill ? 28 : 18} />
          ) : (
            <span className="size-1.5 rounded-full bg-[color:var(--bjork-text-faint)]" />
          )}
        </span>
      )}
    </span>
  );
}

function DocGlyph({ ext, big }: { ext: string; big: boolean }) {
  const w = big ? 34 : 20;
  const h = big ? 42 : 24;
  const fold = big ? 9 : 6;
  return (
    <span className="relative grid place-items-center" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0" fill="none">
        <path
          d={`M1.5 1.5 H${w - fold} L${w - 1.5} ${fold} V${h - 1.5} H1.5 Z`}
          stroke="var(--bjork-border-strong)"
          strokeWidth="1"
          fill="var(--bjork-field)"
        />
        <path d={`M${w - fold} 1.5 V${fold} H${w - 1.5}`} stroke="var(--bjork-border-strong)" strokeWidth="1" />
      </svg>
      <span
        className={cn(
          "relative translate-y-[2px] font-mono font-semibold uppercase tracking-[0.02em] text-[color:var(--bjork-text-medium)]",
          big ? "text-[9px]" : "text-[6.5px]",
        )}
      >
        {(ext || "file").slice(0, 4)}
      </span>
    </span>
  );
}

function Ring({ progress, size }: { progress: number; size: number }) {
  const reduce = useReduceMotion();
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bjork-hair)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--bjork-accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
        style={{ transition: reduce ? "none" : `stroke-dashoffset 240ms ${easeCss.out}` }}
      />
    </svg>
  );
}

function Hairline({ progress }: { progress?: number }) {
  const reduce = useReduceMotion();
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-0 h-px overflow-hidden">
      <span
        className="absolute inset-0 origin-left bg-[color:var(--bjork-accent)]"
        style={{
          transform: `scaleX(${Math.min(1, Math.max(0, progress ?? 0))})`,
          transition: reduce ? "none" : `transform 240ms ${easeCss.out}`,
        }}
      />
    </span>
  );
}

function RemoveButton({ item, onRemove }: { item: AttachmentItem; onRemove: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRemove(item.id)}
      aria-label={`Remove ${item.name}`}
      className={cn(
        "grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-[color:var(--bjork-text-faint)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
        FOCUS_RING,
        PRESS,
      )}
    >
      <StrokeMorphIcon name="close" size={12} strokeWidth={1.75} />
    </button>
  );
}

function RetryButton({ item, onRetry }: { item: AttachmentItem; onRetry: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRetry(item.id)}
      aria-label={`Retry ${item.name}`}
      className={cn(
        "grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-[color:var(--bjork-error)] transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--bjork-error)_12%,transparent)]",
        FOCUS_RING,
        PRESS,
      )}
    >
      <RotateCw aria-hidden="true" size={13} strokeWidth={1.75} />
    </button>
  );
}
