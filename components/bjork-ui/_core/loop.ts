"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

export interface VisibleLoopOptions {
  enabled?: boolean;
  fpsCap?: number;
  rootMargin?: string;
}

/**
 * Runs `frame(dt, t)` on requestAnimationFrame while the element is near the viewport,
 * the tab is visible and `enabled` is not false. Return `false` from `frame` to go idle
 * until `wake()` is called. Writes `data-loop` on the element: running, idle or paused.
 */
export function useVisibleLoop(
  ref: RefObject<HTMLElement | null>,
  frame: (dt: number, t: number) => boolean | void,
  opts?: VisibleLoopOptions,
): { wake: () => void } {
  const enabled = opts?.enabled !== false;
  const fpsCap = opts?.fpsCap ?? 0;
  const rootMargin = opts?.rootMargin ?? "96px";

  const frameRef = useRef(frame);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  const wakeRef = useRef<() => void>(() => {});
  const wake = useCallback(() => wakeRef.current(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    let wants = true; // false once the frame callback returns false
    let inView = false;
    let raf = 0;
    let last = 0;
    let t = 0;
    const minFrame = fpsCap > 0 ? 1000 / fpsCap : 0;

    const canRun = () => enabled && inView && document.visibilityState === "visible";
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const update = () => {
      if (!enabled) {
        stop();
        el.dataset.loop = "paused";
        return;
      }
      if (!wants) {
        stop();
        el.dataset.loop = "idle";
        return;
      }
      if (!canRun()) {
        stop();
        el.dataset.loop = "paused";
        return;
      }
      el.dataset.loop = "running";
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const tick = (now: number) => {
      raf = 0;
      if (!canRun() || !wants) {
        update();
        return;
      }
      const elapsed = now - last;
      if (minFrame && elapsed < minFrame - 0.5) {
        raf = requestAnimationFrame(tick);
        return;
      }
      last = now;
      const dt = Math.min(0.05, Math.max(0, elapsed / 1000));
      t += dt;
      const keep = frameRef.current(dt, t);
      if (keep === false) {
        wants = false;
        update();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { rootMargin },
    );
    observer.observe(el);

    const onVisibility = () => update();
    document.addEventListener("visibilitychange", onVisibility);

    wakeRef.current = () => {
      wants = true;
      update();
    };

    update();

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      wakeRef.current = () => {};
    };
  }, [ref, enabled, fpsCap, rootMargin]);

  return useMemo(() => ({ wake }), [wake]);
}

// matchMedia based check. False on the server.
export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
