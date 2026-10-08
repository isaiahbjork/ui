"use client";

import { useEffect, useState, type RefObject } from "react";
import { isCoarsePointer } from "./loop";

// Caps DPR at 1.5 on coarse pointers and 2 otherwise.
export function defaultMaxDpr(): number {
  return isCoarsePointer() ? 1.5 : 2;
}

// Sets the backing size for a CSS box and returns the DPR used.
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  maxDpr: number = defaultMaxDpr(),
): number {
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, maxDpr);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  return dpr;
}

// Rounded size of an element, kept current with a ResizeObserver.
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
