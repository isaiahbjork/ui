"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface BjorkShaderAvatarProps extends React.ComponentProps<"div"> {
  initials?: string;
  label?: string;
  size?: number;
}

function useBjorkDocumentTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">("dark");

  React.useEffect(() => {
    const syncTheme = () => {
      setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

export function BjorkShaderAvatar({
  initials = "IB",
  label = "Shader avatar",
  size = 76,
  className,
  style,
  ...props
}: BjorkShaderAvatarProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const theme = useBjorkDocumentTheme();
  const isLightTheme = theme === "light";

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;
    const canvasElement = canvas;
    const context = gl;

    const vertexSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision highp float;
      varying vec2 vUv;
      uniform float time;
      uniform float lightMode;
      uniform vec2 resolution;
      void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= resolution.x / resolution.y;
        float wave = sin((uv.x * 3.4) + time * 0.45) + cos((uv.y * 4.2) - time * 0.38);
        float ring = sin(length(uv) * 9.0 - time * 0.72);
        float vignette = smoothstep(1.22, 0.08, length(uv));

        if (lightMode > 0.5) {
          vec3 linen = vec3(0.955, 0.918, 0.842);
          vec3 clay = vec3(0.84, 0.42, 0.16);
          vec3 ivory = vec3(1.0, 0.985, 0.945);
          vec3 umber = vec3(0.54, 0.45, 0.34);
          vec3 color = mix(linen, clay, smoothstep(-0.82, 1.02, wave + ring * 0.34) * 0.74);
          color = mix(color, ivory, smoothstep(0.70, 1.0, wave * 0.32 + ring * 0.52) * 0.86);
          color = mix(umber, color, 0.86 + vignette * 0.14);
          gl_FragColor = vec4(color, 1.0);
          return;
        }

        vec3 ink = vec3(0.07, 0.07, 0.07);
        vec3 ember = vec3(0.925, 0.36, 0.075);
        vec3 pearl = vec3(0.93, 0.93, 0.90);
        vec3 color = mix(ink, ember, smoothstep(-0.85, 1.0, wave + ring * 0.35));
        color = mix(color, pearl, smoothstep(0.72, 1.0, wave * 0.32 + ring * 0.55));
        gl_FragColor = vec4(color * (0.38 + vignette * 0.82), 1.0);
      }
    `;

    function compileShader(type: number, source: string) {
      const shader = context.createShader(type);
      if (!shader) return null;
      context.shaderSource(shader, source);
      context.compileShader(shader);
      return context.getShaderParameter(shader, context.COMPILE_STATUS) ? shader : null;
    }

    const vertex = compileShader(context.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(context.FRAGMENT_SHADER, fragmentSource);
    const program = context.createProgram();
    if (!vertex || !fragment || !program) return;

    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) return;
    context.useProgram(program);

    const buffer = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      context.STATIC_DRAW,
    );

    const positionLocation = context.getAttribLocation(program, "position");
    const timeLocation = context.getUniformLocation(program, "time");
    const lightModeLocation = context.getUniformLocation(program, "lightMode");
    const resolutionLocation = context.getUniformLocation(program, "resolution");
    context.enableVertexAttribArray(positionLocation);
    context.vertexAttribPointer(positionLocation, 2, context.FLOAT, false, 0, 0);

    let frame = 0;
    const startedAt = performance.now();

    function resize() {
      const rect = canvasElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvasElement.width = Math.max(1, Math.floor(rect.width * ratio));
      canvasElement.height = Math.max(1, Math.floor(rect.height * ratio));
      context.viewport(0, 0, canvasElement.width, canvasElement.height);
    }

    function render(now: number) {
      resize();
      const elapsed = shouldReduceMotion ? 0.9 : (now - startedAt) / 1000;
      context.uniform1f(timeLocation, elapsed);
      context.uniform1f(lightModeLocation, isLightTheme ? 1 : 0);
      context.uniform2f(resolutionLocation, canvasElement.width, canvasElement.height);
      context.drawArrays(context.TRIANGLES, 0, 6);
      if (!shouldReduceMotion) frame = window.requestAnimationFrame(render);
    }

    render(performance.now());

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      context.deleteProgram(program);
      context.deleteShader(vertex);
      context.deleteShader(fragment);
      context.deleteBuffer(buffer);
    };
  }, [isLightTheme, shouldReduceMotion]);

  return (
    <div
      aria-label={label}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border text-sm font-medium",
        isLightTheme
          ? "border-[#e1d7c8] bg-[#f7f3ea] text-[#5b4a37] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_18px_34px_-26px_rgba(119,93,57,0.28)]"
          : "border-[#2b2b2b] bg-[#111] text-[#fff5ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_34px_-24px_rgba(236,92,19,0.62)]",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <span
        className={cn(
          "relative z-10",
          isLightTheme
            ? "mix-blend-multiply drop-shadow-[0_1px_5px_rgba(255,255,255,0.5)]"
            : "mix-blend-screen drop-shadow-[0_1px_8px_rgba(255,255,255,0.2)]",
        )}
      >
        {initials}
      </span>
    </div>
  );
}
