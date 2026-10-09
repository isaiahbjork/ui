import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/blocks/marketing-pricing");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
