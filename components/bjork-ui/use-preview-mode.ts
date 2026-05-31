"use client";

import { useMemo, useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getSearchSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

export function usePreviewSearchParam(name: string) {
  const search = useSyncExternalStore(subscribe, getSearchSnapshot, () => "");

  return useMemo(() => new URLSearchParams(search).get(name), [name, search]);
}

export function usePreviewMode() {
  return usePreviewSearchParam("preview") === "1";
}
