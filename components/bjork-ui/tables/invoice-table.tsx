"use client";

import {
  useCallback,
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
import { FileText, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export interface InvoiceLine {
  id: string;
  description: string;
  sku?: string;
  /** Up to two decimals, e.g. 12.5 hours. */
  quantity: number;
  /** Price of one unit in minor units (cents). */
  unitPrice: number;
  /** Percent off this line, 0–100. */
  discount?: number;
  /** Tax percent applied after the discount, e.g. 8.25. */
  taxRate?: number;
}

export interface InvoiceParty {
  name: string;
  lines: string[];
}

export interface InvoiceMeta {
  number: string;
  /** ISO date. */
  issuedOn: string;
  /** ISO date. */
  dueOn: string;
  from: InvoiceParty;
  billTo: InvoiceParty;
}

/** All amounts in integer minor units. */
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface InvoiceTableProps {
  /** Controlled lines. Pair with `onChange`. */
  lines?: InvoiceLine[];
  /** Starting lines when uncontrolled. Defaults to the sample invoice. */
  defaultLines?: InvoiceLine[];
  onChange?: (lines: InvoiceLine[], totals: InvoiceTotals) => void;
  /** Inputs for description, quantity, unit price, discount and tax, plus add/remove. Defaults to true. */
  editable?: boolean;
  /** ISO 4217 code. Minor-unit digits come from Intl (USD 2, JPY 0). */
  currency?: string;
  locale?: string;
  /** Invoice header. Pass `null` to render only the table. */
  meta?: InvoiceMeta | null;
  caption?: string;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sample data                                                         */
/* ------------------------------------------------------------------ */

export const INVOICE_SAMPLE_META: InvoiceMeta = {
  number: "INV-2026-0419",
  issuedOn: "2026-10-01",
  dueOn: "2026-10-31",
  from: { name: "Halden & Rowe Studio", lines: ["418 Tannery Row, Suite 3", "Portland, OR 97209"] },
  billTo: { name: "Meridian Coffee Roasters", lines: ["Attn: Accounts payable", "77 Kiln Street, Duluth, MN 55802"] },
};

export const INVOICE_SAMPLE_LINES: InvoiceLine[] = [
  {
    id: "ln-1",
    description: "Brand identity system",
    sku: "HR-ID-01 · logo suite, type, color tokens",
    quantity: 1,
    unitPrice: 480_000,
  },
  {
    id: "ln-2",
    description: "Packaging design, retail bags",
    sku: "HR-PK-03 · per SKU",
    quantity: 3,
    unitPrice: 125_000,
    discount: 10,
  },
  {
    id: "ln-3",
    description: "Art direction, on-site shoot",
    sku: "HR-AD-HR · hourly",
    quantity: 12.5,
    unitPrice: 14_500,
  },
  {
    id: "ln-4",
    description: "Printed proofs, 250 gsm",
    sku: "HR-PR-250",
    quantity: 40,
    unitPrice: 675,
    taxRate: 8.25,
  },
  {
    id: "ln-5",
    description: "Stock photo license, extended",
    sku: "HR-LC-07",
    quantity: 2,
    unitPrice: 8_999,
    discount: 5,
    taxRate: 8.25,
  },
];

/* ------------------------------------------------------------------ */
/* Integer money math                                                  */
/* ------------------------------------------------------------------ */

/** Percent (e.g. 8.25) to basis points (825) without float drift. */
const toBps = (percent = 0) => Math.round(percent * 100);
/** Divide and round half away from zero, on integers. */
const divRound = (numerator: number, denominator: number) =>
  Math.sign(numerator) * Math.round(Math.abs(numerator) / denominator);

export function computeInvoiceLine(line: InvoiceLine) {
  const qtyHundredths = Math.round(line.quantity * 100);
  const gross = divRound(qtyHundredths * line.unitPrice, 100);
  const discount = divRound(gross * toBps(line.discount), 10_000);
  const net = gross - discount;
  const tax = divRound(net * toBps(line.taxRate), 10_000);
  return { gross, discount, net, tax };
}

export function computeInvoiceTotals(lines: InvoiceLine[]): InvoiceTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const line of lines) {
    const amounts = computeInvoiceLine(line);
    subtotal += amounts.gross;
    discount += amounts.discount;
    tax += amounts.tax;
  }
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const noopSubscribe = () => () => {};
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/45";
let lineCounter = 0;

export function InvoiceTable({
  lines: controlledLines,
  defaultLines = INVOICE_SAMPLE_LINES,
  onChange,
  editable = true,
  currency = "USD",
  locale = "en-US",
  meta = INVOICE_SAMPLE_META,
  caption = "Invoice line items",
  className,
  theme = "auto",
  enableAnimations = true,
}: InvoiceTableProps) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const reduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !reduceMotion;

  const [internalLines, setInternalLines] = useState(defaultLines);
  const lines = controlledLines ?? internalLines;
  const [entered, setEntered] = useState(false);
  const [lastAdded, setLastAdded] = useState<{ id: string; instant: boolean } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(rootRef);
  const compact = width > 0 && width < 640;

  const uid = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<{ kind: "description"; id: string } | { kind: "remove"; index: number } | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), 50);
    return () => window.clearTimeout(id);
  }, []);

  const money = useMemo(() => {
    const currencyFormat = new Intl.NumberFormat(locale, { style: "currency", currency });
    const digits = currencyFormat.resolvedOptions().maximumFractionDigits ?? 2;
    const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const parts = new Intl.NumberFormat(locale).formatToParts(1.5);
    const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
    const scale = 10 ** digits;
    return {
      digits,
      decimal,
      format: (minor: number) => currencyFormat.format(minor / scale),
      plain: (minor: number) => plain.format(minor / scale),
      /** Parse user text into integer minor units using string math only. */
      parse: (text: string): number | null => {
        const cleaned = text.replace(new RegExp(`[^0-9\\${decimal}-]`, "g"), "");
        if (!cleaned || cleaned === "-") return null;
        const negative = cleaned.startsWith("-");
        const [wholeRaw, fracRaw = ""] = cleaned.replace(/-/g, "").split(decimal);
        const whole = Number(wholeRaw || "0");
        const padded = (fracRaw + "0".repeat(digits + 1)).slice(0, digits + 1);
        const frac = digits === 0 ? 0 : Number(padded.slice(0, digits));
        const roundUp = Number(padded[digits] ?? "0") >= 5 ? 1 : 0;
        const value = whole * scale + frac + roundUp;
        if (!Number.isFinite(value)) return null;
        return negative ? -value : value;
      },
    };
  }, [locale, currency]);

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale]
  );
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
    [locale]
  );

  const totals = useMemo(() => computeInvoiceTotals(lines), [lines]);
  const taxRates = useMemo(
    () => [...new Set(lines.filter((l) => l.taxRate).map((l) => l.taxRate as number))],
    [lines]
  );

  const commit = useCallback(
    (next: InvoiceLine[]) => {
      if (controlledLines === undefined) setInternalLines(next);
      onChange?.(next, computeInvoiceTotals(next));
    },
    [controlledLines, onChange]
  );

  const updateLine = (id: string, patch: Partial<InvoiceLine>) => {
    commit(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addLine = (instant: boolean) => {
    lineCounter += 1;
    const id = `ln-new-${Date.now().toString(36)}-${lineCounter}`;
    pendingFocus.current = { kind: "description", id };
    setLastAdded({ id, instant });
    commit([...lines, { id, description: "", sku: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeLine = (index: number) => {
    pendingFocus.current = { kind: "remove", index };
    commit(lines.filter((_, i) => i !== index));
  };

  // Move focus after add/remove so keyboard users never land on <body>.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const table = tableRef.current;
    if (!table) return;
    if (target.kind === "description") {
      table.querySelector<HTMLInputElement>(`[data-line="${target.id}"][data-field="description"]`)?.focus();
      return;
    }
    const removers = table.querySelectorAll<HTMLButtonElement>("[data-remove]");
    const next = removers[Math.min(target.index, removers.length - 1)];
    (next ?? addButtonRef.current)?.focus();
  }, [lines]);

  const fieldTone = isDark
    ? "border-[#232323] bg-[#181818] text-[#ededed]/90 hover:border-[#2e2e2e] placeholder:text-[#ededed]/26"
    : "border-[#eadfce] bg-[#fffcf6] text-[#171717]/86 hover:border-[#dccdb6] placeholder:text-[#171717]/36";
  const fieldBase = cn(
    "h-8 w-full rounded-[8px] border px-2 text-[13px] transition-colors focus:border-[#ec5c13]/50",
    "print:h-auto print:border-transparent print:bg-transparent print:px-0 print:text-inherit",
    fieldTone,
    focusRing
  );
  const bareField = cn(
    "h-7 w-full rounded-[7px] border border-transparent bg-transparent px-1.5 text-[13px] transition-colors",
    isDark ? "hover:border-[#2a2a2a] hover:bg-[#181818]" : "hover:border-[#eadfce] hover:bg-[#fffcf6]",
    "focus:border-[#ec5c13]/50 print:border-transparent print:bg-transparent print:px-0",
    focusRing
  );

  // Column plan: item | qty | unit | disc | tax | amount | remove
  const showAction = editable;
  const midColumns = compact ? 0 : 4; // qty, unit, disc, tax (folded under the item when compact)
  const allColumns = 1 + midColumns + 1 + (showAction ? 1 : 0);
  const headerCell = cn("sticky top-0 z-[1] h-9 border-b px-2 text-[11px] font-medium uppercase tracking-[0.08em]", palette.header);
  const animateIn = shouldAnimate && !entered;

  return (
    <div
      ref={rootRef}
      className={cn(
        "mx-auto w-full max-w-[920px] text-[13px] print:max-w-none print:text-black",
        // Paper is always light: force ink, hairlines and clear fills regardless of theme.
        "print:**:border-black/15! print:**:bg-transparent! print:**:text-black! print:**:shadow-none! print:**:transition-none!",
        className
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-[18px] border print:rounded-none print:border-0 print:bg-transparent print:shadow-none",
          palette.container
        )}
      >
        {meta ? (
          <header className={cn("grid gap-4 border-b px-5 pb-4 pt-5", palette.divider, compact ? "grid-cols-1" : "grid-cols-[1.2fr_1fr_1fr]")}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn("flex h-7 w-7 items-center justify-center rounded-[8px] print:hidden", palette.accentBg)}
                >
                  <FileText className={cn("h-3.5 w-3.5", palette.accent)} />
                </span>
                <div className="min-w-0">
                  <p className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", palette.secondaryText)}>Invoice</p>
                  <p className={cn("font-mono text-[13px]", palette.primaryText)}>{meta.number}</p>
                </div>
              </div>
              <dl className="mt-3 flex gap-5 text-[12px]">
                <div>
                  <dt className={palette.secondaryText}>Issued</dt>
                  <dd className={cn("tabular-nums", palette.primaryText)}>
                    <time dateTime={meta.issuedOn}>{dateFormat.format(new Date(meta.issuedOn))}</time>
                  </dd>
                </div>
                <div>
                  <dt className={palette.secondaryText}>Due</dt>
                  <dd className={cn("tabular-nums", palette.primaryText)}>
                    <time dateTime={meta.dueOn}>{dateFormat.format(new Date(meta.dueOn))}</time>
                  </dd>
                </div>
              </dl>
            </div>
            <div className={cn(compact && "grid grid-cols-2 gap-4", !compact && "contents")}>
              {[
                { label: "From", party: meta.from },
                { label: "Bill to", party: meta.billTo },
              ].map(({ label, party }) => (
                <address key={label} className="min-w-0 text-[12px] not-italic leading-relaxed">
                  <span className={cn("block text-[11px] font-medium uppercase tracking-[0.08em]", palette.secondaryText)}>
                    {label}
                  </span>
                  <span className={cn("mt-1 block text-[13px] font-medium", palette.primaryText)}>{party.name}</span>
                  {party.lines.map((l) => (
                    <span key={l} className={cn("block", palette.secondaryText)}>
                      {l}
                    </span>
                  ))}
                </address>
              ))}
            </div>
          </header>
        ) : null}

        <div
          role="region"
          aria-label={caption}
          tabIndex={0}
          className={cn("overflow-x-auto", focusRing, "focus-visible:ring-inset")}
        >
          <table ref={tableRef} className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">
              {caption}
              {meta ? `, invoice ${meta.number}` : ""}. Total {money.format(totals.total)}.
            </caption>
            <colgroup>
              <col />
              {compact ? null : (
                <>
                  <col style={{ width: 84 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 78 }} />
                  <col style={{ width: 78 }} />
                </>
              )}
              <col style={{ width: compact ? 104 : 124 }} />
              {showAction ? <col className="print:hidden" style={{ width: 44 }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(headerCell, "pl-5 text-left")}>
                  Item
                </th>
                {compact ? null : (
                  <>
                    <th scope="col" className={cn(headerCell, "text-right")}>
                      Qty
                    </th>
                    <th scope="col" className={cn(headerCell, "text-right")}>
                      Unit price
                    </th>
                    <th scope="col" className={cn(headerCell, "text-right")}>
                      <abbr title="Discount" className="no-underline">Disc.</abbr>
                    </th>
                    <th scope="col" className={cn(headerCell, "text-right")}>
                      Tax
                    </th>
                  </>
                )}
                <th scope="col" className={cn(headerCell, "text-right", !showAction && "pr-5")}>
                  Amount
                </th>
                {showAction ? (
                  <th scope="col" className={cn(headerCell, "print:hidden")}>
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={allColumns} className="px-6 py-12 text-center">
                    <p className={cn("text-[14px] font-medium", palette.primaryText)}>No line items yet</p>
                    <p className={cn("mt-1 text-[12px]", palette.secondaryText)}>
                      {editable ? "Add a line to start building this invoice." : "This invoice has no billable items."}
                    </p>
                  </td>
                </tr>
              ) : null}
              {lines.map((line, index) => {
                const amounts = computeInvoiceLine(line);
                const label = line.description || `Line ${index + 1}`;
                const cell = cn("border-b px-2 py-2.5 align-top", palette.divider);
                const isNew = lastAdded?.id === line.id;
                const rowInitial =
                  (animateIn || (isNew && shouldAnimate && !lastAdded?.instant)) ? { opacity: 0, y: 6 } : false;
                return (
                  <motion.tr
                    key={line.id}
                    initial={rowInitial}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34, delay: animateIn ? index * 0.04 : 0 }}
                    className={cn("transition-colors duration-150", palette.row)}
                  >
                    <td className={cn(cell, "pl-5")}>
                      {editable ? (
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <input
                            data-line={line.id}
                            data-field="description"
                            value={line.description}
                            placeholder="Description"
                            aria-label={`Line ${index + 1} description`}
                            onChange={(event) => updateLine(line.id, { description: event.target.value })}
                            className={cn(bareField, "-ml-1.5 font-medium", palette.primaryText)}
                          />
                          <input
                            value={line.sku ?? ""}
                            placeholder="SKU or note"
                            aria-label={`Line ${index + 1} SKU`}
                            onChange={(event) => updateLine(line.id, { sku: event.target.value })}
                            className={cn(bareField, "-ml-1.5 h-6 font-mono text-[11px]", palette.secondaryText)}
                          />
                        </div>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-0.5 pt-1">
                          <span className={cn("truncate font-medium", palette.primaryText)}>{line.description}</span>
                          {line.sku ? (
                            <span className={cn("truncate font-mono text-[11px]", palette.secondaryText)}>{line.sku}</span>
                          ) : null}
                        </div>
                      )}
                      {compact ? (
                        <div className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] tabular-nums", palette.secondaryText)}>
                          <span className="flex items-center gap-1">
                            {editable ? (
                              <NumberField
                                value={line.quantity}
                                display={(v) => numberFormat.format(v)}
                                parse={(text) => parseQuantity(text, money.decimal)}
                                step={1}
                                min={0}
                                ariaLabel={`Line ${index + 1} quantity`}
                                describedBy={`${uid}-hint`}
                                onCommit={(quantity) => updateLine(line.id, { quantity })}
                                className={cn(fieldBase, "h-7 w-[52px] text-right tabular-nums")}
                              />
                            ) : (
                              numberFormat.format(line.quantity)
                            )}
                            <span aria-hidden>×</span>
                            {editable ? (
                              <NumberField
                                value={line.unitPrice}
                                display={money.plain}
                                parse={money.parse}
                                step={10 ** money.digits}
                                min={0}
                                ariaLabel={`Line ${index + 1} unit price`}
                                describedBy={`${uid}-hint`}
                                onCommit={(unitPrice) => updateLine(line.id, { unitPrice })}
                                className={cn(fieldBase, "h-7 w-[92px] text-right tabular-nums")}
                              />
                            ) : (
                              money.format(line.unitPrice)
                            )}
                          </span>
                          {line.discount ? <span>−{numberFormat.format(line.discount)}%</span> : null}
                          {line.taxRate ? <span>+{numberFormat.format(line.taxRate)}% tax</span> : null}
                        </div>
                      ) : null}
                    </td>
                    {compact ? null : (
                      <>
                        <td className={cn(cell, "text-right tabular-nums")}>
                          {editable ? (
                            <NumberField
                              value={line.quantity}
                              display={(v) => numberFormat.format(v)}
                              parse={(text) => parseQuantity(text, money.decimal)}
                              step={1}
                              min={0}
                              ariaLabel={`Line ${index + 1} quantity`}
                              describedBy={`${uid}-hint`}
                              onCommit={(quantity) => updateLine(line.id, { quantity })}
                              className={cn(fieldBase, "text-right tabular-nums")}
                            />
                          ) : (
                            <span className={cn("block pt-1", palette.primaryText)}>{numberFormat.format(line.quantity)}</span>
                          )}
                        </td>
                        <td className={cn(cell, "text-right tabular-nums")}>
                          {editable ? (
                            <NumberField
                              value={line.unitPrice}
                              display={money.plain}
                              parse={money.parse}
                              step={10 ** money.digits}
                              min={0}
                              ariaLabel={`Line ${index + 1} unit price`}
                              describedBy={`${uid}-hint`}
                              onCommit={(unitPrice) => updateLine(line.id, { unitPrice })}
                              className={cn(fieldBase, "text-right tabular-nums")}
                            />
                          ) : (
                            <span className={cn("block pt-1", palette.primaryText)}>{money.format(line.unitPrice)}</span>
                          )}
                        </td>
                        <td className={cn(cell, "text-right tabular-nums")}>
                          {editable ? (
                            <NumberField
                              value={line.discount ?? 0}
                              display={(v) => (v ? `${numberFormat.format(v)}%` : "—")}
                              parse={(text) => clampPercent(parseDecimal(text, money.decimal))}
                              step={1}
                              min={0}
                              max={100}
                              ariaLabel={`Line ${index + 1} discount percent`}
                              describedBy={`${uid}-hint`}
                          onCommit={(discount) => updateLine(line.id, { discount })}
                              className={cn(bareField, "h-8 text-right tabular-nums", line.discount ? palette.accent : palette.secondaryText)}
                            />
                          ) : (
                            <span className={cn("block pt-1", line.discount ? palette.accent : palette.secondaryText)}>
                              {line.discount ? `${numberFormat.format(line.discount)}%` : "—"}
                            </span>
                          )}
                        </td>
                        <td className={cn(cell, "text-right tabular-nums")}>
                          {editable ? (
                            <NumberField
                              value={line.taxRate ?? 0}
                              display={(v) => (v ? `${numberFormat.format(v)}%` : "—")}
                              parse={(text) => clampPercent(parseDecimal(text, money.decimal))}
                              step={0.25}
                              min={0}
                              max={100}
                              ariaLabel={`Line ${index + 1} tax percent`}
                              describedBy={`${uid}-hint`}
                          onCommit={(taxRate) => updateLine(line.id, { taxRate })}
                              className={cn(bareField, "h-8 text-right tabular-nums", line.taxRate ? palette.primaryText : palette.secondaryText)}
                            />
                          ) : (
                            <span className={cn("block pt-1", line.taxRate ? palette.primaryText : palette.secondaryText)}>
                              {line.taxRate ? `${numberFormat.format(line.taxRate)}%` : "—"}
                            </span>
                          )}
                        </td>
                      </>
                    )}
                    <td className={cn(cell, "text-right tabular-nums", !showAction && "pr-5")}>
                      <span className={cn("block pt-1.5 font-medium", palette.primaryText)}>{money.format(amounts.net)}</span>
                      {amounts.discount ? (
                        <span className={cn("block text-[11px] line-through decoration-1", palette.secondaryText)}>
                          {money.format(amounts.gross)}
                        </span>
                      ) : null}
                    </td>
                    {showAction ? (
                      <td className={cn(cell, "px-0 text-center print:hidden")}>
                        <button
                          type="button"
                          data-remove
                          aria-label={`Remove ${label}`}
                          onClick={() => removeLine(index)}
                          className={cn(
                            "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors",
                            palette.secondaryText,
                            isDark ? "hover:bg-[#87463f]/18 hover:text-[#cf7c72]" : "hover:bg-[#eadad5] hover:text-[#9d5149]",
                            focusRing
                          )}
                        >
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    ) : null}
                  </motion.tr>
                );
              })}
            </tbody>
            <tfoot className="tabular-nums">
              {editable ? (
                <tr className="print:hidden">
                  <td colSpan={allColumns} className={cn("border-b px-5 py-2.5", palette.divider)}>
                    <button
                      ref={addButtonRef}
                      type="button"
                      onClick={(event) => addLine(event.detail === 0)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-dashed px-2.5 text-[13px] transition-colors",
                        palette.accentBorder,
                        palette.accent,
                        isDark ? "hover:bg-[#ec5c13]/10" : "hover:bg-[#ec5c13]/8",
                        focusRing
                      )}
                    >
                      <Plus aria-hidden className="h-3.5 w-3.5" />
                      Add line
                    </button>
                  </td>
                </tr>
              ) : null}
              <TotalRow
                label="Subtotal"
                value={money.format(totals.subtotal)}
                compact={compact}
                midColumns={midColumns}
                showAction={showAction}
                palette={palette}
                first
              />
              {totals.discount ? (
                <TotalRow
                  label="Discounts"
                  value={money.format(-totals.discount)}
                  compact={compact}
                  midColumns={midColumns}
                  showAction={showAction}
                  palette={palette}
                  valueClassName={palette.accent}
                />
              ) : null}
              <TotalRow
                label={taxRates.length === 1 ? `Tax (${numberFormat.format(taxRates[0])}%)` : "Tax"}
                value={money.format(totals.tax)}
                compact={compact}
                midColumns={midColumns}
                showAction={showAction}
                palette={palette}
              />
              <TotalRow
                label={`Total due (${currency})`}
                value={money.format(totals.total)}
                compact={compact}
                midColumns={midColumns}
                showAction={showAction}
                palette={palette}
                emphasis
                live
              />
            </tfoot>
          </table>
        </div>
      </div>
      <span id={`${uid}-hint`} className="sr-only">
        Use the up and down arrow keys to step a number field. Press Enter to apply, Escape to undo.
      </span>
    </div>
  );
}

function TotalRow({
  label,
  value,
  compact,
  midColumns,
  showAction,
  palette,
  valueClassName,
  emphasis = false,
  first = false,
  live = false,
}: {
  label: string;
  value: string;
  compact: boolean;
  midColumns: number;
  showAction: boolean;
  palette: ReturnType<typeof getBjorkTablePalette>;
  valueClassName?: string;
  emphasis?: boolean;
  first?: boolean;
  live?: boolean;
}) {
  const pad = first ? "pt-3.5" : emphasis ? "pt-3 pb-4" : "pt-1.5";
  return (
    <tr>
      {compact ? null : <td className={pad} />}
      <th
        scope="row"
        colSpan={compact ? 1 + midColumns : midColumns}
        className={cn(
          "px-2 text-right font-normal",
          pad,
          compact && "pl-5",
          emphasis ? cn("text-[13px] font-medium", palette.primaryText) : cn("text-[12px]", palette.secondaryText)
        )}
      >
        {emphasis ? (
          <span className={cn("block border-t pt-3", palette.divider)} style={{ marginTop: -1 }}>
            {label}
          </span>
        ) : (
          label
        )}
      </th>
      <td
        aria-live={live ? "polite" : undefined}
        className={cn(
          "px-2 text-right",
          pad,
          !showAction && "pr-5",
          emphasis ? cn("text-[17px] font-semibold tracking-tight", palette.primaryText) : cn("text-[13px]", valueClassName ?? palette.primaryText)
        )}
      >
        {emphasis ? (
          <span className={cn("block border-t pt-[9px]", palette.divider)} style={{ marginTop: -1 }}>
            {value}
          </span>
        ) : (
          value
        )}
      </td>
      {showAction ? <td className={cn(pad, "print:hidden")} /> : null}
    </tr>
  );
}

function parseDecimal(text: string, decimal: string): number | null {
  const cleaned = text.replace(new RegExp(`[^0-9\\${decimal}]`, "g"), "").replace(decimal, ".");
  if (!cleaned || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseQuantity(text: string, decimal: string) {
  const value = parseDecimal(text, decimal);
  return value === null ? null : Math.max(0, Math.round(value * 100) / 100);
}

function clampPercent(value: number | null) {
  if (value === null) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

/**
 * Text input for numbers: shows the formatted value, edits a free-form draft,
 * commits on Enter or blur, reverts on Escape, and steps with the arrow keys.
 */
function NumberField({
  value,
  display,
  parse,
  onCommit,
  step,
  min = -Infinity,
  max = Infinity,
  ariaLabel,
  describedBy,
  className,
}: {
  value: number;
  display: (value: number) => string;
  parse: (text: string) => number | null;
  onCommit: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  ariaLabel: string;
  describedBy?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    setDraft(null);
    if (parsed !== null && parsed !== value) onCommit(clamp(parsed));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Escape") {
      if (draft !== null) {
        event.preventDefault();
        setDraft(null);
      }
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const base = draft !== null ? (parse(draft) ?? value) : value;
      const delta = (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1);
      // Step in integer space so 0.25 increments never drift.
      const next = clamp(Math.round((base + delta) * 100) / 100);
      setDraft(null);
      if (next !== value) onCommit(next);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      value={draft ?? display(value)}
      onFocus={(event) => {
        setDraft(display(value).replace(/[^0-9.,-]/g, ""));
        const input = event.currentTarget;
        requestAnimationFrame(() => input.select());
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}
