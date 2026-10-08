"use client";

// Aperture Dive: a hero that starts straight above a ring of screens (an eclipse), dives
// into the ring on native scroll, lands square on one screen, then hands that screen to a
// real DOM element in the next section. WebGL first, CSS 3D when WebGL is missing, a still
// poster under reduced motion.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { cn } from "@/lib/utils";
import { cubicBezier } from "../_core/motion";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import { LiveRegion } from "../_core/a11y";
import { angleDelta, clamp01, smoothstep } from "../_core/scene-states";
import {
  ApertureDiveScene,
  DIVE_PROFILES,
  PANEL_H,
  PANEL_W,
  applyDiveCamera,
  createDiveFrame,
  createDiveSampler,
  panelPlacement,
  projectPanelCorners,
  quadToMatrix3d,
  ringRadius,
  type DiveFrame,
  type DiveQuality,
  type DiveSceneMedia,
} from "./aperture-dive-scene";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApertureDiveMedia {
  type: "image" | "video";
  src: string;
  poster?: string;
  /** `cover` fills the screen; `contain` floats the media on `backdrop`. Default cover. */
  fit?: "cover" | "contain";
  backdrop?: string;
  /** Contain only: inset as a fraction of the screen height. */
  inset?: number;
  /** Contain only: corner radius as a fraction of the screen height. */
  radius?: number;
  /** Width / height of the media. Lets contained media lay out before it loads. */
  aspect?: number;
}

export interface ApertureDivePanel {
  id: string;
  media: ApertureDiveMedia;
  title?: string;
  meta?: string;
}

export type ApertureDivePhase = "overhead" | "dive" | "landed" | "handoff";

export interface ApertureDiveProps {
  /** 6–12 screens. More than 12 are ignored. */
  panels: ApertureDivePanel[];
  /** The screen the dive lands on and hands off. */
  focusIndex?: number;
  headline?: ReactNode;
  eyebrowLeft?: ReactNode;
  eyebrowRight?: ReactNode;
  scrollHint?: string;
  /** Scroll length of the dive, in viewport heights beyond the first. 140 desktop, 110 mobile. */
  travel?: number;
  /** Element that receives the landed screen. Defaults to `<ApertureDiveTarget />` or any `[data-aperture-target]` inside `children`. */
  handoffTarget?: RefObject<HTMLElement | null>;
  /** Where the target's centre sits in the viewport when the handoff completes, 0..1. */
  handoffAlign?: number;
  haze?: boolean;
  ground?: "sand" | "none";
  tone?: "light" | "dark";
  /** `auto` picks `low` on small or touch screens. */
  quality?: "auto" | "high" | "low";
  /** Force a renderer. `auto` uses WebGL and falls back to CSS 3D. */
  renderer?: "auto" | "webgl" | "css";
  /** Page background the scene fades into. Defaults to the BJORK background for the tone. */
  background?: string;
  /** Scroll container, when the page does not scroll on the window. */
  scrollRoot?: RefObject<HTMLElement | null>;
  /** Freeze at a progress (0..1). For posters and docs. */
  staticProgress?: number;
  onPhaseChange?: (phase: ApertureDivePhase) => void;
  className?: string;
  /** The section after the hero. Put `<ApertureDiveTarget />` in it. */
  children?: ReactNode;
}

const HANDOFF_START = 0.92;
const easeHandoff = cubicBezier(0.65, 0, 0.35, 1);
const DISPLAY_FONT = '"Bjork Grotesk Display", "Bjork Grotesk Alpha", var(--font-geist-sans), sans-serif';
const MONO_FONT = "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

const TONES = {
  dark: { bg: "#111111", ink: "#f2eee7", soft: "rgba(242,238,231,0.56)", faint: "rgba(242,238,231,0.32)", line: "rgba(242,238,231,0.18)", stage: "#070707" },
  light: { bg: "#f7f3ea", ink: "#1a1815", soft: "rgba(26,24,21,0.58)", faint: "rgba(26,24,21,0.34)", line: "rgba(26,24,21,0.16)", stage: "#f2ede3" },
} as const;

// ─── Media ────────────────────────────────────────────────────────────────────

function normalizeMedia(media: ApertureDiveMedia): DiveSceneMedia & { aspect?: number } {
  return {
    type: media.type,
    src: media.src,
    poster: media.poster,
    fit: media.fit ?? "cover",
    backdrop: media.backdrop ?? "#000000",
    inset: media.fit === "contain" ? (media.inset ?? 0) : 0,
    radius: media.fit === "contain" ? (media.radius ?? 0) : 0,
    aspect: media.aspect,
  };
}

/** Inline styles for the media element, shared by React and imperative paths. */
function mediaElementStyle(m: ReturnType<typeof normalizeMedia>): Partial<CSSStyleDeclaration> & CSSProperties {
  if (m.fit === "cover") {
    return { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", display: "block" };
  }
  return {
    position: "absolute",
    left: "50%",
    top: `${m.inset * 100}%`,
    height: `${(1 - 2 * m.inset) * 100}%`,
    width: m.aspect ? "auto" : "auto",
    aspectRatio: m.aspect ? String(m.aspect) : undefined,
    maxWidth: `calc(100% - ${m.inset * 200}cqh)`,
    objectFit: "contain",
    transform: "translateX(-50%)",
    borderRadius: `calc(${m.radius} * 100cqh)`,
    display: "block",
  } as Partial<CSSStyleDeclaration> & CSSProperties;
}

export interface ApertureMediaProps {
  media: ApertureDiveMedia;
  title?: string;
  className?: string;
  style?: CSSProperties;
  /** Reuse an existing <video> (the WebGL texture source) instead of creating one. */
  sharedVideo?: HTMLVideoElement | null;
}

/** Renders a panel's media exactly as the WebGL screen draws it. */
export function ApertureMedia({ media, title, className, style, sharedVideo }: ApertureMediaProps) {
  const m = normalizeMedia(media);
  const slotRef = useRef<HTMLDivElement>(null);
  const elStyle = mediaElementStyle(m) as CSSProperties;

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !sharedVideo) return;
    Object.assign(sharedVideo.style, mediaElementStyle(m));
    slot.appendChild(sharedVideo);
    // Re-attaching pauses a media element; keep it running.
    sharedVideo.play().catch(() => {});
    return () => {
      if (sharedVideo.parentNode === slot) slot.removeChild(sharedVideo);
      sharedVideo.play().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedVideo, m.fit, m.inset, m.radius, m.aspect]);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: m.backdrop, containerType: "size", ...style }}
    >
      {m.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.src} alt={title ?? ""} draggable={false} style={elStyle} />
      ) : sharedVideo ? (
        <div ref={slotRef} className="absolute inset-0" />
      ) : (
        <video
          src={m.src}
          poster={m.poster}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-label={title}
          style={elStyle}
        />
      )}
    </div>
  );
}

// ─── Handoff target ───────────────────────────────────────────────────────────

interface DiveContextValue {
  panel: ApertureDivePanel;
  registerTarget: (el: HTMLElement | null) => void;
}

const DiveContext = createContext<DiveContextValue | null>(null);

export interface ApertureDiveTargetProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * The DOM element the landed screen becomes. Render it anywhere inside <ApertureDive>'s
 * children. It keeps the screen's aspect ratio so the morph only moves and scales.
 */
export function ApertureDiveTarget({ className, style, children }: ApertureDiveTargetProps) {
  const ctx = useContext(DiveContext);
  const register = ctx?.registerTarget;
  const ref = useCallback((el: HTMLDivElement | null) => register?.(el), [register]);
  if (!ctx) return null;
  return (
    <div
      ref={ref}
      data-aperture-target=""
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: `${PANEL_W} / ${PANEL_H}`, ...style }}
    >
      <ApertureMedia media={ctx.panel.media} title={ctx.panel.title} className="absolute inset-0" />
      {children}
    </div>
  );
}

// ─── Environment ──────────────────────────────────────────────────────────────

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const noopSubscribe = () => () => {};

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function saveData() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(conn?.saveData);
}

// ─── CSS 3D fallback ──────────────────────────────────────────────────────────

const CSS_UNIT = 200; // px per world unit inside CSS3DObjects

function createMediaElement(media: ReturnType<typeof normalizeMedia>, play: boolean) {
  const el = document.createElement("div");
  el.style.cssText = `width:${PANEL_W * CSS_UNIT}px;height:${PANEL_H * CSS_UNIT}px;overflow:hidden;background:${media.backdrop};container-type:size;backface-visibility:hidden;`;
  const inner = document.createElement("div");
  inner.style.cssText = "position:absolute;inset:0;transform-origin:50% 50%;";
  let node: HTMLImageElement | HTMLVideoElement;
  if (media.type === "video" && play) {
    const v = document.createElement("video");
    v.src = media.src;
    if (media.poster) v.poster = media.poster;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.play().catch(() => {});
    node = v;
  } else {
    const img = document.createElement("img");
    img.src = media.type === "image" ? media.src : (media.poster ?? "");
    img.alt = "";
    img.draggable = false;
    node = img;
  }
  Object.assign(node.style, mediaElementStyle(media));
  inner.appendChild(node);
  el.appendChild(inner);
  return { el, inner, video: node instanceof HTMLVideoElement ? node : null };
}

class CssWorld {
  readonly renderer = new CSS3DRenderer();
  readonly camera = new THREE.PerspectiveCamera(15, 1, 0.05, 200);
  private scene = new THREE.Scene();
  private group = new THREE.Group();
  private panels: { obj: CSS3DObject; el: HTMLElement; inner: HTMLElement; video: HTMLVideoElement | null }[] = [];
  private interior: HTMLDivElement;
  private corona: HTMLDivElement;
  private width = 1;
  private height = 1;
  readonly ring: number;

  constructor(
    container: HTMLElement,
    panels: ReturnType<typeof normalizeMedia>[],
    private focusIndex: number,
    tone: "light" | "dark",
  ) {
    const count = panels.length;
    this.ring = ringRadius(count);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.scene.add(this.group);

    // Ground: a disc with the corona painted on, and an interior glow that fills in.
    const size = 18;
    const px = size * CSS_UNIT * 0.25;
    const ground = document.createElement("div");
    const r = (this.ring / (size / 2)) * 100; // % of the disc radius (closest-side)
    ground.style.cssText = `width:${px}px;height:${px}px;border-radius:50%;position:relative;`;
    this.corona = document.createElement("div");
    this.corona.style.cssText =
      tone === "dark"
        ? `position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle closest-side, transparent ${r * 0.98}%, rgba(255,233,204,.55) ${r * 1.02}%, rgba(255,233,204,.12) ${r * 1.35}%, transparent ${r * 2.4}%);`
        : `position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle closest-side, transparent ${r * 0.98}%, rgba(96,80,58,.42) ${r * 1.03}%, rgba(96,80,58,.08) ${r * 1.45}%, transparent ${r * 2.4}%);`;
    this.interior = document.createElement("div");
    this.interior.style.cssText =
      tone === "dark"
        ? `position:absolute;inset:0;border-radius:50%;opacity:0;background:radial-gradient(circle closest-side, rgba(236,170,120,.28) 0%, rgba(236,140,90,.16) ${r * 0.7}%, transparent ${r}%);`
        : `position:absolute;inset:0;border-radius:50%;opacity:0;background:radial-gradient(circle closest-side, rgba(60,50,40,.12) 0%, rgba(60,50,40,.06) ${r * 0.7}%, transparent ${r}%);`;
    ground.append(this.interior, this.corona);
    const groundObj = new CSS3DObject(ground);
    groundObj.rotation.x = -Math.PI / 2;
    groundObj.scale.setScalar(size / px);
    this.scene.add(groundObj);

    panels.forEach((media, i) => {
      const { el, inner, video } = createMediaElement(media, i === focusIndex);
      const obj = new CSS3DObject(el);
      const place = panelPlacement(i, count, focusIndex);
      obj.position.set(place.x, place.y, place.z);
      obj.rotation.y = place.rotationY;
      obj.scale.setScalar(1 / CSS_UNIT);
      this.group.add(obj);
      this.panels.push({ obj, el, inner, video });
    });
  }

  get focusVideo() {
    return this.panels[this.focusIndex]?.video ?? null;
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render(frame: DiveFrame) {
    this.group.rotation.y = frame.ringSpin;
    applyDiveCamera(this.camera, frame);
    this.panels.forEach((p, i) => {
      p.obj.scale.set(frame.scaleX / CSS_UNIT, 1 / CSS_UNIT, 1 / CSS_UNIT);
      p.inner.style.transform = `scaleX(${1 / Math.max(0.01, frame.scaleX)})`;
      p.el.style.filter = frame.saturation < 0.999 ? `saturate(${frame.saturation.toFixed(3)})` : "";
      p.el.style.opacity = i === this.focusIndex && frame.focusOut > 0.5 ? "0.06" : "1";
    });
    this.interior.style.opacity = frame.interior.toFixed(3);
    this.corona.style.opacity = frame.corona.toFixed(3);
    this.renderer.domElement.style.opacity = (1 - frame.fade).toFixed(3);
    this.renderer.render(this.scene, this.camera);
  }

  projectFocus(scaleX: number) {
    const p = this.panels[this.focusIndex];
    if (!p) return [];
    p.obj.updateWorldMatrix(true, false);
    // The CSS object is scaled to px; rebuild the unit-size panel matrix for projection.
    const m = new THREE.Matrix4().compose(
      p.obj.getWorldPosition(new THREE.Vector3()),
      p.obj.getWorldQuaternion(new THREE.Quaternion()),
      new THREE.Vector3(1, 1, 1),
    );
    return projectPanelCorners(m, this.camera, scaleX, this.width, this.height);
  }

  setVideosPlaying(playing: boolean) {
    const v = this.focusVideo;
    if (!v) return;
    if (playing && v.paused) v.play().catch(() => {});
    if (!playing && !v.paused) v.pause();
  }

  dispose() {
    this.panels.forEach((p) => p.video?.pause());
    this.renderer.domElement.remove();
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type Mode = "webgl" | "css";

interface Runtime {
  scene: ApertureDiveScene | null;
  css: CssWorld | null;
  sampler: ReturnType<typeof createDiveSampler>;
  goal: DiveFrame;
  cur: DiveFrame;
  out: DiveFrame;
  primed: boolean;
  mouse: { x: number; y: number; tx: number; ty: number };
  width: number;
  height: number;
  ghostShown: boolean;
  targetShown: boolean | null;
  videosPlaying: boolean | null;
  text: Record<string, string>;
  wake: () => void;
}

function createRuntime(count: number): Runtime {
  return {
    scene: null,
    css: null,
    sampler: createDiveSampler(ringRadius(Math.max(1, count))),
    goal: createDiveFrame(),
    cur: createDiveFrame(),
    out: createDiveFrame(),
    primed: false,
    mouse: { x: 0, y: 0, tx: 0, ty: 0 },
    width: 1,
    height: 1,
    ghostShown: false,
    targetShown: null,
    videosPlaying: null,
    text: {},
    wake: () => {},
  };
}

function copyFrame(from: DiveFrame, to: DiveFrame) {
  to.pose.target[0] = from.pose.target[0];
  to.pose.target[1] = from.pose.target[1];
  to.pose.target[2] = from.pose.target[2];
  to.pose.radius = from.pose.radius;
  to.pose.phi = from.pose.phi;
  to.pose.theta = from.pose.theta;
  to.fov = from.fov;
  to.scaleX = from.scaleX;
  to.saturation = from.saturation;
  to.haze = from.haze;
  to.interior = from.interior;
  to.corona = from.corona;
  to.look = from.look;
  to.ringSpin = from.ringSpin;
  to.focusOut = from.focusOut;
  to.focusDim = from.focusDim;
  to.fade = from.fade;
}

/** Frame-rate independent approach, `1 - e^(-9dt)`. Returns the largest remaining gap. */
function dampFrame(cur: DiveFrame, goal: DiveFrame, dt: number) {
  const k = 1 - Math.exp(-9 * dt);
  let gap = 0;
  const step = (a: number, b: number) => {
    gap = Math.max(gap, Math.abs(b - a));
    return a + (b - a) * k;
  };
  for (let i = 0; i < 3; i++) cur.pose.target[i] = step(cur.pose.target[i], goal.pose.target[i]);
  // Radius damps in log space so the dolly feels even at both ends.
  const lr = step(Math.log(cur.pose.radius), Math.log(goal.pose.radius));
  cur.pose.radius = Math.exp(lr);
  cur.pose.phi = step(cur.pose.phi, goal.pose.phi);
  const dTheta = angleDelta(cur.pose.theta, goal.pose.theta);
  gap = Math.max(gap, Math.abs(dTheta));
  cur.pose.theta += dTheta * k;
  cur.fov = step(cur.fov, goal.fov);
  cur.scaleX = step(cur.scaleX, goal.scaleX);
  cur.saturation = step(cur.saturation, goal.saturation);
  cur.haze = step(cur.haze, goal.haze);
  cur.interior = step(cur.interior, goal.interior);
  cur.corona = step(cur.corona, goal.corona);
  cur.look = step(cur.look, goal.look);
  return gap;
}

export function ApertureDive({
  panels: panelsProp,
  focusIndex: focusProp = 0,
  headline,
  eyebrowLeft,
  eyebrowRight,
  scrollHint = "Scroll to dive",
  travel: travelProp,
  handoffTarget,
  handoffAlign = 0.5,
  haze = true,
  ground = "sand",
  tone: toneProp,
  quality: qualityProp = "auto",
  renderer: rendererProp = "auto",
  background,
  scrollRoot,
  staticProgress,
  onPhaseChange,
  className,
  children,
}: ApertureDiveProps) {
  const tone = useBjorkTone(toneProp);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const smallScreen = useMedia("(max-width: 767px), (pointer: coarse)");
  const quality: DiveQuality = qualityProp === "auto" ? (smallScreen ? "low" : "high") : qualityProp;
  const isStatic = reducedMotion || staticProgress != null;
  const travel = travelProp ?? (quality === "low" ? 110 : 140);
  const palette = TONES[tone];
  const pageBg = background ?? palette.bg;

  const panels = useMemo(() => panelsProp.slice(0, 12), [panelsProp]);
  const focusIndex = Math.min(Math.max(0, focusProp), Math.max(0, panels.length - 1));
  const focusPanel = panels[focusIndex];
  const media = useMemo(() => panels.map((p) => normalizeMedia(p.media)), [panels]);

  const [mode, setMode] = useState<Mode>("webgl");
  const [sharedVideo, setSharedVideo] = useState<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<ApertureDivePhase>("overhead");
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssHostRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const childrenRef = useRef<HTMLDivElement>(null);
  const registeredTarget = useRef<HTMLElement | null>(null);
  const phaseRef = useRef<ApertureDivePhase>("overhead");
  const onPhaseRef = useRef(onPhaseChange);
  useEffect(() => {
    onPhaseRef.current = onPhaseChange;
  }, [onPhaseChange]);

  // Mutable per-instance runtime. Allocated each render but only the first is kept.
  const rt = useRef<Runtime>(createRuntime(panels.length));

  const registerTarget = useCallback((el: HTMLElement | null) => {
    registeredTarget.current = el;
  }, []);
  const ctx = useMemo<DiveContextValue | null>(
    () => (focusPanel ? { panel: focusPanel, registerTarget } : null),
    [focusPanel, registerTarget],
  );

  const resolveTarget = useCallback((): HTMLElement | null => {
    if (handoffTarget?.current) return handoffTarget.current;
    if (registeredTarget.current?.isConnected) return registeredTarget.current;
    return childrenRef.current?.querySelector<HTMLElement>("[data-aperture-target]") ?? null;
  }, [handoffTarget]);

  // ── Build the renderer ────────────────────────────────────────────────────
  useEffect(() => {
    const r = rt.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || panels.length === 0) return;
    r.sampler = createDiveSampler(ringRadius(panels.length));
    r.primed = false;
    r.ghostShown = false;
    r.targetShown = null;
    r.videosPlaying = null;

    const wantCss = rendererProp === "css" || (rendererProp === "auto" && (!hasWebGL() || saveData()));
    let nextMode: Mode = wantCss ? "css" : "webgl";
    if (!wantCss) {
      try {
        r.scene = new ApertureDiveScene({
          canvas,
          panels: media,
          focusIndex,
          tone,
          quality,
          haze: haze && quality === "high" && !isStatic,
          ground: ground === "sand",
          background: pageBg,
        });
        setSharedVideo(r.scene.focusVideo);
      } catch {
        r.scene = null;
        nextMode = "css";
      }
    }
    if (nextMode === "css" && cssHostRef.current) {
      r.css = new CssWorld(cssHostRef.current, media, focusIndex, tone);
      setSharedVideo(null);
    }
    setMode(nextMode);

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      r.width = rect.width;
      r.height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.75 : 1.5);
      r.scene?.resize(rect.width, rect.height, dpr);
      r.css?.resize(rect.width, rect.height);
      rt.current.wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    return () => {
      ro.disconnect();
      r.scene?.dispose();
      r.scene = null;
      r.css?.dispose();
      r.css = null;
      setSharedVideo(null);
    };
  }, [panels, media, focusIndex, tone, quality, haze, ground, rendererProp, pageBg, isStatic]);

  // ── Per-frame ─────────────────────────────────────────────────────────────
  const write = (key: string, el: HTMLElement | null, prop: "opacity" | "transform" | "filter", value: string) => {
    const r = rt.current;
    const k = `${key}.${prop}`;
    if (!el || r.text[k] === value) return;
    r.text[k] = value;
    el.style[prop] = value;
  };

  const frame = useCallback(
    (dt: number) => {
      const r = rt.current;
      const track = trackRef.current;
      const stage = stageRef.current;
      if (!track || !stage || (!r.scene && !r.css)) return false;

      const root = scrollRoot?.current ?? null;
      const rootTop = root ? root.getBoundingClientRect().top : 0;
      const vh = root ? root.clientHeight : window.innerHeight;
      const tr = track.getBoundingClientRect();
      const scrolled = rootTop - tr.top;
      const range = Math.max(1, tr.height - vh);
      const p = staticProgress != null ? clamp01(staticProgress) : isStatic ? 0 : clamp01(scrolled / range);

      // Handoff progress: from p = HANDOFF_START until the target sits at `handoffAlign`.
      const target = isStatic ? null : resolveTarget();
      let h = 0;
      let tRect: DOMRect | null = null;
      if (target) {
        tRect = target.getBoundingClientRect();
        const s0 = HANDOFF_START * range;
        const align = scrolled + (tRect.top + tRect.height / 2 - rootTop) - vh * handoffAlign;
        const s1 = Math.max(align, s0 + 0.3 * vh);
        h = clamp01((scrolled - s0) / (s1 - s0));
      }

      // Keyframes → goal, then damp the current frame toward it.
      const aspect = r.width / Math.max(1, r.height);
      r.sampler(p, aspect, DIVE_PROFILES[quality], r.goal);
      let gap = 0;
      if (!r.primed || isStatic) {
        copyFrame(r.goal, r.cur);
        r.primed = true;
      } else {
        gap = dampFrame(r.cur, r.goal, dt);
      }

      // Pointer parallax, desktop only; fades out of the overhead ring spin by p = .3.
      const m = r.mouse;
      const km = 1 - Math.exp(-4 * dt);
      m.x += (m.tx - m.x) * km;
      m.y += (m.ty - m.y) * km;
      gap = Math.max(gap, Math.abs(m.tx - m.x), Math.abs(m.ty - m.y));
      copyFrame(r.cur, r.out);
      const overhead = 1 - smoothstep(clamp01(p / 0.3));
      r.out.pose.theta += m.x * 0.03;
      r.out.pose.phi = Math.min(Math.PI - 1e-4, Math.max(1e-4, r.out.pose.phi + m.y * 0.02));
      r.out.ringSpin = m.x * 0.2 * Math.PI * 0.4 * overhead;
      r.out.focusOut = h > 0 ? 1 : 0;
      r.out.focusDim = smoothstep(clamp01(h / 0.3));
      r.out.fade = target ? smoothstep(clamp01((h - 0.02) / 0.5)) : smoothstep(clamp01((p - 0.9) / 0.1));

      const sr = stage.getBoundingClientRect();
      const stageVisible = sr.bottom > rootTop && sr.top < rootTop + vh;
      const flying = h > 0 && h < 1;

      if (stageVisible && r.out.fade < 0.999) {
        if (r.scene) r.scene.render(r.out, dt);
        else r.css?.render(r.out);
      }

      // Videos only decode while someone can see them.
      const wantVideos = stageVisible || flying;
      if (wantVideos !== r.videosPlaying) {
        r.videosPlaying = wantVideos;
        r.scene?.setVideosPlaying(wantVideos, !wantVideos);
        r.css?.setVideosPlaying(wantVideos);
      }

      // Ghost: the landed screen as a DOM element, flown from its projected quad to the target.
      const ghost = ghostRef.current;
      if (ghost && target && tRect && flying) {
        const corners = r.scene ? r.scene.projectFocus() : (r.css?.projectFocus(r.out.scaleX) ?? []);
        if (corners.length === 4) {
          const top = Math.max(sr.top, rootTop); // floats free once the stage scrolls away
          const e = easeHandoff(h);
          const tq: [number, number][] = [
            [tRect.left, tRect.top],
            [tRect.right, tRect.top],
            [tRect.right, tRect.bottom],
            [tRect.left, tRect.bottom],
          ];
          const q = corners.map(([x, y], i) => [
            x + sr.left + (tq[i][0] - x - sr.left) * e,
            y + top + (tq[i][1] - y - top) * e,
          ]) as [number, number][];
          const w = Math.max(1, tRect.width);
          const hh = Math.max(1, tRect.height);
          ghost.style.width = `${w}px`;
          ghost.style.height = `${hh}px`;
          ghost.style.transform = quadToMatrix3d(w, hh, q);
          const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
          ghost.style.borderRadius = `${radius * e}px`;
          if (!r.ghostShown) {
            r.ghostShown = true;
            ghost.style.visibility = "visible";
            const from = r.css?.focusVideo ?? target.querySelector("video");
            const to = ghost.querySelector("video");
            if (from && to && from !== to && Number.isFinite(from.currentTime)) to.currentTime = from.currentTime;
          }
        }
      } else if (ghost && r.ghostShown) {
        r.ghostShown = false;
        ghost.style.visibility = "hidden";
      }

      if (target) {
        const show = h >= 1;
        if (show !== r.targetShown) {
          const ghostVideo = ghost?.querySelector("video");
          const targetVideo = target.querySelector("video");
          if (show && ghostVideo && targetVideo) {
            targetVideo.currentTime = ghostVideo.currentTime;
            targetVideo.play().catch(() => {});
          }
          r.targetShown = show;
          target.style.opacity = show ? "" : "0";
        }
      }

      // DOM chrome, written only when a value changes.
      const headlineK = smoothstep(clamp01((p - 0.1) / 0.2));
      write("headline", headlineRef.current, "opacity", (1 - headlineK).toFixed(3));
      write(
        "headline",
        headlineRef.current,
        "transform",
        `translate3d(0, ${(-headlineK * 18).toFixed(2)}px, 0) scale(${(1 + headlineK * 0.06).toFixed(4)})`,
      );
      write("headline", headlineRef.current, "filter", headlineK > 0.001 ? `blur(${(headlineK * 8).toFixed(2)}px)` : "none");
      write("hint", hintRef.current, "opacity", (1 - smoothstep(clamp01(p / 0.08))).toFixed(3));
      const hudK = (1 - smoothstep(clamp01((p - 0.86) / 0.06))) * (1 - smoothstep(clamp01(h / 0.1)));
      write("hud", hudRef.current, "opacity", isStatic ? "0" : hudK.toFixed(3));
      if (altRef.current) {
        const alt = r.out.pose.target[1] + r.out.pose.radius * Math.cos(r.out.pose.phi);
        const text = alt.toFixed(1).padStart(4, "0");
        if (r.text.alt !== text) {
          r.text.alt = text;
          altRef.current.textContent = text;
        }
      }
      const titleEl = titleRef.current;
      if (titleEl) {
        const k = smoothstep(clamp01((p - 0.78) / 0.08)) * (1 - smoothstep(clamp01(h / 0.12)));
        write("title", titleEl, "opacity", k.toFixed(3));
        if (k > 0.001) {
          const corners = r.scene ? r.scene.projectFocus() : (r.css?.projectFocus(r.out.scaleX) ?? []);
          if (corners.length === 4) {
            const cx = (corners[2][0] + corners[3][0]) / 2;
            const by = Math.max(corners[2][1], corners[3][1]);
            write("title", titleEl, "transform", `translate3d(${cx.toFixed(1)}px, ${(by + 22 + (1 - k) * 8).toFixed(1)}px, 0) translateX(-50%)`);
          }
        }
      }

      const nextPhase: ApertureDivePhase = h > 0 ? "handoff" : p < 0.08 ? "overhead" : p < 0.8 ? "dive" : "landed";
      if (nextPhase !== phaseRef.current) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
        onPhaseRef.current?.(nextPhase);
      }

      if (isStatic) return false;
      // Idle once nothing moves and the stage is out of sight.
      const settled = gap < 1e-4;
      if (!stageVisible && !flying && settled) return false;
      return true;
    },
    [scrollRoot, staticProgress, isStatic, resolveTarget, handoffAlign, quality],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: mounted && !isStatic });
  useEffect(() => {
    rt.current.wake = isStatic ? () => requestAnimationFrame(() => frame(0)) : wake;
  }, [wake, isStatic, frame]);

  // Static: one frame after the renderer exists (and again on resize via rt.current.wake).
  useEffect(() => {
    if (!isStatic) return;
    const id = requestAnimationFrame(() => frame(0));
    const t = window.setTimeout(() => frame(0), 600);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [isStatic, frame, mode, tone, quality]);

  // Wake on scroll and pointer.
  useEffect(() => {
    if (isStatic) return;
    const target: HTMLElement | Window = scrollRoot?.current ?? window;
    const onScroll = () => wake();
    const onPointer = (e: PointerEvent) => {
      if (quality !== "high" || e.pointerType !== "mouse") return;
      const m = rt.current.mouse;
      m.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      m.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      wake();
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [wake, scrollRoot, quality, isStatic]);

  // Reduced motion: the next section crossfades in over 200 ms instead of a handoff.
  useEffect(() => {
    const el = childrenRef.current;
    if (!el || !reducedMotion || staticProgress != null) return;
    el.style.opacity = "0";
    el.style.transition = "opacity 200ms ease-out";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          io.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.style.opacity = "";
      el.style.transition = "";
    };
  }, [reducedMotion, staticProgress]);

  // Targets are visible until the dive takes them over, so no-JS and reduced motion still show them.
  useEffect(() => {
    if (!isStatic) return;
    const t = resolveTarget();
    if (t) t.style.opacity = "";
  }, [isStatic, resolveTarget]);

  const trackHeight = isStatic ? "100svh" : `calc(100svh * ${(1 + travel / 100).toFixed(3)})`;
  const announce =
    phase === "landed" || phase === "handoff" ? `Now showing ${focusPanel?.title ?? `screen ${focusIndex + 1}`}` : "";
  const label = (i: number) => String(i + 1).padStart(2, "0");

  return (
    <div ref={rootRef} className={cn("relative", className)} style={{ background: pageBg }}>
      <style>{`
        @keyframes bjork-aperture-hint { 0% { transform: scaleY(0); transform-origin: top; } 45% { transform: scaleY(1); transform-origin: top; } 55% { transform: scaleY(1); transform-origin: bottom; } 100% { transform: scaleY(0); transform-origin: bottom; } }
        @media (prefers-reduced-motion: reduce) { [data-aperture-hint-line] { animation: none !important; } }
      `}</style>
      <section
        ref={trackRef}
        aria-label="Featured work"
        className="relative"
        style={{ height: trackHeight }}
        data-aperture-dive=""
        data-phase={phase}
      >
        <div
          ref={stageRef}
          className="sticky top-0 w-full overflow-hidden"
          style={{ height: "100svh", background: palette.stage }}
        >
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="absolute inset-0 block h-full w-full"
            style={{ display: mode === "webgl" ? "block" : "none" }}
          />
          <div
            ref={cssHostRef}
            aria-hidden="true"
            className="absolute inset-0"
            style={{ display: mode === "css" ? "block" : "none" }}
          />
          {mode === "css" ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />
          ) : null}

          {/* Chrome */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-5 sm:px-8 sm:pt-7">
            <div className="text-[11px] uppercase tracking-[0.16em]" style={{ color: palette.soft, fontFamily: MONO_FONT }}>
              {eyebrowLeft}
            </div>
            <div className="text-right text-[11px] uppercase tracking-[0.16em]" style={{ color: palette.soft, fontFamily: MONO_FONT }}>
              {eyebrowRight}
            </div>
          </div>

          {headline ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
              <div
                ref={headlineRef}
                className="max-w-[16ch] text-balance text-center will-change-transform"
                style={{
                  color: palette.ink,
                  fontFamily: DISPLAY_FONT,
                  fontSize: "clamp(34px, 6.2vw, 96px)",
                  lineHeight: 0.98,
                  letterSpacing: "-0.035em",
                  fontWeight: 500,
                }}
              >
                {headline}
              </div>
            </div>
          ) : null}

          <div
            ref={hintRef}
            className="pointer-events-none absolute inset-x-0 bottom-7 flex flex-col items-center gap-3"
            style={{ color: palette.soft }}
          >
            <span className="text-[11px] uppercase tracking-[0.18em]" style={{ fontFamily: MONO_FONT }}>
              {scrollHint}
            </span>
            <span className="relative block h-7 w-px overflow-hidden" style={{ background: palette.line }}>
              <span
                data-aperture-hint-line=""
                className="absolute inset-0 block"
                style={{ background: palette.ink, animation: "bjork-aperture-hint 1.8s cubic-bezier(0.77,0,0.175,1) infinite" }}
              />
            </span>
          </div>

          <div
            ref={hudRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-5 pb-5 text-[10px] uppercase tracking-[0.16em] sm:px-8 sm:pb-7"
            style={{ color: palette.faint, fontFamily: MONO_FONT, opacity: isStatic ? 0 : undefined }}
          >
            <span>
              Alt <span ref={altRef} className="tabular-nums" style={{ color: palette.soft }}>34.0</span>
            </span>
            <span className="tabular-nums">
              {label(focusIndex)} / {label(panels.length - 1)}
            </span>
          </div>

          <div
            ref={titleRef}
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-center"
            style={{ opacity: 0, color: palette.ink }}
          >
            {focusPanel?.title ? (
              <div className="text-[15px] tracking-[-0.01em]" style={{ fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
                {focusPanel.title}
              </div>
            ) : null}
            {focusPanel?.meta ? (
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em]" style={{ color: palette.soft, fontFamily: MONO_FONT }}>
                {focusPanel.meta}
              </div>
            ) : null}
          </div>

          <ul className="sr-only">
            {panels.map((p, i) => (
              <li key={p.id}>
                {p.title ?? `Screen ${i + 1}`}
                {p.meta ? `, ${p.meta}` : ""}
              </li>
            ))}
          </ul>
          <LiveRegion message={announce} />
        </div>
      </section>

      <DiveContext.Provider value={ctx}>
        <div ref={childrenRef}>{children}</div>
      </DiveContext.Provider>

      {mounted && focusPanel && !isStatic
        ? createPortal(
            <div
              ref={ghostRef}
              aria-hidden="true"
              className="pointer-events-none fixed left-0 top-0 overflow-hidden"
              style={{ visibility: "hidden", transformOrigin: "0 0", zIndex: 30, willChange: "transform" }}
            >
              <ApertureMedia
                media={focusPanel.media}
                className="absolute inset-0"
                sharedVideo={mode === "webgl" ? sharedVideo : null}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
