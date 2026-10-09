import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/text/weight-wave");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
