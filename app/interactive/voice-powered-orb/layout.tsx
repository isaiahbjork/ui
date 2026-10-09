import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/interactive/voice-powered-orb");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
