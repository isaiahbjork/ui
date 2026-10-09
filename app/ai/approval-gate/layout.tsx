import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/ai/approval-gate");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
