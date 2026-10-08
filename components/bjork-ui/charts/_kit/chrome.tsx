"use client";

// Shared chart chrome for the Charts collection: theme vars, the hover tooltip, legend keys and the
// screen-reader table twin every chart ships with.

import { forwardRef, memo, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";

export type ChartPalette = (typeof BJORK_PALETTE)[BjorkTone];

// Tokens a chart root writes so DOM overlays follow `tone` even outside a themed page.
export function chartVars(pal: ChartPalette): CSSProperties {
  return {
    "--bjork-accent": pal.accent,
    "--bjork-accent-ink": pal.accentInk,
    "--bjork-accent-fill": pal.accentFill,
    "--bjork-accent-soft": pal.accentSoft,
    "--bjork-accent-foreground": pal.accentFg,
    "--bjork-text": pal.text,
    "--bjork-text-medium": pal.textMedium,
    "--bjork-text-muted": pal.textMuted,
    "--bjork-text-soft": pal.textSoft,
    "--bjork-text-faint": pal.textFaint,
    "--bjork-hair": pal.hair,
    "--bjork-border": pal.border,
    "--bjork-border-strong": pal.borderStrong,
    "--bjork-surface": pal.surface,
    "--bjork-surface-hover": pal.raised,
    "--bjork-ring-offset": pal.bg,
    "--bjork-success": pal.success,
    "--bjork-warning": pal.warning,
    "--bjork-error": pal.error,
  } as CSSProperties;
}

// Tone, palette, reduced motion and root vars in one call.
export function useChartTheme(toneProp?: BjorkTone) {
  const tone = useBjorkTone(toneProp);
  const pal = BJORK_PALETTE[tone];
  const reduce = !!useReducedMotion();
  return { tone, pal, reduce, vars: chartVars(pal) };
}

// Focus ring shared by every focusable plot surface.
export const chartFocusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]";

// Mono label style: 10px Geist Mono, tabular, cap-trimmed.
export const chartMono = "font-mono text-[10px] leading-none tabular-nums [text-box:trim-both_cap_alphabetic]";

export interface TooltipRow {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  color?: string;
  dashed?: boolean;
  strong?: boolean;
}

// The hover card. Values lead, labels follow, series keyed with a short line in the series colour.
// Position it with `style.transform` from the caller; it never takes pointer events.
export const ChartTooltip = forwardRef<
  HTMLDivElement,
  { title?: ReactNode; rows: TooltipRow[]; visible: boolean; className?: string; style?: CSSProperties }
>(function ChartTooltip({ title, rows, visible, className, style }, ref) {
  return (
    <div
      ref={ref}
      role="presentation"
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-10 min-w-[120px] rounded-[10px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface-hover)] px-2.5 py-2 shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-opacity duration-150 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
      style={style}
    >
      {title !== undefined && (
        <div className="mb-1.5 whitespace-nowrap font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">
          {title}
        </div>
      )}
      <div className="flex flex-col gap-[7px]">
        {rows.map((r, i) => (
          <div key={r.key ?? i} className="flex items-center gap-2 whitespace-nowrap leading-none">
            {r.color && (
              <span
                aria-hidden="true"
                className="inline-block w-2.5 shrink-0"
                style={
                  r.dashed
                    ? { borderTop: `1.5px dashed ${r.color}`, height: 0 }
                    : { background: r.color, height: 2, borderRadius: 1 }
                }
              />
            )}
            <span
              className={cn(
                "font-mono text-[12px] tabular-nums [text-box:trim-both_cap_alphabetic]",
                r.strong === false ? "text-[color:var(--bjork-text-medium)]" : "text-[color:var(--bjork-text)]",
              )}
            >
              {r.value}
            </span>
            <span className="ml-auto pl-3 font-bjork-alpha text-[11px] text-[color:var(--bjork-text-muted)] [text-box:trim-both_cap_alphabetic]">
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

// Places a tooltip of size (tw, th) next to (x, y) inside a (w, h) box, flipping away from edges.
export function placeTooltip(
  x: number,
  y: number,
  tw: number,
  th: number,
  w: number,
  h: number,
  gap = 12,
): { x: number; y: number } {
  let tx = x + gap;
  if (tx + tw > w) tx = x - gap - tw;
  if (tx < 0) tx = Math.max(0, Math.min(w - tw, x - tw / 2));
  let ty = y - th - gap;
  if (ty < 0) ty = Math.min(h - th, y + gap);
  return { x: Math.round(tx), y: Math.round(Math.max(0, ty)) };
}

export interface LegendItem {
  id: string;
  label: string;
  color: string;
  shape?: "line" | "dash" | "rect" | "dot";
  muted?: boolean;
}

// A legend row. Keys mirror the mark: line for lines, rect for areas and bars.
export function ChartLegend({
  items,
  className,
  onHover,
  activeId,
}: {
  items: LegendItem[];
  className?: string;
  onHover?: (id: string | null) => void;
  activeId?: string | null;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {items.map((it) => {
        const dim = (activeId && activeId !== it.id) || it.muted;
        return (
          <span
            key={it.id}
            onPointerEnter={onHover ? () => onHover(it.id) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 font-bjork-alpha text-[11px] font-medium leading-3 transition-opacity duration-150 ease-out",
              dim ? "opacity-45" : "opacity-100",
              "text-[color:var(--bjork-text-medium)]",
            )}
          >
            <LegendKey color={it.color} shape={it.shape} />
            {it.label}
          </span>
        );
      })}
    </div>
  );
}

export function LegendKey({ color, shape = "rect" }: { color: string; shape?: LegendItem["shape"] }) {
  if (shape === "line") return <span aria-hidden="true" className="inline-block h-[2px] w-2.5 rounded-[1px]" style={{ background: color }} />;
  if (shape === "dash") return <span aria-hidden="true" className="inline-block h-0 w-2.5" style={{ borderTop: `1.5px dashed ${color}` }} />;
  if (shape === "dot") return <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: color }} />;
  return <span aria-hidden="true" className="inline-block size-2 rounded-[2px]" style={{ background: color }} />;
}

// The table twin. Every value the chart shows is reachable here without hovering.
// Memoised: hover state re-renders the chart, never the table. Pass memoised rows.
export const ChartTable = memo(function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
});
