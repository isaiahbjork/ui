"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, damp, withAlpha, formatCompact, formatPercent } from "@/components/bjork-ui/charts/_kit/scale";

export interface SankeyNode {
  id: string;
  label: string;
  /** Column index. Inferred from the longest path when omitted. */
  column?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyFlowProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Pinned node id, drawn with its whole path traced. Uncontrolled by default. */
  highlightId?: string | null;
  defaultHighlightId?: string | null;
  onHighlightChange?: (id: string | null) => void;
  /** Marching dashes along every link. */
  flow?: boolean;
  nodeWidth?: number;
  nodeGap?: number;
  formatValue?: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

interface LNode {
  id: string;
  label: string;
  col: number;
  value: number;
  inValue: number;
  outValue: number;
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  inLinks: number[];
  outLinks: number[];
}

interface LLink {
  source: number;
  target: number;
  value: number;
  sy0: number;
  ty0: number;
  w: number;
}

const PAD_Y = 8;
const LABEL_ROOM = 120;
const ENTER_MS = 1000;
const TRACE_TAU = 0.08;
const ATTRACT_STEP_MS = 2200;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatCompact(v, 1);

// Layout: columns by longest path, value-scaled heights, a few relaxation passes, then link offsets.
function layoutSankey(nodes: SankeyNode[], links: SankeyLink[], w: number, h: number, nodeW: number, gap: number): { N: LNode[]; L: LLink[] } {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const N: LNode[] = nodes.map((n) => ({ id: n.id, label: n.label, col: n.column ?? -1, value: 0, inValue: 0, outValue: 0, y0: 0, y1: 0, x0: 0, x1: 0, inLinks: [], outLinks: [] }));
  const L: LLink[] = [];
  links.forEach((l) => {
    const s = idx.get(l.source);
    const t = idx.get(l.target);
    if (s === undefined || t === undefined || !(l.value > 0)) return;
    L.push({ source: s, target: t, value: l.value, sy0: 0, ty0: 0, w: 0 });
    N[s].outLinks.push(L.length - 1);
    N[t].inLinks.push(L.length - 1);
    N[s].outValue += l.value;
    N[t].inValue += l.value;
  });
  for (const n of N) n.value = Math.max(n.inValue, n.outValue);
  // Columns: longest path from any source, unless given.
  const depth = (i: number, seen: Set<number>): number => {
    if (N[i].col >= 0) return N[i].col;
    if (seen.has(i)) return 0;
    seen.add(i);
    let d = 0;
    for (const li of N[i].inLinks) d = Math.max(d, depth(L[li].source, seen) + 1);
    return d;
  };
  N.forEach((n, i) => {
    if (n.col < 0) n.col = depth(i, new Set());
  });
  const cols = Math.max(0, ...N.map((n) => n.col)) + 1;
  const byCol: number[][] = Array.from({ length: cols }, () => []);
  N.forEach((n, i) => byCol[n.col].push(i));
  const innerW = w - LABEL_ROOM;
  N.forEach((n) => {
    n.x0 = cols > 1 ? (n.col / (cols - 1)) * (innerW - nodeW) : 0;
    n.x1 = n.x0 + nodeW;
  });
  // The last column's labels sit on the left; shift so the plot keeps its label room on the right.
  const top = PAD_Y;
  const bottom = h - PAD_Y;
  const ky = Math.min(...byCol.filter((c) => c.length).map((c) => (bottom - top - (c.length - 1) * gap) / Math.max(1e-9, c.reduce((s, i) => s + N[i].value, 0))));
  for (const c of byCol) {
    let y = top;
    for (const i of c) {
      N[i].y0 = y;
      N[i].y1 = y + N[i].value * ky;
      y = N[i].y1 + gap;
    }
  }
  for (const l of L) l.w = l.value * ky;
  const centre = (i: number) => (N[i].y0 + N[i].y1) / 2;
  const resolve = (c: number[]) => {
    c.sort((a, b) => N[a].y0 - N[b].y0);
    let y = top;
    for (const i of c) {
      const dy = y - N[i].y0;
      if (dy > 0) {
        N[i].y0 += dy;
        N[i].y1 += dy;
      }
      y = N[i].y1 + gap;
    }
    let over = y - gap - bottom;
    if (over > 0) {
      for (let k = c.length - 1; k >= 0; k--) {
        const i = c[k];
        N[i].y0 -= over;
        N[i].y1 -= over;
        over = N[i].y0 - gap - (k > 0 ? N[c[k - 1]].y1 : top);
        if (over >= 0) break;
        over = -over;
      }
    }
  };
  for (let iter = 0, alpha = 1; iter < 24; iter++, alpha *= 0.94) {
    const forward = iter % 2 === 0;
    const order = forward ? byCol.slice(1) : byCol.slice(0, -1).reverse();
    for (const c of order) {
      for (const i of c) {
        const rel = forward ? N[i].inLinks : N[i].outLinks;
        let sw = 0;
        let sy = 0;
        for (const li of rel) {
          const other = forward ? L[li].source : L[li].target;
          sw += L[li].value;
          sy += centre(other) * L[li].value;
        }
        if (!sw) continue;
        const dy = (sy / sw - centre(i)) * alpha * 0.5;
        N[i].y0 += dy;
        N[i].y1 += dy;
      }
      resolve(c);
    }
  }
  // Link offsets: ordered by the far end's position, so ribbons do not cross at the node.
  for (const n of N) {
    n.outLinks.sort((a, b) => N[L[a].target].y0 - N[L[b].target].y0);
    n.inLinks.sort((a, b) => N[L[a].source].y0 - N[L[b].source].y0);
    let y = n.y0 + (n.y1 - n.y0 - n.outValue * ky) / 2;
    for (const li of n.outLinks) {
      L[li].sy0 = y;
      y += L[li].w;
    }
    y = n.y0 + (n.y1 - n.y0 - n.inValue * ky) / 2;
    for (const li of n.inLinks) {
      L[li].ty0 = y;
      y += L[li].w;
    }
  }
  return { N, L };
}

function ribbon(l: LLink, N: LNode[]): Path2D {
  const s = N[l.source];
  const t = N[l.target];
  const x0 = s.x1;
  const x1 = t.x0;
  const xm = (x0 + x1) / 2;
  const p = new Path2D();
  p.moveTo(x0, l.sy0);
  p.bezierCurveTo(xm, l.sy0, xm, l.ty0, x1, l.ty0);
  p.lineTo(x1, l.ty0 + l.w);
  p.bezierCurveTo(xm, l.ty0 + l.w, xm, l.sy0 + l.w, x0, l.sy0 + l.w);
  p.closePath();
  return p;
}

// Every link upstream and downstream of a node (or a link), for path tracing.
function tracePath(N: LNode[], L: LLink[], from: { node?: number; link?: number }): Set<number> {
  const out = new Set<number>();
  const up = (i: number) => {
    for (const li of N[i].inLinks) {
      if (out.has(li)) continue;
      out.add(li);
      up(L[li].source);
    }
  };
  const down = (i: number) => {
    for (const li of N[i].outLinks) {
      if (out.has(li)) continue;
      out.add(li);
      down(L[li].target);
    }
  };
  if (from.node !== undefined) {
    up(from.node);
    down(from.node);
  } else if (from.link !== undefined) {
    out.add(from.link);
    up(L[from.link].source);
    down(L[from.link].target);
  }
  return out;
}

interface Run {
  key: string;
  N: LNode[];
  L: LLink[];
  paths: Path2D[];
  w: Float32Array; // displayed trace weight per link
  enter: number;
  hover: { node?: number; link?: number } | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  dash: number;
  lastInput: number;
  attractAt: number;
}

export function SankeyFlow({
  nodes,
  links,
  highlightId: highlightProp,
  defaultHighlightId = null,
  onHighlightChange,
  flow = false,
  nodeWidth = 10,
  nodeGap = 14,
  formatValue = defaultFormatValue,
  height = 380,
  ariaLabel = "Flow diagram",
  tone: toneProp,
  attract = false,
  className,
}: SankeyFlowProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [hlState, setHlState] = useState<string | null>(defaultHighlightId);
  const highlightId = highlightProp !== undefined ? highlightProp : hlState;

  const cfg = useRef({ nodes, links, highlightId, flow, nodeWidth, nodeGap, reduce, pal, attract, formatValue });
  useEffect(() => {
    cfg.current = { nodes, links, highlightId, flow, nodeWidth, nodeGap, reduce, pal, attract, formatValue };
  });

  const st = useRef<Run>({ key: "", N: [], L: [], paths: [], w: new Float32Array(0), enter: 0, hover: null, source: null, dash: 0, lastInput: 0, attractAt: 0 });
  const hoverRef = useRef<(h: Run["hover"], source: Run["source"]) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const key = `${w}|${h}|${c.nodes.length}|${c.links.length}|${c.nodeWidth}|${c.nodeGap}|${c.links.map((l) => l.value).join(",")}`;
    if (key !== s.key) {
      const lay = layoutSankey(c.nodes, c.links, w, h, c.nodeWidth, c.nodeGap);
      s.N = lay.N;
      s.L = lay.L;
      s.paths = lay.L.map((l) => ribbon(l, lay.N));
      if (s.w.length !== lay.L.length) s.w = new Float32Array(lay.L.length);
      s.key = key;
    }
    const { N, L } = s;

    // Which links are traced: hover beats the pinned node.
    const hlNode = c.highlightId ? N.findIndex((n) => n.id === c.highlightId) : -1;
    const focus = s.hover ?? (hlNode >= 0 ? { node: hlNode } : null);
    const traced = focus ? tracePath(N, L, focus) : null;
    let moving = false;
    for (let i = 0; i < L.length; i++) {
      const target = traced ? (traced.has(i) ? 1 : -1) : 0;
      s.w[i] = c.reduce ? target : damp(s.w[i], target, TRACE_TAU, dt);
      if (Math.abs(s.w[i] - target) > 0.01) moving = true;
      else s.w[i] = target;
    }

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const reveal = easeOut(s.enter);
    const maxX = Math.max(1, ...N.map((n) => n.x1));

    // Links, revealed left to right.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, maxX * reveal + 2, h);
    ctx.clip();
    for (let i = 0; i < L.length; i++) {
      // Weight 1 is traced (accent), 0 is neutral ink, -1 is dimmed while something else is traced.
      const wgt = s.w[i];
      if (wgt > 0) {
        ctx.fillStyle = withAlpha(p.text, 0.09 * (1 - wgt));
        ctx.fill(s.paths[i]);
        ctx.fillStyle = withAlpha(p.accent, 0.5 * wgt);
      } else ctx.fillStyle = withAlpha(p.text, 0.09 + 0.055 * wgt);
      ctx.fill(s.paths[i]);
    }
    // Marching dashes along each link's centre line.
    if (c.flow && !c.reduce) {
      s.dash = (s.dash + dt * 28) % 1000;
      ctx.setLineDash([2, 10]);
      ctx.lineDashOffset = -s.dash;
      ctx.lineCap = "round";
      for (let i = 0; i < L.length; i++) {
        const l = L[i];
        const sN = N[l.source];
        const tN = N[l.target];
        const y0 = l.sy0 + l.w / 2;
        const y1 = l.ty0 + l.w / 2;
        const xm = (sN.x1 + tN.x0) / 2;
        ctx.beginPath();
        ctx.moveTo(sN.x1, y0);
        ctx.bezierCurveTo(xm, y0, xm, y1, tN.x0, y1);
        ctx.lineWidth = Math.min(2, Math.max(1, l.w * 0.25));
        ctx.strokeStyle = s.w[i] > 0 ? withAlpha(p.accentInk, 0.8) : withAlpha(p.text, s.w[i] < 0 ? 0.15 : 0.35);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Nodes grow out of their centre, column by column.
    const maxCol = Math.max(1, ...N.map((m) => m.col));
    for (let i = 0; i < N.length; i++) {
      const n = N[i];
      const k = clamp((s.enter - (n.col / maxCol) * 0.5) / 0.5, 0, 1);
      const g = easeOut(k);
      const cy = (n.y0 + n.y1) / 2;
      const hh = (n.y1 - n.y0) * g;
      const on = focus && (focus.node === i || (traced && [...n.inLinks, ...n.outLinks].some((li) => traced.has(li))));
      const pinned = i === hlNode;
      ctx.fillStyle = pinned || focus?.node === i ? p.accent : focus && !on ? withAlpha(p.text, 0.3) : withAlpha(p.text, 0.78);
      ctx.beginPath();
      ctx.roundRect(n.x0, cy - hh / 2, n.x1 - n.x0, Math.max(1, hh), 2);
      ctx.fill();
      const el = labelRefs.current[i];
      if (el) {
        el.style.opacity = String(clamp((k - 0.4) / 0.6, 0, 1) * (focus && !on ? 0.45 : 1));
        el.style.transform = `translate3d(${(n.x1 + 8).toFixed(1)}px, ${cy.toFixed(1)}px, 0) translateY(-50%)`;
      }
    }

    const tip = tipRef.current;
    if (tip?.el && s.hover) {
      let ax = 0;
      let ay = 0;
      if (s.hover.node !== undefined) {
        const n = N[s.hover.node];
        ax = n.x1;
        ay = n.y0;
      } else if (s.hover.link !== undefined) {
        const l = L[s.hover.link];
        ax = (N[l.source].x1 + N[l.target].x0) / 2;
        ay = (l.sy0 + l.ty0) / 2;
      }
      const pos = placeTooltip(ax, ay, tip.size.w, tip.size.h, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    if (c.attract && !c.reduce && N.length && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        const cur = s.hover?.node ?? -1;
        hoverRef.current({ node: (cur + 1) % N.length }, "attract");
      }
      return true;
    }
    return moving || s.enter < 1 || (c.flow && !c.reduce);
  });

  const totals = useMemo(() => {
    const out = new Map<string, { in: number; out: number }>();
    for (const n of nodes) out.set(n.id, { in: 0, out: 0 });
    for (const l of links) {
      const a = out.get(l.source);
      const b = out.get(l.target);
      if (a) a.out += l.value;
      if (b) b.in += l.value;
    }
    return out;
  }, [nodes, links]);

  const tooltipFor = (hv: NonNullable<Run["hover"]>): TooltipContent | null => {
    const s = st.current;
    if (hv.node !== undefined) {
      const n = s.N[hv.node];
      if (!n) return null;
      const t = totals.get(n.id);
      return {
        key: `n${hv.node}|${pal.text}`,
        title: n.label,
        rows: [
          ...(t && t.in ? [{ key: "in", label: "In", value: formatValue(t.in) }] : []),
          ...(t && t.out ? [{ key: "out", label: "Out", value: formatValue(t.out) }] : []),
          ...(t && t.in && t.out && t.in > t.out ? [{ key: "drop", label: "Drop-off", value: formatPercent(1 - t.out / t.in, 0), strong: false }] : []),
        ],
      };
    }
    const l = s.L[hv.link ?? -1];
    if (!l) return null;
    const src = s.N[l.source];
    const share = l.value / Math.max(1e-12, src.outValue || src.value);
    return {
      key: `l${hv.link}|${pal.text}`,
      title: `${src.label} → ${s.N[l.target].label}`,
      rows: [
        { key: "v", label: "Flow", value: formatValue(l.value), color: pal.accent },
        { key: "s", label: `of ${src.label}`, value: formatPercent(share, 0), strong: false },
      ],
    };
  };

  const setHover = (hv: Run["hover"], source: Run["source"]) => {
    const s = st.current;
    const same = (!hv && !s.hover) || (hv && s.hover && hv.node === s.hover.node && hv.link === s.hover.link);
    s.hover = hv;
    s.source = hv ? source : null;
    if (!same) {
      tipRef.current?.set(hv ? tooltipFor(hv) : null);
      if (hv?.node !== undefined && source === "keyboard") {
        const n = s.N[hv.node];
        const t = totals.get(n.id);
        announcer.current?.say(`${n.label}${t?.in ? `, in ${formatValue(t.in)}` : ""}${t?.out ? `, out ${formatValue(t.out)}` : ""}`);
      }
    }
    wake();
  };
  useEffect(() => {
    hoverRef.current = setHover;
  });

  useEffect(() => {
    wake();
  }, [nodes, links, highlightId, flow, nodeWidth, nodeGap, pal, reduce, attract, wake]);

  const hitTest = (x: number, y: number): Run["hover"] => {
    const s = st.current;
    for (let i = 0; i < s.N.length; i++) {
      const n = s.N[i];
      if (x >= n.x0 - 4 && x <= n.x1 + 4 && y >= n.y0 - 2 && y <= n.y1 + 2) return { node: i };
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    // Last drawn wins: test in reverse so the topmost ribbon is picked.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = s.paths.length - 1; i >= 0; i--) {
      if (ctx.isPointInPath(s.paths[i], x, y)) {
        ctx.restore();
        return { link: i };
      }
    }
    ctx.restore();
    return null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(hitTest(e.clientX - rect.left, e.clientY - rect.top), "pointer");
  };

  const pin = (id: string | null) => {
    if (highlightProp === undefined) setHlState(id);
    onHighlightChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const N = s.N;
    if (!N.length) return;
    const cur = s.hover?.node ?? -1;
    const byCol = (col: number) =>
      N.map((n, i) => ({ n, i }))
        .filter((x) => x.n.col === col)
        .sort((a, b) => a.n.y0 - b.n.y0)
        .map((x) => x.i);
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (cur < 0) {
        setHover({ node: byCol(0)[0] ?? 0 }, "keyboard");
        return;
      }
      const n = N[cur];
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const col = byCol(n.col);
        const k = col.indexOf(cur);
        setHover({ node: col[clamp(k + (e.key === "ArrowDown" ? 1 : -1), 0, col.length - 1)] }, "keyboard");
      } else {
        const maxCol = Math.max(...N.map((m) => m.col));
        const nc = clamp(n.col + (e.key === "ArrowRight" ? 1 : -1), 0, maxCol);
        const col = byCol(nc);
        const cy = (n.y0 + n.y1) / 2;
        const best = col.reduce((b, i) => (Math.abs((N[i].y0 + N[i].y1) / 2 - cy) < Math.abs((N[b].y0 + N[b].y1) / 2 - cy) ? i : b), col[0]);
        setHover({ node: best }, "keyboard");
      }
    } else if ((e.key === "Enter" || e.key === " ") && cur >= 0) {
      e.preventDefault();
      const id = N[cur].id;
      pin(highlightId === id ? null : id);
      announcer.current?.say(highlightId === id ? "Unpinned" : `${N[cur].label} pinned`);
    } else if (e.key === "Escape") setHover(null, null);
  };

  const tableRows = useMemo(() => {
    const label = new Map(nodes.map((n) => [n.id, n.label]));
    return links.map((l) => [label.get(l.source) ?? l.source, label.get(l.target) ?? l.target, formatValue(l.value)]);
  }, [nodes, links, formatValue]);
  const tableCols = useMemo(() => ["From", "To", "Value"], []);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move between nodes, Enter pins a node and traces its path.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onClick={() => {
          const s = st.current;
          if (s.hover?.node === undefined) return;
          const id = s.N[s.hover.node].id;
          pin(highlightId === id ? null : id);
        }}
        onPointerLeave={() => setHover(null, null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-pointer touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={`${ariaLabel}: ${nodes.length} nodes, ${links.length} flows`} className="pointer-events-none absolute left-0 top-0" />
        </div>
        {nodes.map((n, i) => {
          const t = totals.get(n.id);
          const v = Math.max(t?.in ?? 0, t?.out ?? 0);
          return (
            <span
              key={n.id}
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 flex flex-col gap-[3px] whitespace-nowrap opacity-0 [text-shadow:0_0_2px_var(--bjork-chart-bg),0_0_6px_var(--bjork-chart-bg),0_0_10px_var(--bjork-chart-bg)]"
            >
              <span className="font-bjork-alpha text-[12px] font-medium leading-[14px] text-[color:var(--bjork-text)]">{n.label}</span>
              <span className="font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">{formatValue(v)}</span>
            </span>
          );
        })}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
