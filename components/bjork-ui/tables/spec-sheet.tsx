"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BjorkTableThemeMode,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export interface SpecVariant {
  id: string;
  name: string;
  /** Short line under the name, such as a price. */
  detail?: string;
}

/** A cell value. Use `{ value, unit }` when one cell needs a different unit than its row. */
export type SpecValue = string | number | boolean | null | { value: number; unit?: string };

export interface SpecRow {
  id?: string;
  label: string;
  /** One value per variant id. A plain value applies to every variant. */
  value: Record<string, SpecValue> | SpecValue;
  unit?: string;
  note?: string;
  /** Fraction digits for numeric values. Defaults to what the number needs. */
  precision?: number;
}

export interface SpecGroup {
  id: string;
  label: string;
  rows: SpecRow[];
}

export interface SpecSheetProps {
  groups?: SpecGroup[];
  /** Up to three variants to compare. Extra variants are ignored. */
  variants?: SpecVariant[];
  title?: string;
  /** Start with only the differing rows visible. */
  defaultDifferencesOnly?: boolean;
  /** Controlled "differences only" state. */
  differencesOnly?: boolean;
  onDifferencesOnlyChange?: (value: boolean) => void;
  /** Variant shown first in the narrow, one-column layout. */
  defaultVariantId?: string;
  onVariantChange?: (variantId: string) => void;
  /** Max height of the scrolling body. Header and group headings stick. */
  maxHeight?: number;
  loading?: boolean;
  locale?: string;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

export const SPEC_SHEET_SAMPLE_VARIANTS: SpecVariant[] = [
  { id: "h14", name: "Halden 14", detail: "from $1,599" },
  { id: "h16", name: "Halden 16", detail: "from $2,299" },
  { id: "h16p", name: "Halden 16 Pro", detail: "from $3,199" },
];

export const SPEC_SHEET_SAMPLE: SpecGroup[] = [
  {
    id: "display",
    label: "Display",
    rows: [
      { label: "Size", value: { h14: 14.2, h16: 16.2, h16p: 16.2 }, unit: "in", note: "Diagonal, viewable" },
      { label: "Resolution", value: { h14: "2880 × 1800", h16: "3456 × 2160", h16p: "3456 × 2160" } },
      { label: "Panel", value: { h14: "IPS", h16: "IPS", h16p: "Mini-LED, 2,304 zones" } },
      { label: "Peak brightness", value: { h14: 500, h16: 600, h16p: 1600 }, unit: "nits", note: "HDR content" },
      { label: "Refresh rate", value: { h14: 120, h16: 120, h16p: 165 }, unit: "Hz" },
      { label: "Color gamut", value: "100% DCI-P3" },
      { label: "Finish", value: { h14: "Glossy", h16: "Glossy", h16p: "Nano-texture" } },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    rows: [
      { label: "Processor", value: { h14: "H2, 10-core", h16: "H2, 12-core", h16p: "H2 Max, 16-core" } },
      { label: "Graphics", value: { h14: 16, h16: 20, h16p: 40 }, unit: "cores" },
      { label: "Memory", value: { h14: 16, h16: 32, h16p: 64 }, unit: "GB", note: "Unified, not upgradable" },
      {
        label: "Storage",
        value: { h14: { value: 512, unit: "GB" }, h16: { value: 1, unit: "TB" }, h16p: { value: 2, unit: "TB" } },
      },
      { label: "Neural engine", value: 38, unit: "TOPS" },
      { label: "Cooling", value: { h14: "Single fan", h16: "Dual fan", h16p: "Dual fan, vapor chamber" } },
    ],
  },
  {
    id: "battery",
    label: "Battery",
    rows: [
      { label: "Capacity", value: { h14: 72, h16: 100, h16p: 100 }, unit: "Wh" },
      { label: "Video playback", value: { h14: 19, h16: 22, h16p: 18 }, unit: "h", note: "Local 1080p, 150 nits" },
      { label: "Charger", value: { h14: 70, h16: 96, h16p: 140 }, unit: "W" },
      { label: "Fast charge", value: { h14: false, h16: true, h16p: true }, note: "50% in 30 min" },
    ],
  },
  {
    id: "connectivity",
    label: "Connectivity",
    rows: [
      { label: "USB-C / Thunderbolt", value: { h14: 2, h16: 3, h16p: 3 }, unit: "ports" },
      { label: "HDMI 2.1", value: { h14: false, h16: true, h16p: true } },
      { label: "SD card slot", value: { h14: false, h16: true, h16p: true } },
      { label: "Wireless", value: "Wi-Fi 7, Bluetooth 5.4" },
      { label: "Headphone jack", value: true },
      { label: "Webcam", value: "1080p, Center Frame" },
    ],
  },
  {
    id: "dimensions",
    label: "Dimensions",
    rows: [
      { label: "Width", value: { h14: 312.6, h16: 355.7, h16p: 355.7 }, unit: "mm", precision: 1 },
      { label: "Depth", value: { h14: 221.2, h16: 248.1, h16p: 248.1 }, unit: "mm", precision: 1 },
      { label: "Thickness", value: { h14: 14.9, h16: 16.8, h16p: 16.8 }, unit: "mm", precision: 1 },
      { label: "Enclosure", value: "Recycled aluminium" },
      { label: "Weight", value: { h14: 1.38, h16: 2.04, h16p: 2.16 }, unit: "kg", precision: 2 },
    ],
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useIsNarrow<T extends HTMLElement>(threshold: number) {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width > 0 && width < threshold);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, narrow] as const;
}

function isPerVariant(value: SpecRow["value"]): value is Record<string, SpecValue> {
  return typeof value === "object" && value !== null && !("value" in value && typeof value.value === "number");
}

function cellValue(row: SpecRow, variantId: string): SpecValue {
  return isPerVariant(row.value)
    ? ((row.value as Record<string, SpecValue>)[variantId] ?? null)
    : (row.value as SpecValue);
}

function valueKey(row: SpecRow, value: SpecValue) {
  if (value !== null && typeof value === "object") return `${value.value}${value.unit ?? row.unit ?? ""}`;
  return `${String(value)}${row.unit ?? ""}`;
}

function rowDiffers(row: SpecRow, variants: SpecVariant[]) {
  if (!isPerVariant(row.value) || variants.length < 2) return false;
  const first = valueKey(row, cellValue(row, variants[0].id));
  return variants.some((v) => valueKey(row, cellValue(row, v.id)) !== first);
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, precision?: number) {
  const key = `${locale}|${precision ?? ""}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision ?? 0,
      maximumFractionDigits: precision ?? 2,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

// ─── component ───────────────────────────────────────────────────────────────

const HEADER_HEIGHT = 58;

export function SpecSheet({
  groups = SPEC_SHEET_SAMPLE,
  variants: variantsProp = SPEC_SHEET_SAMPLE_VARIANTS,
  title = "Compare models",
  defaultDifferencesOnly = false,
  differencesOnly: differencesOnlyProp,
  onDifferencesOnlyChange,
  defaultVariantId,
  onVariantChange,
  maxHeight = 540,
  loading = false,
  locale = "en-US",
  className,
  theme = "auto",
  enableAnimations = true,
}: SpecSheetProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;
  const uid = useId();

  const variants = useMemo(() => variantsProp.slice(0, 3), [variantsProp]);
  const [rootRef, narrow] = useIsNarrow<HTMLDivElement>(480);
  const [diffOnlyState, setDiffOnlyState] = useState(defaultDifferencesOnly);
  const diffOnly = differencesOnlyProp ?? diffOnlyState;
  const [pickedId, setPickedId] = useState(defaultVariantId ?? variants[variants.length - 1]?.id);
  const picked = variants.find((v) => v.id === pickedId) ?? variants[0];
  const [intro, setIntro] = useState(true);
  const pickerRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const formatNumber = (n: number, precision?: number) => getFormatter(locale, precision).format(n);

  const { visibleGroups, diffCount, totalCount } = useMemo(() => {
    let diff = 0;
    let total = 0;
    const out = groups
      .map((group) => {
        const rows = group.rows.map((row) => {
          const differs = rowDiffers(row, variants);
          total += 1;
          if (differs) diff += 1;
          return { row, differs };
        });
        return { group, rows: diffOnly ? rows.filter((r) => r.differs) : rows };
      })
      .filter((g) => g.rows.length > 0);
    return { visibleGroups: out, diffCount: diff, totalCount: total };
  }, [groups, variants, diffOnly]);

  const setDiffOnly = (next: boolean) => {
    if (differencesOnlyProp === undefined) setDiffOnlyState(next);
    onDifferencesOnlyChange?.(next);
  };

  const pick = (id: string, focus = false) => {
    setPickedId(id);
    onVariantChange?.(id);
    if (focus) pickerRefs.current.get(id)?.focus();
  };

  const handlePickerKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = variants.length - 1;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    if (next < 0) return;
    event.preventDefault();
    pick(variants[next].id, true);
  };

  const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/60";
  const headerLabel = "text-[11px] font-medium uppercase tracking-[0.08em]";
  const bar = isDark ? "bg-[#d86a2c]" : "bg-[#bd4514]";
  const surface = isDark ? "bg-[#111]" : "bg-[#fffcf6]";

  const renderValue = (row: SpecRow, value: SpecValue) => {
    if (value === null || value === undefined) {
      return (
        <span className={palette.secondaryText}>
          <span aria-hidden>—</span>
          <span className="sr-only">Not available</span>
        </span>
      );
    }
    if (typeof value === "boolean") {
      return value ? (
        <span className={cn("inline-flex items-center gap-1.5", palette.primaryText)}>
          <Check size={14} strokeWidth={2.4} className={palette.accent} aria-hidden />
          <span className="sr-only">Yes</span>
        </span>
      ) : (
        <span className={cn("inline-flex items-center", palette.secondaryText)}>
          <Minus size={14} strokeWidth={2} aria-hidden />
          <span className="sr-only">No</span>
        </span>
      );
    }
    const isObj = typeof value === "object";
    const num = isObj ? value.value : typeof value === "number" ? value : null;
    const unit = isObj ? (value.unit ?? row.unit) : row.unit;
    if (num !== null) {
      return (
        <span className="whitespace-nowrap tabular-nums">
          <span className={cn("font-medium", palette.primaryText)}>{formatNumber(num, row.precision)}</span>
          {unit ? <span className={cn("ml-[0.28em] text-[11.5px]", palette.secondaryText)}>{unit}</span> : null}
        </span>
      );
    }
    return (
      <span className={cn("tabular-nums", palette.primaryText)}>
        {String(value)}
        {unit ? <span className={cn("ml-[0.28em] text-[11.5px]", palette.secondaryText)}>{unit}</span> : null}
      </span>
    );
  };

  const shownVariants = narrow && picked ? [picked] : variants;
  const labelWidth = narrow ? "46%" : variants.length === 1 ? "40%" : "28%";

  return (
    <div
      ref={rootRef}
      className={cn("w-full overflow-hidden rounded-[18px] border text-[13px]", palette.container, className)}
    >
      <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5 py-3.5", narrow && "px-4")}>
        <div className="min-w-0">
          <h3 className={cn("text-[15px] font-semibold tracking-[-0.01em]", palette.primaryText)}>{title}</h3>
          <p className={cn("mt-0.5 text-[12px] tabular-nums", palette.secondaryText)}>
            {loading ? "Loading specs…" : `${diffCount} of ${totalCount} specs differ`}
          </p>
        </div>
        {variants.length > 1 ? (
          <label className={cn("flex cursor-pointer select-none items-center gap-2.5 text-[12.5px]", palette.primaryText)}>
            <span>Show differences only</span>
            <button
              type="button"
              role="switch"
              aria-checked={diffOnly}
              onClick={() => setDiffOnly(!diffOnly)}
              className={cn(
                "relative h-[20px] w-[34px] shrink-0 rounded-full border transition-colors duration-200 motion-reduce:transition-none",
                diffOnly
                  ? "border-[#ec5c13]/40 bg-[#ec5c13]"
                  : isDark
                    ? "border-[#2a2a2a] bg-[#1d1d1d]"
                    : "border-[#e2d6c3] bg-[#efe7da]",
                focusRing
              )}
            >
              <motion.span
                aria-hidden
                className={cn(
                  "absolute left-[2px] top-[2px] size-[14px] rounded-full",
                  diffOnly ? "bg-[#fffcf6]" : isDark ? "bg-[#ededed]/60" : "bg-[#fffcf6] shadow-[0_1px_2px_rgba(62,52,38,0.25)]"
                )}
                initial={false}
                animate={{ x: diffOnly ? 14 : 0 }}
                transition={shouldAnimate ? { type: "spring", stiffness: 600, damping: 34 } : { duration: 0 }}
              />
            </button>
          </label>
        ) : null}
      </div>

      {narrow && variants.length > 1 ? (
        <div className="px-4 pb-3">
          <div
            role="radiogroup"
            aria-label="Model"
            className={cn("grid gap-1 rounded-[10px] border p-[3px]", palette.divider, palette.mutedSurface)}
            style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` }}
          >
            {variants.map((variant, index) => {
              const selected = variant.id === picked?.id;
              return (
                <button
                  key={variant.id}
                  ref={(node) => {
                    if (node) pickerRefs.current.set(variant.id, node);
                    else pickerRefs.current.delete(variant.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => pick(variant.id)}
                  onKeyDown={(e) => handlePickerKey(e, index)}
                  className={cn(
                    "relative truncate rounded-[7px] px-2 py-1.5 text-[12px] font-medium transition-colors motion-reduce:transition-none",
                    selected ? palette.primaryText : palette.secondaryText,
                    focusRing
                  )}
                >
                  {selected ? (
                    <motion.span
                      layoutId={shouldAnimate ? `${uid}-pick` : undefined}
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                      className={cn(
                        "absolute inset-0 rounded-[7px] border",
                        isDark ? "border-[#2c2c2c] bg-[#222]" : "border-[#eadfce] bg-[#fffcf6] shadow-[var(--bjork-shadow-soft)]"
                      )}
                    />
                  ) : null}
                  <span className="relative">{variant.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        role="region"
        aria-label={`${title} specifications`}
        aria-busy={loading || undefined}
        tabIndex={0}
        className={cn("overflow-auto overscroll-contain border-t", palette.divider, focusRing)}
        style={{ maxHeight }}
      >
        <table className={cn("w-full table-fixed border-separate border-spacing-0 text-left", !narrow && "min-w-[520px]")}>
          <caption className="sr-only">
            {title}: {variants.map((v) => v.name).join(", ")}
            {diffOnly ? " (differences only)" : ""}
          </caption>
          <colgroup>
            <col style={{ width: labelWidth }} />
            {shownVariants.map((v) => (
              <col key={v.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className={cn("sticky top-0 z-20 border-b pl-5 pr-3 align-bottom", palette.header, headerLabel, narrow && "pl-4")}
                style={{ height: HEADER_HEIGHT }}
              >
                <span className="block pb-2.5">Spec</span>
              </th>
              {shownVariants.map((variant) => (
                <th
                  key={variant.id}
                  scope="col"
                  className={cn("sticky top-0 z-20 border-b px-3 align-bottom last:pr-5", palette.header, narrow && "last:pr-4")}
                  style={{ height: HEADER_HEIGHT }}
                >
                  <span className="block pb-2.5">
                    <span className={cn("block truncate text-[13px] font-semibold normal-case tracking-[-0.005em]", palette.primaryText)}>
                      {variant.name}
                    </span>
                    {variant.detail ? (
                      <span className={cn("block truncate text-[11.5px] font-normal tabular-nums", palette.secondaryText)}>
                        {variant.detail}
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {loading ? (
            <tbody aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className={cn("border-b py-3.5 pl-5 pr-3", palette.divider)}>
                    <span className={cn("block h-3 w-24 animate-pulse rounded motion-reduce:animate-none", palette.mutedSurface)} />
                  </td>
                  {shownVariants.map((v) => (
                    <td key={v.id} className={cn("border-b px-3 py-3.5", palette.divider)}>
                      <span className={cn("block h-3 w-16 animate-pulse rounded motion-reduce:animate-none", palette.mutedSurface)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : visibleGroups.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={shownVariants.length + 1} className="px-6 py-12 text-center">
                  <span className={cn("block text-[13px] font-medium", palette.primaryText)}>No differences</span>
                  <span className={cn("mt-1 block text-[12.5px]", palette.secondaryText)}>
                    These models share every listed spec.
                  </span>
                </td>
              </tr>
            </tbody>
          ) : (
            visibleGroups.map(({ group, rows }, groupIndex) => (
              <tbody key={group.id}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={shownVariants.length + 1}
                    className={cn(
                      "sticky z-10 border-b pb-2 pl-5 pr-3 pt-4 text-left",
                      surface,
                      palette.divider,
                      narrow && "pl-4",
                      groupIndex === 0 && "pt-3.5"
                    )}
                    style={{ top: HEADER_HEIGHT }}
                  >
                    <span className={cn(headerLabel, palette.accent)}>{group.label}</span>
                  </th>
                </tr>
                {rows.map(({ row, differs }, rowIndex) => {
                  const showDiff = differs;
                  const index = groupIndex * 6 + rowIndex;
                  const lastInGroup = rowIndex === rows.length - 1;
                  const cell = cn("border-b py-3 align-top", lastInGroup ? palette.divider : isDark ? "border-[#1c1c1c]" : "border-[#f5eee3]");
                  return (
                    <motion.tr
                      key={row.id ?? row.label}
                      initial={intro && shouldAnimate ? { opacity: 0, y: 6 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: intro ? 0.04 + index * 0.018 : 0 }}
                      className={cn("transition-colors duration-150 motion-reduce:transition-none", palette.row)}
                    >
                      <th scope="row" className={cn(cell, "relative pl-5 pr-3 font-normal", narrow && "pl-4")}>
                        {showDiff ? (
                          <span aria-hidden className={cn("absolute bottom-2 left-0 top-2 w-[2px] rounded-r-full", bar)} />
                        ) : null}
                        <span className={cn("block", palette.primaryText, !showDiff && "opacity-80")}>{row.label}</span>
                        {row.note ? (
                          <span className={cn("mt-0.5 block text-[11.5px] leading-[1.4]", palette.secondaryText)}>{row.note}</span>
                        ) : null}
                        {showDiff ? <span className="sr-only">(differs between models)</span> : null}
                      </th>
                      {!isPerVariant(row.value) && !narrow && shownVariants.length > 1 ? (
                        <td colSpan={shownVariants.length} className={cn(cell, "px-3 last:pr-5")}>
                          <span className="flex items-center gap-3">
                            {renderValue(row, row.value)}
                            <span aria-hidden className={cn("h-px flex-1", isDark ? "bg-[#232323]" : "bg-[#efe6d8]")} />
                            <span className={cn("text-[11px]", palette.secondaryText)}>All models</span>
                          </span>
                        </td>
                      ) : (
                        shownVariants.map((variant) => (
                          <td key={variant.id} className={cn(cell, "px-3 last:pr-5", narrow && "last:pr-4")}>
                            {renderValue(row, cellValue(row, variant.id))}
                          </td>
                        ))
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            ))
          )}
        </table>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 border-t px-5 py-2.5 text-[11.5px]",
          palette.divider,
          palette.secondaryText,
          narrow && "px-4"
        )}
      >
        <span aria-hidden className={cn("h-3 w-[2px] rounded-full", bar)} />
        <span>Marked rows differ between models</span>
        <span aria-live="polite" className="sr-only">
          {diffOnly ? `Showing ${diffCount} differing specs` : `Showing all ${totalCount} specs`}
        </span>
      </div>
    </div>
  );
}

export default SpecSheet;
