"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";

export type FlapCharset = "digits" | "alpha" | "alnum" | string | string[];

export interface FlapColumn {
  key: string;
  header: string;
  /** Width in character cells. An enum column is one word flap of this width. */
  width: number;
  charset: FlapCharset;
  align?: "left" | "right";
}

export type FlapRow = Record<string, string>;
export type FlapStatus = "ok" | "warn" | "off";

export interface FlapLedgerProps {
  columns: FlapColumn[];
  rows: FlapRow[];
  size?: "sm" | "md" | "lg";
  /** Duration of one flip (the top half plus the bottom half), in ms. */
  flapMs?: number;
  /** Delay per column away from the cascade origin, in ms. */
  stagger?: number;
  cascadeFrom?: "changed" | "left" | "right";
  /** Optional LED left of each row. */
  status?: (row: FlapRow) => FlapStatus;
  /** Announces changed rows to screen readers. */
  announceChanges?: boolean;
  ariaLabel?: string;
  tone?: BjorkTone;
  /** Cycles three built-in departure sets every 5s. Pauses on pointer input and offscreen. */
  attract?: boolean;
  className?: string;
}

const CHARSET_PRESETS: Record<"digits" | "alpha" | "alnum", string> = {
  digits: " 0123456789",
  alpha: " ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  alnum: " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
};

const FALL_EASE = "cubic-bezier(0.55,0,1,0.45)"; // gravity: the top half drops
const RISE_EASE = "cubic-bezier(0,0.55,0.45,1)"; // the bottom half lifts into place
const MAX_STEPS = 12;
const MAX_FLIPPING = 160;
const ROW_DELAY_MS = 40;
const LAND_MS = 120;
const LAND_DEG = -6;
const ATTRACT_MS = 5000;
const ATTRACT_RESUME_MS = 4000;

// Geist Mono 500 glyphs are centred on the split line by cap height. Canvas
// metrics: ascent 1.01em, descent 0.29em, cap height 0.71em. A line-height 1 box
// puts the baseline at 0.5 + (1.01 - 0.29) / 2 = 0.86em, so the cap centre sits at
// 0.86 - 0.355 = 0.505em, 0.005em (0.1px at 20px) below the box centre. A pixel
// probe of a rendered H put the ink centre 0.13 scaled px above the cell centre.
// Nudge up by 0.005em, which is within measurement noise.
const CAP_NUDGE_EM = -0.005;
// Enum words carry letter-spacing 0.06em after the last letter. Shift right by
// half of it so the visible word stays centred.
const WORD_TRAIL_EM = 0.03;

const SIZE_SCALE = { sm: 0.72, md: 1, lg: 1.36 } as const;

const MATERIAL = {
  dark: {
    board: "#0b0b0b",
    topFace: "linear-gradient(#1a1a1a, #151515)",
    bottomFace: "linear-gradient(#131313, #101010)",
    split: "#050505",
    splitHighlight: "rgba(255,255,255,0.04)",
  },
  light: {
    board: "#efe9dd",
    topFace: "linear-gradient(#fffcf6, #f8f2e7)",
    bottomFace: "linear-gradient(#f5efe3, #efe7d8)",
    split: "#e1d7c8",
    splitHighlight: "rgba(255,255,255,0.7)",
  },
} as const;

interface Metrics {
  cellW: number;
  cellH: number;
  cellGap: number;
  radius: number;
  charFs: number;
  wordFs: number;
  headerFs: number;
  headerGap: number;
  led: number;
  ledGap: number;
  colGap: number;
  rowGap: number;
  pad: number;
  boardRadius: number;
  perspective: number;
}

function buildMetrics(size: "sm" | "md" | "lg"): Metrics {
  const k = SIZE_SCALE[size];
  return {
    cellW: 22 * k,
    cellH: 32 * k,
    cellGap: 2 * k,
    radius: 3 * k,
    charFs: 20 * k,
    wordFs: 15 * k,
    headerFs: 10 * k,
    headerGap: 8 * k,
    led: 6 * k,
    ledGap: 8 * k,
    colGap: 8 * k,
    rowGap: 6 * k,
    pad: 16 * k,
    boardRadius: 14 * k,
    perspective: 220 * k,
  };
}

/** Pixel width of a column of `width` character cells, including the gaps between them. */
function columnPx(width: number, m: Metrics): number {
  return width * (m.cellW + m.cellGap) - m.cellGap;
}

/** Cycle of states a cell flips through, in order. Blank comes first. */
function buildCycle(col: FlapColumn): string[] {
  if (Array.isArray(col.charset)) {
    const words = col.charset.map((v) => v.toUpperCase().trim().slice(0, col.width));
    return Array.from(new Set(["", ...words]));
  }
  const preset = col.charset in CHARSET_PRESETS
    ? CHARSET_PRESETS[col.charset as keyof typeof CHARSET_PRESETS]
    : col.charset;
  const chars = Array.from(new Set(Array.from(preset)));
  if (!chars.includes(" ")) chars.unshift(" ");
  return chars;
}

/** Target cell values for one row, after normalising. Missing rows are blank. */
function cellTargets(col: FlapColumn, cycle: string[], row: FlapRow | undefined): string[] {
  const raw = row?.[col.key] ?? "";
  if (Array.isArray(col.charset)) {
    const word = raw.toUpperCase().trim().slice(0, col.width);
    return [cycle.includes(word) ? word : ""];
  }
  let chars = Array.from(raw.toUpperCase()).map((ch) => (cycle.includes(ch) ? ch : " "));
  chars = chars.slice(0, col.width);
  const fill = Array.from({ length: col.width - chars.length }, () => " ");
  return col.align === "right" ? [...fill, ...chars] : [...chars, ...fill];
}

/** Forward distance through the cycle, wrapping. */
function distance(cycle: string[], from: string, to: string): number {
  const j = cycle.indexOf(to);
  if (j < 0) return 0;
  const i = Math.max(0, cycle.indexOf(from));
  return (j - i + cycle.length) % cycle.length;
}

interface FlipStep {
  from: string;
  to: string;
  last: boolean;
}

function planFlips(cycle: string[], from: string, to: string): { jump: string | null; steps: FlipStep[] } {
  const len = cycle.length;
  let i = Math.max(0, cycle.indexOf(from));
  const j = cycle.indexOf(to);
  if (j < 0) return { jump: null, steps: [] };
  let d = (j - i + len) % len;
  if (d === 0) return { jump: null, steps: [] };
  let jump: string | null = null;
  if (d > MAX_STEPS) {
    i = (j - MAX_STEPS + len) % len;
    d = MAX_STEPS;
    jump = cycle[i];
  }
  const steps: FlipStep[] = [];
  for (let k = 0; k < d; k++) {
    steps.push({ from: cycle[(i + k) % len], to: cycle[(i + k + 1) % len], last: k === d - 1 });
  }
  return { jump, steps };
}

// --- Imperative cell controller -------------------------------------------
// Flip frames are driven with WAAPI on the cell's DOM layers. React renders the
// layers once, and text is written through the controller so a running flip is
// never clobbered by a re-render.

interface CellCtl {
  top: HTMLElement;
  bottom: HTMLElement;
  fall: HTMLElement;
  rise: HTMLElement;
  shade: HTMLElement;
  gTop: HTMLElement;
  gBottom: HTMLElement;
  gFall: HTMLElement;
  gRise: HTMLElement;
  value: string;
  pending: string | null;
  target: string | null;
  run: number;
  anims: Animation[];
  active: boolean;
  done: Promise<void>;
}

interface BoardState {
  active: number;
}

const controllers = new WeakMap<HTMLElement, CellCtl>();

function part(el: HTMLElement, name: string): HTMLElement {
  const found = el.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (!found) throw new Error(`FlapLedger cell is missing the ${name} layer`);
  return found;
}

function glyph(el: HTMLElement, name: string): HTMLElement {
  const found = el.querySelector<HTMLElement>(`[data-glyph="${name}"]`);
  if (!found) throw new Error(`FlapLedger cell is missing the ${name} glyph`);
  return found;
}

function getCtl(el: HTMLElement): CellCtl {
  const existing = controllers.get(el);
  if (existing) return existing;
  const ctl: CellCtl = {
    top: part(el, "top"),
    bottom: part(el, "bottom"),
    fall: part(el, "fall"),
    rise: part(el, "rise"),
    shade: part(el, "shade"),
    gTop: glyph(el, "top"),
    gBottom: glyph(el, "bottom"),
    gFall: glyph(el, "fall"),
    gRise: glyph(el, "rise"),
    value: "",
    pending: null,
    target: null,
    run: 0,
    anims: [],
    active: false,
    done: Promise.resolve(),
  };
  controllers.set(el, ctl);
  return ctl;
}

function setText(el: HTMLElement, value: string) {
  const node = el.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE) (node as Text).data = value;
  else el.textContent = value;
}

function paint(ctl: CellCtl, value: string) {
  ctl.value = value;
  setText(ctl.gTop, value);
  setText(ctl.gBottom, value);
}

// visibility, not display: no layout change, only a paint toggle.
function hideFlaps(ctl: CellCtl) {
  ctl.fall.style.visibility = "hidden";
  ctl.rise.style.visibility = "hidden";
  ctl.shade.style.visibility = "hidden";
}

function showFlap(el: HTMLElement) {
  el.style.visibility = "visible";
}

/** Cancels the running flip, lands on its destination and invalidates its loop. */
function settle(ctl: CellCtl, board: BoardState) {
  ctl.run++;
  for (const anim of ctl.anims) anim.cancel();
  ctl.anims = [];
  if (ctl.pending !== null) {
    paint(ctl, ctl.pending);
    ctl.pending = null;
  }
  hideFlaps(ctl);
  if (ctl.active) {
    ctl.active = false;
    board.active--;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function flip(ctl: CellCtl, step: FlipStep, flapMs: number, perspectivePx: number, id: number): Promise<boolean> {
  const half = flapMs / 2;
  const persp = `perspective(${perspectivePx}px)`;
  ctl.pending = step.to;
  setText(ctl.gTop, step.to);
  setText(ctl.gBottom, step.from);
  setText(ctl.gFall, step.from);
  setText(ctl.gRise, step.to);

  showFlap(ctl.fall);
  showFlap(ctl.rise);
  showFlap(ctl.shade);
  // Both halves start in the same frame. The rise is delayed by half a flip and
  // held at 90deg (edge-on) until then, so the step needs one await, not two.
  const fall = ctl.fall.animate(
    [{ transform: `${persp} rotateX(0deg)` }, { transform: `${persp} rotateX(-90deg)` }],
    { duration: half, easing: FALL_EASE, fill: "forwards" },
  );
  const rise = ctl.rise.animate(
    [{ transform: `${persp} rotateX(90deg)` }, { transform: `${persp} rotateX(0deg)` }],
    { duration: half, easing: RISE_EASE, delay: half, fill: "backwards" },
  );
  const shade = ctl.shade.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }],
    { duration: flapMs, easing: "linear" },
  );
  const stepAnims = [fall, rise, shade];
  ctl.anims = stepAnims;
  await rise.finished;
  if (ctl.run !== id) return false;

  setText(ctl.gBottom, step.to);
  let land: Animation | null = null;
  if (step.last) {
    land = ctl.rise.animate(
      [
        { transform: `${persp} rotateX(0deg)`, easing: easeCss.out },
        { transform: `${persp} rotateX(${LAND_DEG}deg)`, offset: 0.4, easing: easeCss.out },
        { transform: `${persp} rotateX(0deg)`, offset: 1 },
      ],
      { duration: LAND_MS },
    );
    stepAnims.push(land);
    ctl.anims = stepAnims;
    await land.finished;
    if (ctl.run !== id) return false;
  }

  for (const anim of stepAnims) anim.cancel();
  ctl.anims = [];
  ctl.pending = null;
  ctl.value = step.to;
  hideFlaps(ctl);
  return true;
}

type CellMode = "flip" | "crossfade" | "instant";

function startCell(
  ctl: CellCtl,
  el: HTMLElement,
  board: BoardState,
  cycle: string[],
  target: string,
  mode: CellMode,
  delay: number,
  flapMs: number,
  perspectivePx: number,
) {
  settle(ctl, board);
  const id = ctl.run;
  if (ctl.value === target) {
    ctl.done = Promise.resolve();
    return;
  }
  if (mode === "instant") {
    paint(ctl, target);
    ctl.done = Promise.resolve();
    return;
  }
  if (mode === "crossfade") {
    paint(ctl, target);
    el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 120, easing: easeCss.out });
    ctl.done = Promise.resolve();
    return;
  }
  if (board.active >= MAX_FLIPPING) {
    paint(ctl, target);
    ctl.done = Promise.resolve();
    return;
  }

  const plan = planFlips(cycle, ctl.value, target);
  board.active++;
  ctl.active = true;
  ctl.done = (async () => {
    try {
      if (delay > 0) await sleep(delay);
      if (ctl.run !== id) return;
      if (plan.jump !== null) paint(ctl, plan.jump);
      for (const step of plan.steps) {
        if (ctl.run !== id) return;
        const ok = await flip(ctl, step, flapMs, perspectivePx, id);
        if (!ok) return;
      }
    } finally {
      if (ctl.run === id && ctl.active) {
        ctl.active = false;
        board.active--;
      }
    }
  })();
}

// --- Rendering ------------------------------------------------------------

interface CellProps {
  r: number;
  c: number;
  i: number;
  kind: "char" | "word";
  width: number;
  m: Metrics;
  ink: string;
  material: (typeof MATERIAL)[keyof typeof MATERIAL];
}

function glyphStyle(m: Metrics, kind: "char" | "word", top: number, ink: string): CSSProperties {
  const fs = kind === "word" ? m.wordFs : m.charFs;
  const nudge = CAP_NUDGE_EM * fs;
  const trail = kind === "word" ? WORD_TRAIL_EM * fs : 0;
  return {
    position: "absolute",
    left: 0,
    top,
    width: "100%",
    height: m.cellH,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    fontSize: fs,
    fontWeight: 500,
    letterSpacing: kind === "word" ? "0.06em" : undefined,
    whiteSpace: "pre",
    color: ink,
    transform: `translate(${trail}px, ${nudge}px)`,
    pointerEvents: "none",
  };
}

function FlapCell({ r, c, i, kind, width, m, ink, material }: CellProps) {
  const half = m.cellH / 2;
  const r0 = m.radius;
  const layer: CSSProperties = { position: "absolute", left: 0, width: "100%", overflow: "hidden" };
  return (
    <span
      data-flap-cell=""
      data-r={r}
      data-c={c}
      data-i={i}
      className="relative block shrink-0"
      style={{ width, height: m.cellH, borderRadius: r0, contain: "layout paint style" }}
    >
      <span
        data-part="top"
        style={{ ...layer, top: 0, height: half, background: material.topFace, borderRadius: `${r0}px ${r0}px 0 0` }}
      >
        <span data-glyph="top" style={glyphStyle(m, kind, 0, ink)} />
      </span>
      <span
        data-part="bottom"
        style={{ ...layer, top: half, height: half, background: material.bottomFace, borderRadius: `0 0 ${r0}px ${r0}px` }}
      >
        <span data-glyph="bottom" style={glyphStyle(m, kind, -half, ink)} />
      </span>
      <span
        data-part="shade"
        aria-hidden="true"
        style={{
          ...layer,
          top: half,
          height: half,
          visibility: "hidden",
          background: "linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0))",
        }}
      />
      <span
        aria-hidden="true"
        style={{ position: "absolute", left: 0, width: "100%", top: half - 1, height: 1, background: material.split }}
      />
      <span
        aria-hidden="true"
        style={{ position: "absolute", left: 0, width: "100%", top: half, height: 1, background: material.splitHighlight }}
      />
      <span
        data-part="fall"
        style={{
          ...layer,
          top: 0,
          height: half,
          visibility: "hidden",
          transformOrigin: "50% 100%",
          background: material.topFace,
          borderRadius: `${r0}px ${r0}px 0 0`,
        }}
      >
        <span data-glyph="fall" style={glyphStyle(m, kind, 0, ink)} />
      </span>
      <span
        data-part="rise"
        style={{
          ...layer,
          top: half,
          height: half,
          visibility: "hidden",
          transformOrigin: "50% 0",
          background: material.bottomFace,
          borderRadius: `0 0 ${r0}px ${r0}px`,
        }}
      >
        <span data-glyph="rise" style={glyphStyle(m, kind, -half, ink)} />
      </span>
    </span>
  );
}

function Led({ state, m, colours }: { state: FlapStatus; m: Metrics; colours: Record<FlapStatus, string> }) {
  return (
    <span
      aria-hidden="true"
      className="relative block shrink-0"
      style={{ width: m.led, height: m.led, marginRight: m.ledGap }}
    >
      {(["ok", "warn", "off"] as const).map((key) => (
        <span
          key={key}
          className="absolute inset-0 rounded-full transition-opacity duration-200 ease-out"
          style={{ background: colours[key], opacity: state === key ? 1 : 0 }}
        />
      ))}
    </span>
  );
}

/** Built-in idle sets for `attract`. Keys match the demo columns. */
export const FLAP_LEDGER_SAMPLE_ROWS: FlapRow[][] = [
  [
    { time: "08:15", flight: "BJ204", destination: "LONDON", gate: "A12", status: "ON TIME" },
    { time: "08:40", flight: "BJ317", destination: "TOKYO", gate: "B4", status: "BOARDING" },
    { time: "09:05", flight: "BJ82", destination: "BERLIN", gate: "C7", status: "DELAYED" },
    { time: "09:30", flight: "BJ551", destination: "OSLO", gate: "D2", status: "GATE CLOSED" },
    { time: "10:10", flight: "BJ19", destination: "NEW YORK", gate: "E9", status: "DEPARTED" },
  ],
  [
    { time: "08:15", flight: "BJ204", destination: "LONDON", gate: "A12", status: "DEPARTED" },
    { time: "08:40", flight: "BJ317", destination: "TOKYO", gate: "B4", status: "BOARDING" },
    { time: "09:05", flight: "BJ82", destination: "BERLIN", gate: "C7", status: "ON TIME" },
    { time: "09:30", flight: "BJ551", destination: "OSLO", gate: "D2", status: "DELAYED" },
    { time: "10:10", flight: "BJ19", destination: "NEW YORK", gate: "E9", status: "ON TIME" },
  ],
  [
    { time: "08:15", flight: "BJ204", destination: "LONDON", gate: "A12", status: "DEPARTED" },
    { time: "08:40", flight: "BJ317", destination: "TOKYO", gate: "B4", status: "DEPARTED" },
    { time: "09:05", flight: "BJ82", destination: "BERLIN", gate: "C7", status: "GATE CLOSED" },
    { time: "09:30", flight: "BJ551", destination: "OSLO", gate: "D2", status: "BOARDING" },
    { time: "10:10", flight: "BJ19", destination: "NEW YORK", gate: "E9", status: "DELAYED" },
  ],
];

function diffMessage(prev: FlapRow[], next: FlapRow[], columns: FlapColumn[]): string {
  const parts: string[] = [];
  const count = Math.max(prev.length, next.length);
  for (let r = 0; r < count; r++) {
    const before = prev[r] ?? {};
    const after = next[r] ?? {};
    const changed = columns.filter((col) => (before[col.key] ?? "") !== (after[col.key] ?? ""));
    if (changed.length === 0) continue;
    const values = changed.map((col) => after[col.key] ?? "").filter(Boolean).join(", ");
    parts.push(`Row ${r + 1} updated${values ? `: ${values}` : ""}`);
  }
  return parts.join(". ");
}

export function FlapLedger({
  columns,
  rows,
  size = "md",
  flapMs = 70,
  stagger = 28,
  cascadeFrom = "changed",
  status,
  announceChanges = false,
  ariaLabel = "Board",
  tone,
  attract = false,
  className,
}: FlapLedgerProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const material = MATERIAL[resolvedTone];
  const reduced = !!useReducedMotion();
  const m = useMemo(() => buildMetrics(size), [size]);
  const cycles = useMemo(() => columns.map(buildCycle), [columns]);

  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardState = useRef<BoardState>({ active: 0 });
  const genRef = useRef(0);
  const firstRunRef = useRef(true);
  const pauseUntilRef = useRef(0);
  const attractAccRef = useRef(0);

  const [attractStep, setAttractStep] = useState(0);
  const attractActive = attract && !reduced;
  const liveRows = attract ? FLAP_LEDGER_SAMPLE_ROWS[reduced ? 0 : attractStep % FLAP_LEDGER_SAMPLE_ROWS.length] : rows;

  // Row slots stay mounted while removed rows flip to blank.
  const [slots, setSlots] = useState(liveRows.length);
  if (liveRows.length > slots) setSlots(liveRows.length);

  // Announcements, computed while rendering from the previous rows snapshot.
  const rowsKey = JSON.stringify(liveRows);
  const [seenKey, setSeenKey] = useState(rowsKey);
  const [prevRows, setPrevRows] = useState<FlapRow[]>(liveRows);
  const [announcement, setAnnouncement] = useState("");
  if (rowsKey !== seenKey) {
    setSeenKey(rowsKey);
    if (announceChanges) setAnnouncement(diffMessage(prevRows, liveRows, columns));
    setPrevRows(liveRows);
  }

  const frame = useCallback((dt: number) => {
    if (performance.now() < pauseUntilRef.current) return;
    attractAccRef.current += dt;
    if (attractAccRef.current >= ATTRACT_MS / 1000) {
      attractAccRef.current = 0;
      setAttractStep((s) => (s + 1) % FLAP_LEDGER_SAMPLE_ROWS.length);
    }
  }, []);
  useVisibleLoop(rootRef, frame, { enabled: attractActive });

  const pauseAttract = useCallback(() => {
    pauseUntilRef.current = performance.now() + ATTRACT_RESUME_MS;
  }, []);

  // Flip the board toward the current rows. Only cells whose target changed move.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const gen = ++genRef.current;
    const instant = firstRunRef.current;
    firstRunRef.current = false;
    const mode: CellMode = instant ? "instant" : reduced ? "crossfade" : "flip";

    const targetCache = new Map<string, string[]>();
    const jobs = Array.from(board.querySelectorAll<HTMLElement>("[data-flap-cell]")).map((el) => {
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      const i = Number(el.dataset.i);
      const key = `${r}:${c}`;
      let targets = targetCache.get(key);
      if (!targets) {
        targets = cellTargets(columns[c], cycles[c], liveRows[r]);
        targetCache.set(key, targets);
      }
      return { el, r, c, ctl: getCtl(el), cycle: cycles[c], target: targets[i] };
    });

    const colDistance = columns.map(() => 0);
    if (mode === "flip") {
      for (const job of jobs) {
        if (job.target === undefined || job.ctl.target === job.target) continue;
        colDistance[job.c] += distance(job.cycle, job.ctl.value, job.target);
      }
    }
    let origin = 0;
    if (cascadeFrom === "right") origin = columns.length - 1;
    else if (cascadeFrom === "changed") {
      let best = -1;
      colDistance.forEach((d, c) => {
        if (d > best) {
          best = d;
          origin = c;
        }
      });
    }

    for (const job of jobs) {
      if (job.target === undefined || job.ctl.target === job.target) continue;
      job.ctl.target = job.target;
      const delay = mode === "flip" ? Math.abs(job.c - origin) * stagger + job.r * ROW_DELAY_MS : 0;
      startCell(job.ctl, job.el, boardState.current, job.cycle, job.target, mode, delay, flapMs, m.perspective);
    }

    // Rows removed from the data flip to blank, then unmount.
    if (slots > liveRows.length) {
      const len = liveRows.length;
      const removed = jobs.filter((job) => job.r >= len).map((job) => job.ctl.done);
      void Promise.all(removed).then(() => {
        if (genRef.current === gen) setSlots(len);
      });
    }
  }, [liveRows, slots, columns, cycles, cascadeFrom, stagger, flapMs, reduced, m]);

  const ink = palette.text;
  const ledColours: Record<FlapStatus, string> = {
    ok: palette.success,
    warn: palette.warning,
    off: palette.textFaint,
  };
  const ledSpace = status ? m.led + m.ledGap : 0;
  const boardWidth = columns.reduce((sum, col) => sum + columnPx(col.width, m), 0) + Math.max(0, columns.length - 1) * m.colGap;

  return (
    <div
      ref={rootRef}
      className={cn("relative max-w-full overflow-x-auto overscroll-x-contain", className)}
      onPointerDown={pauseAttract}
      onPointerMove={pauseAttract}
    >
      <div
        ref={boardRef}
        aria-hidden="true"
        className="relative block w-max font-mono tabular-nums select-none"
        style={{
          padding: m.pad,
          borderRadius: m.boardRadius,
          background: material.board,
          border: `1px solid var(--bjork-border, ${palette.border})`,
          boxShadow: "var(--bjork-shadow-panel, none)",
          color: ink,
          width: boardWidth + ledSpace + m.pad * 2 + 2,
        }}
      >
        <div className="flex" style={{ paddingLeft: ledSpace, marginBottom: m.headerGap }}>
          {columns.map((col, c) => {
            const right = col.align === "right";
            return (
              <span
                key={col.key}
                className="block overflow-hidden whitespace-nowrap font-mono uppercase"
                style={{
                  width: columnPx(col.width, m),
                  marginLeft: c > 0 ? m.colGap : 0,
                  fontSize: m.headerFs,
                  lineHeight: 1,
                  letterSpacing: "0.12em",
                  textAlign: right ? "right" : "left",
                  // Trailing letter-spacing pushes right-aligned text left. Pull it back by one tracking unit.
                  marginRight: right ? "-0.12em" : undefined,
                  color: palette.textFaint,
                }}
              >
                {col.header}
              </span>
            );
          })}
        </div>

        <div className="flex flex-col" style={{ gap: m.rowGap }}>
          {Array.from({ length: slots }, (_, r) => {
            const state: FlapStatus = status && r < liveRows.length ? status(liveRows[r]) : "off";
            return (
              <div key={r} className="flex items-center">
                {status ? <Led state={state} m={m} colours={ledColours} /> : null}
                {columns.map((col, c) => {
                  const cells = Array.from({ length: col.width }, (_, i) => i);
                  const isWord = Array.isArray(col.charset);
                  return (
                    <div
                      key={col.key}
                      className="flex shrink-0"
                      style={{
                        width: columnPx(col.width, m),
                        gap: m.cellGap,
                        marginLeft: c > 0 ? m.colGap : 0,
                      }}
                    >
                      {isWord ? (
                        <FlapCell
                          r={r}
                          c={c}
                          i={0}
                          kind="word"
                          width={columnPx(col.width, m)}
                          m={m}
                          ink={ink}
                          material={material}
                        />
                      ) : (
                        cells.map((i) => (
                          <FlapCell
                            key={i}
                            r={r}
                            c={c}
                            i={i}
                            kind="char"
                            width={m.cellW}
                            m={m}
                            ink={ink}
                            material={material}
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {liveRows.map((row, r) => (
            <tr key={r}>
              {columns.map((col) => (
                <td key={col.key}>{row[col.key] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {announceChanges ? <LiveRegion message={announcement} /> : null}
    </div>
  );
}
