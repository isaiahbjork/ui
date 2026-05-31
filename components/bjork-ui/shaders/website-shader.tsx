"use client";

import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type WebsiteShaderId =
  | "aurora-veil"
  | "kinetic-dots";

export interface WebsiteShaderPreset {
  id: WebsiteShaderId;
  title: string;
  summary: string;
  intent: string;
  accent: string;
  interactive?: boolean;
  preview: {
    dark: string;
    light: string;
  };
  fragment: string;
}

export interface WebsiteShaderCanvasProps {
  preset?: WebsiteShaderId | string | WebsiteShaderPreset;
  className?: string;
  tone?: "dark" | "light";
  intensity?: number;
  animate?: boolean;
  maxPixelRatio?: number;
  maxCanvasPixels?: number;
  children?: ReactNode;
}

interface WebsiteShaderDemoProps {
  preset: WebsiteShaderId | WebsiteShaderPreset;
  className?: string;
}

const vertexShaderSource = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentHeader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec4 u_trails[8];
uniform float u_intensity;
uniform float u_isLight;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = rotate2d(0.72) * p * 2.03 + 4.17;
    amplitude *= 0.5;
  }
  return value;
}

vec3 softLight(vec3 base, vec3 glow, float amount) {
  return mix(base, glow, saturate(amount));
}
`;

const fragmentFooter = `
void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / max(min(u_resolution.x, u_resolution.y), 1.0);
  vec2 pointer = u_pointer * 2.0 - 1.0;
  pointer.x *= u_resolution.x / max(u_resolution.y, 1.0);

  vec3 color = shaderColor(uv, p, u_time, pointer, u_intensity, u_isLight);
  color = pow(max(color, vec3(0.0)), vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
`;

export const websiteShaderPresets: WebsiteShaderPreset[] = [
  {
    id: "aurora-veil",
    title: "Aurora veil",
    summary: "Soft atmospheric color fields that sit well behind editorial copy.",
    intent: "Use it as a low-pressure section backdrop for launch pages, portfolios, and app onboarding.",
    accent: "#7bd8c4",
    interactive: false,
    preview: {
      dark: "radial-gradient(circle at 30% 24%, rgba(89,216,190,0.5), transparent 31%), radial-gradient(circle at 80% 72%, rgba(236,92,19,0.3), transparent 34%), linear-gradient(140deg, #06110f, #151515 55%, #030303)",
      light:
        "radial-gradient(circle at 30% 24%, rgba(35,164,141,0.32), transparent 31%), radial-gradient(circle at 80% 72%, rgba(214,74,14,0.24), transparent 34%), radial-gradient(circle at 50% 42%, rgba(255,255,255,0.66), transparent 40%), linear-gradient(140deg, #fbfaf6, #f7f5ef 55%, #fff8ec)",
    },
    fragment: `
vec3 shaderColor(vec2 uv, vec2 p, float t, vec2 pointer, float intensity, float isLight) {
  vec2 q = p;
  q.x += sin(q.y * 2.0 + t * 0.18) * 0.22;
  q.y += cos(q.x * 1.7 - t * 0.14) * 0.16;

  float veilA = smoothstep(0.72, 0.04, abs(q.y + sin(q.x * 1.8 + t * 0.24) * 0.32));
  float veilB = smoothstep(0.62, 0.02, abs(q.y * 0.85 - cos(q.x * 2.4 - t * 0.2) * 0.24));
  float grain = fbm(q * 2.5 + t * 0.04);

  vec3 darkBase = vec3(0.03, 0.04, 0.038);
  vec3 darkGreen = vec3(0.28, 0.82, 0.72);
  vec3 darkEmber = vec3(0.95, 0.34, 0.1);
  vec3 darkColor = darkBase + darkGreen * veilA * 0.46 + darkEmber * veilB * 0.28;
  darkColor += (grain - 0.5) * 0.036;
  darkColor *= 0.84 + intensity * 0.22;

  vec3 lightBase = vec3(0.97, 0.96, 0.92);
  vec3 lightGreen = vec3(0.06, 0.55, 0.48);
  vec3 lightEmber = vec3(0.78, 0.22, 0.03);
  vec3 lightColor = lightBase;
  lightColor = mix(lightColor, lightGreen, veilA * 0.38);
  lightColor = mix(lightColor, lightEmber, veilB * 0.27);
  lightColor += vec3(1.0, 0.97, 0.88) * smoothstep(0.86, 0.12, length(p - vec2(0.08, 0.04))) * 0.045;
  lightColor += (grain - 0.5) * 0.012;

  return mix(darkColor, lightColor, isLight);
}
`,
  },
  {
    id: "kinetic-dots",
    title: "Kinetic dots",
    summary: "A hover-reactive cell field that fills the trail behind the pointer.",
    intent: "Use it for interactive cards, playful analytics, and hero accents where the motion should come from the visitor.",
    accent: "#f0d46a",
    interactive: true,
    preview: {
      dark: "linear-gradient(90deg, rgba(240,212,106,0.13) 1px, transparent 1px), linear-gradient(0deg, rgba(236,92,19,0.09) 1px, transparent 1px), radial-gradient(circle at 58% 44%, rgba(236,92,19,0.18), transparent 24%), #090907",
      light:
        "linear-gradient(90deg, rgba(154,118,27,0.16) 1px, transparent 1px), linear-gradient(0deg, rgba(198,80,28,0.11) 1px, transparent 1px), radial-gradient(circle at 58% 44%, rgba(225,92,28,0.16), transparent 27%), linear-gradient(140deg, #f7f3ea, #f0eadc)",
    },
    fragment: `
vec3 shaderColor(vec2 uv, vec2 p, float t, vec2 pointer, float intensity, float isLight) {
  vec2 gridSize = vec2(18.0, 12.0);
  vec2 gridUv = uv * gridSize;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv);
  vec2 centered = local - 0.5;
  vec2 cellCenter = (cell + 0.5) / gridSize;
  float seed = hash21(cell);

  float edge = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
  float line = 1.0 - smoothstep(0.005, 0.032, edge);
  float box = smoothstep(0.5, 0.38, max(abs(centered.x), abs(centered.y)));
  float idle = pow(sin(seed * 6.2831 + t * 0.22) * 0.5 + 0.5, 13.0) * 0.014;
  float hover = smoothstep(0.085, 0.0, distance((cellCenter - u_pointer) * vec2(1.0, 0.72), vec2(0.0))) * 0.42;
  float fill = hover;
  float trailAmount = 0.0;
  vec3 fillColor = vec3(0.0);
  vec3 gold = vec3(1.0, 0.78, 0.24);
  vec3 orange = vec3(1.0, 0.36, 0.08);
  vec3 rose = vec3(0.9, 0.28, 0.38);

  for (int i = 0; i < 8; i++) {
    vec4 trail = u_trails[i];
    float distanceToTrail = distance((cellCenter - trail.xy) * vec2(1.0, 0.72), vec2(0.0));
    float trailFill = smoothstep(0.16, 0.0, distanceToTrail) * trail.z;
    trailFill *= 0.78 + hash21(cell + float(i) * 2.17) * 0.06;
    fill = max(fill, trailFill);
    trailAmount = max(trailAmount, trailFill);
    fillColor += mix(mix(gold, orange, trail.w), rose, seed * 0.35) * trailFill;
  }

  fillColor = fillColor / max(trailAmount, 0.001);

  vec3 base = mix(vec3(0.022, 0.021, 0.016), vec3(0.94, 0.91, 0.82), isLight);
  vec3 lineColor = mix(vec3(0.9, 0.7, 0.25), vec3(0.52, 0.38, 0.08), isLight);
  vec3 lightGold = vec3(0.76, 0.48, 0.04);
  vec3 lightOrange = vec3(0.82, 0.26, 0.04);
  vec3 lightRose = vec3(0.66, 0.16, 0.22);
  vec3 idleColor = mix(mix(gold, lightGold, isLight), mix(orange, lightOrange, isLight), seed);
  vec3 activeColor = mix(idleColor, fillColor, step(0.001, trailAmount));
  activeColor = mix(activeColor, mix(mix(lightGold, lightOrange, seed), lightRose, seed * 0.35), isLight);
  vec3 color = base + lineColor * line * mix(0.034, 0.032, isLight);
  color += idleColor * idle * box * mix(1.0, 0.82, isLight);
  color = mix(color, activeColor, saturate(fill * box * mix(0.82 + intensity * 0.12, 0.64 + intensity * 0.1, isLight)));
  color += activeColor * fill * smoothstep(0.64, 0.0, length(centered)) * mix(0.14, 0.1, isLight);
  color += (fbm(uv * 3.2) - 0.5) * mix(0.01, 0.006, isLight);
  return color;
}
`,
  },
];

export function getWebsiteShaderPreset(
  value: WebsiteShaderId | string | undefined
) {
  if (!value) return undefined;

  const normalized = value.replace(/^shader-/, "");
  return websiteShaderPresets.find((preset) => preset.id === normalized);
}

export function WebsiteShaderCanvas({
  preset,
  className,
  tone = "dark",
  intensity = 1,
  animate = true,
  maxPixelRatio = 1.35,
  maxCanvasPixels = 620_000,
  children,
}: WebsiteShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const trailRef = useRef<{ x: number; y: number; createdAt: number }[]>([]);
  const shouldReduceMotion = useReducedMotion();
  const [contextEpoch, setContextEpoch] = useState(0);
  const [failed, setFailed] = useState(false);
  const activePreset = useMemo(
    () => resolveShaderPreset(preset),
    [preset]
  );

  const shouldAnimate = animate && !shouldReduceMotion;
  const isInteractive = activePreset.interactive !== false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;

    let disposed = false;
    let visible = true;
    let frame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const handleContextRestored = () => {
      setFailed(false);
      setContextEpoch((value) => value + 1);
    };

    canvasElement.addEventListener("webglcontextlost", handleContextLost);
    canvasElement.addEventListener("webglcontextrestored", handleContextRestored);

    try {
      gl = canvasElement.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        desynchronized: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
        stencil: false,
      } as WebGLContextAttributes);

      if (!gl) {
        setFailed(true);
        return cleanup;
      }

      program = createProgram(
        gl,
        vertexShaderSource,
        createFragmentSource(activePreset.fragment)
      );
      buffer = gl.createBuffer();

      if (!program || !buffer) {
        setFailed(true);
        return cleanup;
      }

      const positionLocation = gl.getAttribLocation(program, "a_position");
      const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
      const timeLocation = gl.getUniformLocation(program, "u_time");
      const pointerLocation = gl.getUniformLocation(program, "u_pointer");
      const trailLocation = gl.getUniformLocation(program, "u_trails[0]");
      const intensityLocation = gl.getUniformLocation(program, "u_intensity");
      const isLightLocation = gl.getUniformLocation(program, "u_isLight");
      const trailUniform = new Float32Array(32);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW
      );
      gl.useProgram(program);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      setFailed(false);

      const resize = () => {
        if (!gl) return;

        const rect = canvasElement.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
        let width = Math.max(1, Math.floor(rect.width * ratio));
        let height = Math.max(1, Math.floor(rect.height * ratio));
        const pixelCount = width * height;

        if (pixelCount > maxCanvasPixels) {
          const scale = Math.sqrt(maxCanvasPixels / pixelCount);
          width = Math.max(1, Math.floor(width * scale));
          height = Math.max(1, Math.floor(height * scale));
        }

        if (canvasElement.width !== width || canvasElement.height !== height) {
          canvasElement.width = width;
          canvasElement.height = height;
        }

        gl.viewport(0, 0, width, height);
      };

      const render = (now: number) => {
        if (!gl || !program || disposed) return;

        resize();
        const nowSeconds = now * 0.001;
        const time = shouldAnimate ? nowSeconds : 18.0;
        const pointerValue = isInteractive ? pointerRef.current : { x: 0.5, y: 0.5 };
        const liveTrails = isInteractive
          ? trailRef.current.filter((trail) => nowSeconds - trail.createdAt < 1.1)
          : [];
        trailRef.current = liveTrails;
        trailUniform.fill(0);

        liveTrails.slice(0, 8).forEach((trail, index) => {
          const offset = index * 4;
          const strength = saturateNumber(1 - (nowSeconds - trail.createdAt) / 1.1);

          trailUniform[offset] = trail.x;
          trailUniform[offset + 1] = trail.y;
          trailUniform[offset + 2] = strength;
          trailUniform[offset + 3] = index / 7;
        });

        gl.useProgram(program);
        gl.uniform2f(resolutionLocation, canvasElement.width, canvasElement.height);
        gl.uniform1f(timeLocation, time);
        gl.uniform2f(pointerLocation, pointerValue.x, pointerValue.y);
        if (trailLocation) gl.uniform4fv(trailLocation, trailUniform);
        gl.uniform1f(intensityLocation, intensity);
        gl.uniform1f(isLightLocation, tone === "light" ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      const tick = (now: number) => {
        if (disposed || !visible) {
          frame = 0;
          return;
        }

        render(now);
        frame = requestAnimationFrame(tick);
      };

      const start = () => {
        if (frame || disposed) return;
        frame = requestAnimationFrame(tick);
      };

      resizeObserver = new ResizeObserver(() => render(performance.now()));
      resizeObserver.observe(canvasElement);

      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          visible = Boolean(entry?.isIntersecting);

          if (visible && shouldAnimate) {
            start();
            return;
          }

          if (frame) {
            cancelAnimationFrame(frame);
            frame = 0;
          }

          if (visible) render(performance.now());
        },
        { threshold: 0.01 }
      );
      intersectionObserver.observe(canvasElement);

      render(performance.now());
      if (shouldAnimate) start();
    } catch {
      setFailed(true);
    }

    return cleanup;

    function cleanup() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      canvasElement.removeEventListener("webglcontextlost", handleContextLost);
      canvasElement.removeEventListener("webglcontextrestored", handleContextRestored);

      if (gl) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
    }
  }, [
    activePreset.fragment,
    contextEpoch,
    intensity,
    isInteractive,
    maxCanvasPixels,
    maxPixelRatio,
    shouldAnimate,
    tone,
  ]);

  const updatePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextPointer = {
      x: saturateNumber((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: 1 - saturateNumber((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
    const now = performance.now() * 0.001;
    const lastTrail = trailRef.current[0];

    pointerRef.current = nextPointer;

    if (
      !lastTrail ||
      Math.hypot(nextPointer.x - lastTrail.x, nextPointer.y - lastTrail.y) > 0.018 ||
      now - lastTrail.createdAt > 0.045
    ) {
      trailRef.current = [
        { ...nextPointer, createdAt: now },
        ...trailRef.current,
      ].slice(0, 8);
    }
  }, []);

  const fallback = tone === "light" ? activePreset.preview.light : activePreset.preview.dark;

  return (
    <div
      className={cn("relative overflow-hidden bg-background", className)}
      style={{ background: fallback }}
      onPointerMove={isInteractive ? updatePointer : undefined}
      onPointerLeave={isInteractive ? () => {
        pointerRef.current = { x: 0.5, y: 0.5 };
      } : undefined}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full touch-none transition-opacity duration-300",
          failed ? "opacity-0" : "opacity-100"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          tone === "light"
            ? "bg-[radial-gradient(circle_at_48%_16%,rgba(255,252,240,0.08),transparent_34%)] opacity-45"
            : "bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.12),transparent_36%)] opacity-70"
        )}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

export function WebsiteShaderDemo({ preset, className }: WebsiteShaderDemoProps) {
  const activePreset = resolveShaderPreset(preset);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const tone =
    mounted && (theme === "system" ? resolvedTheme : theme) === "light"
      ? "light"
      : "dark";

  return (
    <div className={cn("w-full max-w-[900px]", className)}>
      <div className="relative overflow-hidden rounded-[22px] border border-border/50 bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <WebsiteShaderCanvas
          preset={activePreset}
          tone={tone}
          className="h-[min(62vw,470px)] min-h-[520px] w-full lg:min-h-[320px]"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h2 className="text-[22px] font-medium leading-tight tracking-[-0.025em] text-foreground">
            {activePreset.title}
          </h2>
          <p className="mt-2 max-w-[620px] text-[14px] leading-6 text-muted-foreground">
            {activePreset.summary}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 md:w-[270px]">
          {["1 draw", "No assets", "Auto pause"].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2 text-center text-[11px] font-medium text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function resolveShaderPreset(
  preset: WebsiteShaderId | string | WebsiteShaderPreset | undefined
) {
  if (typeof preset === "object" && preset) return preset;
  return getWebsiteShaderPreset(preset) ?? websiteShaderPresets[0];
}

function createFragmentSource(fragmentBody: string) {
  return `${fragmentHeader}
${fragmentBody}
${fragmentFooter}`;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function saturateNumber(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function getShaderPreviewStyle(
  itemSlug: string,
  isLight: boolean
): CSSProperties {
  const preset = getWebsiteShaderPreset(itemSlug) ?? websiteShaderPresets[0];
  return {
    background: isLight ? preset.preview.light : preset.preview.dark,
  };
}
