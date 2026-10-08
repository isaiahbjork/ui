"use client";

import { useEffect, useRef, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { MinimapScrollbar } from "@/components/bjork-ui/navigation/minimap-scrollbar";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("minimap-scrollbar");

function MinimapDemo() {
  const isPreview = usePreviewMode();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [debugHoverAt, setDebugHoverAt] = useState<number | undefined>(undefined);

  // Preview pose: scrolled to 38%, with the label pill on section 03.
  useEffect(() => {
    if (!isPreview) return;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = 0.38 * (el.scrollHeight - el.clientHeight);
      const third = el.querySelectorAll<HTMLElement>("h2")[2];
      if (third) setDebugHoverAt(third.offsetTop / el.scrollHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPreview]);

  return (
    <div className="relative h-[440px] w-[min(760px,calc(100vw-56px))] overflow-hidden rounded-[16px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)]">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto text-[color:var(--bjork-text)]"
        style={{ padding: "40px 56px 40px 40px", scrollbarWidth: "thin" }}
      >
        <article>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">Notes on optical alignment</h1>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Measured centres and visual centres rarely agree. These notes collect the habits that close the gap,
            from small icons to long columns of figures.
          </p>

          <h2 className="mt-8 text-[18px] font-semibold tracking-[-0.01em]">Starting from the eye</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            A box can be perfectly centred and still look low. Filled shapes carry more weight than outlines, and
            flat edges read heavier than curves of the same size.
          </p>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Start with the bounding box, then step back and judge the weight. Move in small steps and stop when
            the shape stops feeling off.
          </p>

          <h2 className="mt-8 text-[18px] font-semibold tracking-[-0.01em]">Centring small shapes</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Small glyphs need the most attention because a pixel is a large share of their size.
          </p>

          <h3 className="mt-5 text-[14px] font-semibold">Icon centring</h3>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Triangles and arrows should sit slightly toward the direction they point. Their centroid is what the
            eye reads, not the corners of their box.
          </p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Round icons can overshoot the box a little so they match the square ones next to them.
          </p>

          <h2 className="mt-8 text-[18px] font-semibold tracking-[-0.01em]">Padding and balance</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Equal padding on every side often looks uneven. A label with a leading icon usually needs less space on
            the icon side.
          </p>

          <h3 className="mt-5 text-[14px] font-semibold">Padding asymmetry</h3>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Trim the side that already carries an icon by a couple of pixels. Leave the text side alone so the
            words keep their rhythm.
          </p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Check the result with the blur test. The visual mass should land where the box centre is.
          </p>

          <h2 className="mt-8 text-[18px] font-semibold tracking-[-0.01em]">Shape weight and punctuation</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Counters, the open space inside letters, change how heavy a word looks. Tight counters darken a line,
            open ones lighten it.
          </p>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Hanging punctuation lets quotes and bullets sit outside the text edge, so the first letters line up
            down the column.
          </p>

          <h2 className="mt-8 text-[18px] font-semibold tracking-[-0.01em]">Type at small and large sizes</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            A single typeface can behave differently across sizes. Display cuts run tighter with finer joins, while
            text cuts open up for legibility.
          </p>

          <h3 className="mt-5 text-[14px] font-semibold">Optical sizes</h3>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Pick the cut that matches the size on screen. A large heading set in a text cut looks loose and
            underweight.
          </p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Keep optical sizing automatic where the font supports it, and only override it when a layout demands
            a fixed look.
          </p>

          <h2 className="mt-8 text-[18px] font-semibold tracking-[-0.01em]">Figures in columns</h2>
          <p className="mt-3 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Numbers that change, such as counters and timers, should keep a fixed width so the layout does not
            wobble on every tick.
          </p>

          <h3 className="mt-5 text-[14px] font-semibold">Tabular numerals</h3>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Set columns of figures with tabular numerals so the digits share one advance width and line up by
            their place value.
          </p>
          <p className="mt-2 text-[14px] leading-[1.65] text-[color:var(--bjork-text-medium)]">
            Proportional figures look nicer in running prose. Switch to tabular only where digits stack.
          </p>
        </article>
      </div>

      <MinimapScrollbar target={scrollRef} debugHoverAt={debugHoverAt} />
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A scroll rail that shows where you are in the document and how it is built. Ticks mark headings and blocks, and the heading under your pointer appears in a label."
      cliCommand="npx shadcn@latest add @bjork-ui/minimap-scrollbar"
      usageCode={`import { useRef } from "react";
import { MinimapScrollbar } from "@/components/bjork-ui/navigation/minimap-scrollbar";

export function Article() {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-[440px]">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {/* headings and paragraphs */}
      </div>
      <MinimapScrollbar target={scrollRef} />
    </div>
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[920px] scale-[1]"
    >
      <MinimapDemo />
    </SimpleComponentDemoPage>
  );
}
