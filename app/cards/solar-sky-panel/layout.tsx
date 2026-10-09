import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/cards/solar-sky-panel");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
