import type { Metadata } from "next";

import { galleryItems } from "@/lib/bjork-gallery";

// One place for component page titles. The name comes from the gallery entry
// for the route; a route with no gallery entry gets its name from the segment.
export function componentMetadata(name: string): Metadata {
  const title = `${name} — Björk UI`;
  return {
    title,
    openGraph: { title },
    twitter: { title },
  };
}

function nameFromSegment(route: string) {
  const segment = route.split("/").filter(Boolean).pop() ?? "";
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function routeMetadata(route: string): Metadata {
  const item = galleryItems.find((entry) => entry.route === route);
  return componentMetadata(item?.title ?? nameFromSegment(route));
}
