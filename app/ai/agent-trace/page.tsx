"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentTrace, type AgentStep } from "@/components/bjork-ui/ai/agent-trace";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("agent-trace");

// A scripted run. `seconds` is how long each step stays active before it finishes.
const RUN = [
  { id: "parse", kind: "think", label: "Parse request", seconds: 0.6 },
  {
    id: "search",
    kind: "search",
    label: 'Search docs: "optical alignment"',
    seconds: 1.8,
    detail:
      "Matched 3 files: OPTICAL-ALIGNMENT.md, AGENTS.md (sections 8 and 31), and components/bjork-ui/misc/timer.tsx, which uses the play-glyph nudge.",
  },
  { id: "read", kind: "read", label: "Read OPTICAL-ALIGNMENT.md", seconds: 1.1 },
  { id: "draft", kind: "code", label: "Draft component spec", seconds: 5.2 },
  {
    id: "typecheck",
    kind: "tool",
    label: "Run type check",
    seconds: 2.0,
    error: true,
    detail: "tsc --noEmit: 2 errors in agent-trace.tsx",
  },
  { id: "retry", kind: "tool", label: "Retry type check", seconds: 1.4 },
  { id: "compose", kind: "think", label: "Compose answer", seconds: 0.9 },
] as const;

// Steps before `stage` are finished, step `stage` is active. stage = RUN.length means every step is finished.
function stepsAt(stage: number, startedAt?: number): AgentStep[] {
  return RUN.map((step, i): AgentStep => {
    const base = { id: step.id, kind: step.kind, label: step.label, detail: "detail" in step ? step.detail : undefined };
    if (i < stage) {
      return {
        ...base,
        status: "error" in step && step.error ? "error" : "done",
        durationMs: Math.round(step.seconds * 1000),
      };
    }
    if (i === stage) return { ...base, status: "active", startedAt };
    return { ...base, status: "pending" };
  });
}

function Demo() {
  const isPreview = usePreviewMode();
  const [stage, setStage] = useState(0);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  // Preview posed frame: step 3 has been running for 4.6s, so it shows amber.
  const [previewStart] = useState(() => Date.now() - 4600);

  useEffect(() => {
    if (isPreview || stage >= RUN.length) return;
    const id = window.setTimeout(() => setStage((s) => s + 1), RUN[stage].seconds * 1000);
    return () => window.clearTimeout(id);
  }, [isPreview, stage]);

  const steps = useMemo(
    () => (isPreview ? stepsAt(3, previewStart) : stepsAt(stage)),
    [isPreview, previewStart, stage],
  );

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <AgentTrace steps={steps} density={density} />
      {!isPreview && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <BjorkButton variant="secondary" size="sm" onClick={() => setStage(0)}>
            Replay
          </BjorkButton>
          <BjorkButtonGroup role="group" aria-label="Density">
            {(["comfortable", "compact"] as const).map((value) => (
              <BjorkButton
                key={value}
                aria-pressed={density === value}
                variant={density === value ? "default" : "ghost"}
                size="sm"
                onClick={() => setDensity(value)}
              >
                {value}
              </BjorkButton>
            ))}
          </BjorkButtonGroup>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="An agent's work as one rail that fills as steps finish. Slow steps turn amber, and the whole trace folds into a one-line receipt."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { AgentTrace, type AgentStep } from "@/components/bjork-ui/ai/agent-trace";

export function Demo({ steps }: { steps: AgentStep[] }) {
  return <AgentTrace steps={steps} title="Thinking" slowThresholdMs={4000} />;
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[520px] scale-[1.3]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
