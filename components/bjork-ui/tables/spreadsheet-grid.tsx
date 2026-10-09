"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { SquareFunction } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Raw cell contents keyed by A1 address ("B4"). Formulas start with "=". */
export type SpreadsheetCells = Record<string, string>;

export type SpreadsheetColumnType = "text" | "number" | "currency" | "percent";

export interface SpreadsheetColumn {
  /** How numbers in this column are parsed, formatted and aligned. */
  type?: SpreadsheetColumnType;
  /** Fixed width in px. */
  width?: number;
  /** Fraction digits for number / currency / percent. */
  decimals?: number;
}

export interface SpreadsheetCellChange {
  address: string;
  /** Raw value before the change ("" when the cell was empty). */
  previous: string;
  /** Raw value after the change ("" clears the cell). */
  value: string;
}

export interface SpreadsheetGridProps {
  /** Controlled cell contents. Pair with `onChange`. */
  cells?: SpreadsheetCells;
  /** Initial contents when uncontrolled. Defaults to the sample budget. */
  defaultCells?: SpreadsheetCells;
  onChange?: (cells: SpreadsheetCells, changes: SpreadsheetCellChange[]) => void;
  /** Column formats, left to right (A, B, C…). */
  columns?: SpreadsheetColumn[];
  rowCount?: number;
  /** Leading rows styled as labels. */
  headerRows?: number;
  /** 1-based row numbers styled as totals. */
  totalRows?: number[];
  /** Cell that starts active, e.g. "B9". */
  defaultActiveCell?: string;
  onActiveCellChange?: (address: string) => void;
  title?: string;
  readOnly?: boolean;
  /** ISO 4217 code for currency columns. */
  currency?: string;
  locale?: string;
  /** Max height of the scrolling grid in px. */
  maxHeight?: number;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sample: an invented quarterly operating budget                      */
/* ------------------------------------------------------------------ */

export const SPREADSHEET_SAMPLE_COLUMNS: SpreadsheetColumn[] = [
  { type: "text", width: 168 },
  { type: "currency", width: 104 },
  { type: "currency", width: 104 },
  { type: "currency", width: 104 },
  { type: "currency", width: 104 },
  { type: "currency", width: 116 },
  { type: "percent", width: 92 },
  { type: "text", width: 202 },
];

const sampleLines: [string, number, number, number, number, string][] = [
  ["Cloud infrastructure", 42800, 44100, 46900, 51200, "Reserved capacity renews Q3"],
  ["Contractors", 18500, 22000, 22000, 16000, "Design system rebuild"],
  ["Software licenses", 9640, 9640, 12180, 12180, "Seat count grows in Q3"],
  ["Travel", 6200, 3400, 8900, 4100, "Offsite in Q3"],
  ["Events", 12000, 0, 24500, 7800, "Fieldnote Summit booth"],
  ["Hardware", 15300, 2100, 2100, 19600, "Laptop refresh, Q1 and Q4"],
  ["Training", 2400, 2400, 3600, 3600, "Two cohorts a half"],
];

function buildSample(): SpreadsheetCells {
  const cells: SpreadsheetCells = {
    A1: "Line item",
    B1: "Q1",
    C1: "Q2",
    D1: "Q3",
    E1: "Q4",
    F1: "FY27",
    G1: "Share",
    H1: "Notes",
  };
  sampleLines.forEach(([label, q1, q2, q3, q4, note], i) => {
    const r = i + 2;
    cells[`A${r}`] = label;
    cells[`B${r}`] = String(q1);
    cells[`C${r}`] = String(q2);
    cells[`D${r}`] = String(q3);
    cells[`E${r}`] = String(q4);
    cells[`F${r}`] = `=SUM(B${r}:E${r})`;
    cells[`G${r}`] = `=F${r}/F9`;
    cells[`H${r}`] = note;
  });
  cells.A9 = "Total";
  cells.A10 = "Average per line";
  cells.A11 = "Budget cap";
  cells.A12 = "Headroom";
  for (const col of ["B", "C", "D", "E", "F"]) {
    cells[`${col}9`] = `=SUM(${col}2:${col}8)`;
    cells[`${col}10`] = `=AVG(${col}2:${col}8)`;
    cells[`${col}12`] = `=${col}11-${col}9`;
  }
  cells.B11 = "112000";
  cells.C11 = "84000";
  cells.D11 = "116000";
  cells.E11 = "118000";
  cells.F11 = "=SUM(B11:E11)";
  cells.G9 = "=SUM(G2:G8)";
  cells.G12 = "=F12/F11";
  cells.H9 = "Q3 runs over cap";
  cells.H12 = "Share of cap left";
  return cells;
}

export const SPREADSHEET_SAMPLE: SpreadsheetCells = buildSample();
export const SPREADSHEET_SAMPLE_ROWS = 14;

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const toAddress = (r: number, c: number) => `${columnLetter(c)}${r + 1}`;

function parseAddress(address: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(address.trim());
  if (!m) return null;
  return { r: Number(m[2]) - 1, c: columnIndex(m[1]) };
}

/* ------------------------------------------------------------------ */
/* Formula engine                                                      */
/* ------------------------------------------------------------------ */

type ErrorCode = "#REF!" | "#VALUE!" | "#DIV/0!" | "#NAME?" | "#ERROR!";

type CellResult =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "error"; code: ErrorCode; message: string };

class FormulaError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Token =
  | { t: "num"; v: number }
  | { t: "ref"; v: string }
  | { t: "name"; v: string }
  | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|(\$?[A-Za-z]{1,3}\$?\d+)(?![A-Za-z(])|([A-Za-z_][A-Za-z_.]*)|([-+*/(),:]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new FormulaError("#ERROR!", `Unexpected "${src.slice(i).trim()[0]}"`);
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "ref", v: m[2].replace(/\$/g, "").toUpperCase() });
    else if (m[3] !== undefined) out.push({ t: "name", v: m[3].toUpperCase() });
    else out.push({ t: "op", v: m[4] });
    i = re.lastIndex;
  }
  return out;
}

type Scalar = number;
type Arg = { range: { r0: number; c0: number; r1: number; c1: number } } | { value: Scalar };

const FUNCTIONS: Record<string, (values: number[], count: number) => number> = {
  SUM: (v) => v.reduce((a, b) => a + b, 0),
  AVG: (v) => {
    if (!v.length) throw new FormulaError("#DIV/0!", "Average of no numbers");
    return v.reduce((a, b) => a + b, 0) / v.length;
  },
  MIN: (v) => (v.length ? Math.min(...v) : 0),
  MAX: (v) => (v.length ? Math.max(...v) : 0),
  COUNT: (v) => v.length,
};
FUNCTIONS.AVERAGE = FUNCTIONS.AVG;

function createEvaluator(cells: SpreadsheetCells, rows: number, cols: number) {
  const cache = new Map<string, CellResult>();
  const visiting = new Set<string>();

  const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols;

  function evalCell(address: string): CellResult {
    const hit = cache.get(address);
    if (hit) return hit;
    if (visiting.has(address)) {
      return { kind: "error", code: "#REF!", message: `Circular reference through ${address}` };
    }
    const raw = (cells[address] ?? "").trim();
    let result: CellResult;
    if (raw === "") result = { kind: "empty" };
    else if (raw.startsWith("=")) {
      visiting.add(address);
      try {
        result = { kind: "number", value: evalFormula(raw.slice(1)) };
        if (!Number.isFinite(result.value)) result = { kind: "error", code: "#DIV/0!", message: "Division by zero" };
      } catch (err) {
        result =
          err instanceof FormulaError
            ? { kind: "error", code: err.code, message: err.message }
            : { kind: "error", code: "#ERROR!", message: "Could not evaluate" };
      }
      visiting.delete(address);
    } else {
      const n = Number(raw);
      result = Number.isFinite(n) ? { kind: "number", value: n } : { kind: "text", value: raw };
    }
    cache.set(address, result);
    return result;
  }

  function scalarOf(address: string): number {
    const pos = parseAddress(address);
    if (!pos || !inBounds(pos.r, pos.c)) throw new FormulaError("#REF!", `${address} is outside the sheet`);
    const res = evalCell(address);
    if (res.kind === "error") throw new FormulaError(res.code, res.message);
    if (res.kind === "empty") return 0;
    if (res.kind === "text") throw new FormulaError("#VALUE!", `${address} holds text`);
    return res.value;
  }

  function evalFormula(src: string): number {
    const tokens = tokenize(src);
    let p = 0;
    const peek = () => tokens[p];
    const isOp = (v: string) => peek()?.t === "op" && peek().v === v;
    const expectOp = (v: string) => {
      if (!isOp(v)) throw new FormulaError("#ERROR!", `Expected "${v}"`);
      p += 1;
    };

    const parseArg = (): Arg => {
      const tok = peek();
      const next = tokens[p + 1];
      if (tok?.t === "ref" && next?.t === "op" && next.v === ":") {
        const end = tokens[p + 2];
        if (end?.t !== "ref") throw new FormulaError("#ERROR!", "Incomplete range");
        p += 3;
        const a = parseAddress(tok.v)!;
        const b = parseAddress(end.v)!;
        const range = {
          r0: Math.min(a.r, b.r),
          c0: Math.min(a.c, b.c),
          r1: Math.max(a.r, b.r),
          c1: Math.max(a.c, b.c),
        };
        if (!inBounds(range.r1, range.c1)) throw new FormulaError("#REF!", "Range runs off the sheet");
        return { range };
      }
      return { value: parseExpr() };
    };

    const parsePrimary = (): number => {
      const tok = peek();
      if (!tok) throw new FormulaError("#ERROR!", "Formula ends early");
      if (tok.t === "num") {
        p += 1;
        return tok.v;
      }
      if (tok.t === "ref") {
        p += 1;
        if (isOp(":")) throw new FormulaError("#VALUE!", "A range needs a function like SUM");
        return scalarOf(tok.v);
      }
      if (tok.t === "name") {
        const fn = FUNCTIONS[tok.v];
        if (!fn) throw new FormulaError("#NAME?", `Unknown function ${tok.v}`);
        p += 1;
        expectOp("(");
        const args: Arg[] = [];
        if (!isOp(")")) {
          args.push(parseArg());
          while (isOp(",")) {
            p += 1;
            args.push(parseArg());
          }
        }
        expectOp(")");
        const values: number[] = [];
        for (const arg of args) {
          if ("value" in arg) {
            values.push(arg.value);
            continue;
          }
          const { r0, c0, r1, c1 } = arg.range;
          for (let r = r0; r <= r1; r += 1) {
            for (let c = c0; c <= c1; c += 1) {
              const res = evalCell(toAddress(r, c));
              if (res.kind === "error") throw new FormulaError(res.code, res.message);
              if (res.kind === "number") values.push(res.value);
            }
          }
        }
        return fn(values, values.length);
      }
      if (tok.v === "(") {
        p += 1;
        const v = parseExpr();
        expectOp(")");
        return v;
      }
      throw new FormulaError("#ERROR!", `Unexpected "${tok.v}"`);
    };

    const parseUnary = (): number => {
      if (isOp("-")) {
        p += 1;
        return -parseUnary();
      }
      if (isOp("+")) {
        p += 1;
        return parseUnary();
      }
      return parsePrimary();
    };

    const parseTerm = (): number => {
      let v = parseUnary();
      while (isOp("*") || isOp("/")) {
        const op = peek().v;
        p += 1;
        const rhs = parseUnary();
        if (op === "/" && rhs === 0) throw new FormulaError("#DIV/0!", "Division by zero");
        v = op === "*" ? v * rhs : v / rhs;
      }
      return v;
    };

    function parseExpr(): number {
      let v = parseTerm();
      while (isOp("+") || isOp("-")) {
        const op = peek().v;
        p += 1;
        const rhs = parseTerm();
        v = op === "+" ? v + rhs : v - rhs;
      }
      return v;
    }

    if (!tokens.length) throw new FormulaError("#ERROR!", "Empty formula");
    const value = parseExpr();
    if (p < tokens.length) throw new FormulaError("#ERROR!", `Unexpected "${peek().v}"`);
    return value;
  }

  return evalCell;
}

/** Ranges referenced by a formula, for the dashed reference highlights. */
function referencedRanges(raw: string) {
  if (!raw.startsWith("=")) return [];
  const out: { r0: number; c0: number; r1: number; c1: number }[] = [];
  const re = /(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![A-Za-z(])/g;
  for (const m of raw.slice(1).matchAll(re)) {
    const a = parseAddress(m[1]);
    const b = m[2] ? parseAddress(m[2]) : a;
    if (!a || !b) continue;
    out.push({ r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) });
  }
  return out.slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Parsing & formatting                                                */
/* ------------------------------------------------------------------ */

/** Turns what was typed into the stored raw value for a column type. */
function normalizeInput(text: string, type: SpreadsheetColumnType): string {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.startsWith("=")) return trimmed;
  const m = /^([-+])?\$?\s*([\d,]*\.?\d+)\s*(%)?$/.exec(trimmed);
  if (!m || (type === "text" && !m[3])) return trimmed;
  const digits = m[2].replace(/,/g, "");
  let n = Number(digits) * (m[1] === "-" ? -1 : 1);
  if (!Number.isFinite(n)) return trimmed;
  if (m[3] || type === "percent") n /= 100;
  return String(Number(n.toPrecision(15)));
}

/** What the editor shows for a stored raw value. */
function toEditText(raw: string, type: SpreadsheetColumnType): string {
  if (type === "percent" && raw !== "" && !raw.startsWith("=")) {
    const n = Number(raw);
    if (Number.isFinite(n)) return `${Number((n * 100).toPrecision(12))}%`;
  }
  return raw;
}

function makeFormatter(type: SpreadsheetColumnType, decimals: number | undefined, locale: string, currency: string) {
  if (type === "currency") {
    const d = decimals ?? 0;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }
  if (type === "percent") {
    const d = decimals ?? 1;
    return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: d, maximumFractionDigits: d });
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals ?? 2 });
}

const subscribeNoop = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

const ROW_H = 32;
const HEAD_H = 28;
const ROWHEAD_W = 44;
const DEFAULT_COL_W = 112;

interface Pos {
  r: number;
  c: number;
}

interface EditState extends Pos {
  value: string;
  /** "enter": started by typing, arrows commit. "edit": F2 / Enter / double click, arrows move the caret. */
  mode: "enter" | "edit";
  source: "cell" | "bar";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function SpreadsheetGrid({
  cells: controlledCells,
  defaultCells,
  onChange,
  columns: columnsProp,
  rowCount: rowCountProp,
  headerRows = 1,
  totalRows,
  defaultActiveCell = "B2",
  onActiveCellChange,
  title = "FY27 operating budget",
  readOnly = false,
  currency = "USD",
  locale = "en-US",
  maxHeight = 520,
  className,
  theme = "auto",
  enableAnimations = true,
}: SpreadsheetGridProps) {
  const isSample = controlledCells === undefined && defaultCells === undefined;
  const columns = useMemo<SpreadsheetColumn[]>(
    () => columnsProp ?? (isSample ? SPREADSHEET_SAMPLE_COLUMNS : Array.from({ length: 6 }, () => ({}))),
    [columnsProp, isSample],
  );
  const rowCount = rowCountProp ?? (isSample ? SPREADSHEET_SAMPLE_ROWS : 20);
  const totals = useMemo(() => new Set(totalRows ?? (isSample ? [9] : [])), [totalRows, isSample]);
  const colCount = columns.length;

  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const red = getBjorkSignalPalette("red", isDark);
  const reduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !reduceMotion;
  const accentHex = palette.checkboxAccent;

  /* ---------- data ---------- */

  const [internalCells, setInternalCells] = useState<SpreadsheetCells>(() => defaultCells ?? SPREADSHEET_SAMPLE);
  const cells = controlledCells ?? internalCells;

  const evaluate = useMemo(() => createEvaluator(cells, rowCount, colCount), [cells, rowCount, colCount]);

  const formatters = useMemo(
    () => columns.map((col) => makeFormatter(col.type ?? "text", col.decimals, locale, currency)),
    [columns, locale, currency],
  );

  const applyChanges = useCallback(
    (entries: { address: string; value: string }[]) => {
      if (readOnly) return;
      const next = { ...cells };
      const changes: SpreadsheetCellChange[] = [];
      for (const { address, value } of entries) {
        const previous = cells[address] ?? "";
        if (previous === value) continue;
        if (value === "") delete next[address];
        else next[address] = value;
        changes.push({ address, previous, value });
      }
      if (!changes.length) return;
      if (controlledCells === undefined) setInternalCells(next);
      onChange?.(next, changes);
    },
    [cells, controlledCells, onChange, readOnly],
  );

  /* ---------- selection ---------- */

  const clampPos = useCallback(
    (p: Pos): Pos => ({
      r: Math.max(0, Math.min(rowCount - 1, p.r)),
      c: Math.max(0, Math.min(colCount - 1, p.c)),
    }),
    [rowCount, colCount],
  );

  const [active, setActive] = useState<Pos>(() => clampPos(parseAddress(defaultActiveCell) ?? { r: 0, c: 0 }));
  const [anchor, setAnchor] = useState<Pos>(active);
  const [editing, setEditingState] = useState<EditState | null>(null);
  const editRef = useRef<EditState | null>(null);
  const setEditing = (next: EditState | null) => {
    editRef.current = next;
    setEditingState(next);
  };

  const range = useMemo(
    () => ({
      r0: Math.min(active.r, anchor.r),
      r1: Math.max(active.r, anchor.r),
      c0: Math.min(active.c, anchor.c),
      c1: Math.max(active.c, anchor.c),
    }),
    [active, anchor],
  );
  const isMulti = range.r0 !== range.r1 || range.c0 !== range.c1;

  const gridRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef(false);
  const dragging = useRef(false);

  const activeAddress = toAddress(active.r, active.c);

  useEffect(() => {
    onActiveCellChange?.(activeAddress);
  }, [activeAddress, onActiveCellChange]);

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    if (editing?.source === "cell") return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${activeAddress}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeAddress, editing]);

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const select = useCallback(
    (to: Pos, extend = false) => {
      const next = clampPos(to);
      pendingFocus.current = true;
      setActive(next);
      if (!extend) setAnchor(next);
    },
    [clampPos],
  );

  /* ---------- editing ---------- */

  const typeAt = (c: number): SpreadsheetColumnType => columns[c]?.type ?? "text";

  const beginEdit = (mode: EditState["mode"], initial?: string, source: EditState["source"] = "cell") => {
    if (readOnly) return;
    const raw = cells[activeAddress] ?? "";
    setAnchor(active);
    setEditing({ ...active, value: initial ?? toEditText(raw, typeAt(active.c)), mode, source });
  };

  /** Commits the open edit (if any) and optionally moves the active cell. */
  const commit = (move?: Pos | "stay") => {
    const e = editRef.current;
    if (e) {
      setEditing(null);
      applyChanges([{ address: toAddress(e.r, e.c), value: normalizeInput(e.value, typeAt(e.c)) }]);
    }
    if (move && move !== "stay") select(move);
    else {
      pendingFocus.current = true;
      setActive((a) => ({ ...a }));
    }
  };

  const cancel = () => {
    setEditing(null);
    pendingFocus.current = true;
    setActive((a) => ({ ...a }));
  };

  const clearRange = () => {
    const entries: { address: string; value: string }[] = [];
    for (let r = range.r0; r <= range.r1; r += 1)
      for (let c = range.c0; c <= range.c1; c += 1) entries.push({ address: toAddress(r, c), value: "" });
    applyChanges(entries);
  };

  /* ---------- keyboard ---------- */

  const moveBy = (dr: number, dc: number, extend: boolean, jump: boolean) => {
    const from = active;
    const to = jump
      ? { r: dr ? (dr > 0 ? rowCount - 1 : 0) : from.r, c: dc ? (dc > 0 ? colCount - 1 : 0) : from.c }
      : { r: from.r + dr, c: from.c + dc };
    select(to, extend);
  };

  const handleGridKeyDown = (e: ReactKeyboardEvent<HTMLTableElement>) => {
    if (editRef.current) return;
    if (!(e.target as HTMLElement).dataset.cell) return;
    const mod = e.metaKey || e.ctrlKey;
    let handled = true;
    switch (e.key) {
      case "ArrowUp":
        moveBy(-1, 0, e.shiftKey, mod);
        break;
      case "ArrowDown":
        moveBy(1, 0, e.shiftKey, mod);
        break;
      case "ArrowLeft":
        moveBy(0, -1, e.shiftKey, mod);
        break;
      case "ArrowRight":
        moveBy(0, 1, e.shiftKey, mod);
        break;
      case "Home":
        select(mod ? { r: 0, c: 0 } : { r: active.r, c: 0 }, e.shiftKey);
        break;
      case "End":
        select(mod ? { r: rowCount - 1, c: colCount - 1 } : { r: active.r, c: colCount - 1 }, e.shiftKey);
        break;
      case "PageDown":
        moveBy(10, 0, e.shiftKey, false);
        break;
      case "PageUp":
        moveBy(-10, 0, e.shiftKey, false);
        break;
      case "Tab": {
        // Tab walks the row and wraps; at either end of the sheet it lets focus leave the grid.
        const flat = active.r * colCount + active.c + (e.shiftKey ? -1 : 1);
        if (flat < 0 || flat >= rowCount * colCount) handled = false;
        else select({ r: Math.floor(flat / colCount), c: flat % colCount });
        break;
      }
      case "Enter":
        if (e.shiftKey) moveBy(-1, 0, false, false);
        else if (readOnly) moveBy(1, 0, false, false);
        else beginEdit("edit");
        break;
      case "F2":
        beginEdit("edit");
        break;
      case "Escape":
        if (isMulti) setAnchor(active);
        else handled = false;
        break;
      case "Delete":
      case "Backspace":
        clearRange();
        break;
      case "a":
      case "A":
        if (mod) {
          setAnchor({ r: 0, c: 0 });
          setActive({ r: rowCount - 1, c: colCount - 1 });
        } else handled = false;
        break;
      default:
        handled = false;
    }
    if (!handled && !readOnly && e.key.length === 1 && !mod && !e.altKey) {
      beginEdit("enter", e.key);
      handled = true;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleEditorKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>, source: EditState["source"]) => {
    const cur = editRef.current;
    if (!cur) return;
    const at = { r: cur.r, c: cur.c };
    if (e.key === "Enter") {
      e.preventDefault();
      commit({ r: at.r + (e.shiftKey ? -1 : 1), c: at.c });
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit({ r: at.r, c: at.c + (e.shiftKey ? -1 : 1) });
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (source === "cell" && cur.mode === "enter" && !cur.value.startsWith("=") && e.key.startsWith("Arrow")) {
      // Typed-over cells behave like a sheet: arrows commit and move. Formulas keep the caret.
      e.preventDefault();
      const steps: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const d = steps[e.key] ?? [0, 0];
      commit({ r: at.r + d[0], c: at.c + d[1] });
    }
    e.stopPropagation();
  };

  /* ---------- clipboard ---------- */

  const rawForCopy = useCallback(
    (address: string) => {
      const raw = cells[address] ?? "";
      if (!raw.startsWith("=")) return raw;
      const res = evaluate(address);
      if (res.kind === "number") return String(Number(res.value.toPrecision(15)));
      if (res.kind === "error") return res.code;
      return "";
    },
    [cells, evaluate],
  );

  const clipboardRef = useRef({ range, active, rawForCopy, applyChanges, select, rowCount, colCount, columns });
  useEffect(() => {
    clipboardRef.current = { range, active, rawForCopy, applyChanges, select, rowCount, colCount, columns };
  });

  useEffect(() => {
    const owns = () => {
      const el = document.activeElement;
      return !!el && !!gridRef.current?.contains(el) && !editRef.current && (el as HTMLElement).dataset.cell !== undefined;
    };
    const tsv = () => {
      const { range: rg, rawForCopy: raw } = clipboardRef.current;
      const lines: string[] = [];
      for (let r = rg.r0; r <= rg.r1; r += 1) {
        const row: string[] = [];
        for (let c = rg.c0; c <= rg.c1; c += 1) row.push(raw(toAddress(r, c)).replace(/[\t\n\r]/g, " "));
        lines.push(row.join("\t"));
      }
      return lines.join("\n");
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!owns() || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", tsv());
    };
    const onCut = (e: ClipboardEvent) => {
      if (!owns() || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", tsv());
      const { range: rg, applyChanges: apply } = clipboardRef.current;
      const entries: { address: string; value: string }[] = [];
      for (let r = rg.r0; r <= rg.r1; r += 1)
        for (let c = rg.c0; c <= rg.c1; c += 1) entries.push({ address: toAddress(r, c), value: "" });
      apply(entries);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!owns() || !e.clipboardData) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const ctx = clipboardRef.current;
      const rows = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
      const single = rows.length === 1 && rows[0].length === 1;
      const { r0, c0 } = ctx.range;
      // One value pasted over a range fills the range; a block pastes from the top-left corner.
      const r1 = single ? ctx.range.r1 : Math.min(ctx.rowCount - 1, r0 + rows.length - 1);
      const c1 = single
        ? ctx.range.c1
        : Math.min(ctx.colCount - 1, c0 + Math.max(...rows.map((row) => row.length)) - 1);
      const entries: { address: string; value: string }[] = [];
      for (let r = r0; r <= r1; r += 1)
        for (let c = c0; c <= c1; c += 1) {
          const v = single ? rows[0][0] : rows[r - r0]?.[c - c0];
          if (v === undefined) continue;
          entries.push({ address: toAddress(r, c), value: normalizeInput(v, ctx.columns[c]?.type ?? "text") });
        }
      ctx.applyChanges(entries);
      setAnchor({ r: r0, c: c0 });
      ctx.select({ r: r1, c: c1 }, true);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  /* ---------- pointer ---------- */

  const handleCellPointerDown = (e: ReactMouseEvent, pos: Pos) => {
    if (e.button !== 0) return;
    if (editRef.current && editRef.current.r === pos.r && editRef.current.c === pos.c) return;
    if (editRef.current) commit("stay");
    dragging.current = true;
    select(pos, e.shiftKey);
  };

  const handleCellPointerEnter = (pos: Pos) => {
    if (!dragging.current) return;
    setActive(pos);
  };

  const selectColumn = (c: number) => {
    if (editRef.current) commit("stay");
    setAnchor({ r: 0, c });
    pendingFocus.current = true;
    setActive({ r: rowCount - 1, c });
  };
  const selectRow = (r: number) => {
    if (editRef.current) commit("stay");
    setAnchor({ r, c: 0 });
    pendingFocus.current = true;
    setActive({ r, c: colCount - 1 });
  };

  /* ---------- geometry ---------- */

  const widths = columns.map((col) => col.width ?? DEFAULT_COL_W);
  const lefts: number[] = [];
  let tableWidth = ROWHEAD_W;
  for (const w of widths) {
    lefts.push(tableWidth);
    tableWidth += w;
  }
  const rectOf = (rg: { r0: number; c0: number; r1: number; c1: number }) => ({
    left: lefts[rg.c0],
    top: HEAD_H + rg.r0 * ROW_H,
    width: lefts[rg.c1] + widths[rg.c1] - lefts[rg.c0],
    height: (rg.r1 - rg.r0 + 1) * ROW_H,
  });

  const activeRaw = cells[activeAddress] ?? "";
  const refHighlights = useMemo(
    () =>
      referencedRanges(editing ? (editing.value.startsWith("=") ? editing.value : "") : activeRaw).filter(
        (rg) => rg.r1 < rowCount && rg.c1 < colCount,
      ),
    [activeRaw, editing, rowCount, colCount],
  );

  /* ---------- status ---------- */

  const stats = useMemo(() => {
    let sum = 0;
    let count = 0;
    let filled = 0;
    for (let r = range.r0; r <= range.r1; r += 1)
      for (let c = range.c0; c <= range.c1; c += 1) {
        const res = evaluate(toAddress(r, c));
        if (res.kind !== "empty") filled += 1;
        if (res.kind === "number") {
          sum += res.value;
          count += 1;
        }
      }
    return { sum, count, filled };
  }, [evaluate, range]);
  const statFormat = formatters[range.c0] ?? formatters[0];
  const statsType = columns[range.c0]?.type ?? "number";
  const sameType = columns.slice(range.c0, range.c1 + 1).every((col) => (col.type ?? "text") === statsType);
  const formatStat = (n: number) =>
    sameType && statsType !== "text" ? statFormat.format(n) : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);

  const rangeLabel = isMulti
    ? `${toAddress(range.r0, range.c0)}:${toAddress(range.r1, range.c1)}`
    : activeAddress;

  const barValue = editing ? editing.value : toEditText(activeRaw, typeAt(active.c));

  /* ---------- render ---------- */

  const gridLine = isDark ? "border-[#232323]" : "border-[#efe6d8]";
  const headCell = isDark ? "bg-[#161616] text-[#ededed]/40" : "bg-[#fbf7ef] text-[#171717]/50";
  const headActive = isDark ? "bg-[#1f1a17] text-[#d86a2c]" : "bg-[#f6e8dc] text-[#bd4514]";
  const bodyBg = isDark ? "bg-[#111]" : "bg-[#fffcf6]";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1040px] overflow-hidden rounded-[18px] border text-[13px]",
        palette.container,
        className,
      )}
    >
      {/* Title + formula bar */}
      <div className={cn("flex items-center gap-2.5 border-b px-4 py-2.5", palette.divider)}>
        <div className={cn("min-w-0 truncate font-medium", palette.primaryText)}>{title}</div>
        <span className={cn("ml-auto hidden shrink-0 text-[12px] sm:inline", palette.secondaryText)}>
          {readOnly ? "View only" : "Autosaved"}
        </span>
      </div>
      <div className={cn("flex h-10 items-stretch border-b", palette.divider)}>
        <div
          className={cn(
            "flex w-[84px] shrink-0 items-center border-r px-3 font-medium tabular-nums",
            palette.divider,
            palette.primaryText,
          )}
        >
          <span className="sr-only">Selection </span>
          <span className="truncate">{rangeLabel}</span>
        </div>
        <label className={cn("flex min-w-0 flex-1 items-center gap-2 px-3", palette.secondaryText)}>
          <SquareFunction aria-hidden size={15} strokeWidth={1.7} className={palette.accent} />
          <span className="sr-only">Contents of {activeAddress}</span>
          <input
            ref={barRef}
            value={barValue}
            readOnly={readOnly}
            spellCheck={false}
            autoComplete="off"
            onFocus={() => {
              if (readOnly) return;
              const cur = editRef.current;
              if (cur) setEditing({ ...cur, source: "bar", mode: "edit" });
              else beginEdit("edit", undefined, "bar");
            }}
            onChange={(e) => {
              const cur = editRef.current;
              if (cur) setEditing({ ...cur, value: e.target.value });
            }}
            onKeyDown={(e) => handleEditorKeyDown(e, "bar")}
            onBlur={() => {
              if (editRef.current?.source === "bar") {
                const e = editRef.current;
                setEditing(null);
                applyChanges([{ address: toAddress(e.r, e.c), value: normalizeInput(e.value, typeAt(e.c)) }]);
              }
            }}
            className={cn(
              "h-full min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none",
              palette.primaryText,
            )}
          />
        </label>
      </div>

      {/* Grid */}
      <div
        ref={scrollRef}
        role="region"
        aria-label={`${title} sheet`}
        className="relative overflow-auto overscroll-contain"
        style={{ maxHeight, scrollPaddingTop: HEAD_H, scrollPaddingLeft: ROWHEAD_W }}
      >
        <div className="relative" style={{ width: tableWidth }}>
          <table
            ref={gridRef}
            role="grid"
            aria-label={title}
            aria-rowcount={rowCount + 1}
            aria-colcount={colCount + 1}
            aria-multiselectable
            aria-readonly={readOnly || undefined}
            onKeyDown={handleGridKeyDown}
            className="table-fixed border-separate border-spacing-0"
            style={{ width: tableWidth }}
          >
            <caption className="sr-only">
              {title}. Arrow keys move between cells, Shift extends the selection, type or press Enter to edit, Escape
              cancels.
            </caption>
            <colgroup>
              <col style={{ width: ROWHEAD_W }} />
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr role="row" aria-rowindex={1}>
                <th
                  role="columnheader"
                  scope="col"
                  aria-colindex={1}
                  className={cn("sticky left-0 top-0 z-30 border-b border-r p-0", gridLine, headCell)}
                  style={{ height: HEAD_H }}
                >
                  <span className="sr-only">Row</span>
                </th>
                {columns.map((_, c) => {
                  const on = c >= range.c0 && c <= range.c1;
                  return (
                    <th
                      key={c}
                      role="columnheader"
                      scope="col"
                      aria-colindex={c + 2}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectColumn(c);
                      }}
                      className={cn(
                        "sticky top-0 z-20 cursor-pointer select-none border-b border-r p-0 text-center text-[11px] font-medium tracking-[0.08em] tabular-nums",
                        gridLine,
                        on ? headActive : headCell,
                      )}
                      style={{ height: HEAD_H }}
                    >
                      {columnLetter(c)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }, (_, r) => {
                const rowOn = r >= range.r0 && r <= range.r1;
                const isHeader = r < headerRows;
                const isTotal = totals.has(r + 1);
                const enter = shouldAnimate
                  ? {
                      initial: { opacity: 0, y: 4 },
                      animate: { opacity: 1, y: 0 },
                      transition: { type: "spring" as const, stiffness: 520, damping: 40, delay: Math.min(r, 16) * 0.02 },
                    }
                  : { initial: false as const };
                return (
                  <motion.tr key={r} role="row" aria-rowindex={r + 2} {...enter}>
                    <th
                      role="rowheader"
                      scope="row"
                      aria-colindex={1}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectRow(r);
                      }}
                      className={cn(
                        "sticky left-0 z-20 cursor-pointer select-none border-b border-r px-2 text-right text-[11px] font-medium tabular-nums",
                        gridLine,
                        rowOn ? headActive : headCell,
                      )}
                      style={{ height: ROW_H }}
                    >
                      {r + 1}
                    </th>
                    {columns.map((col, c) => {
                      const address = toAddress(r, c);
                      const type = col.type ?? "text";
                      const isActive = r === active.r && c === active.c;
                      const inRange = rowOn && c >= range.c0 && c <= range.c1;
                      const isEditingHere = editing && editing.r === r && editing.c === c;
                      const res = evaluate(address);
                      const numeric = type !== "text";
                      let display = "";
                      let tone: "normal" | "muted" | "error" | "negative" = "normal";
                      let tip: string | undefined;
                      if (isEditingHere && editing.source === "bar") display = editing.value;
                      else if (res.kind === "number") {
                        display = formatters[c].format(res.value);
                        if (res.value < 0 && numeric) tone = "negative";
                      } else if (res.kind === "text") {
                        display = res.value;
                        if (numeric && !isHeader) tone = "muted";
                      } else if (res.kind === "error") {
                        display = res.code;
                        tone = "error";
                        tip = res.message;
                      }
                      const alignRight = numeric && !(res.kind === "text" && !isHeader);
                      return (
                        <td
                          key={c}
                          role="gridcell"
                          data-cell={address}
                          aria-colindex={c + 2}
                          aria-selected={inRange}
                          aria-label={tip ? `${display}, ${tip}` : undefined}
                          tabIndex={isActive ? 0 : -1}
                          title={tip}
                          onMouseDown={(e) => handleCellPointerDown(e, { r, c })}
                          onMouseEnter={() => handleCellPointerEnter({ r, c })}
                          onDoubleClick={() => {
                            if (!editRef.current) beginEdit("edit");
                          }}
                          onFocus={() => {
                            if (!isActive && !editRef.current) {
                              setActive({ r, c });
                              setAnchor({ r, c });
                            }
                          }}
                          className={cn(
                            "relative overflow-hidden whitespace-nowrap border-b border-r px-2.5 outline-none",
                            gridLine,
                            bodyBg,
                            isHeader && cn("text-[12px] font-medium", palette.secondaryText),
                            !isHeader && palette.primaryText,
                            isTotal && "font-semibold",
                            isTotal && (isDark ? "border-t-[#3a3a3a]" : "border-t-[#d9ccb8]"),
                            alignRight ? "text-right tabular-nums" : "text-left",
                            tone === "muted" && palette.secondaryText,
                            tone === "negative" && red.textColor,
                            tone === "error" && cn("font-medium", red.textColor),
                          )}
                          style={{ height: ROW_H, borderTopWidth: isTotal ? 1 : 0, borderTopStyle: "solid" }}
                        >
                          {isEditingHere && editing.source === "cell" ? (
                            <input
                              autoFocus
                              aria-label={`Edit ${address}`}
                              value={editing.value}
                              spellCheck={false}
                              autoComplete="off"
                              onChange={(e) => {
                                const cur = editRef.current;
                                if (cur) setEditing({ ...cur, value: e.target.value });
                              }}
                              onKeyDown={(e) => handleEditorKeyDown(e, "cell")}
                              onBlur={(e) => {
                                if (e.relatedTarget === barRef.current) return;
                                if (editRef.current?.source === "cell") {
                                  const cur = editRef.current;
                                  setEditing(null);
                                  applyChanges([
                                    { address: toAddress(cur.r, cur.c), value: normalizeInput(cur.value, typeAt(cur.c)) },
                                  ]);
                                }
                              }}
                              onFocus={(e) => {
                                const len = e.currentTarget.value.length;
                                e.currentTarget.setSelectionRange(len, len);
                              }}
                              className={cn(
                                "absolute inset-0 z-10 w-full px-2.5 font-normal outline-none",
                                bodyBg,
                                palette.primaryText,
                                editing.value.startsWith("=") ? "text-left font-mono text-[12.5px]" : alignRight ? "text-right tabular-nums" : "text-left",
                              )}
                            />
                          ) : (
                            <span className="block truncate">{display}</span>
                          )}
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>

          {/* Selection overlay: range tint, formula references, active cell. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-[15]">
            {refHighlights.map((rg, i) => (
              <div
                key={`ref-${i}`}
                className="absolute rounded-[2px] border border-dashed"
                style={{ ...rectOf(rg), borderColor: `${accentHex}b3` }}
              />
            ))}
            {isMulti ? (
              <div
                className={cn("absolute border", palette.accentBg)}
                style={{ ...rectOf(range), borderColor: accentHex }}
              />
            ) : null}
            <div
              className="absolute rounded-[2px]"
              style={{
                ...rectOf({ r0: active.r, c0: active.c, r1: active.r, c1: active.c }),
                boxShadow: `inset 0 0 0 2px ${accentHex}`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[12px] tabular-nums",
          palette.divider,
          palette.secondaryText,
        )}
      >
        <span className="truncate">
          {editing ? (editing.value.startsWith("=") ? "Editing formula" : "Editing") : `${rowCount} rows · ${colCount} columns`}
        </span>
        <span className={cn("flex shrink-0 items-center gap-3", stats.count > 1 && palette.primaryText)}>
          {stats.count > 1 ? (
            <>
              <span>Sum {formatStat(stats.sum)}</span>
              <span className="hidden sm:inline">Avg {formatStat(stats.sum / stats.count)}</span>
              <span>Count {stats.filled}</span>
            </>
          ) : (
            <span>{isMulti ? `Count ${stats.filled}` : activeAddress}</span>
          )}
        </span>
      </div>
    </div>
  );
}

export default SpreadsheetGrid;
