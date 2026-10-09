import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/charts/bullet-chart");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
