import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/misc/glow-rules");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
