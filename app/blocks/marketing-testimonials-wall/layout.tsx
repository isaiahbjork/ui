import type { ReactNode } from "react";

import { routeMetadata } from "@/lib/component-metadata";

export const generateMetadata = () => routeMetadata("/blocks/marketing-testimonials-wall");

export default function ComponentLayout({ children }: { children: ReactNode }) {
  return children;
}
