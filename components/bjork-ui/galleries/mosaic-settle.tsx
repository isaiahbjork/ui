"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import NextImage from "next/image";
import { useReducedMotion } from "framer-motion";
import { Mesh, Program, Renderer, Texture, Triangle } from "ogl";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { cubicBezier, ease } from "@/components/bjork-ui/_core/motion";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { defaultMaxDpr, useElementSize } from "@/components/bjork-ui/_core/canvas";

export type MosaicPalette = "ember" | "ocean" | "mono" | [string, string, string, string];

export interface MosaicSettleProps {
  src: string;
  alt: string;
  caption?: ReactNode;
  pending?: boolean;
  aspectRatio?: number;
  rounded?: number;
  palette?: MosaicPalette;
  mechanic?: "organic" | "sweep";
  /** Sweep origin in frame space, 0 to 1. [0, 0] is the top-left corner. */
  origin?: [number, number];
  cellSize?: number;
  duration?: number;
  onSettled?: () => void;
  onError?: () => void;
  /** Images that `attract` cycles through. Falls back to `src`. */
  srcList?: string[];
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

type Rgb = [number, number, number];

const PALETTES: Record<"ember" | "ocean" | "monoDark" | "monoLight", string[]> = {
  ember: ["#140904", "#5a1f08", "#ec5c13", "#ffb27a"],
  ocean: ["#04101a", "#0d3b5c", "#1f7fb0", "#9fd6f0"],
  monoDark: ["#0b0b0b", "#2a2a2a", "#6a6a6a", "#d8d8d8"],
  monoLight: ["#f7f5ef", "#e1d7c8", "#a49b8e", "#3a3a3a"],
};

// Attract timeline: churn for 1.8s, then release (settle, fade and hold) for 2.6s, then the next image.
const ATTRACT_CHURN_MS = 1800;
const ATTRACT_RELEASE_MS = 2600;
const ATTRACT_RESUME_MS = 4000;
const FADE_MS = 200;
const FALLBACK_FADE_MS = 400;
const MAX_CONTEXT_ATTEMPTS = 3;

// Cubic bezier from _core/motion (ease.out), evaluated per frame for the settle progress.
const easeOutCurve = cubicBezier(ease.out[0], ease.out[1], ease.out[2], ease.out[3]);

// Probed once. OGL logs a console error when no context exists, so the probe avoids that path entirely.
let webglSupport: boolean | null = null;
function supportsWebGL(): boolean {
  if (webglSupport === null) {
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") || probe.getContext("webgl");
      webglSupport = gl !== null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function resolvePalette(palette: MosaicPalette, tone: BjorkTone): string[] {
  if (Array.isArray(palette)) return palette;
  if (palette === "mono") return tone === "light" ? PALETTES.monoLight : PALETTES.monoDark;
  return PALETTES[palette];
}

// Module-level sources: compiled once, shared by every instance.
const VERT = /* glsl */ `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uSettle;
uniform float uTime;
uniform vec2 uCells;
uniform vec3 uPalette[4];
uniform float uMechanic;
uniform vec2 uOrigin;
uniform float uImageAspect;
uniform float uFrameAspect;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// Value noise in 0..1.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 paletteAt(float i) {
  if (i < 0.5) return uPalette[0];
  if (i < 1.5) return uPalette[1];
  if (i < 2.5) return uPalette[2];
  return uPalette[3];
}

// Cover fit: maps frame uv to image uv, the same crop as object-fit: cover.
vec2 coverUv(vec2 uv) {
  float r = uFrameAspect / uImageAspect;
  vec2 o = uv;
  if (r > 1.0) o.y = (uv.y - 0.5) / r + 0.5;
  else o.x = (uv.x - 0.5) * r + 0.5;
  return o;
}

float originDist(vec2 p) {
  return length((p - uOrigin) * vec2(uFrameAspect, 1.0));
}

float maxOriginDist() {
  return max(max(originDist(vec2(0.0, 0.0)), originDist(vec2(1.0, 0.0))),
             max(originDist(vec2(0.0, 1.0)), originDist(vec2(1.0, 1.0))));
}

void main() {
  vec2 cell = floor(vUv * uCells);
  vec2 cc = (cell + 0.5) / uCells;
  float h = hash(cell);

  // Pending churn: quantised noise picks a palette index, plus a small brightness flicker.
  float n = vnoise(cell * 0.35 + vec2(uTime * 0.6, 0.0));
  float idx = floor(clamp(n, 0.0, 0.999) * 4.0);
  vec3 pend = paletteAt(idx) + (h - 0.5) * 0.08;

  // Settle delay per cell.
  float delay;
  if (uMechanic < 0.5) {
    delay = 0.6 * h + 0.4 * vnoise(cell * 0.12);
  } else {
    delay = 0.85 * originDist(cc) / maxOriginDist() + 0.15 * h;
  }
  float local = smoothstep(delay, delay + 0.15, uSettle * 1.15);

  // Cells sample the image at their centre, then de-pixelate over the last 15 percent.
  float depix = smoothstep(0.85, 1.0, uSettle);
  vec2 suv = mix(cc, vUv, depix);
  vec3 texel = texture2D(uTex, coverUv(suv)).rgb;

  gl_FragColor = vec4(mix(pend, texel, local), 1.0);
}
`;

interface LiveState {
  pending: boolean;
  reduce: boolean;
  decoded: HTMLImageElement | null;
  duration: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  mechanic: "organic" | "sweep";
  ox: number;
  oy: number;
  pal: number[];
  src: string;
}

const INITIAL_LIVE: LiveState = {
  pending: false,
  reduce: false,
  decoded: null,
  duration: 900,
  width: 0,
  height: 0,
  cols: 1,
  rows: 1,
  mechanic: "organic",
  ox: 0,
  oy: 0,
  pal: [],
  src: "",
};

interface GLState {
  renderer: Renderer;
  program: Program;
  mesh: Mesh;
  texture: Texture;
  image: HTMLImageElement | null;
  dead: boolean;
}

function draw(gl: GLState, s: LiveState, settle: number, time: number) {
  if (s.decoded && gl.image !== s.decoded) {
    gl.image = s.decoded;
    gl.texture.image = s.decoded;
  }
  const u = gl.program.uniforms;
  u.uTime.value = time;
  u.uSettle.value = settle;
  u.uCells.value = [s.cols, s.rows];
  u.uFrameAspect.value = s.width / s.height;
  u.uImageAspect.value = s.decoded ? s.decoded.naturalWidth / s.decoded.naturalHeight : 1;
  u.uMechanic.value = s.mechanic === "sweep" ? 1 : 0;
  u.uOrigin.value = [s.ox, s.oy];
  u.uPalette.value = s.pal;
  gl.renderer.render({ scene: gl.mesh });
}

function subscribeNoop() {
  return () => {};
}
function getMounted() {
  return true;
}
function getServerMounted() {
  return false;
}

export function MosaicSettle({
  src,
  alt,
  caption,
  pending = false,
  aspectRatio = 4 / 3,
  rounded = 16,
  palette = "ember",
  mechanic = "organic",
  origin = [0, 0],
  cellSize = 14,
  duration = 900,
  onSettled,
  onError,
  srcList,
  tone: toneProp,
  attract = false,
  className,
}: MosaicSettleProps) {
  const tone = useBjorkTone(toneProp);
  // Hydration-safe: the server and first client render assume no reduced motion.
  const reducedRaw = useReducedMotion();
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  const reduce = mounted && reducedRaw === true;

  // Attract: cycle through srcList, churning, then releasing. Timers, not frames, so it stays cheap.
  const list = srcList && srcList.length > 0 ? srcList : [src];
  const attractOn = attract && !reduce;
  const [attractStep, setAttractStep] = useState<0 | 1>(0);
  const [attractIdx, setAttractIdx] = useState(0);
  const [attractPaused, setAttractPaused] = useState(false);
  const resumeTimer = useRef(0);

  const effSrc = attractOn ? list[attractIdx % list.length] : src;
  const effPending = pending || (attractOn && attractStep === 0);

  const [decoded, setDecoded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const [fadeOn, setFadeOn] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [prevPending, setPrevPending] = useState(effPending);

  // A rising edge of `pending` after the image has settled re-churns: clear the done latch.
  if (prevPending !== effPending) {
    setPrevPending(effPending);
    if (effPending) {
      setDoneFor(null);
      setFadeOn(false);
    }
  }

  const decodedImg = decoded && decoded.src === effSrc ? decoded.img : null;
  const isFailed = failed === effSrc;
  const settled = doneFor === effSrc;
  const fallbackMode = glFailed && !isFailed;
  const showCanvas = !glFailed && !isFailed && !settled;
  const fallbackDone = fallbackMode && decodedImg !== null && !effPending;
  const done = !isFailed && (fallbackMode ? fallbackDone : settled);
  const busy = !isFailed && !done;
  const imgShown = !isFailed && (fallbackMode ? fallbackDone : settled || fadeOn);

  const figureRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLState | null>(null);
  const phaseRef = useRef<"churn" | "settle">("churn");
  const phaseSrcRef = useRef("");
  const settleStartRef = useRef(0);
  const live = useRef<LiveState>(INITIAL_LIVE);
  const cbRef = useRef<{ onSettled?: () => void; onError?: () => void }>({});

  const size = useElementSize(frameRef);
  const colors = resolvePalette(palette, tone);
  const tokens = BJORK_PALETTE[tone];
  const cssVars = {
    "--bjork-border": tokens.border,
    "--bjork-text-muted": tokens.textMuted,
    "--bjork-text-soft": tokens.textSoft,
    "--bjork-accent": tokens.accent,
  } as CSSProperties;
  const gradient = `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 35%, ${colors[2]} 68%, ${colors[3]} 100%)`;

  // Effects run in declaration order. Keep the live snapshot first so later effects see fresh values.
  useEffect(() => {
    cbRef.current = { onSettled, onError };
    live.current = {
      pending: effPending,
      reduce,
      decoded: decodedImg,
      duration,
      width: size.width,
      height: size.height,
      cols: Math.max(1, Math.round(size.width / cellSize)),
      rows: Math.max(1, Math.round(size.height / cellSize)),
      mechanic,
      ox: origin[0],
      oy: 1 - origin[1],
      pal: colors.flatMap(hexToRgb),
      src: effSrc,
    };
  });

  // Decode once per source. The texture is uploaded from this decoded image.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.src = effSrc;
    img.decode().then(
      () => {
        if (alive) setDecoded({ src: effSrc, img });
      },
      () => {
        if (alive) {
          setFailed(effSrc);
          cbRef.current.onError?.();
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [effSrc]);

  // WebGL context: created when the canvas mounts, lost when it unmounts (settled, or a new churn).
  useEffect(() => {
    if (!showCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!supportsWebGL()) {
      requestAnimationFrame(() => setGlFailed(true));
      return;
    }

    let renderer: Renderer | null = null;
    try {
      renderer = new Renderer({
        canvas,
        alpha: false,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, defaultMaxDpr()),
      });
    } catch {
      renderer = null;
    }
    const gl = renderer?.gl;
    if (!renderer || !gl || gl.isContextLost()) {
      // StrictMode re-runs effects on the same canvas, whose context is already lost: remount with a fresh canvas.
      requestAnimationFrame(() => {
        if (epoch + 1 >= MAX_CONTEXT_ATTEMPTS) setGlFailed(true);
        else setEpoch((e) => e + 1);
      });
      return;
    }

    let state: GLState;
    try {
      const geometry = new Triangle(gl);
      const texture = new Texture(gl, {
        generateMipmaps: false,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
      });
      // A 1x1 placeholder keeps the sampler complete until the real image is uploaded.
      const placeholder = document.createElement("canvas");
      placeholder.width = 1;
      placeholder.height = 1;
      texture.image = placeholder;
      const program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTex: { value: texture },
          uSettle: { value: 0 },
          uTime: { value: 0 },
          uCells: { value: [1, 1] },
          uPalette: { value: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          uMechanic: { value: 0 },
          uOrigin: { value: [0, 0] },
          uImageAspect: { value: 1 },
          uFrameAspect: { value: 1 },
        },
      });
      const mesh = new Mesh(gl, { geometry, program });
      state = { renderer, program, mesh, texture, image: null, dead: false };
    } catch {
      requestAnimationFrame(() => setGlFailed(true));
      return;
    }

    glRef.current = state;
    phaseRef.current = "churn";
    phaseSrcRef.current = "";

    return () => {
      // Mark dead first so a frame that is already queued never touches a lost context.
      state.dead = true;
      renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [showCanvas, epoch]);

  useEffect(() => {
    const g = glRef.current;
    if (!g || g.dead || !showCanvas || !size.width || !size.height) return;
    g.renderer.setSize(size.width, size.height);
  }, [size.width, size.height, showCanvas, epoch]);

  // One frame function drives churn, settle and the static reduced-motion frame.
  const frame = (_dt: number, t: number): boolean => {
    const s = live.current;
    const g = glRef.current;
    if (!g || g.dead) return false;
    if (!s.width || !s.height) return true;

    if (phaseSrcRef.current !== s.src) {
      phaseSrcRef.current = s.src;
      phaseRef.current = "churn";
    }
    if (s.pending && phaseRef.current === "settle") phaseRef.current = "churn";
    if (phaseRef.current === "churn" && s.decoded && !s.pending) {
      phaseRef.current = "settle";
      settleStartRef.current = t;
    }

    let settle = 0;
    let finished = false;
    if (phaseRef.current === "settle") {
      if (s.reduce) {
        settle = 1;
        finished = true;
      } else {
        const p = Math.min(1, (t - settleStartRef.current) / (s.duration / 1000));
        finished = p >= 1;
        settle = finished ? 1 : easeOutCurve(p);
      }
    }

    try {
      // Reduced motion draws one static frame: no churn time, no settle sweep.
      draw(g, s, settle, s.reduce ? 0 : t);
    } catch {
      // Texture upload can fail on cross-origin images without CORS. Fall back to the CSS surface.
      setGlFailed(true);
      return false;
    }

    if (finished) {
      const srcAtFinish = s.src;
      setFadeOn(true);
      window.setTimeout(() => {
        setFadeOn(false);
        if (!live.current.pending) setDoneFor(srcAtFinish);
      }, FADE_MS);
      return false;
    }
    if (phaseRef.current === "churn" && s.reduce) return false;
    return true;
  };

  // The loop is always subscribed. With no canvas the frame returns false at once, so data-loop reads idle.
  const { wake } = useVisibleLoop(figureRef, frame);

  useEffect(() => {
    wake();
  }, [wake, effPending, decodedImg, reduce]);

  // Fires once per completed settle (canvas or fallback), including re-settles after a re-churn.
  useEffect(() => {
    if (done) cbRef.current.onSettled?.();
  }, [done]);

  // Attract timeline: each step is a timer, so nothing accumulates over time.
  useEffect(() => {
    if (!attractOn || attractPaused) return;
    const id = window.setTimeout(
      () => {
        if (attractStep === 0) {
          setAttractStep(1);
        } else {
          setAttractStep(0);
          setAttractIdx((i) => (i + 1) % list.length);
        }
      },
      attractStep === 0 ? ATTRACT_CHURN_MS : ATTRACT_RELEASE_MS,
    );
    return () => window.clearTimeout(id);
  }, [attractOn, attractPaused, attractStep, list.length]);

  const pauseAttract = () => {
    if (!attractOn) return;
    setAttractPaused(true);
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setAttractPaused(false), ATTRACT_RESUME_MS);
  };

  return (
    <figure
      ref={figureRef}
      aria-busy={busy}
      onPointerMove={pauseAttract}
      onPointerDown={pauseAttract}
      onKeyDown={pauseAttract}
      className={cn("m-0 w-full min-w-0", className)}
      style={cssVars}
    >
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden border border-[color:var(--bjork-border)]"
        style={{ aspectRatio, borderRadius: rounded, background: colors[0] }}
      >
        {fallbackMode || isFailed ? (
          <div aria-hidden="true" className="absolute inset-0" style={{ background: gradient }} />
        ) : null}
        <NextImage
          src={effSrc}
          alt={alt}
          fill
          unoptimized
          loading="eager"
          sizes="(max-width: 768px) 100vw, 560px"
          draggable={false}
          className="object-cover"
          style={{
            opacity: imgShown ? 1 : 0,
            filter: fallbackMode && !imgShown && !reduce ? "blur(12px)" : "none",
            transition: fallbackMode
              ? `opacity ${reduce ? 200 : FALLBACK_FADE_MS}ms cubic-bezier(0.23,1,0.32,1), filter ${FALLBACK_FADE_MS}ms cubic-bezier(0.23,1,0.32,1)`
              : `opacity ${FADE_MS}ms ease-out`,
          }}
        />
        {showCanvas ? (
          <canvas
            key={epoch}
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
            style={{ opacity: fadeOn ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-out` }}
          />
        ) : null}
        {isFailed ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <span className="font-bjork-alpha text-[12px] text-[color:var(--bjork-text-soft)]">
              Image unavailable
            </span>
          </div>
        ) : null}
      </div>
      {caption ? (
        <figcaption className="mt-2 font-bjork-alpha text-[12px] text-[color:var(--bjork-text-muted)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
