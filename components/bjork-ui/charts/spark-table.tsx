"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut } from "@/components/bjork-ui/charts/_kit/canvas";
import { useChartTheme, chartFocusRing, ChartTable, ChartAnnouncer, type AnnouncerHandle } from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, withAlpha, formatCompact, formatPercent, formatSigned, formatDateUTC, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface SparkPoint {
  t: number;
  v: number;
}

export interface SparkRow {
  id: string;
  label: string;
  sublabel?: string;
  data: SparkPoint[];
  format?: (v: number) => string;
  /** Which direction is good news. Tints the change chip. Default "up". */
  goodDirection?: "up" | "down";
}

export interface SparkTableProps {
  rows: SparkRow[];
  /** Header text when nothing is scrubbed, e.g. "Last 90 days". */
  periodLabel?: string;
  formatTime?: (t: number) => string;
  /** Posed shared index into every row's data. `null` shows the latest values. */
  index?: number | null;
  onIndexChange?: (index: number | null) => void;
  /** Selected row: drawn in the accent. */
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelectedChange?: (id: string | null) => void;
  rowHeight?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const HEADER_H = 28;
const VALUE_TAU = 0.09;
const ENTER_MS = 900;
const ROW_ENTER_MS = 520;
const ATTRACT_IDLE_MS = 4000;
const ATTRACT_STEP_MS = 90;

const defaultFormat = (v: number) => formatCompact(v, 1);
// Input timestamps for the attract idle timer, read only from event handlers.
const clock = () => performance.now();
const defaultFormatTime = (t: number) => formatDateUTC(t);
// Period change as a signed percent with a true minus; a change that rounds to zero carries no sign.
const changeText = (chg: number) => formatSigned(chg, (n) => formatPercent(n, n < 0.1 ? 1 : 0));

function layoutColumns(w: number) {
  const narrow = w < 460;
  const gap = narrow ? 12 : 20;
  const label = narrow ? clamp(w * 0.28, 84, 120) : clamp(w * 0.24, 120, 200);
  const value = narrow ? 76 : 84;
  const delta = narrow ? 0 : 76;
  const spark = Math.max(40, w - label - value - delta - gap * (narrow ? 2 : 3));
  const sparkL = label + gap;
  const valueR = sparkL + spark + gap + value;
  return { narrow, gap, label, value, delta, spark, sparkL, sparkR: sparkL + spark, valueR, deltaR: w };
}

interface Run {
  enter: number;
  index: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  disp: number[];
  ready: boolean;
  lastInput: number;
  attractAt: number;
}

export function SparkTable({
  rows,
  periodLabel = "Latest",
  formatTime = defaultFormatTime,
  index,
  onIndexChange,
  selectedId: selectedProp,
  defaultSelectedId,
  onSelectedChange,
  rowHeight = 44,
  ariaLabel = "Metrics",
  tone: toneProp,
  attract = false,
  className,
}: SparkTableProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const deltaRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const arrowRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [selState, setSelState] = useState<string | null>(defaultSelectedId === undefined ? (rows[0]?.id ?? null) : defaultSelectedId);
  const selected = selectedProp === undefined ? selState : selectedProp;

  const len = useMemo(() => rows.reduce((m, r) => Math.max(m, r.data.length), 0), [rows]);

  const cfg = useRef({ rows, selected, reduce, pal, attract, len, formatTime, periodLabel });
  useEffect(() => {
    cfg.current = { rows, selected, reduce, pal, attract, len, formatTime, periodLabel };
  });

  const st = useRef<Run>({
    enter: 0,
    index: index ?? null,
    source: index != null ? "prop" : null,
    disp: [],
    ready: false,
    lastInput: 0,
    attractAt: 0,
  });

  const { rootRef, hostRef, canvasRef, size, wake } = useChartCanvas(({ ctx, w, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const R = c.rows;
    const L = layoutColumns(w);
    const rh = rowHeight;

    if (c.attract && !c.reduce) {
      const now = performance.now();
      if ((!s.lastInput || now - s.lastInput > ATTRACT_IDLE_MS) && (s.source === null || s.source === "attract") && now - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = now;
        s.index = s.index === null || s.index >= c.len - 1 ? Math.floor(c.len * 0.3) : s.index + 1;
        s.source = "attract";
      }
    }

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const revealOf = (i: number) => {
      if (s.enter >= 1) return 1;
      const delay = (i / Math.max(1, R.length)) * (ENTER_MS - ROW_ENTER_MS);
      return easeOut(clamp((s.enter * ENTER_MS - delay) / ROW_ENTER_MS, 0, 1));
    };

    const idx = s.index;
    let moving = false;
    const xOf = (k: number, n: number) => L.sparkL + (k / Math.max(1, n - 1)) * (L.sparkR - L.sparkL);

    // Crosshair through every row at the shared index.
    if (idx !== null && c.len > 1) {
      const x = crisp(xOf(idx, c.len) - 0.5);
      ctx.strokeStyle = p.textFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_H);
      ctx.lineTo(x, HEADER_H + R.length * rh);
      ctx.stroke();
    }

    for (let i = 0; i < R.length; i++) {
      const row = R[i];
      const d = row.data;
      const n = d.length;
      if (!n) continue;
      const top = HEADER_H + i * rh;
      const pad = 9;
      let lo = Infinity;
      let hi = -Infinity;
      let iMin = 0;
      let iMax = 0;
      for (let k = 0; k < n; k++) {
        if (d[k].v < lo) {
          lo = d[k].v;
          iMin = k;
        }
        if (d[k].v > hi) {
          hi = d[k].v;
          iMax = k;
        }
      }
      if (hi - lo < 1e-9) {
        hi += 1;
        lo -= 1;
      }
      const yOf = (v: number) => top + pad + ((hi - v) / (hi - lo)) * (rh - pad * 2);
      const isSel = row.id === c.selected;
      const rev = revealOf(i);

      // Row divider.
      if (i > 0) {
        ctx.strokeStyle = p.hair;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, crisp(top));
        ctx.lineTo(w, crisp(top));
        ctx.stroke();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(L.sparkL - 4, top, (L.sparkR - L.sparkL) * rev + 8, rh);
      ctx.clip();
      // Wash under the line.
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = xOf(k, n);
        const y = yOf(d[k].v);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(xOf(n - 1, n), top + rh - pad + 2);
      ctx.lineTo(xOf(0, n), top + rh - pad + 2);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, top + pad, 0, top + rh - pad);
      grad.addColorStop(0, withAlpha(isSel ? p.accent : p.text, isSel ? 0.16 : 0.06));
      grad.addColorStop(1, withAlpha(isSel ? p.accent : p.text, 0));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = xOf(k, n);
        const y = yOf(d[k].v);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = isSel ? 1.75 : 1.25;
      ctx.strokeStyle = isSel ? p.accent : withAlpha(p.text, 0.62);
      ctx.stroke();
      ctx.restore();

      if (rev >= 1) {
        // Extremes as small hollow marks, the latest as a solid dot.
        for (const k of [iMin, iMax]) {
          ctx.beginPath();
          ctx.arc(xOf(k, n), yOf(d[k].v), 2, 0, Math.PI * 2);
          ctx.fillStyle = p.stage;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = p.textSoft;
          ctx.stroke();
        }
        const k = idx !== null ? Math.min(n - 1, idx) : n - 1;
        ctx.beginPath();
        ctx.arc(xOf(k, n), yOf(d[k].v), 3, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? p.accent : p.text;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
      }

      // Value cell: counts toward the value at the index with a damped step.
      const k = idx !== null ? Math.min(n - 1, idx) : n - 1;
      const target = d[k].v;
      if (!s.ready || c.reduce || s.disp[i] === undefined) s.disp[i] = target;
      else {
        s.disp[i] = damp(s.disp[i], target, VALUE_TAU, dt);
        if (Math.abs(s.disp[i] - target) > Math.abs(target) * 1e-4 + 1e-9) moving = true;
        else s.disp[i] = target;
      }
      const fmt = row.format ?? defaultFormat;
      const vText = fmt(s.disp[i]);
      const vEl = valueRefs.current[i];
      if (vEl && vEl.textContent !== vText) vEl.textContent = vText;
      // Change from the first point in the window to the index.
      const base = d[0].v;
      const chg = base ? (target - base) / Math.abs(base) : 0;
      const flat = Math.abs(chg) < 0.0005;
      const dText = changeText(chg);
      // Compared against the element itself, not a cache: the chip remounts when the layout
      // crosses the narrow breakpoint, and its colours must follow a theme switch.
      const dEl = deltaRefs.current[i];
      const chip = dEl?.parentElement;
      if (dEl && chip && (dEl.textContent !== dText || chip.dataset.ink !== p.text)) {
        dEl.textContent = dText;
        chip.dataset.ink = p.text;
        const good = (row.goodDirection ?? "up") === "up" ? chg >= 0 : chg <= 0;
        chip.style.color = flat ? p.textMuted : good ? p.success : p.error;
        chip.style.background = withAlpha(flat ? p.text : good ? p.success : p.error, 0.1);
        const ar = arrowRefs.current[i];
        if (ar) ar.textContent = flat ? "" : chg > 0 ? "↑" : "↓";
      }
    }
    s.ready = true;

    const tEl = timeRef.current;
    if (tEl) {
      const first = R.find((r) => r.data.length);
      const text = idx !== null && first ? c.formatTime(first.data[Math.min(first.data.length - 1, idx)].t) : c.periodLabel;
      if (tEl.textContent !== text) tEl.textContent = text;
      const x = idx !== null ? clamp(xOf(idx, c.len), L.sparkL + tEl.offsetWidth / 2, L.sparkR - tEl.offsetWidth / 2) : (L.sparkL + L.sparkR) / 2;
      tEl.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) translateX(-50%)`;
      tEl.dataset.active = idx !== null ? "true" : "false";
    }

    return moving || s.enter < 1 || (c.attract && !c.reduce);
  });

  useEffect(() => {
    wake();
  }, [rows, selected, pal, reduce, attract, wake]);

  useEffect(() => {
    if (index === undefined) return;
    st.current.index = index;
    st.current.source = index === null ? null : "prop";
    wake();
  }, [index, wake]);

  const describe = (i: number | null) => {
    const parts = rows.map((r) => {
      const d = r.data[i === null ? r.data.length - 1 : Math.min(r.data.length - 1, i)];
      return d ? `${r.label} ${(r.format ?? defaultFormat)(d.v)}` : r.label;
    });
    const first = rows.find((r) => r.data.length);
    const when = i !== null && first ? formatTime(first.data[Math.min(first.data.length - 1, i)].t) : periodLabel;
    return `${when}: ${parts.join(", ")}`;
  };

  const setIndex = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.index === i && s.source === source) return;
    s.index = i;
    s.source = i === null ? null : source;
    onIndexChange?.(i);
    if (source === "keyboard") announcer.current?.say(describe(i));
    wake();
  };

  const select = (id: string | null) => {
    if (selectedProp === undefined) setSelState(id);
    onSelectedChange?.(id);
    const r = rows.find((x) => x.id === id);
    if (r) announcer.current?.say(`${r.label} selected`);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const L = layoutColumns(rect.width);
    if (x < L.sparkL - 8 || x > L.sparkR + 8 || len < 2) {
      if (st.current.source === "pointer") setIndex(null, null);
      return;
    }
    setIndex(clamp(Math.round(((x - L.sparkL) / (L.sparkR - L.sparkL)) * (len - 1)), 0, len - 1), "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 7 : 1);
      const cur = s.index === null || s.source === "attract" ? len - 1 : s.index;
      setIndex(clamp(s.index === null ? len - 1 : cur + step, 0, len - 1), "keyboard");
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const i = rows.findIndex((r) => r.id === selected);
      const next = rows[clamp((i < 0 ? 0 : i) + (e.key === "ArrowUp" ? -1 : 1), 0, rows.length - 1)];
      if (next) select(next.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setIndex(0, "keyboard");
    } else if (e.key === "End" || e.key === "Escape") {
      if (s.index === null) return;
      e.preventDefault();
      setIndex(null, null);
      announcer.current?.say(describe(null));
    }
  };

  const width = size.width;
  const cols = layoutColumns(width || 600);

  const tableRows = useMemo(
    () =>
      rows.map((r) => {
        const d = r.data;
        if (!d.length) return [r.label, "", "", ""];
        const fmt = r.format ?? defaultFormat;
        const a = d[0].v;
        const b = d[d.length - 1].v;
        return [r.label, fmt(a), fmt(b), changeText(a ? (b - a) / Math.abs(a) : 0)];
      }),
    [rows],
  );
  const tableCols = useMemo(() => ["Metric", "Start of period", "Latest", "Change"], []);
  const height = HEADER_H + rows.length * rowHeight;

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right move through time for every row, up and down select a row, Escape returns to the latest values.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onPointerLeave={() => {
          if (st.current.source === "pointer") setIndex(null, null);
        }}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={describe(null)} className="pointer-events-none absolute left-0 top-0" />
        </div>

        {/* Header */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)]" style={{ height: HEADER_H }}>
          <span className="absolute left-0 top-[9px] [text-box:trim-both_cap_alphabetic]">Metric</span>
          <span
            ref={timeRef}
            className="absolute left-0 top-[9px] whitespace-nowrap tabular-nums [text-box:trim-both_cap_alphabetic] data-[active=true]:text-[color:var(--bjork-text-medium)]"
          />
          <span className="absolute top-[9px] [text-box:trim-both_cap_alphabetic]" style={{ right: (width || 600) - cols.valueR }}>
            Value
          </span>
          {!cols.narrow && (
            <span className="absolute right-0 top-[9px] [text-box:trim-both_cap_alphabetic]">Change</span>
          )}
        </div>

        {rows.map((r, i) => {
          const isSel = r.id === selected;
          return (
            <div key={r.id} className="absolute inset-x-0" style={{ top: HEADER_H + i * rowHeight, height: rowHeight }}>
              <button
                type="button"
                tabIndex={-1}
                aria-pressed={isSel}
                onClick={() => select(isSel ? null : r.id)}
                className="absolute inset-y-0 left-0 flex flex-col items-start justify-center gap-[3px] text-left outline-none"
                style={{ width: cols.label }}
              >
                <span className="flex max-w-full items-center gap-1.5 truncate font-bjork-alpha text-[13px] font-medium leading-[16px] text-[color:var(--bjork-text)]">
                  <span
                    aria-hidden="true"
                    className="inline-block size-1.5 shrink-0 rounded-full transition-opacity duration-150 ease-out"
                    style={{ background: "var(--bjork-accent)", opacity: isSel ? 1 : 0 }}
                  />
                  <span className="truncate">{r.label}</span>
                </span>
                {r.sublabel && (
                  <span className="max-w-full truncate pl-3 font-mono text-[10px] leading-[14px] text-[color:var(--bjork-text-soft)]">
                    {r.sublabel}
                  </span>
                )}
              </button>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 flex flex-col items-end justify-center gap-[5px]"
                style={{ left: cols.valueR - cols.value, width: cols.value }}
              >
                <span
                  ref={(el) => {
                    valueRefs.current[i] = el;
                  }}
                  className="font-mono text-[14px] leading-none tabular-nums text-[color:var(--bjork-text)] [text-box:trim-both_cap_alphabetic]"
                />
                {cols.narrow && (
                  <span className="inline-flex items-center gap-0.5 rounded-[5px] px-1 py-[2px] font-mono text-[10px] leading-none tabular-nums">
                    <span
                      ref={(el) => {
                        arrowRefs.current[i] = el;
                      }}
                    />
                    <span
                      ref={(el) => {
                        deltaRefs.current[i] = el;
                      }}
                      className="[text-box:trim-both_cap_alphabetic]"
                    />
                  </span>
                )}
              </div>
              {!cols.narrow && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end" style={{ width: cols.delta }}>
                  <span className="inline-flex h-[20px] items-center gap-0.5 rounded-[6px] px-1.5 font-mono text-[11px] leading-none tabular-nums">
                    <span
                      ref={(el) => {
                        arrowRefs.current[i] = el;
                      }}
                      className="text-[10px]"
                    />
                    <span
                      ref={(el) => {
                        deltaRefs.current[i] = el;
                      }}
                      className="[text-box:trim-both_cap_alphabetic]"
                    />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded daily metric for demos: trend, weekly seasonality and noise.
export function createMetricSeries(seed: number, days: number, opts: { base: number; trend?: number; weekly?: number; noise?: number; start?: number }): SparkPoint[] {
  const rnd = mulberry32(seed);
  const start = opts.start ?? Date.UTC(2025, 6, 1);
  const out: SparkPoint[] = [];
  let drift = 0;
  for (let i = 0; i < days; i++) {
    drift = drift * 0.85 + gaussian(rnd) * (opts.noise ?? 0.03);
    const weekly = Math.sin(((i % 7) / 7) * Math.PI * 2) * (opts.weekly ?? 0.04);
    out.push({ t: start + i * 86400000, v: opts.base * (1 + (opts.trend ?? 0) * (i / days) + weekly + drift) });
  }
  return out;
}
