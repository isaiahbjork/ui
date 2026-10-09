import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/misc/timer");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
