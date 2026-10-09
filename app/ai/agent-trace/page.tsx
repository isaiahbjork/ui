"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentTrace, type AgentStep } from "@/components/bjork-ui/ai/agent-trace";
import {
  ShellActions,
  ShellSegmented,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
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

const RETRY_INDEX = RUN.findIndex((step) => step.id === "retry");

// Steps before `stage` are finished, step `stage` is active. stage = RUN.length means every step is finished.
// Without a forced error the type check passes, so the retry is skipped and the run never waits for it.
function stepsAt(stage: number, forceError: boolean, startedAt?: number): AgentStep[] {
  return RUN.map((step, i): AgentStep => {
    const base = { id: step.id, kind: step.kind, label: step.label, detail: "detail" in step ? step.detail : undefined };
    if (i < stage) {
      if (i === RETRY_INDEX && !forceError) return { ...base, status: "skipped" };
      return {
        ...base,
        status: forceError && "error" in step && step.error ? "error" : "done",
        durationMs: Math.round(step.seconds * 1000),
      };
    }
    if (i === stage) return { ...base, status: "active", startedAt };
    return { ...base, status: "pending" };
  });
}

// Fixed clock for the preview pose, so the captured frame never changes.
const POSE = 1_700_000_000_000;

type Density = "comfortable" | "compact";

function Demo({
  forceError,
  density,
  replay,
}: {
  forceError: boolean;
  density: Density;
  replay: number;
}) {
  const isPreview = usePreviewMode();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (isPreview || stage >= RUN.length) return;
    const id = window.setTimeout(
      () => setStage((s) => (s + 1 === RETRY_INDEX && !forceError ? s + 2 : s + 1)),
      RUN[stage].seconds * 1000,
    );
    return () => window.clearTimeout(id);
  }, [isPreview, stage, forceError]);

  // Preview posed frame: steps 1 to 4 are done (draft is amber at 5.2s), and step 5 has run for 1.2s.
  const steps = useMemo(
    () => (isPreview ? stepsAt(4, false, POSE) : stepsAt(stage, forceError)),
    [isPreview, stage, forceError],
  );

  return (
    <div className="flex w-[min(520px,calc(100vw-56px))] flex-col items-center gap-6">
      {/* A new replay value remounts the trace, so a folded trace opens again. */}
      <AgentTrace key={replay} steps={steps} density={density} now={isPreview ? POSE + 1200 : undefined} />
    </div>
  );
}

const DEFAULT_DENSITY: Density = "comfortable";

export default function Page() {
  const [forceError, setForceError] = useState(false);
  const [density, setDensity] = useState<Density>(DEFAULT_DENSITY);
  const [replay, setReplay] = useState(0);

  const reset = () => {
    setForceError(false);
    setDensity(DEFAULT_DENSITY);
    setReplay((r) => r + 1);
  };

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
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellActions>
            <BjorkButton variant="secondary" size="sm" onClick={() => setReplay((r) => r + 1)}>
              Replay
            </BjorkButton>
          </ShellActions>
          <ShellSwitch
            label="Force error"
            checked={forceError}
            onCheckedChange={(checked) => {
              setForceError(checked);
              setReplay((r) => r + 1);
            }}
          />
          <ShellSegmented
            label="Density"
            value={density}
            onChange={(value) => setDensity(value as Density)}
            options={[
              { value: "comfortable", label: "comfortable" },
              { value: "compact", label: "compact" },
            ]}
          />
        </>
      }
    >
      <Demo forceError={forceError} density={density} replay={replay} />
    </SimpleComponentDemoPage>
  );
}
