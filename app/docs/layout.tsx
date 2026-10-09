import type { ReactNode } from "react";

import { shareMetadata } from "@/lib/component-metadata";
import { docsCard } from "@/lib/og-cards";

export const metadata = shareMetadata(docsCard, "Docs — Björk UI");

export default function DocsLayout({ children }: { children: ReactNode }) {
  return children;
}
