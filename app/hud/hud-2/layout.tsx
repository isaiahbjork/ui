import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/hud/hud-2");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
