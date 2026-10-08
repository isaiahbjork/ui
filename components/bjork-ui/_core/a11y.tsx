import type { ReactNode } from "react";

// Text for assistive tech only.
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

// Announces `message` when it changes. Same text re-rendered does not re-announce.
export function LiveRegion({
  message,
  politeness = "polite",
}: {
  message: string;
  politeness?: "polite" | "assertive";
}) {
  return (
    <span role="status" aria-live={politeness} aria-atomic="true" className="sr-only">
      {message}
    </span>
  );
}
