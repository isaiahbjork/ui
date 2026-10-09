import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/navigation/sidebar-08");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
