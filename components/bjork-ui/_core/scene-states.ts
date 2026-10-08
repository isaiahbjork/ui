"use client";

// Scene States: DOM sections declare camera poses, scroll blends between them.
//
//   <section data-scene-state="overview" />
//   <section data-scene-state="detail" data-scene-lead="0.4" />
//   <div data-scene-state="pinned" data-scene-hold />   // holds through a sticky span
//
// The engine knows nothing about three.js. It returns a blended pose and params,
// and a small rig damps toward them frame-rate independently. Add `?scene-debug`
// to the URL to draw every anchor and the probe.

import { useEffect, useMemo, useRef } from "react";

export type Vec3 = [number, number, number];

export interface Pose {
  target: Vec3;
  radius: number;
  /** Polar angle from +Y. 0 looks straight down. */
  phi: number;
  /** Azimuth around +Y. `null` keeps whatever the previous state had. */
  theta: number | null;
}

export type SceneParams = Record<string, number>;

export interface StateDef<P extends SceneParams = SceneParams> {
  pose: Pose;
  params: P;
  /** Per-frame damping at 60 fps, 0..1. Defaults to 0.1. */
  damp?: number;
  mobile?: { pose?: Partial<Pose>; params?: Partial<P>; damp?: number };
}

export interface SceneSample<P extends SceneParams = SceneParams> {
  pose: Pose & { theta: number };
  params: P;
  activeKey: string | null;
  fromKey: string | null;
  toKey: string | null;
  /** Raw blend 0..1 between `fromKey` and `toKey`. */
  t: number;
  damp: number;
  /** True when the active section asked to snap (data-scene-immediate). */
  immediate: boolean;
  /** Document-space probe line, useful for debugging. */
  probe: number;
}

export interface SceneStatesOptions<P extends SceneParams = SceneParams> {
  /** Element to scan for `[data-scene-state]`. Defaults to document.body. */
  root?: HTMLElement | null;
  /** Element that scrolls. Defaults to the window. */
  scrollRoot?: HTMLElement | null;
  /** Mobile overrides apply while this matches. */
  mobileQuery?: string;
  /** Params that blend with easeOutQuad so lights die before the camera arrives. */
  fadeKeys?: (keyof P & string)[];
  /** Fallback when no section is registered. */
  initialKey?: string;
  /** Force the debug overlay regardless of the URL. */
  debug?: boolean;
}

export interface SceneStates<P extends SceneParams = SceneParams> {
  sample(scrollY?: number, vh?: number, maxScroll?: number): SceneSample<P>;
  rescan(): void;
  destroy(): void;
  readonly keys: string[];
}

interface Entry {
  el: HTMLElement;
  key: string;
  anchorY: number;
  lead: number | null;
  immediate: boolean;
}

const DEFAULT_DAMP = 0.1;
const TAU = Math.PI * 2;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
export const easeOutQuad = (t: number) => t * (2 - t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shortest signed difference b - a on the circle. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Converts a per-frame damping factor (tuned at 60 fps) into the factor for `dt` seconds,
 * so the rig settles the same on a 120 Hz display as on a 60 Hz one.
 */
export function dampFactor(damp: number, dt: number) {
  if (damp >= 1) return 1;
  return 1 - Math.pow(1 - damp, dt * 60);
}

/** Exponential approach with rate `lambda` per second. `1 - e^(-9dt)` is the house default. */
export function expDamp(current: number, target: number, lambda: number, dt: number) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** World-space camera position for a pose: target + r·(sinφ sinθ, cosφ, sinφ cosθ). */
export function poseToPosition(pose: Pose, out: Vec3 = [0, 0, 0], theta = pose.theta ?? 0): Vec3 {
  const s = Math.sin(pose.phi);
  out[0] = pose.target[0] + pose.radius * s * Math.sin(theta);
  out[1] = pose.target[1] + pose.radius * Math.cos(pose.phi);
  out[2] = pose.target[2] + pose.radius * s * Math.cos(theta);
  return out;
}

/** Blends two poses. Theta takes the shortest arc; a null theta keeps `fallbackTheta`. */
export function blendPose(a: Pose, b: Pose, t: number, fallbackTheta: number, out?: Pose & { theta: number }) {
  const res = out ?? { target: [0, 0, 0] as Vec3, radius: 0, phi: 0, theta: 0 };
  res.target[0] = lerp(a.target[0], b.target[0], t);
  res.target[1] = lerp(a.target[1], b.target[1], t);
  res.target[2] = lerp(a.target[2], b.target[2], t);
  res.radius = lerp(a.radius, b.radius, t);
  res.phi = lerp(a.phi, b.phi, t);
  const ta = a.theta ?? fallbackTheta;
  const tb = b.theta ?? fallbackTheta;
  res.theta = ta + angleDelta(ta, tb) * t;
  return res;
}

function resolveDef<P extends SceneParams>(def: StateDef<P>, mobile: boolean): StateDef<P> {
  if (!mobile || !def.mobile) return def;
  return {
    pose: { ...def.pose, ...def.mobile.pose },
    params: { ...def.params, ...def.mobile.params } as P,
    damp: def.mobile.damp ?? def.damp,
  };
}

function readScroll(scrollRoot: HTMLElement | null | undefined) {
  if (scrollRoot) {
    return {
      y: scrollRoot.scrollTop,
      vh: scrollRoot.clientHeight,
      max: Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight),
    };
  }
  const vh = window.innerHeight;
  const doc = document.scrollingElement ?? document.documentElement;
  return { y: window.scrollY, vh, max: Math.max(0, doc.scrollHeight - vh) };
}

/**
 * Builds the engine. `defs` maps a state key to its pose and params. Every def should
 * carry the same param keys; missing ones fall back to the first def's value.
 */
export function createSceneStates<P extends SceneParams>(
  defs: Record<string, StateDef<P>>,
  opts: SceneStatesOptions<P> = {},
): SceneStates<P> {
  const keys = Object.keys(defs);
  const fadeKeys = new Set<string>(opts.fadeKeys ?? []);
  const paramKeys = Array.from(new Set(keys.flatMap((k) => Object.keys(defs[k].params))));
  const fallbackKey = opts.initialKey && defs[opts.initialKey] ? opts.initialKey : keys[0];
  const mq =
    typeof window !== "undefined" && opts.mobileQuery ? window.matchMedia(opts.mobileQuery) : null;

  let entries: Entry[] = [];
  let lastTheta = defs[fallbackKey]?.pose.theta ?? 0;
  const out: SceneSample<P> = {
    pose: { target: [0, 0, 0], radius: 0, phi: 0, theta: 0 },
    params: {} as P,
    activeKey: null,
    fromKey: null,
    toKey: null,
    t: 0,
    damp: DEFAULT_DAMP,
    immediate: false,
    probe: 0,
  };

  const def = (key: string) => {
    const d = defs[key] ?? defs[fallbackKey];
    return resolveDef(d, Boolean(mq?.matches));
  };

  const measure = () => {
    if (typeof window === "undefined") return;
    const root = opts.root ?? document.body;
    const { y, vh } = readScroll(opts.scrollRoot);
    const rootTop = opts.scrollRoot ? opts.scrollRoot.getBoundingClientRect().top : 0;
    const portrait = vh > (opts.scrollRoot?.clientWidth ?? window.innerWidth);
    const next: Entry[] = [];
    root.querySelectorAll<HTMLElement>("[data-scene-state]").forEach((el) => {
      const key = el.dataset.sceneState;
      if (!key || !defs[key]) return;
      const rect = el.getBoundingClientRect();
      const top = rect.top - rootTop + y;
      const lead = el.dataset.sceneLead != null ? parseFloat(el.dataset.sceneLead) : NaN;
      const base = {
        el,
        key,
        lead: Number.isFinite(lead) && lead > 0 ? lead : null,
        immediate: el.hasAttribute("data-scene-immediate"),
      };
      if (el.hasAttribute("data-scene-hold") && rect.height > vh) {
        // Two anchors with the same key: the blend stays flat across the sticky span.
        next.push({ ...base, anchorY: top + vh / 2 });
        next.push({ ...base, lead: null, anchorY: top + rect.height - vh / 2 });
        return;
      }
      next.push({ ...base, anchorY: portrait ? top : top + rect.height / 2 });
    });
    next.sort((a, b) => a.anchorY - b.anchorY);
    entries = next;
    debug?.draw(entries);
  };

  // Rescans are coalesced to one per frame.
  let raf = 0;
  const schedule = () => {
    if (typeof window === "undefined") return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
  };

  let mo: MutationObserver | null = null;
  let ro: ResizeObserver | null = null;
  const debug =
    typeof window !== "undefined" &&
    (opts.debug || new URLSearchParams(window.location.search).has("scene-debug"))
      ? createDebugOverlay(opts.scrollRoot ?? null)
      : null;

  if (typeof window !== "undefined") {
    const root = opts.root ?? document.body;
    mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-scene-state", "data-scene-lead", "data-scene-hold"] });
    ro = new ResizeObserver(schedule);
    ro.observe(root);
    mq?.addEventListener?.("change", schedule);
    window.addEventListener("resize", schedule);
    measure();
  }

  const blendParams = (a: P, b: P, t: number, tf: number) => {
    const base = defs[fallbackKey].params;
    const res = out.params as SceneParams;
    for (const k of paramKeys) {
      const va = a[k] ?? base[k] ?? 0;
      const vb = b[k] ?? base[k] ?? 0;
      res[k] = lerp(va, vb, fadeKeys.has(k) ? tf : t);
    }
  };

  const sample = (scrollY?: number, vh?: number, maxScroll?: number): SceneSample<P> => {
    const live = typeof window !== "undefined" ? readScroll(opts.scrollRoot) : { y: 0, vh: 1, max: 0 };
    const y = scrollY ?? live.y;
    const h = vh ?? live.vh;
    const max = maxScroll ?? live.max;

    if (entries.length === 0) {
      const d = def(fallbackKey);
      blendPose(d.pose, d.pose, 0, lastTheta, out.pose);
      blendParams(d.params, d.params, 0, 0);
      out.activeKey = out.fromKey = out.toKey = fallbackKey;
      out.t = 0;
      out.damp = d.damp ?? DEFAULT_DAMP;
      out.immediate = false;
      out.probe = y + h / 2;
      return out;
    }

    // Edge-corrected probe: the first and last sections stay reachable.
    const half = h / 2;
    const i = 1 - smoothstep(clamp01(y / half));
    const s = 1 - smoothstep(clamp01((max - y) / half));
    const c = y + half * (1 - i + s);

    let idx = 0;
    while (idx < entries.length - 1 && entries[idx + 1].anchorY <= c) idx++;
    const from = entries[idx];
    const to = entries[Math.min(idx + 1, entries.length - 1)];
    const start = to.lead != null ? Math.max(from.anchorY, to.anchorY - to.lead * h) : from.anchorY;
    const span = to.anchorY - start;
    const t = span > 0 ? clamp01((c - start) / span) : 0;

    const a = def(from.key);
    const b = def(to.key);
    blendPose(a.pose, b.pose, smoothstep(t), lastTheta, out.pose);
    lastTheta = out.pose.theta;
    blendParams(a.params, b.params, smoothstep(t), easeOutQuad(t));

    const active = t < 0.5 ? from : to;
    out.activeKey = active.key;
    out.fromKey = from.key;
    out.toKey = to.key;
    out.t = t;
    out.damp = def(active.key).damp ?? DEFAULT_DAMP;
    out.immediate = active.immediate;
    out.probe = c;
    debug?.probe(c, y);
    return out;
  };

  return {
    sample,
    rescan: measure,
    destroy() {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      ro?.disconnect();
      mq?.removeEventListener?.("change", schedule);
      if (typeof window !== "undefined") window.removeEventListener("resize", schedule);
      debug?.destroy();
      entries = [];
    },
    get keys() {
      return keys;
    },
  };
}

/**
 * A damped follower for poses and params. `update` moves toward the sample using
 * frame-rate independent damping and returns the smoothed values.
 */
export function createSceneRig<P extends SceneParams>(initial: { pose: Pose; params: P }) {
  const pose: Pose & { theta: number } = {
    target: [...initial.pose.target] as Vec3,
    radius: initial.pose.radius,
    phi: initial.pose.phi,
    theta: initial.pose.theta ?? 0,
  };
  const params = { ...initial.params } as P;
  return {
    pose,
    params,
    update(sample: { pose: Pose; params: P; damp?: number; immediate?: boolean }, dt: number) {
      const k = sample.immediate ? 1 : dampFactor(sample.damp ?? DEFAULT_DAMP, dt);
      for (let i = 0; i < 3; i++) pose.target[i] += (sample.pose.target[i] - pose.target[i]) * k;
      pose.radius += (sample.pose.radius - pose.radius) * k;
      pose.phi += (sample.pose.phi - pose.phi) * k;
      if (sample.pose.theta != null) pose.theta += angleDelta(pose.theta, sample.pose.theta) * k;
      const p = params as SceneParams;
      for (const key in sample.params) p[key] = (p[key] ?? 0) + (sample.params[key] - (p[key] ?? 0)) * k;
      return { pose, params };
    },
    /** True once every value is within `eps` of the sample. */
    settled(sample: { pose: Pose; params: P }, eps = 1e-4) {
      if (Math.abs(sample.pose.radius - pose.radius) > eps) return false;
      if (Math.abs(sample.pose.phi - pose.phi) > eps) return false;
      if (sample.pose.theta != null && Math.abs(angleDelta(pose.theta, sample.pose.theta)) > eps) return false;
      for (let i = 0; i < 3; i++) if (Math.abs(sample.pose.target[i] - pose.target[i]) > eps) return false;
      for (const key in sample.params) if (Math.abs(sample.params[key] - (params as SceneParams)[key]) > eps) return false;
      return true;
    },
  };
}

/**
 * React binding. The engine is created once per mount; pass stable `defs`.
 * Returns a ref whose `current` is the engine (null before mount).
 */
export function useSceneStates<P extends SceneParams>(
  defs: Record<string, StateDef<P>>,
  opts?: SceneStatesOptions<P>,
) {
  const ref = useRef<SceneStates<P> | null>(null);
  const root = opts?.root ?? null;
  const scrollRoot = opts?.scrollRoot ?? null;
  const mobileQuery = opts?.mobileQuery;
  const fadeKey = (opts?.fadeKeys ?? []).join(",");
  const initialKey = opts?.initialKey;
  const debug = opts?.debug;
  const stableOpts = useMemo(
    () => ({
      root,
      scrollRoot,
      mobileQuery,
      fadeKeys: fadeKey ? (fadeKey.split(",") as (keyof P & string)[]) : [],
      initialKey,
      debug,
    }),
    [root, scrollRoot, mobileQuery, fadeKey, initialKey, debug],
  );

  useEffect(() => {
    const engine = createSceneStates(defs, stableOpts);
    ref.current = engine;
    return () => {
      engine.destroy();
      ref.current = null;
    };
  }, [defs, stableOpts]);

  return ref;
}

// ─── ?scene-debug overlay ─────────────────────────────────────────────────────

function createDebugOverlay(scrollRoot: HTMLElement | null) {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:11px/1.2 ui-monospace,monospace;";
  const probeLine = document.createElement("div");
  probeLine.style.cssText =
    "position:absolute;left:0;right:0;height:0;border-top:1px dashed #ec5c13;";
  const probeLabel = document.createElement("span");
  probeLabel.style.cssText =
    "position:absolute;right:8px;top:-16px;color:#ec5c13;background:rgba(0,0,0,.6);padding:1px 4px;border-radius:3px;";
  probeLabel.textContent = "probe";
  probeLine.appendChild(probeLabel);
  layer.appendChild(probeLine);
  document.body.appendChild(layer);

  let marks: { el: HTMLDivElement; y: number }[] = [];
  let lastY = 0;
  const place = (scrollY: number) => {
    const offset = scrollRoot ? scrollRoot.getBoundingClientRect().top : 0;
    for (const m of marks) m.el.style.transform = `translateY(${m.y - scrollY + offset}px)`;
  };

  return {
    draw(entries: Entry[]) {
      marks.forEach((m) => m.el.remove());
      marks = entries.map((e) => {
        const el = document.createElement("div");
        el.style.cssText =
          "position:absolute;left:0;right:0;top:0;height:0;border-top:1px solid rgba(80,180,255,.8);";
        const label = document.createElement("span");
        label.style.cssText =
          "position:absolute;left:8px;top:-16px;color:#7cc4ff;background:rgba(0,0,0,.6);padding:1px 4px;border-radius:3px;";
        label.textContent = `${e.key}${e.lead ? ` lead ${e.lead}` : ""}${e.immediate ? " immediate" : ""}`;
        el.appendChild(label);
        layer.appendChild(el);
        return { el, y: e.anchorY };
      });
      place(lastY);
    },
    probe(c: number, scrollY: number) {
      lastY = scrollY;
      const offset = scrollRoot ? scrollRoot.getBoundingClientRect().top : 0;
      probeLine.style.transform = `translateY(${c - scrollY + offset}px)`;
      place(scrollY);
    },
    destroy() {
      layer.remove();
    },
  };
}
