import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/badges/animated-status-badge");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
