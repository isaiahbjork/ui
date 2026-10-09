"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Link2Off, RotateCw, X } from "lucide-react";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Skeleton,
  focusRing,
  useCardTheme,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export interface LinkMeta {
  title: string;
  description?: string;
  siteName?: string;
  /** Open Graph image URL. Without one the card draws a cover from `themeColor`. */
  image?: string;
  imageAlt?: string;
  favicon?: string;
  /** ISO date. */
  publishedAt?: string;
  author?: string;
  readingMinutes?: number;
  themeColor?: string;
}

export type LinkPreviewLayout = "large" | "compact";

export interface LinkPreviewCardProps {
  url?: string;
  /** Known metadata. Skips `resolve`. */
  meta?: LinkMeta;
  /** Fetches metadata for `url` (your unfurl endpoint). Rejects show the fallback. */
  resolve?: (url: string) => Promise<LinkMeta>;
  layout?: LinkPreviewLayout;
  /** Shows a remove button, e.g. in a composer. */
  onDismiss?: () => void;
  /** Open in a new tab. Default true. */
  external?: boolean;
  locale?: string;
  theme?: CardTheme;
  className?: string;
}

export const LINK_PREVIEW_SAMPLE = {
  url: "https://fieldnotes.studio/essays/quiet-interfaces",
  meta: {
    title: "Quiet interfaces: designing software that gets out of the way",
    description:
      "Notes from three years of shipping tools for people who would rather be doing something else. On defaults, restraint and the craft of the boring parts.",
    siteName: "Field Notes",
    author: "Ines Albrecht",
    publishedAt: "2026-09-14",
    readingMinutes: 9,
    themeColor: "#ec5c13",
  } satisfies LinkMeta,
};

type Load = { state: "idle" | "loading" | "ready" | "error"; meta?: LinkMeta };

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * An Open Graph unfurl for chat, docs and composers. Loads with a matching skeleton, falls back to a
 * plain link when the page can't be read, and stays one link so it reads cleanly with a screen reader.
 */
export function LinkPreviewCard({
  url = LINK_PREVIEW_SAMPLE.url,
  meta,
  resolve,
  layout = "large",
  onDismiss,
  external = true,
  locale = "en-US",
  theme = "auto",
  className,
}: LinkPreviewCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();
  const host = hostOf(url);

  const [load, setLoad] = useState<Load>(() =>
    meta ? { state: "ready", meta } : resolve ? { state: "loading" } : { state: "ready", meta: LINK_PREVIEW_SAMPLE.meta },
  );
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (meta || !resolve) return;
    let live = true;
    resolve(url).then(
      (m) => live && setLoad({ state: "ready", meta: m }),
      () => live && setLoad({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [url, meta, resolve, attempt]);

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setImageFailed(false);
    setAttempt((a) => a + 1);
  }, []);

  const data = meta ?? load.meta;
  const state = meta ? "ready" : load.state;
  const compact = layout === "compact";
  const linkProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};

  const dismiss = onDismiss && (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Remove link preview"
      className={cn(
        "absolute right-2 top-2 z-20 grid size-7 cursor-pointer place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-[background-color,transform] hover:bg-black/65 active:scale-[0.92] motion-reduce:transition-none",
        focusRing,
      )}
    >
      <X aria-hidden="true" className="size-3.5" />
    </button>
  );

  if (state === "loading" || state === "idle") {
    return (
      <CardFrame as="div" aria-busy="true" aria-label={`Loading preview for ${host}`} className={className} style={style} maxWidth={compact ? 460 : 420}>
        {dismiss}
        <div className={cn(compact ? "flex gap-3 p-3" : "")}>
          <Skeleton className={cn(compact ? "size-[72px] shrink-0 rounded-[10px]" : "aspect-[1.91] w-full rounded-none")} />
          <div className={cn("flex-1 space-y-2", compact ? "py-1" : "p-4")}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-[85%]" />
            {!compact && <Skeleton className="h-3 w-full" />}
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </CardFrame>
    );
  }

  if (state === "error" || !data) {
    return (
      <CardFrame as="article" aria-labelledby={titleId} className={cn("group", className)} style={style} maxWidth={460}>
        {dismiss}
        <div className="flex items-center gap-3 p-3 pr-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[color:var(--bjork-card-raised)] text-[color:var(--bjork-text-muted)] ring-1 ring-[color:var(--bjork-border)]">
            <Link2Off aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <a
              id={titleId}
              href={url}
              {...linkProps}
              className={cn("block truncate rounded-[4px] text-[13px] font-medium leading-5 underline-offset-2 hover:underline", focusRing)}
            >
              {host}
            </a>
            <p className="truncate text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">Preview unavailable · {url.replace(/^https?:\/\//, "")}</p>
          </div>
          {resolve && (
            <CardButton size="sm" variant="ghost" onClick={retry} aria-label="Retry loading preview" icon={<RotateCw aria-hidden="true" className="size-3.5" />} className={onDismiss ? "mr-7" : ""}>
              Retry
            </CardButton>
          )}
        </div>
      </CardFrame>
    );
  }

  const date = data.publishedAt
    ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(Date.parse(data.publishedAt))
    : null;
  const metaBits = [data.author, date, data.readingMinutes ? `${data.readingMinutes} min read` : null].filter(Boolean);
  const showImage = data.image && !imageFailed;

  const cover = (
    <div className={cn("relative overflow-hidden bg-[color:var(--bjork-card-raised)]", compact ? "size-[72px] shrink-0 rounded-[10px]" : "aspect-[1.91] w-full")}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt={data.imageAlt ?? ""}
          onError={() => setImageFailed(true)}
          className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <GeneratedCover color={data.themeColor ?? "#ec5c13"} label={data.siteName ?? host} compact={compact} />
      )}
    </div>
  );

  return (
    <CardFrame as="article" aria-labelledby={titleId} className={cn("group transition-[border-color] hover:border-[color:var(--bjork-border-strong)]", className)} style={style} maxWidth={compact ? 460 : 420}>
      {dismiss}
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: ease.out }}
        className={cn(compact && "flex items-center gap-3 p-3 pr-4")}
      >
        {cover}
        <div className={cn("min-w-0", compact ? "flex-1" : "p-4")}>
          <p className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
            {data.favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.favicon} alt="" className="size-3.5 shrink-0 rounded-[3px]" />
            ) : (
              <span
                aria-hidden="true"
                className="grid size-3.5 shrink-0 place-items-center rounded-[3px] text-[8px] font-bold text-white"
                style={{ background: data.themeColor ?? "#ec5c13" }}
              >
                {(data.siteName ?? host)[0]}
              </span>
            )}
            <span className="truncate">
              {data.siteName && <span className="text-[color:var(--bjork-text-medium)]">{data.siteName}</span>}
              {data.siteName && " · "}
              {host}
            </span>
          </p>
          <h3 id={titleId} className={cn("mt-1.5 font-semibold tracking-[-0.005em]", compact ? "line-clamp-1 text-[13px] leading-5" : "line-clamp-2 text-[15px] leading-5")}>
            {/* Stretched link: the whole card is one target, the dismiss button stays separate. */}
            <a
              href={url}
              {...linkProps}
              className="rounded-[4px] outline-none after:absolute after:inset-0 after:z-10 after:rounded-[20px] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[color:var(--bjork-accent)] focus-visible:after:ring-inset"
            >
              {data.title}
              {external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          </h3>
          {data.description && (
            <p className={cn("mt-1 text-[13px] leading-5 text-[color:var(--bjork-text-medium)]", compact ? "line-clamp-1" : "line-clamp-2")}>
              {data.description}
            </p>
          )}
          {!compact && metaBits.length > 0 && (
            <p className="mt-3 flex items-center justify-between gap-3 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
              <span className="truncate">{metaBits.join(" · ")}</span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-[color:var(--bjork-text-soft)] transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[color:var(--bjork-text)] motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
              />
            </p>
          )}
        </div>
      </motion.div>
    </CardFrame>
  );
}

function GeneratedCover({ color, label, compact }: { color: string; label: string; compact: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      style={{
        background: `radial-gradient(90% 120% at 85% 110%, color-mix(in oklab, ${color} 85%, white) 0%, ${color} 28%, transparent 60%), radial-gradient(70% 90% at 0% 0%, color-mix(in oklab, ${color} 40%, black) 0%, transparent 70%), linear-gradient(160deg, #1a1a1a, #0c0c0c)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: compact ? "12px 12px" : "28px 28px",
          maskImage: "linear-gradient(to bottom right, black, transparent 70%)",
        }}
      />
      {!compact && (
        <span className="absolute bottom-4 left-4 font-bjork-display text-[28px] font-semibold leading-none tracking-[-0.02em] text-white/90">
          {label}
        </span>
      )}
    </div>
  );
}
