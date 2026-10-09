"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const fitQuery = "(max-width: 1023px)";

/**
 * Below the lg breakpoint, scales a demo down to the width it is given when its
 * natural width would overflow. Content that already fits is left untouched, so
 * responsive components keep their own layout. `minWidth` opts a demo into
 * laying out wider than a phone and shrinking, for cards that wrap badly.
 * From lg up both wrappers are `display: contents` and the demo lays out
 * exactly as it did before.
 *
 * The demo stays hidden below lg until the first measurement, so a phone never
 * paints the unscaled, clipped frame before hydration.
 */
export function DemoFit({
  children,
  layout = "single",
  minWidth = 0,
}: {
  children: ReactNode;
  layout?: "single" | "list";
  /** Lay the demo out at least this wide (px) and scale it down to fit, for cards that wrap badly when squeezed. */
  minWidth?: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const query = window.matchMedia(fitQuery);

    const fit = () => {
      inner.style.width = "";
      inner.style.transform = "";
      outer.style.height = "";
      if (!query.matches) return;

      const available = outer.clientWidth;
      // Layout widths only: scrollWidth would also count decorative,
      // absolutely positioned overflow (glows, off-canvas tooltips).
      let natural = minWidth;
      for (const child of Array.from(inner.children)) {
        if (child instanceof HTMLElement) natural = Math.max(natural, child.offsetWidth);
      }
      if (available <= 0 || natural <= available + 2) return;

      const scale = available / natural;
      inner.style.width = `${natural}px`;
      inner.style.transform = `scale(${scale})`;
      outer.style.height = `${inner.offsetHeight * scale}px`;
    };

    fit();
    inner.style.visibility = "visible";

    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    for (const child of Array.from(inner.children)) observer.observe(child);
    query.addEventListener("change", fit);

    return () => {
      observer.disconnect();
      query.removeEventListener("change", fit);
    };
  }, [minWidth]);

  return (
    <div ref={outerRef} className="w-full min-w-0 lg:contents">
      <div
        ref={innerRef}
        className={cn(
          "w-full origin-top-left lg:contents",
          layout === "single" && "flex items-center justify-center",
          "max-lg:invisible",
        )}
      >
        {children}
      </div>
    </div>
  );
}
