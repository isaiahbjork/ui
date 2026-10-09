import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/charts/live-line");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
