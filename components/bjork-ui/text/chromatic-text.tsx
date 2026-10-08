"use client";

// Chromatic Text: crisp, single-coloured type that only splits into colour when it moves.
// Pointer velocity is splatted into a small flow-field texture that decays (and drifts a little
// along itself) every frame. The display shader samples the text along that flow with a
// spectral spread of taps, so fast strokes leave a rainbow smear that settles back to one ink.
// A soft lens magnifies under the cursor. The loop goes idle as soon as everything has settled.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { defaultMaxDpr, sizeCanvas, useElementSize } from "../_core/canvas";
import { useVisibleLoop } from "../_core/loop";
import { useBjorkTone } from "../_core/tone";
import { BJORK_PALETTE, type BjorkTone } from "../_core/palette";

export interface ChromaticTextHandle {
  /** Sweeps a one-shot aberration across the word. */
  pulse: () => void;
}

export interface ChromaticTextProps {
  text?: string;
  /** Ink colour. Defaults to the tone's text colour. */
  color?: string;
  /** Background the type usually sits on. Only used to tint the colour fringes correctly. */
  background?: string;
  /** Strength of the colour split. 0 to 2, default 1. */
  intensity?: number;
  /** Radius of the pointer's influence and lens in CSS px. Defaults to 45% of the font size. */
  radius?: number;
  /** Seconds for the aberration to fade after the pointer stops. Default 0.7. */
  decay?: number;
  /** Fine grain and scanlines that show up with motion. 0 to 1, default 0. */
  grain?: number;
  /** Lens magnification under the cursor. 0 to 0.4, default 0.14. */
  lens?: number;
  tone?: BjorkTone;
  /** Upper bound for the font size in CSS px. The type shrinks to fit narrower containers. */
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  /** Run a pulse once the type is ready. */
  pulseOnMount?: boolean;
  /** Render a single frame of a pulse frozen mid-sweep. Used for previews. */
  frozen?: boolean;
  ariaLabel?: string;
  className?: string;
  ref?: Ref<ChromaticTextHandle>;
}

// ─── WebGL2 support (cached, client only) ────────────────────────────────────

let webgl2Support: boolean | null = null;
function getWebGL2Support(): boolean {
  if (webgl2Support === null) {
    try {
      const probe = document.createElement("canvas");
      const ctx = probe.getContext("webgl2");
      webgl2Support = !!ctx;
      ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl2Support = false;
    }
  }
  return webgl2Support;
}
// React StrictMode runs effect cleanups and re-runs them on the same canvas. Losing the context
// right away would hand the second run a dead context, so the release waits a tick and is
// cancelled if the canvas is picked up again.
const pendingRelease = new WeakMap<HTMLCanvasElement, number>();
function claimCanvas(canvas: HTMLCanvasElement) {
  const t = pendingRelease.get(canvas);
  if (t !== undefined) {
    window.clearTimeout(t);
    pendingRelease.delete(canvas);
  }
}
function releaseCanvas(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
  pendingRelease.set(
    canvas,
    window.setTimeout(() => {
      pendingRelease.delete(canvas);
      if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
    }, 0),
  );
}
const subscribeNoop = () => () => {};
const getServerSupport = () => true;

let scratchCtx: CanvasRenderingContext2D | null = null;
function getScratch(): CanvasRenderingContext2D | null {
  if (!scratchCtx) scratchCtx = document.createElement("canvas").getContext("2d");
  return scratchCtx;
}

function parseColor(input: string, fallback: [number, number, number]): [number, number, number] {
  const ctx = getScratch();
  if (!ctx) return fallback;
  ctx.fillStyle = "#000";
  ctx.fillStyle = input;
  const v = String(ctx.fillStyle);
  if (v.startsWith("#")) {
    const n = parseInt(v.slice(1, 7), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = v.match(/[\d.]+/g);
  if (!m || m.length < 3) return fallback;
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
}

interface Layout {
  width: number;
  height: number;
  fontSize: number;
  font: string;
  tracking: number;
  baseline: number;
  textWidth: number;
  mid: number;
}

function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function computeLayout(width: number, text: string, family: string, weight: number, maxFont: number): Layout | null {
  const ctx = getScratch();
  if (!ctx || width < 8) return null;
  ctx.font = `${weight} 100px ${family}`;
  setTracking(ctx, -3);
  const w100 = Math.max(1, ctx.measureText(text).width);
  const fontSize = Math.max(14, Math.min(maxFont, (width * 0.86 * 100) / w100));
  ctx.font = `${weight} ${fontSize}px ${family}`;
  setTracking(ctx, -0.03 * fontSize);
  const m = ctx.measureText(text);
  const asc = m.actualBoundingBoxAscent || fontSize * 0.72;
  const desc = m.actualBoundingBoxDescent || 0;
  const height = Math.round(fontSize * 1.32);
  const baseline = height / 2 + (asc - desc) / 2;
  return {
    width,
    height,
    fontSize,
    font: `${weight} ${fontSize}px ${family}`,
    tracking: -0.03 * fontSize,
    baseline,
    textWidth: m.width,
    mid: baseline - (asc - desc) / 2,
  };
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Flow field: decay, self-advect, then splat the pointer stroke (a capsule from A to B).
const FLOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPrev;
uniform vec2 uSize;
uniform vec2 uA;
uniform vec2 uB;
uniform vec2 uSplat;
uniform float uRadius;
uniform float uDecay;
uniform float uAdvect;
uniform float uOn;
out vec4 outColor;
void main() {
  vec2 p = vUv * uSize;
  vec2 here = texture(uPrev, vUv).rg * 2.0 - 1.0;
  vec2 v = texture(uPrev, vUv - here * uAdvect / uSize).rg * 2.0 - 1.0;
  v *= uDecay;
  v = sign(v) * max(abs(v) - 1.5 / 255.0, 0.0);
  vec2 ab = uB - uA;
  float t = clamp(dot(p - uA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  float d = length(p - (uA + ab * t));
  float g = exp(-d * d / (uRadius * uRadius)) * uOn;
  v += (uSplat - v) * g * 0.85;
  float l = length(v);
  if (l > 1.0) v /= l;
  outColor = vec4(v * 0.5 + 0.5, 0.0, 1.0);
}`;

const TAPS = 12;

const VIEW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uText;
uniform sampler2D uFlow;
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uPointer;
uniform float uHover;
uniform float uLensR;
uniform float uLens;
uniform float uShift;
uniform float uGrain;
uniform float uTime;
uniform vec3 uInk;
uniform vec3 uBg;
out vec4 outColor;

vec3 hue(float h) {
  return clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0);
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = gl_FragCoord.xy / uDpr;
  vec2 d = p - uPointer;
  float r = length(d) / uLensR;
  float lens = uHover * uLens * pow(max(0.0, 1.0 - r * r), 2.0);
  vec2 q = uPointer + d * (1.0 - lens);

  vec2 flow = texture(uFlow, q / uSize).rg * 2.0 - 1.0;
  flow = sign(flow) * max(abs(flow) - 2.0 / 255.0, 0.0);
  float speed = length(flow);
  vec2 off = flow * uShift;
  vec2 base = q - off * 0.3;

  // Interleaved-gradient jitter turns the discrete taps into one continuous spectral smear.
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  vec3 acc = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < ${TAPS}; i++) {
    float t = clamp((float(i) + jit * min(1.0, speed * 40.0)) / float(${TAPS - 1}), 0.0, 1.0);
    vec3 w = hue(t * 0.74) + 0.08;
    float m = texture(uText, (base + off * (t * 2.0 - 1.0)) / uSize).a;
    acc += m * w;
    wsum += w;
  }
  vec3 m = acc / wsum;

  if (uGrain > 0.0) {
    float heat = min(1.0, speed * 2.5 + uHover * 0.1);
    float n = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y / uDpr * 3.14159 * 0.75);
    float g = uGrain * (0.2 + 0.8 * heat);
    m *= clamp(1.0 + n * g * 0.5 - (1.0 - scan) * g * 0.35, 0.0, 1.2);
    m = clamp(m, 0.0, 1.0);
  }

  float a = max(m.r, max(m.g, m.b));
  // Exact over any background at rest (all channels equal); fringes are tinted for uBg in motion.
  vec3 col = uInk * m + uBg * (a - m);
  outColor = vec4(col, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn("ChromaticText shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, frag: string, names: string[]) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}

function makeTex(gl: WebGL2RenderingContext) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

interface GLState {
  gl: WebGL2RenderingContext;
  view: { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
  flow: { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
  buf: WebGLBuffer;
  text: WebGLTexture;
  fields: { tex: WebGLTexture; fbo: WebGLFramebuffer }[];
  fieldW: number;
  fieldH: number;
  read: number;
}

interface Motion {
  // Pointer in CSS px, y up.
  px: number;
  py: number;
  lastX: number;
  lastY: number;
  vx: number;
  vy: number;
  hasPointer: boolean;
  hover: number;
  hoverTarget: number;
  energy: number;
  pulseT: number; // < 0 when no pulse is running
  pulseLastX: number;
  time: number;
  dirty: boolean;
}

const PULSE_DURATION = 0.75;

export function ChromaticText({
  text = "Chromatic",
  color,
  background,
  intensity = 1,
  radius,
  decay = 0.7,
  grain = 0,
  lens = 0.14,
  tone,
  fontSize = 200,
  fontWeight = 650,
  fontFamily,
  pulseOnMount = false,
  frozen = false,
  ariaLabel,
  className,
  ref,
}: ChromaticTextProps) {
  const resolvedTone = useBjorkTone(tone);
  const reducedMotion = useReducedMotion() ?? false;
  const supported = useSyncExternalStore(subscribeNoop, getWebGL2Support, getServerSupport);
  const palette = BJORK_PALETTE[resolvedTone];

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width } = useElementSize(wrapRef);
  const [fontsReady, setFontsReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);

  const glRef = useRef<GLState | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const dprRef = useRef(1);
  const motionRef = useRef<Motion>({
    px: 0,
    py: 0,
    lastX: 0,
    lastY: 0,
    vx: 0,
    vy: 0,
    hasPointer: false,
    hover: 0,
    hoverTarget: 0,
    energy: 0,
    pulseT: -1,
    pulseLastX: 0,
    time: 0,
    dirty: false,
  });
  const look = useRef({
    ink: [0.93, 0.93, 0.93] as [number, number, number],
    bg: [0.07, 0.07, 0.07] as [number, number, number],
    intensity,
    radius: radius as number | undefined,
    decay,
    grain,
    lens,
  });
  const wakeRef = useRef<() => void>(() => {});

  const still = reducedMotion;

  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearFields = useCallback(() => {
    const g = glRef.current;
    if (!g) return;
    const { gl } = g;
    for (const f of g.fields) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.clearColor(0.5, 0.5, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }, []);

  // Advances the flow field one step, splatting the stroke from A to B (CSS px, y up).
  const stepField = useCallback(
    (dt: number, splat: { ax: number; ay: number; bx: number; by: number; vx: number; vy: number; r: number } | null) => {
      const g = glRef.current;
      const lay = layoutRef.current;
      if (!g || !lay) return;
      const { gl, flow } = g;
      const L = look.current;
      const src = g.fields[g.read];
      const dst = g.fields[1 - g.read];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, g.fieldW, g.fieldH);
      gl.useProgram(flow.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(flow.u.uPrev, 0);
      gl.uniform2f(flow.u.uSize, lay.width, lay.height);
      const life = Math.max(0.08, L.decay);
      gl.uniform1f(flow.u.uDecay, Math.exp((-dt * 4.6) / life));
      gl.uniform1f(flow.u.uAdvect, 140 * dt);
      if (splat) {
        gl.uniform2f(flow.u.uA, splat.ax, splat.ay);
        gl.uniform2f(flow.u.uB, splat.bx, splat.by);
        gl.uniform2f(flow.u.uSplat, splat.vx, splat.vy);
        gl.uniform1f(flow.u.uRadius, splat.r);
        gl.uniform1f(flow.u.uOn, 1);
      } else {
        gl.uniform1f(flow.u.uOn, 0);
        gl.uniform1f(flow.u.uRadius, 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      g.read = 1 - g.read;
    },
    [],
  );

  const draw = useCallback(() => {
    const g = glRef.current;
    const lay = layoutRef.current;
    const canvas = canvasRef.current;
    if (!g || !lay || !canvas || g.gl.isContextLost()) return;
    const { gl, view } = g;
    const L = look.current;
    const M = motionRef.current;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(view.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.text);
    gl.uniform1i(view.u.uText, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, g.fields[g.read].tex);
    gl.uniform1i(view.u.uFlow, 1);
    gl.uniform2f(view.u.uSize, lay.width, lay.height);
    gl.uniform1f(view.u.uDpr, dprRef.current);
    gl.uniform2f(view.u.uPointer, M.px, M.py);
    gl.uniform1f(view.u.uHover, M.hover);
    gl.uniform1f(view.u.uLensR, L.radius ?? lay.fontSize * 0.45);
    gl.uniform1f(view.u.uLens, Math.min(0.4, Math.max(0, L.lens)));
    gl.uniform1f(view.u.uShift, Math.min(2, Math.max(0, L.intensity)) * lay.fontSize * 0.15);
    gl.uniform1f(view.u.uGrain, Math.min(1, Math.max(0, L.grain)));
    gl.uniform1f(view.u.uTime, M.time);
    gl.uniform3f(view.u.uInk, L.ink[0], L.ink[1], L.ink[2]);
    gl.uniform3f(view.u.uBg, L.bg[0], L.bg[1], L.bg[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, []);

  // One simulation step. Returns true while something is still moving.
  const advance = useCallback(
    (dt: number): boolean => {
      const lay = layoutRef.current;
      if (!lay || !glRef.current) return false;
      const M = motionRef.current;
      const L = look.current;
      const r = L.radius ?? lay.fontSize * 0.45;
      M.time += dt;

      let splat: Parameters<typeof stepField>[1] = null;
      if (M.pulseT >= 0) {
        M.pulseT += dt;
        const k = Math.min(1, M.pulseT / PULSE_DURATION);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const x0 = lay.width / 2 - lay.textWidth * 0.62;
        const x1 = lay.width / 2 + lay.textWidth * 0.62;
        const x = x0 + (x1 - x0) * e;
        const speed = Math.min(1, Math.abs(x - M.pulseLastX) / Math.max(dt, 1e-3) / 1400);
        const y = lay.height - lay.mid;
        splat = { ax: M.pulseLastX, ay: y, bx: x, by: y, vx: speed, vy: speed * 0.18, r: lay.fontSize * 0.55 };
        M.energy = Math.max(M.energy, speed);
        M.pulseLastX = x;
        if (k >= 1) M.pulseT = -1;
      } else if (M.hasPointer) {
        const dx = M.px - M.lastX;
        const dy = M.py - M.lastY;
        const ivx = dx / Math.max(dt, 1e-3);
        const ivy = dy / Math.max(dt, 1e-3);
        M.vx += (ivx - M.vx) * 0.5;
        M.vy += (ivy - M.vy) * 0.5;
        // Saturating response: a casual stroke already splits clearly, a flick maxes out.
        const raw = Math.hypot(M.vx, M.vy);
        const sl = 1 - Math.exp(-raw / 420);
        const svx = raw > 1e-3 ? (M.vx / raw) * sl : 0;
        const svy = raw > 1e-3 ? (M.vy / raw) * sl : 0;
        if (sl > 0.02) {
          splat = { ax: M.lastX, ay: M.lastY, bx: M.px, by: M.py, vx: svx, vy: svy, r: r * 0.7 };
          M.energy = Math.max(M.energy, Math.min(1, sl));
        }
        M.lastX = M.px;
        M.lastY = M.py;
      }
      stepField(dt, splat);
      M.energy *= Math.exp((-dt * 4.6) / Math.max(0.08, L.decay));
      M.hover += (M.hoverTarget - M.hover) * (1 - Math.exp(-dt * 9));
      const settled = M.energy < 0.004 && Math.abs(M.hoverTarget - M.hover) < 0.002 && M.pulseT < 0;
      if (settled) {
        M.hover = M.hoverTarget;
        M.energy = 0;
        M.vx = 0;
        M.vy = 0;
        clearFields();
      }
      return !settled;
    },
    [stepField, clearFields],
  );

  // Props that only change the look are kept in a ref and repainted in place.
  useEffect(() => {
    const L = look.current;
    L.ink = parseColor(color ?? palette.text, resolvedTone === "dark" ? [0.93, 0.93, 0.93] : [0.09, 0.09, 0.09]);
    L.bg = parseColor(background ?? palette.stage, resolvedTone === "dark" ? [0.07, 0.07, 0.07] : [0.97, 0.96, 0.94]);
    L.intensity = intensity;
    L.radius = radius;
    L.decay = decay;
    L.grain = grain;
    L.lens = lens;
    draw();
  }, [color, background, palette, resolvedTone, intensity, radius, decay, grain, lens, draw]);

  // GL setup / teardown.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !supported) return;
    claimCanvas(canvas);
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) return;
    const view = link(gl, VIEW_FRAG, ["uText", "uFlow", "uSize", "uDpr", "uPointer", "uHover", "uLensR", "uLens", "uShift", "uGrain", "uTime", "uInk", "uBg"]);
    const flow = link(gl, FLOW_FRAG, ["uPrev", "uSize", "uA", "uB", "uSplat", "uRadius", "uDecay", "uAdvect", "uOn"]);
    const buf = gl.createBuffer();
    const textTex = makeTex(gl);
    if (!view || !flow || !buf || !textTex) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    glRef.current = { gl, view, flow, buf, text: textTex, fields: [], fieldW: 0, fieldH: 0, read: 0 };

    const onLost = (e: Event) => {
      e.preventDefault();
      glRef.current = null;
    };
    const onRestored = () => setEpoch((v) => v + 1);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const g = glRef.current;
      glRef.current = null;
      if (!gl.isContextLost()) {
        if (g) {
          for (const f of g.fields) {
            gl.deleteFramebuffer(f.fbo);
            gl.deleteTexture(f.tex);
          }
        }
        gl.deleteTexture(textTex);
        gl.deleteBuffer(buf);
        gl.deleteProgram(view.prog);
        gl.deleteProgram(flow.prog);
        releaseCanvas(canvas, gl);
      }
    };
  }, [supported, epoch]);

  const { wake } = useVisibleLoop(
    wrapRef,
    useCallback(
      (dt: number) => {
        const keep = advance(dt);
        draw();
        return keep;
      },
      [advance, draw],
    ),
    { enabled: supported && !still && !frozen },
  );
  useEffect(() => {
    wakeRef.current = wake;
  }, [wake]);

  // Layout, canvas size, text texture and flow-field targets.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !fontsReady || width < 8) return;
    let cancelled = false;
    const family = fontFamily ?? (getComputedStyle(wrap).fontFamily || "sans-serif");
    const run = () => {
      if (cancelled) return;
      const lay = computeLayout(width, text, family, fontWeight, fontSize);
      if (!lay) return;
      layoutRef.current = lay;
      setLayout((prev) =>
        prev && prev.width === lay.width && prev.height === lay.height && prev.fontSize === lay.fontSize ? prev : lay,
      );
      const dpr = sizeCanvas(canvas, lay.width, lay.height, defaultMaxDpr());
      dprRef.current = dpr;
      const g = glRef.current;
      if (!g || g.gl.isContextLost()) return;
      const { gl } = g;

      // Text mask at backing resolution so the resting frame is pixel crisp.
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.font = lay.font;
      setTracking(ctx, lay.tracking);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";
      ctx.fillText(text, lay.width / 2, lay.baseline);
      gl.bindTexture(gl.TEXTURE_2D, g.text);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      // Flow field at a quarter of CSS resolution.
      const fw = Math.max(8, Math.ceil(lay.width / 4));
      const fh = Math.max(8, Math.ceil(lay.height / 4));
      if (fw !== g.fieldW || fh !== g.fieldH || g.fields.length === 0) {
        for (const f of g.fields) {
          gl.deleteFramebuffer(f.fbo);
          gl.deleteTexture(f.tex);
        }
        g.fields = [];
        for (let i = 0; i < 2; i++) {
          const tex = makeTex(gl);
          const fbo = gl.createFramebuffer();
          if (!tex || !fbo) return;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
          g.fields.push({ tex, fbo });
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        g.fieldW = fw;
        g.fieldH = fh;
        g.read = 0;
        clearFields();
      }

      const M = motionRef.current;
      if (frozen && !still) {
        // Replay a pulse offline and stop just past the middle of the sweep.
        clearFields();
        M.hover = 0;
        M.hoverTarget = 0;
        M.energy = 0;
        M.pulseT = 0;
        M.pulseLastX = lay.width / 2 - lay.textWidth * 0.62;
        const dt = 1 / 60;
        for (let t = 0; t < PULSE_DURATION * 0.58; t += dt) advance(dt);
      } else if (pulseOnMount && !still && M.pulseT < 0 && M.time === 0) {
        M.pulseT = 0;
        M.pulseLastX = lay.width / 2 - lay.textWidth * 0.62;
        wakeRef.current();
      }
      draw();
    };
    document.fonts.load(`${fontWeight} 100px ${family}`, text).then(run, run);
    return () => {
      cancelled = true;
    };
  }, [width, text, fontWeight, fontFamily, fontSize, fontsReady, frozen, still, pulseOnMount, epoch, draw, advance, clearFields]);

  // Pointer input.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || still || frozen || !supported) return;
    const toLocal = (e: PointerEvent): [number, number] | null => {
      const lay = layoutRef.current;
      if (!lay) return null;
      const rect = wrap.getBoundingClientRect();
      const sx = rect.width > 0 ? lay.width / rect.width : 1;
      const sy = rect.height > 0 ? lay.height / rect.height : 1;
      return [(e.clientX - rect.left) * sx, lay.height - (e.clientY - rect.top) * sy];
    };
    const onMove = (e: PointerEvent) => {
      const pt = toLocal(e);
      if (!pt) return;
      const M = motionRef.current;
      if (!M.hasPointer) {
        M.lastX = pt[0];
        M.lastY = pt[1];
      }
      M.px = pt[0];
      M.py = pt[1];
      M.hasPointer = true;
      M.hoverTarget = 1;
      wakeRef.current();
    };
    const onLeave = () => {
      const M = motionRef.current;
      M.hasPointer = false;
      M.hoverTarget = 0;
      wakeRef.current();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") onLeave();
    };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerdown", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("pointercancel", onLeave);
    wrap.addEventListener("pointerup", onUp);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerdown", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("pointercancel", onLeave);
      wrap.removeEventListener("pointerup", onUp);
    };
  }, [still, frozen, supported]);

  useImperativeHandle(
    ref,
    () => ({
      pulse: () => {
        const lay = layoutRef.current;
        if (!lay || still || frozen) return;
        const M = motionRef.current;
        M.pulseT = 0;
        M.pulseLastX = lay.width / 2 - lay.textWidth * 0.62;
        wakeRef.current();
      },
    }),
    [still, frozen],
  );

  const label = ariaLabel ?? text;

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={label}
      data-tone={resolvedTone}
      className={cn("relative w-full select-none", className)}
      style={{
        height: layout ? layout.height : undefined,
        minHeight: layout ? undefined : "1.3em",
        touchAction: "pan-y",
        fontFamily: fontFamily ?? "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
        fontWeight,
      }}
    >
      {supported ? (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute left-0 top-0 block" />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap leading-none"
          style={{
            color: color ?? palette.text,
            fontSize: layout ? layout.fontSize : "clamp(40px, 12vw, 140px)",
            letterSpacing: "-0.03em",
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}
