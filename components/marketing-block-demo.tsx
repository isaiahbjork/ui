"use client";

import { useEffect, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { ArrowUpRight } from "lucide-react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const PREVIEW_W = 900;
const PREVIEW_H = 520;
const PREVIEW_STAGE = 1280;

export interface MarketingBlockDemoRender {
  /** Gallery screenshot capture (`?preview=1`). Freeze clocks and skip entrance motion. */
  isPreview: boolean;
  /** Standalone full-width view (`?view=full`). */
  isFull: boolean;
}

/**
 * Demo page wrapper for the marketing blocks.
 * - In the docs shell the block fills the preview column and scrolls; blocks read their own width,
 *   so the column shows the tablet layout and a link opens the block full width.
 * - `?view=full` renders the block alone across the viewport.
 * - `?preview=1` renders the block on a 1280px stage scaled into the 900x520 gallery frame.
 */
export function MarketingBlockDemo({
  slug,
  description,
  usageCode,
  note,
  previewOffset = 0,
  render,
}: {
  slug: string;
  description: string;
  usageCode: string;
  note?: ReactNode;
  /** How far down the block (in stage pixels) the gallery frame starts. */
  previewOffset?: number;
  render: (state: MarketingBlockDemoRender) => ReactNode;
}) {
  const item = getGalleryItem(slug);
  const isPreview = usePreviewMode();
  const isFull = usePreviewSearchParam("view") === "full";
  const theme = usePreviewSearchParam("theme");
  const { setTheme } = useTheme();

  useEffect(() => {
    if (isFull && (theme === "light" || theme === "dark")) setTheme(theme);
  }, [isFull, theme, setTheme]);

  if (isFull) {
    return <main className="min-h-dvh bg-[var(--bjork-bg)]">{render({ isPreview: false, isFull: true })}</main>;
  }

  const scale = PREVIEW_W / PREVIEW_STAGE;

  return (
    <SimpleComponentDemoPage
      item={item}
      description={description}
      usageCode={usageCode}
      note={note}
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      previewLayout="list"
      details={
        <section className="space-y-4 pt-16">
          <h2 className="font-mono text-xs uppercase tracking-[0.08em] text-[color:var(--bjork-text-muted)]">
            Full width
          </h2>
          <a
            href={`${item?.route ?? ""}?view=full`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[15px] text-[color:var(--bjork-text-medium)] underline decoration-[color:var(--bjork-border-strong)] underline-offset-4 transition-colors hover:text-[color:var(--bjork-text)]"
          >
            Open the block on its own page
            <ArrowUpRight aria-hidden className="size-4" />
          </a>
        </section>
      }
    >
      {isPreview ? (
        <div className="relative overflow-hidden" style={{ width: PREVIEW_W, height: PREVIEW_H }}>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: PREVIEW_STAGE, transform: `scale(${scale}) translateY(${-previewOffset}px)` }}
          >
            {render({ isPreview: true, isFull: false })}
          </div>
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-[24px] border border-[color:var(--bjork-border)]">
          {render({ isPreview: false, isFull: false })}
        </div>
      )}
    </SimpleComponentDemoPage>
  );
}
