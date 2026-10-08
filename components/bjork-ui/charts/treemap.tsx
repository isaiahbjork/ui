"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, roundRectPath } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type ChartPalette,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, damp, withAlpha, mixColor, formatCompact, formatPercent, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";

export interface TreeNode {
  id: string;
  label: string;
  /** Leaf size. Groups sum their children. */
  value?: number;
  /** Optional change, e.g. 0.012 for +1.2%, which drives the diverging colour. */
  change?: number;
  children?: TreeNode[];
}

export interface TreemapProps {
  data: TreeNode;
  /** Current zoom root. Uncontrolled by default. */
  rootId?: string;
  onRootChange?: (id: string) => void;
  /** "change" colours by `change` (accent up, ink down). "value" grades ink by size. */
  colorBy?: "change" | "value";
  /** |change| that reaches full intensity. */
  changeScale?: number;
  formatValue?: (v: number) => string;
  formatChange?: (c: number) => string;
  /** Posed hover leaf id. */
  activeId?: string | null;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Flat {
  node: TreeNode;
  value: number;
  change: number | null;
  parent: string | null;
  depth: number;
}

const BREAD_H = 30;
const HEADER_H = 20;
const GROUP_GAP = 4;
const LEAF_GAP = 2;
const RECT_TAU = 0.13;
const ALPHA_TAU = 0.1;
const MAX_LABELS = 80;
const ATTRACT_STEP_MS = 3200;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
const defaultFormatValue = (v: number) => `$${formatCompact(v, 1)}`;
const defaultFormatChange = (c: number) => formatSigned(c, (n) => formatPercent(n, 1));

function flatten(root: TreeNode): Map<string, Flat> {
  const map = new Map<string, Flat>();
  const walk = (n: TreeNode, parent: string | null, depth: number): { value: number; weighted: number; hasChange: boolean } => {
    let value = 0;
    let weighted = 0;
    let hasChange = n.change !== undefined;
    if (n.children?.length) {
      for (const c of n.children) {
        const r = walk(c, n.id, depth + 1);
        value += r.value;
        weighted += r.weighted;
        hasChange = hasChange || r.hasChange;
      }
    } else {
      value = Math.max(0, n.value ?? 0);
      weighted = value * (n.change ?? 0);
    }
    const change = n.change !== undefined ? n.change : hasChange && value > 0 ? weighted / value : null;
    map.set(n.id, { node: n, value, change, parent, depth });
    return { value, weighted: change !== null ? change * value : 0, hasChange };
  };
  walk(root, null, 0);
  return map;
}

// Squarified treemap (Bruls et al.): rows that keep tiles as close to square as possible.
function squarify(items: { id: string; value: number }[], r: Rect): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!list.length || r.w <= 0 || r.h <= 0) return out;
  const scale = (r.w * r.h) / total;
  let { x, y, w, h } = r;
  let row: { id: string; a: number }[] = [];
  const worst = (rw: { a: number }[], side: number) => {
    const sum = rw.reduce((s, i) => s + i.a, 0);
    let mx = 0;
    let mn = Infinity;
    for (const i of rw) {
      mx = Math.max(mx, i.a);
      mn = Math.min(mn, i.a);
    }
    return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
  };
  const layoutRow = (rw: { id: string; a: number }[]) => {
    const sum = rw.reduce((s, i) => s + i.a, 0);
    if (w >= h) {
      const cw = sum / h;
      let cy = y;
      for (const i of rw) {
        const ch = i.a / cw;
        out.set(i.id, { x, y: cy, w: cw, h: ch });
        cy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = sum / w;
      let cx = x;
      for (const i of rw) {
        const cw = i.a / ch;
        out.set(i.id, { x: cx, y, w: cw, h: ch });
        cx += cw;
      }
      y += ch;
      h -= ch;
    }
  };
  for (const it of list) {
    const a = it.value * scale;
    const side = Math.min(w, h);
    if (!row.length || worst([...row, { a }], side) <= worst(row, side)) row.push({ id: it.id, a });
    else {
      layoutRow(row);
      row = [{ id: it.id, a }];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

interface Tile {
  id: string;
  kind: "leaf" | "group";
  target: Rect;
  r: Rect;
  alpha: number;
  targetAlpha: number;
}

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d / 2, y: r.y + d / 2, w: Math.max(0, r.w - d), h: Math.max(0, r.h - d) };
}

// Maps rect `t` from frame `from` into frame `to`.
function mapRect(t: Rect, from: Rect, to: Rect): Rect {
  const sx = to.w / Math.max(1e-6, from.w);
  const sy = to.h / Math.max(1e-6, from.h);
  return { x: to.x + (t.x - from.x) * sx, y: to.y + (t.y - from.y) * sy, w: t.w * sx, h: t.h * sy };
}

function tileFill(pal: ChartPalette, colorBy: "change" | "value", change: number | null, valueRank: number, scale: number): { fill: string; strong: boolean } {
  if (colorBy === "change" && change !== null) {
    const k = clamp(Math.abs(change) / scale, 0, 1);
    // Capped below full strength: a large tile never becomes a saturated block.
    const a = 0.06 + 0.58 * Math.pow(k, 0.8);
    if (change >= 0) return { fill: mixColor(pal.stage, pal.accent, a), strong: false };
    return { fill: mixColor(pal.stage, pal.text, a * 0.6), strong: false };
  }
  const a = 0.08 + 0.3 * valueRank;
  return { fill: mixColor(pal.stage, pal.text, a), strong: false };
}

interface Run {
  tiles: Map<string, Tile>;
  layoutKey: string;
  plot: Rect;
  hover: string | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  zoomFrom: { id: string; rect: Rect; dir: "in" | "out" } | null;
  labelKey: string[];
  lastInput: number;
  attractAt: number;
}

export function Treemap({
  data,
  rootId: rootProp,
  onRootChange,
  colorBy,
  changeScale = 0.03,
  formatValue = defaultFormatValue,
  formatChange = defaultFormatChange,
  activeId,
  height = 420,
  ariaLabel = "Treemap",
  tone: toneProp,
  attract = false,
  className,
}: TreemapProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelPool = useRef<(HTMLDivElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const flat = useMemo(() => flatten(data), [data]);
  const [rootState, setRootState] = useState(data.id);
  const rootId = rootProp ?? (flat.has(rootState) ? rootState : data.id);
  const mode = colorBy ?? ([...flat.values()].some((f) => f.change !== null) ? "change" : "value");

  // The path from the tree root to the zoom root, for breadcrumbs.
  const path = useMemo(() => {
    const out: Flat[] = [];
    let cur: string | null = rootId;
    while (cur) {
      const f = flat.get(cur);
      if (!f) break;
      out.unshift(f);
      cur = f.parent;
    }
    return out;
  }, [flat, rootId]);

  const cfg = useRef({ flat, rootId, mode, changeScale, reduce, pal, formatValue, formatChange, attract });
  useEffect(() => {
    cfg.current = { flat, rootId, mode, changeScale, reduce, pal, formatValue, formatChange, attract };
  });

  const st = useRef<Run>({
    tiles: new Map(),
    layoutKey: "",
    plot: { x: 0, y: 0, w: 0, h: 0 },
    hover: null,
    source: null,
    zoomFrom: null,
    labelKey: [],
    lastInput: 0,
    attractAt: 0,
  });
  const rootSetter = useRef<(id: string, announce: boolean) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const F = c.flat;
    const plot: Rect = { x: 0, y: BREAD_H, w, h: h - BREAD_H };
    s.plot = plot;

    // Two-level layout of the zoom root: its children as groups, their children as leaves.
    const key = `${c.rootId}|${w}|${h}`;
    if (key !== s.layoutKey) {
      const root = F.get(c.rootId);
      const targets = new Map<string, { r: Rect; kind: "leaf" | "group" }>();
      if (root) {
        const kids = root.node.children ?? [root.node];
        const outer = squarify(
          kids.map((k) => ({ id: k.id, value: F.get(k.id)?.value ?? 0 })),
          plot,
        );
        for (const k of kids) {
          const r = outer.get(k.id);
          if (!r) continue;
          const g = inset(r, GROUP_GAP);
          if (k.children?.length && g.h > HEADER_H + 24 && g.w > 40) {
            targets.set(k.id, { r: g, kind: "group" });
            const body = { x: g.x, y: g.y + HEADER_H, w: g.w, h: g.h - HEADER_H };
            const inner = squarify(
              k.children.map((gc) => ({ id: gc.id, value: F.get(gc.id)?.value ?? 0 })),
              body,
            );
            for (const gc of k.children) {
              const ir = inner.get(gc.id);
              if (ir) targets.set(gc.id, { r: inset(ir, LEAF_GAP), kind: "leaf" });
            }
          } else targets.set(k.id, { r: g, kind: "leaf" });
        }
      }
      const first = !s.layoutKey || c.reduce;
      const zf = s.zoomFrom;
      // Entering tiles start where the zoom implies; leaving tiles fly out the same way.
      for (const [id, t] of targets) {
        const existing = s.tiles.get(id);
        if (existing) {
          existing.target = t.r;
          existing.kind = t.kind;
          existing.targetAlpha = 1;
        } else {
          let start = t.r;
          if (!first && zf) start = zf.dir === "in" ? mapRect(t.r, plot, zf.rect) : mapRect(t.r, zf.rect, plot);
          s.tiles.set(id, { id, kind: t.kind, target: t.r, r: { ...start }, alpha: first ? 1 : 0, targetAlpha: 1 });
        }
      }
      for (const [id, tile] of s.tiles) {
        if (targets.has(id)) continue;
        tile.targetAlpha = 0;
        if (zf) tile.target = zf.dir === "in" ? mapRect(tile.r, zf.rect, plot) : mapRect(tile.r, plot, zf.rect);
      }
      if (first) for (const tile of s.tiles.values()) tile.r = { ...tile.target };
      s.layoutKey = key;
      s.zoomFrom = null;
    }

    let moving = false;
    for (const [id, t] of s.tiles) {
      if (c.reduce) {
        t.r = { ...t.target };
        t.alpha = t.targetAlpha;
      } else {
        t.r.x = damp(t.r.x, t.target.x, RECT_TAU, dt);
        t.r.y = damp(t.r.y, t.target.y, RECT_TAU, dt);
        t.r.w = damp(t.r.w, t.target.w, RECT_TAU, dt);
        t.r.h = damp(t.r.h, t.target.h, RECT_TAU, dt);
        t.alpha = damp(t.alpha, t.targetAlpha, ALPHA_TAU, dt);
        const err = Math.abs(t.r.x - t.target.x) + Math.abs(t.r.y - t.target.y) + Math.abs(t.r.w - t.target.w) + Math.abs(t.r.h - t.target.h);
        if (err > 0.2 || Math.abs(t.alpha - t.targetAlpha) > 0.01) moving = true;
        else {
          t.r = { ...t.target };
          t.alpha = t.targetAlpha;
        }
      }
      if (t.targetAlpha === 0 && t.alpha < 0.01) s.tiles.delete(id);
    }

    // Value rank for "value" colouring, within the current view.
    const leaves = [...s.tiles.values()].filter((t) => t.kind === "leaf");
    const vals = leaves.map((t) => F.get(t.id)?.value ?? 0).sort((a, b) => a - b);
    const rankOf = (v: number) => (vals.length > 1 ? vals.indexOf(v) / (vals.length - 1) : 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, BREAD_H, w, h - BREAD_H);
    ctx.clip();
    const labels: { id: string; r: Rect; strong: boolean; alpha: number; group: boolean }[] = [];
    // Groups first (their header strip), then leaves.
    for (const t of s.tiles.values()) {
      if (t.kind !== "group" || t.alpha < 0.01) continue;
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle = withAlpha(p.text, 0.04);
      ctx.beginPath();
      roundRectPath(ctx, t.r.x, t.r.y, t.r.w, t.r.h, 6, 6);
      ctx.fill();
      labels.push({ id: t.id, r: t.r, strong: false, alpha: t.alpha, group: true });
    }
    for (const t of s.tiles.values()) {
      if (t.kind !== "leaf" || t.alpha < 0.01 || t.r.w < 0.5 || t.r.h < 0.5) continue;
      const f = F.get(t.id);
      const { fill, strong } = tileFill(p, c.mode, f?.change ?? null, rankOf(f?.value ?? 0), c.changeScale);
      const hov = s.hover === t.id;
      ctx.globalAlpha = t.alpha * (s.hover && !hov ? 0.82 : 1);
      ctx.fillStyle = fill;
      ctx.beginPath();
      roundRectPath(ctx, t.r.x, t.r.y, t.r.w, t.r.h, Math.min(4, t.r.w / 2, t.r.h / 2), Math.min(4, t.r.w / 2, t.r.h / 2));
      ctx.fill();
      if (hov) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.text;
        ctx.stroke();
      }
      labels.push({ id: t.id, r: t.r, strong, alpha: t.alpha, group: false });
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Labels: name and value inside the tile, only when they fit (Geist Mono advance ~0.6em).
    for (let k = 0; k < MAX_LABELS; k++) {
      const el = labelPool.current[k];
      if (!el) continue;
      const L = labels[k];
      if (!L) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        continue;
      }
      const f = F.get(L.id);
      if (!f) continue;
      const name = f.node.label;
      const val = c.mode === "change" && f.change !== null ? c.formatChange(f.change) : c.formatValue(f.value);
      const roomW = L.r.w - 12;
      const nameFits = name.length * 6.6 <= roomW && L.r.h >= (L.group ? 16 : 22);
      const valFits = !L.group && val.length * 6.6 <= roomW && L.r.h >= 40;
      const groupVal = L.group && (name.length + val.length + 2) * 6.4 <= roomW;
      const textKey = `${L.id}|${nameFits}|${valFits}|${groupVal}|${val}|${L.strong}|${L.group}`;
      if (s.labelKey[k] !== textKey) {
        s.labelKey[k] = textKey;
        const [a, b] = el.children as unknown as HTMLElement[];
        a.textContent = nameFits ? name : "";
        b.textContent = (L.group ? groupVal : valFits) ? val : "";
        el.dataset.strong = L.strong ? "1" : "0";
        el.dataset.group = L.group ? "1" : "0";
      }
      el.style.opacity = String(nameFits ? clamp((L.alpha - 0.5) * 2, 0, 1) : 0);
      el.style.transform = `translate3d(${(L.r.x + 7).toFixed(1)}px, ${(L.r.y + (L.group ? 5 : 8)).toFixed(1)}px, 0)`;
      el.style.maxWidth = `${Math.max(0, L.r.w - 12).toFixed(0)}px`;
    }

    const tip = tipRef.current;
    const ht = s.hover ? s.tiles.get(s.hover) : null;
    if (tip?.el && ht) {
      const pos = placeTooltip(ht.r.x + ht.r.w / 2, ht.r.y + Math.min(ht.r.h / 2, 30), tip.size.w, tip.size.h, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    // Attract: zoom into each group in turn, then back out.
    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        const top = F.get(data.id)?.node.children ?? [];
        const groupsOnly = top.filter((g) => g.children?.length);
        if (c.rootId !== data.id) rootSetter.current(data.id, false);
        else if (groupsOnly.length) rootSetter.current(groupsOnly[Math.floor((s.attractAt / ATTRACT_STEP_MS) % groupsOnly.length)].id, false);
      }
      return true;
    }
    return moving;
  });

  const valueOf = (id: string) => flat.get(id)?.value ?? 0;

  const tooltipFor = (id: string): TooltipContent | null => {
    const f = flat.get(id);
    if (!f) return null;
    const parent = f.parent ? flat.get(f.parent) : null;
    return {
      key: `${id}|${pal.text}`,
      title: parent && parent.node.id !== data.id ? parent.node.label : undefined,
      rows: [
        { key: "v", label: f.node.label, value: formatValue(f.value) },
        ...(parent ? [{ key: "s", label: `of ${parent.node.label}`, value: formatPercent(f.value / Math.max(1e-12, parent.value), 1), strong: false }] : []),
        ...(f.change !== null ? [{ key: "c", label: "Change", value: formatChange(f.change), color: f.change >= 0 ? pal.accent : pal.textMuted }] : []),
      ],
    };
  };

  const setHover = (id: string | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover === id && s.source === source) return;
    s.hover = id;
    s.source = id === null ? null : source;
    tipRef.current?.set(id === null ? null : tooltipFor(id));
    if (id && source === "keyboard") {
      const f = flat.get(id);
      if (f) announcer.current?.say(`${f.node.label}: ${formatValue(f.value)}${f.change !== null ? `, ${formatChange(f.change)}` : ""}`);
    }
    wake();
  };

  const setRoot = (id: string, announce = true) => {
    const s = st.current;
    const f = flat.get(id);
    if (!f || id === rootId) return;
    const target = f.node.children?.length ? id : (f.parent ?? data.id);
    if (target === rootId) return;
    // Zoom in when the target is inside the current view, out otherwise.
    const tile = s.tiles.get(target);
    if (tile) s.zoomFrom = { id: target, rect: { ...tile.r }, dir: "in" };
    else {
      // Zooming out: the current root becomes a tile of the new layout; animate from the full plot into it.
      s.zoomFrom = { id: rootId, rect: s.plot, dir: "out" };
    }
    if (rootProp === undefined) setRootState(target);
    onRootChange?.(target);
    setHover(null, null);
    if (announce) announcer.current?.say(`${flat.get(target)?.node.label ?? ""}, ${formatValue(valueOf(target))}`);
    wake();
  };
  useEffect(() => {
    rootSetter.current = setRoot;
  });

  // Zooming out needs the old root's rect in the new layout, known only after layout. Patch it in the loop:
  // the "out" zoom maps from the full plot into wherever the old root lands.
  useEffect(() => {
    const s = st.current;
    if (s.zoomFrom?.dir === "out") {
      // Compute where the old root lands at the new zoom root, using the same layout as the loop.
      const root = flat.get(rootId);
      const kids = root?.node.children ?? [];
      const outer = squarify(
        kids.map((k) => ({ id: k.id, value: flat.get(k.id)?.value ?? 0 })),
        s.plot,
      );
      const r = outer.get(s.zoomFrom.id);
      if (r) s.zoomFrom.rect = inset(r, GROUP_GAP);
    }
    wake();
  }, [rootId, flat, wake]);

  useEffect(() => {
    st.current.layoutKey = "";
    wake();
  }, [data, wake]);

  useEffect(() => {
    wake();
  }, [mode, changeScale, pal, reduce, attract, wake]);

  useEffect(() => {
    if (activeId === undefined) return;
    setHover(activeId, activeId ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const hitTest = (x: number, y: number): { leaf: string | null; group: string | null } => {
    const s = st.current;
    let leaf: string | null = null;
    let group: string | null = null;
    for (const t of s.tiles.values()) {
      if (t.targetAlpha < 1) continue;
      const inside = x >= t.r.x - 1 && x <= t.r.x + t.r.w + 1 && y >= t.r.y - 1 && y <= t.r.y + t.r.h + 1;
      if (!inside) continue;
      if (t.kind === "leaf") leaf = t.id;
      else group = t.id;
    }
    return { leaf, group };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { leaf } = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    setHover(leaf, "pointer");
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { leaf, group } = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    const target = group ?? leaf;
    if (target) setRoot(target);
  };

  // Arrow keys move to the nearest leaf whose centre lies in that direction.
  const moveFocus = (dir: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown") => {
    const s = st.current;
    const leaves = [...s.tiles.values()].filter((t) => t.kind === "leaf" && t.targetAlpha === 1);
    if (!leaves.length) return;
    const cur = s.hover ? s.tiles.get(s.hover) : null;
    if (!cur) {
      const first = leaves.sort((a, b) => a.target.y - b.target.y || a.target.x - b.target.x)[0];
      setHover(first.id, "keyboard");
      return;
    }
    const cx = cur.target.x + cur.target.w / 2;
    const cy = cur.target.y + cur.target.h / 2;
    let best: Tile | null = null;
    let bd = Infinity;
    for (const t of leaves) {
      if (t.id === cur.id) continue;
      const dx = t.target.x + t.target.w / 2 - cx;
      const dy = t.target.y + t.target.h / 2 - cy;
      const along = dir === "ArrowRight" ? dx : dir === "ArrowLeft" ? -dx : dir === "ArrowDown" ? dy : -dy;
      const across = dir === "ArrowRight" || dir === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
      if (along <= 1) continue;
      const d = along + across * 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (best) setHover(best.id, "keyboard");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(e.key);
    } else if (e.key === "Enter" || e.key === " ") {
      if (!s.hover) return;
      e.preventDefault();
      const f = flat.get(s.hover);
      // A leaf zooms to its group; at the deepest level Enter does nothing.
      const target = f?.node.children?.length ? s.hover : (f?.parent ?? null);
      if (target && target !== rootId) setRoot(target);
    } else if (e.key === "Escape" || e.key === "Backspace") {
      const parent = flat.get(rootId)?.parent;
      if (!parent) return;
      e.preventDefault();
      setRoot(parent);
    }
  };

  const tableRows = useMemo(() => {
    const rows: (string | number)[][] = [];
    for (const f of flat.values()) {
      if (f.node.children?.length) continue;
      const parent = f.parent ? flat.get(f.parent)?.node.label ?? "" : "";
      rows.push([f.node.label, parent, formatValue(f.value), f.change !== null ? formatChange(f.change) : ""]);
    }
    return rows;
  }, [flat, formatValue, formatChange]);
  const tableCols = useMemo(() => ["Item", "Group", "Value", "Change"], []);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      {/* Breadcrumbs: real buttons outside the plot's key handling. */}
      <nav aria-label="Treemap level" className="absolute left-0 top-0 z-10 flex h-[22px] items-center gap-1 font-bjork-alpha text-[12px] font-medium leading-none">
        {path.map((f, i) => {
          const last = i === path.length - 1;
          return (
            <span key={f.node.id} className="inline-flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="text-[color:var(--bjork-text-faint)]">
                  /
                </span>
              )}
              <button
                type="button"
                disabled={last}
                aria-current={last ? "location" : undefined}
                onClick={() => setRoot(f.node.id)}
                className={cn(
                  "rounded-[6px] px-1.5 py-1 transition-[background-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] active:scale-[0.97]",
                  last ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                )}
              >
                {f.node.label}
              </button>
            </span>
          );
        })}
        <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-soft)]">{formatValue(path[path.length - 1]?.value ?? 0)}</span>
      </nav>
      {mode === "change" && (
        <div aria-hidden="true" className="absolute right-0 top-[5px] flex items-center gap-1.5 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]">
          <span className="[text-box:trim-both_cap_alphabetic]">{formatChange(-changeScale)}</span>
          <span
            className="inline-block h-[6px] w-20 rounded-full"
            style={{ background: `linear-gradient(90deg, ${mixColor(pal.stage, pal.text, 0.38)}, ${mixColor(pal.stage, pal.text, 0.04)} 50%, ${mixColor(pal.stage, pal.accent, 0.06)} 50%, ${mixColor(pal.stage, pal.accent, 0.64)})` }}
          />
          <span className="[text-box:trim-both_cap_alphabetic]">{formatChange(changeScale)}</span>
        </div>
      )}
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move between tiles, Enter zooms into a group, Escape zooms out.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onPointerLeave={() => setHover(null, null)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-x-0 bottom-0 cursor-pointer touch-pan-y rounded-[10px]", chartFocusRing)}
        style={{ top: 0 }}
      >
        <div ref={hostRef} className="pointer-events-none absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={`${ariaLabel}: ${path.map((f) => f.node.label).join(" / ")}, ${formatValue(path[path.length - 1]?.value ?? 0)}`} className="pointer-events-none absolute left-0 top-0" />
        </div>
        {Array.from({ length: MAX_LABELS }).map((_, k) => (
          <div
            key={k}
            ref={(el) => {
              labelPool.current[k] = el;
            }}
            aria-hidden="true"
            className="group/t pointer-events-none absolute left-0 top-0 flex flex-col gap-[5px] overflow-hidden opacity-0 data-[group=1]:flex-row data-[group=1]:items-baseline data-[group=1]:gap-2"
          >
            <span className="truncate font-bjork-alpha text-[12px] font-medium leading-[14px] text-[color:var(--bjork-text)] group-data-[group=1]/t:text-[11px] group-data-[group=1]/t:uppercase group-data-[group=1]/t:tracking-[0.06em] group-data-[group=1]/t:text-[color:var(--bjork-text-muted)] group-data-[strong=1]/t:text-[color:var(--bjork-accent-foreground)]" />
            <span className="truncate font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-medium)] [text-box:trim-both_cap_alphabetic] group-data-[strong=1]/t:text-[color:var(--bjork-accent-foreground)]" />
          </div>
        ))}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
