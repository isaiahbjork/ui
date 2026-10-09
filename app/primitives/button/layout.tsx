import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/primitives/button");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
