"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import type { BjorkTone } from "./palette";

const subscribeNoop = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

/**
 * Resolves the tone for a component. An explicit `tone` always wins.
 * Otherwise it follows next-themes' resolved theme, but only after mount,
 * so the server render and first client render agree on dark.
 */
export function useBjorkTone(tone?: BjorkTone): BjorkTone {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNoop, getMounted, getServerMounted);
  if (tone) return tone;
  if (!mounted) return "dark";
  return resolvedTheme === "light" ? "light" : "dark";
}
