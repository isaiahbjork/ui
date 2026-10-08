"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { hashString } from "@/components/bjork-ui/_core/random";

export type RouteStatus = "ok" | "degraded" | "down";

export interface RouteNode {
  id: string;
  label: string;
  sublabel?: string;
  col: number;
  row: number;
  status?: RouteStatus;
}

export interface RouteEdge {
  from: string;
  to: string;
  throughput: number;
  status?: RouteStatus;
}

export interface RouteTraceProps {
  nodes: RouteNode[];
  edges: RouteEdge[];
  cell?: { w: number; h: number };
  cornerRadius?: number;
  speed?: number;
  selectedId?: string;
  onNodeSelect?: (id: string) => void;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  /** Pins the packets at their phase offsets and stops the attract loop. Used for posed previews. */
  frozen?: boolean;
  className?: string;
}

export interface RouteGeometry {
  key: string;
  from: string;
  to: string;
  d: string;
  length: number;
}

export interface RoutePin {
  id: string;
  side: "in" | "out";
  y: number;
}

interface Pt {
  x: number;
  y: number;
}

interface Cell {
  w: number;
  h: number;
}

interface Resolved {
  nodes: RouteNode[];
  byId: Map<string, RouteNode>;
  centres: Map<string, Pt>;
}

const DEFAULT_CELL: Cell = { w: 140, h: 88 };
const NODE_HALF_W = 48;
const NODE_HALF_H = 20;
const PIN_SPACING = 8;
const LANE_SPACING = 6;
const PAD = 24;
const MIN_SCALE = 0.84; // a 12px label stays at 10px or more
const MAX_SCALE = 1.25;
const PACKET_SPEED = 80;
const MIN_PACKET_GAP = 4;
const MAX_PACKETS = 4;
const ATTRACT_TICK_MS = 250;
const ATTRACT_PERIOD_MS = 5000;
const ATTRACT_DOWN_MS = 2500;
const ATTRACT_IDLE_MS = 4000;
const ATTRACT_DRIFT = 0.1;
const DIM_EDGE = 0.4;
const DIM_NODE = 0.6;
const DOWN_EDGE = 0.35;

const STATUS_WORD: Record<RouteStatus, string> = { ok: "healthy", degraded: "degraded", down: "down" };
const ARROW_DIRS: Record<string, Pt> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};
// Hair at 1.8x alpha for the trace, and a 0.05 alpha underlay for the active glow.
const TRACE_COLOUR: Record<BjorkTone, { trace: string; glow: string }> = {
  dark: { trace: "rgba(237,237,237,0.22)", glow: "rgba(237,237,237,0.05)" },
  light: { trace: "rgba(23,23,23,0.22)", glow: "rgba(23,23,23,0.05)" },
};

const ROUTE_CSS = `
@keyframes bjork-route-packet {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: calc(-1 * var(--rt-len, 0)); }
}
[data-route-trace][data-loop="paused"] .bjork-route-packet { animation-play-state: paused !important; }
`;

const fmt = (n: number) => String(Math.round(n * 100) / 100);
// Snap to the half pixel so 1.5px strokes sit on a crisp centre line.
const snap = (v: number) => Math.round(v - 0.5) + 0.5;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const edgeKey = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

const subscribeNoop = () => () => {};

// False on the server and during hydration, so reduced-motion styles never cause a mismatch.
function useHasMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

// Called only from event handlers, never during render.
function stampInput(ref: { current: number }) {
  ref.current = performance.now();
}

function devWarn(message: string) {
  if (process.env.NODE_ENV !== "production") console.warn(`RouteTrace: ${message}`);
}

function devError(message: string) {
  if (process.env.NODE_ENV !== "production") console.error(`RouteTrace: ${message}`);
}

function resolveNodes(input: RouteNode[], cell: Cell): Resolved {
  const nodes: RouteNode[] = [];
  const byId = new Map<string, RouteNode>();
  const centres = new Map<string, Pt>();
  const cells = new Map<string, string>();

  for (const n of input) {
    const cellKey = `${n.col},${n.row}`;
    const clash = cells.get(cellKey);
    if (clash) {
      devError(`"${n.id}" shares cell ${cellKey} with "${clash}". Only the first is rendered.`);
      continue;
    }
    if (byId.has(n.id)) {
      devError(`duplicate node id "${n.id}". Only the first is rendered.`);
      continue;
    }
    cells.set(cellKey, n.id);
    byId.set(n.id, n);
    nodes.push(n);
    centres.set(n.id, { x: n.col * cell.w + cell.w / 2, y: n.row * cell.h + cell.h / 2 });
  }

  return { nodes, byId, centres };
}

// Removes duplicate and collinear points, then fillets every corner with an arc.
// Every command is M, H, V or A.
function orthoPath(points: Pt[], radius: number): { d: string; length: number } {
  const dedup: Pt[] = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) dedup.push(p);
  }

  const pts: Pt[] = [];
  for (let i = 0; i < dedup.length; i++) {
    const p = dedup[i];
    if (i > 0 && i < dedup.length - 1) {
      const a = dedup[i - 1];
      const b = dedup[i + 1];
      const straight =
        (Math.abs(a.x - p.x) < 0.01 && Math.abs(p.x - b.x) < 0.01) ||
        (Math.abs(a.y - p.y) < 0.01 && Math.abs(p.y - b.y) < 0.01);
      if (straight) continue;
    }
    pts.push(p);
  }

  if (pts.length < 2) return { d: "", length: 0 };

  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  const unit = (a: Pt, b: Pt) => {
    const len = dist(a, b) || 1;
    return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  };
  const lineTo = (a: Pt, b: Pt) =>
    Math.abs(a.y - b.y) < 0.01 ? `H${fmt(b.x)}` : `V${fmt(b.y)}`;

  let d = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  let pen = pts[0];
  let length = 0;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (i === pts.length - 1) {
      d += lineTo(pen, p);
      length += dist(pen, p);
      break;
    }
    const prev = pts[i - 1];
    const next = pts[i + 1];
    const rr = Math.min(radius, dist(prev, p) / 2, dist(p, next) / 2);
    if (rr < 0.5) {
      d += lineTo(pen, p);
      length += dist(pen, p);
      pen = p;
      continue;
    }
    const dIn = unit(prev, p);
    const dOut = unit(p, next);
    const entry = { x: p.x - dIn.x * rr, y: p.y - dIn.y * rr };
    const exit = { x: p.x + dOut.x * rr, y: p.y + dOut.y * rr };
    const sweep = dIn.x * dOut.y - dIn.y * dOut.x > 0 ? 1 : 0;
    d += `${lineTo(pen, entry)}A${fmt(rr)} ${fmt(rr)} 0 0 ${sweep} ${fmt(exit.x)} ${fmt(exit.y)}`;
    length += dist(pen, entry) + (Math.PI / 2) * rr;
    pen = exit;
  }

  return { d, length };
}

interface RouteBuild {
  routes: RouteGeometry[];
  pins: RoutePin[];
}

// Deterministic orthogonal routing. Adjacent columns use a Z-route. Everything else uses a gutter route.
function buildRoutes(resolved: Resolved, edges: RouteEdge[], cell: Cell, radius: number): RouteBuild {
  const { byId, centres } = resolved;
  const centre = (id: string): Pt => centres.get(id) ?? { x: 0, y: 0 };
  const colOf = (id: string) => byId.get(id)?.col ?? 0;
  const rowOf = (id: string) => byId.get(id)?.row ?? 0;

  const valid: RouteEdge[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) {
      devWarn(`skipped edge ${e.from} to ${e.to}, because a node is unknown.`);
      continue;
    }
    if (e.from === e.to) {
      devWarn(`skipped self-loop on "${e.from}".`);
      continue;
    }
    const key = edgeKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(e);
  }

  // Pins. Edges leaving a node sit on its right edge, sorted by target height and spread 8px apart.
  const pinY = new Map<string, number>();
  const spread = (owner: "from" | "to", other: "from" | "to", side: "in" | "out") => {
    const groups = new Map<string, RouteEdge[]>();
    for (const e of valid) {
      const list = groups.get(e[owner]) ?? [];
      list.push(e);
      groups.set(e[owner], list);
    }
    for (const [id, list] of groups) {
      const sorted = [...list].sort(
        (a, b) => centre(a[other]).y - centre(b[other]).y || edgeKey(a).localeCompare(edgeKey(b)),
      );
      const mid = (sorted.length - 1) / 2;
      sorted.forEach((e, i) => {
        const y = snap(centre(id).y + (i - mid) * PIN_SPACING);
        pinY.set(`${side}|${edgeKey(e)}`, y);
      });
    }
  };
  spread("from", "to", "out");
  spread("to", "from", "in");

  // Channels and gutters, and which edges share each one, so lanes stay apart.
  type Plan = { edge: RouteEdge; key: string; zig: boolean; gy: number; groups: string[] };
  const plans: Plan[] = valid.map((e) => {
    const sc = colOf(e.from);
    const tc = colOf(e.to);
    const sr = rowOf(e.from);
    const tr = rowOf(e.to);
    const key = edgeKey(e);
    if (tc === sc + 1) {
      return { edge: e, key, zig: true, gy: 0, groups: [`v${sc + 1}`] };
    }
    // The gutter next to the target row, on the source's side.
    const gy = tr > sr ? tr * cell.h : (tr + 1) * cell.h;
    return { edge: e, key, zig: false, gy, groups: [`v${sc + 1}`, `v${tc}`, `g${gy}`] };
  });

  const members = new Map<string, { key: string; y: number }[]>();
  for (const p of plans) {
    const y = (centre(p.edge.from).y + centre(p.edge.to).y) / 2;
    for (const g of p.groups) {
      const list = members.get(g) ?? [];
      list.push({ key: p.key, y });
      members.set(g, list);
    }
  }
  const lane = (group: string, key: string): number => {
    const list = [...(members.get(group) ?? [])].sort((a, b) => a.y - b.y || a.key.localeCompare(b.key));
    const index = list.findIndex((m) => m.key === key);
    return (index - (list.length - 1) / 2) * LANE_SPACING;
  };

  const routes: RouteGeometry[] = plans.map((p) => {
    const e = p.edge;
    const s = centre(e.from);
    const t = centre(e.to);
    const sc = colOf(e.from);
    const tc = colOf(e.to);
    const pOut: Pt = { x: s.x + NODE_HALF_W, y: pinY.get(`out|${p.key}`) ?? s.y };
    const pIn: Pt = { x: t.x - NODE_HALF_W, y: pinY.get(`in|${p.key}`) ?? t.y };

    let raw: Pt[];
    if (p.zig) {
      const b = sc + 1;
      const x = b * cell.w + lane(`v${b}`, p.key);
      raw = [pOut, { x, y: pOut.y }, { x, y: pIn.y }, pIn];
    } else {
      const b1 = sc + 1;
      const x1 = b1 * cell.w + lane(`v${b1}`, p.key);
      const x2 = tc * cell.w + lane(`v${tc}`, p.key);
      const gy = p.gy + lane(`g${p.gy}`, p.key);
      raw = [pOut, { x: x1, y: pOut.y }, { x: x1, y: gy }, { x: x2, y: gy }, { x: x2, y: pIn.y }, pIn];
    }

    const snapped = raw.map((q) => ({ x: snap(q.x), y: snap(q.y) }));
    const { d, length } = orthoPath(snapped, radius);
    return { key: p.key, from: e.from, to: e.to, d, length };
  });

  const pins: RoutePin[] = [];
  for (const e of valid) {
    const out = pinY.get(`out|${edgeKey(e)}`);
    const inn = pinY.get(`in|${edgeKey(e)}`);
    if (out !== undefined) pins.push({ id: e.from, side: "out", y: out });
    if (inn !== undefined) pins.push({ id: e.to, side: "in", y: inn });
  }

  return { routes, pins };
}

// Pure and exported for tests. Returns one orthogonal path per edge, in grid coordinates.
export function routeEdges(
  nodes: RouteNode[],
  edges: RouteEdge[],
  cell: { w: number; h: number } = DEFAULT_CELL,
  r = 6,
): { key: string; d: string }[] {
  const resolved = resolveNodes(nodes, cell);
  return buildRoutes(resolved, edges, cell, r).routes.map(({ key, d }) => ({ key, d }));
}

// Nearest node in a direction, scored as along + 2 × perpendicular distance.
function nearestNode(resolved: Resolved, fromId: string, dir: Pt): string | null {
  const from = resolved.centres.get(fromId);
  if (!from) return null;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const n of resolved.nodes) {
    if (n.id === fromId) continue;
    const c = resolved.centres.get(n.id);
    if (!c) continue;
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const along = dx * dir.x + dy * dir.y;
    if (along <= 0) continue;
    const perp = Math.abs(dx * dir.y - dy * dir.x);
    const score = along + 2 * perp;
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}

export function RouteTrace({
  nodes,
  edges,
  cell,
  cornerRadius = 6,
  speed = 1,
  selectedId,
  onNodeSelect,
  ariaLabel = "System diagram",
  tone,
  attract = false,
  frozen = false,
  className,
}: RouteTraceProps) {
  const resolvedTone = useBjorkTone(tone);
  const palette = BJORK_PALETTE[resolvedTone];
  const mounted = useHasMounted();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const reduced = mounted && prefersReducedMotion;
  const cellW = cell?.w ?? DEFAULT_CELL.w;
  const cellH = cell?.h ?? DEFAULT_CELL.h;

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastInputRef = useRef(-Infinity);
  const clockRef = useRef(0);
  const size = useElementSize(rootRef);

  const [clock, setClock] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const resolved = useMemo(
    () => resolveNodes(nodes, { w: cellW, h: cellH }),
    [nodes, cellW, cellH],
  );
  const built = useMemo(
    () => buildRoutes(resolved, edges, { w: cellW, h: cellH }, cornerRadius),
    [resolved, edges, cellW, cellH, cornerRadius],
  );

  const edgeByKey = useMemo(() => new Map(edges.map((e) => [edgeKey(e), e])), [edges]);

  // Stage geometry: grid extents plus 24px of padding.
  const bounds = useMemo(() => {
    if (resolved.nodes.length === 0) return { x0: -PAD, y0: -PAD, w: PAD * 2, h: PAD * 2 };
    const cols = resolved.nodes.map((n) => n.col);
    const rows = resolved.nodes.map((n) => n.row);
    const minC = Math.min(...cols);
    const maxC = Math.max(...cols);
    const minR = Math.min(...rows);
    const maxR = Math.max(...rows);
    return {
      x0: minC * cellW - PAD,
      y0: minR * cellH - PAD,
      w: (maxC - minC + 1) * cellW + PAD * 2,
      h: (maxR - minR + 1) * cellH + PAD * 2,
    };
  }, [resolved, cellW, cellH]);

  const scale = size.width > 0 ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, size.width / bounds.w)) : 1;

  // Attract: one non-entry node goes down for 2.5s every 5s, and throughputs drift. Input pauses it for 4s.
  const attractOn = attract && !reduced && !frozen;

  useEffect(() => {
    if (!attractOn) return;
    const id = window.setInterval(() => {
      if (performance.now() - lastInputRef.current < ATTRACT_IDLE_MS) return;
      clockRef.current += ATTRACT_TICK_MS;
      setClock(clockRef.current);
    }, ATTRACT_TICK_MS);
    return () => window.clearInterval(id);
  }, [attractOn]);

  const attractDownId = useMemo(() => {
    if (!attractOn) return null;
    const minCol = Math.min(...resolved.nodes.map((n) => n.col));
    const targets = resolved.nodes
      .filter((n) => n.col > minCol)
      .sort((a, b) => a.col - b.col || a.row - b.row);
    if (targets.length === 0) return null;
    if (clock % ATTRACT_PERIOD_MS < ATTRACT_PERIOD_MS - ATTRACT_DOWN_MS) return null;
    const slot = Math.floor(clock / ATTRACT_PERIOD_MS);
    return targets[slot % targets.length]?.id ?? null;
  }, [attractOn, clock, resolved]);

  // Animations and transitions for status changes
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let inView = true;
    const sync = () => {
      el.dataset.loop = inView && document.visibilityState === "visible" ? "running" : "paused";
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        sync();
      },
      { rootMargin: "96px" },
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const nodeStatus = new Map<string, RouteStatus>();
  for (const n of resolved.nodes) {
    nodeStatus.set(n.id, n.id === attractDownId ? "down" : (n.status ?? "ok"));
  }
  const edgeStatus = (from: string, to: string, own?: RouteStatus): RouteStatus => {
    const a = nodeStatus.get(from);
    const b = nodeStatus.get(to);
    if (a === "down" || b === "down" || own === "down") return "down";
    if (a === "degraded" || b === "degraded" || own === "degraded") return "degraded";
    return "ok";
  };

  const activeId = hoverId ?? focusId;
  const transitionMs = (ms: number) => (reduced ? 0 : ms);
  const x0 = bounds.x0;
  const y0 = bounds.y0;
  const vbW = bounds.w;
  const vbH = bounds.h;

  const onNodeKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    stampInput(lastInputRef);
    const dir = ARROW_DIRS[event.key];
    if (!dir) return;
    event.preventDefault();
    const next = nearestNode(resolved, id, dir);
    if (next) buttonRefs.current.get(next)?.focus();
  };

  return (
    <div
      ref={rootRef}
      data-route-trace=""
      data-tone={resolvedTone}
      role="group"
      aria-label={ariaLabel}
      onPointerMove={() => stampInput(lastInputRef)}
      onPointerDown={() => stampInput(lastInputRef)}
      onKeyDown={() => stampInput(lastInputRef)}
      className={cn("relative w-full min-w-0 overflow-x-auto overflow-y-hidden p-2", className)}
    >
      <style>{ROUTE_CSS}</style>
      <div className="mx-auto" style={{ width: vbW * scale, height: vbH * scale }}>
        <div
          className="relative"
          style={{ width: vbW, height: vbH, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width={vbW}
            height={vbH}
            viewBox={`${x0} ${y0} ${vbW} ${vbH}`}
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
          >
            {built.routes.map((r) => {
              const edge = edgeByKey.get(r.key);
              if (!edge) return null;
              const st = edgeStatus(r.from, r.to, edge.status);
              const drift = attractOn ? ATTRACT_DRIFT * Math.sin(clock / 1600 + (hashString(r.key) % 628) / 100) : 0;
              const throughput = clamp01(edge.throughput + drift);
              const touching = activeId !== null && (r.from === activeId || r.to === activeId);
              const opacity = st === "down" ? DOWN_EDGE : activeId !== null && !touching ? DIM_EDGE : 1;
              const dash = 6 + 12 * throughput;
              // Spec count is ceil(throughput x 3), capped at 4. Short edges get fewer packets so each keeps a visible gap.
              const specCount = Math.min(MAX_PACKETS, Math.ceil(throughput * 3));
              const fitCount = Math.floor(r.length / (dash + MIN_PACKET_GAP));
              const packetCount = Math.max(0, Math.min(specCount, fitCount >= 1 ? fitCount : 1, specCount));
              const gap = Math.max(0.01, r.length / Math.max(1, packetCount) - dash);
              const animate = !reduced && packetCount > 0 && r.length > 0 && speed > 0;
              const duration = animate ? r.length / (PACKET_SPEED * speed) : 0;
              const delay = animate ? ((hashString(r.key) % 1000) / 1000) * duration : 0;
              const packetColour = st === "degraded" ? palette.warning : palette.accent;

              return (
                <g
                  key={r.key}
                  data-edge={r.key}
                  data-status={st}
                  style={{
                    opacity,
                    transition: `opacity ${transitionMs(st === "down" ? 240 : 160)}ms ease`,
                  }}
                >
                  <path
                    d={r.d}
                    fill="none"
                    stroke={TRACE_COLOUR[resolvedTone].glow}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={r.d}
                    fill="none"
                    stroke={TRACE_COLOUR[resolvedTone].trace}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {packetCount > 0 && (
                    <path
                      d={r.d}
                      fill="none"
                      className="bjork-route-packet"
                      stroke={packetColour}
                      strokeWidth={2}
                      strokeDasharray={`${fmt(dash)} ${fmt(gap)}`}
                      style={
                        {
                          opacity: st === "down" ? 0 : 1,
                          transition: `opacity ${transitionMs(240)}ms ease`,
                          animationName: animate ? "bjork-route-packet" : undefined,
                          animationDuration: animate ? `${fmt(duration)}s` : undefined,
                          animationTimingFunction: animate ? "linear" : undefined,
                          animationIterationCount: animate ? "infinite" : undefined,
                          animationDelay: animate ? `-${fmt(delay)}s` : undefined,
                          animationPlayState: frozen || st === "down" ? "paused" : "running",
                          "--rt-len": fmt(r.length),
                        } as CSSProperties
                      }
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {resolved.nodes.map((n) => {
            const st = nodeStatus.get(n.id) ?? "ok";
            const c = resolved.centres.get(n.id) ?? { x: 0, y: 0 };
            const left = c.x - NODE_HALF_W - x0;
            const top = c.y - NODE_HALF_H - y0;
            const dimmed = activeId !== null && activeId !== n.id;
            const ledColour =
              st === "ok" ? palette.success : st === "degraded" ? palette.warning : palette.error;
            const ledTop = n.sublabel ? 11 : 17;
            const selected = selectedId === n.id;

            return (
              <button
                key={n.id}
                ref={(el) => {
                  if (el) buttonRefs.current.set(n.id, el);
                  else buttonRefs.current.delete(n.id);
                }}
                type="button"
                aria-label={`${n.label}, ${STATUS_WORD[st]}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => onNodeSelect?.(n.id)}
                onKeyDown={(event) => onNodeKey(event, n.id)}
                onFocus={() => setFocusId(n.id)}
                onBlur={() => setFocusId((prev) => (prev === n.id ? null : prev))}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId((prev) => (prev === n.id ? null : prev))}
                className="absolute rounded-[8px] border text-left outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)] active:scale-[0.97]"
                style={{
                  left,
                  top,
                  width: NODE_HALF_W * 2,
                  height: NODE_HALF_H * 2,
                  borderColor: `var(--bjork-border-strong, ${palette.borderStrong})`,
                  borderWidth: 1,
                  background: `var(--bjork-surface, ${palette.surface})`,
                  opacity: dimmed ? DIM_NODE : 1,
                  transition: `opacity ${transitionMs(160)}ms ease, transform ${transitionMs(140)}ms ease-out`,
                  outline: selected ? `1px solid ${palette.accentInk}` : undefined,
                  outlineOffset: selected ? 3 : undefined,
                }}
              >
                {built.pins
                  .filter((p) => p.id === n.id)
                  .map((p) => (
                    <span
                      key={`${p.side}-${p.y}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute size-1"
                      style={{
                        top: p.y - (c.y - NODE_HALF_H) - 2,
                        left: p.side === "in" ? -2 : undefined,
                        right: p.side === "out" ? -2 : undefined,
                        background: `var(--bjork-border-strong, ${palette.borderStrong})`,
                      }}
                    />
                  ))}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute size-[6px] rounded-full"
                  style={{
                    left: 10,
                    top: ledTop,
                    background: ledColour,
                    transition: `background-color ${transitionMs(240)}ms ease`,
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 left-[22px] right-[8px] flex flex-col justify-center">
                  <span
                    className="block truncate font-bjork-alpha text-[12px] font-medium leading-[14px]"
                    style={{ color: `var(--bjork-text, ${palette.text})` }}
                  >
                    {n.label}
                  </span>
                  {n.sublabel && (
                    <span
                      className="block truncate font-mono text-[10px] leading-[12px] tabular-nums"
                      style={{ color: `var(--bjork-text-soft, ${palette.textSoft})` }}
                    >
                      {n.sublabel}
                    </span>
                  )}
                </span>
                {st === "down" && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-0 -top-[13px] font-mono text-[9px] leading-[10px]"
                    style={{ color: palette.error }}
                  >
                    DOWN
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="sr-only">
        {built.routes.map((r) => {
          const edge = edgeByKey.get(r.key);
          const from = resolved.byId.get(r.from);
          const to = resolved.byId.get(r.to);
          if (!edge || !from || !to) return null;
          const st = edgeStatus(r.from, r.to, edge.status);
          return (
            <li key={r.key}>
              {`${from.label} to ${to.label}, throughput ${Math.round(edge.throughput * 100)}%, ${STATUS_WORD[st]}`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
