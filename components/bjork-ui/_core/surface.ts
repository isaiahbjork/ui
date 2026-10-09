import type { CSSProperties } from "react";
import type { BjorkTone } from "./palette";

// The library surface (CANON.md §1). Values mirror app/globals.css :root and .dark. Change both together.
export const BJORK_SURFACE = {
  light: {
    surface: "#fffcf6", surfaceMuted: "rgba(250, 246, 237, 0.94)", surfaceHover: "#f5efe3", surfaceActive: "#efe7d8",
    panel: "#f8f2e7", menu: "rgba(255, 252, 246, 0.98)", field: "rgba(255, 252, 246, 0.96)",
    fieldMuted: "rgba(248, 242, 231, 0.82)", fieldInset: "rgba(239, 231, 216, 0.72)",
    border: "#eee6db", borderMuted: "#f5ede2", borderStrong: "#e1d7c8",
    shadowSurface: "inset 0 7px 14px rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.92), inset 1px 0 0 rgba(88, 72, 49, 0.026), inset -1px 0 0 rgba(255, 255, 255, 0.68), 0 14px 22px -9px rgba(66, 52, 33, 0.11)",
    shadowSoft: "inset 0 1px 0 rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.86)",
    shadowPanel: "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.64), 0 18px 38px -30px rgba(66, 52, 33, 0.2)",
    shadowMenu: "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 0 12px 24px rgba(88, 72, 49, 0.022), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.62), 0 22px 44px -26px rgba(66, 52, 33, 0.22)",
    shadowInset: "inset 0 1px 10px rgba(88, 72, 49, 0.12), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.72)",
  },
  dark: {
    surface: "#121212", surfaceMuted: "rgba(22, 22, 22, 0.92)", surfaceHover: "#161616", surfaceActive: "#202020",
    panel: "#0d0d0d", menu: "rgba(18, 18, 18, 0.98)", field: "rgba(18, 18, 18, 0.95)",
    fieldMuted: "rgba(18, 18, 18, 0.55)", fieldInset: "rgba(9, 9, 9, 0.75)",
    border: "#232323", borderMuted: "#1c1c1c", borderStrong: "#343434",
    shadowSurface: "inset 0 7px 14px rgba(255, 255, 255, 0.03), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.06), 0 14px 20px -6px rgba(0, 0, 0, 0.45)",
    shadowSoft: "inset 0 1px 0 rgba(255, 255, 255, 0.045)",
    shadowPanel: "inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 18px 36px -28px rgba(0, 0, 0, 0.9)",
    shadowMenu: "inset 0 1px 0 rgba(255, 255, 255, 0.055), inset 0 12px 24px rgba(255, 255, 255, 0.018), inset 0 -18px 26px rgba(0, 0, 0, 0.24), 0 22px 42px -22px rgba(0, 0, 0, 0.9)",
    shadowInset: "inset 0 1px 10px rgba(0, 0, 0, 0.45)",
  },
} as const;

/** Writes the surface tokens for a pinned tone as --bjork-* custom properties. Spread first; kit-specific keys may override. */
export function surfaceVars(tone: BjorkTone): CSSProperties {
  const s = BJORK_SURFACE[tone];
  return {
    "--bjork-surface": s.surface, "--bjork-surface-muted": s.surfaceMuted, "--bjork-surface-hover": s.surfaceHover,
    "--bjork-surface-active": s.surfaceActive, "--bjork-panel": s.panel, "--bjork-menu": s.menu, "--bjork-field": s.field,
    "--bjork-field-muted": s.fieldMuted, "--bjork-field-inset": s.fieldInset, "--bjork-border": s.border,
    "--bjork-border-muted": s.borderMuted, "--bjork-border-strong": s.borderStrong,
    "--bjork-shadow-surface": s.shadowSurface, "--bjork-shadow-soft": s.shadowSoft, "--bjork-shadow-panel": s.shadowPanel,
    "--bjork-shadow-menu": s.shadowMenu, "--bjork-shadow-inset": s.shadowInset,
  } as CSSProperties;
}
