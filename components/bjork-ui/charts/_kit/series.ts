// Series colour for the Charts collection: a fixed categorical order for identity and a one-hue
// ramp for magnitude. Pure data and functions; every chart imports what it needs by path.
//
// The categorical order leads with the house accent and is validated (OKLab, CVD-simulated) per
// tone against the chart stage: every adjacent pair clears ΔE 13 under deutan/protan and ΔE 19
// unsimulated, and the first three slots clear the all-pairs gate for scatter-like marks. Light
// slots 1, 3, 5 and 6 sit under 3:1 on the light stage, so charts using them ship direct labels
// and the table twin. Hues are assigned in this order and never cycled: past six series, fold the
// rest into "Other" (see `foldSeries`).

import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { clamp, lerp, parseColor } from "@/components/bjork-ui/charts/_kit/scale";

export const CHART_SERIES: Record<BjorkTone, readonly string[]> = {
  //       accent     blue       aqua       violet     magenta    amber
  dark: ["#ec5c13", "#3987e5", "#199e70", "#9085e9", "#d55181", "#c98500"],
  light: ["#ec7d43", "#2a78d6", "#1baf7a", "#4a3aa7", "#e87ba4", "#eda100"],
};

// The neutral an "Other" bucket takes, so it never impersonates a series.
export const CHART_OTHER: Record<BjorkTone, string> = { dark: "#5c5c5c", light: "#a8a39a" };

export const MAX_SERIES = 6;

// Slot colour by the series' stable index (its position in the caller's data, never its rank).
export function seriesColor(tone: BjorkTone, index: number): string {
  const set = CHART_SERIES[tone];
  return index >= 0 && index < set.length ? set[index] : CHART_OTHER[tone];
}

// Keeps the first `max - 1` items and sums the rest into one "Other" item when there are more
// than `max`. `merge` builds the Other item from the folded ones.
export function foldSeries<T>(items: T[], max: number, merge: (rest: T[]) => T): T[] {
  if (items.length <= max) return items;
  return [...items.slice(0, max - 1), merge(items.slice(max - 1))];
}

// One-hue magnitude ramp in the accent family. t = 0 recedes toward the stage, t = 1 is the
// strongest step. Dark mode brightens with magnitude, light mode darkens, so "more" always reads
// as more contrast against the surface.
const RAMP: Record<BjorkTone, readonly string[]> = {
  dark: ["#1d1611", "#3a2112", "#6a3013", "#a84514", "#ec5c13", "#ff9a5c"],
  light: ["#f1e8dc", "#f3cfb2", "#eda57a", "#e07a43", "#b4531f", "#7a3412"],
};

export function rampColor(tone: BjorkTone, t: number): string {
  const stops = RAMP[tone];
  const x = clamp(Number.isFinite(t) ? t : 0, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = parseColor(stops[i]);
  const b = parseColor(stops[i + 1]);
  const f = x - i;
  return `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`;
}

// WCAG relative luminance of an sRGB colour.
function relLum(color: string): number {
  const [r, g, b] = parseColor(color).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Light or dark ink for text on a filled mark, whichever has more WCAG contrast. The inks are
// near-white (L ≈ 0.94) and near-black (L ≈ 0.009). Saturated orange gets dark ink; white text
// only lands on the deeper rust steps, the same rule as --bjork-accent-fill.
export function inkOn(color: string): "light" | "dark" {
  const L = relLum(color);
  return (0.94 + 0.05) / (L + 0.05) >= (L + 0.05) / (0.009 + 0.05) ? "light" : "dark";
}

// Whether text on a ramp cell at `t` should use the light or dark ink.
export function rampInk(tone: BjorkTone, t: number): "light" | "dark" {
  return inkOn(rampColor(tone, t));
}
