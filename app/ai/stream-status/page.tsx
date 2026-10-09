"use client";

import { useEffect, useState } from "react";
import { SAMPLE_STREAM_PHASES, StreamStatus, type StreamStatusState } from "@/components/bjork-ui/ai/stream-status";
import { ShellActions, ShellSwitch, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("stream-status");

const TOTAL = SAMPLE_STREAM_PHASES.length;
const FAIL_AT = 3; // with "Fail" on, the run errors while reading the changelog

// Fixed clock for the preview pose.
const POSE = 1_700_000_000_000;

// A new run value remounts the demo, which starts the stream again.
function Demo({ determinate, fail }: { determinate: boolean; fail: boolean }) {
  const isPreview = usePreviewMode();
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState<StreamStatusState>("working");

  useEffect(() => {
    if (isPreview || status !== "working") return;
    const id = window.setTimeout(() => {
      if (fail && stage === FAIL_AT) setStatus("error");
      else if (stage + 1 >= TOTAL) setStatus("done");
      else setStage(stage + 1);
    }, SAMPLE_STREAM_PHASES[stage].ms);
    return () => window.clearTimeout(id);
  }, [isPreview, status, stage, fail]);

  if (isPreview) {
    return (
      <div className="flex w-[min(460px,calc(100vw-56px))] flex-col gap-5">
        <StreamStatus phase="Reading fieldnotes.dev" progress={0.52} step={3} totalSteps={5} startedAt={POSE} now={POSE + 14_000} onStop={() => {}} />
        <StreamStatus phase="Answer ready" status="done" step={5} totalSteps={5} durationMs={42_000} />
        <StreamStatus phase="Search timed out after 3 retries" status="error" progress={0.4} durationMs={31_000} />
        <StreamStatus phase="Stopped while writing" status="stopped" progress={0.82} step={5} totalSteps={5} durationMs={27_000} />
      </div>
    );
  }

  const phase =
    status === "done"
      ? "Answer ready"
      : status === "error"
        ? "Couldn't reach the Lumen Labs changelog"
        : status === "stopped"
          ? `Stopped while ${SAMPLE_STREAM_PHASES[stage].phase.toLowerCase()}`
          : SAMPLE_STREAM_PHASES[stage].phase;

  return (
    <div className="flex w-[min(460px,calc(100vw-56px))] flex-col items-stretch gap-7">
      <StreamStatus
        phase={phase}
        status={status}
        progress={determinate ? (status === "working" ? stage / TOTAL + 0.5 / TOTAL : (stage + 1) / TOTAL) : undefined}
        step={stage + 1}
        totalSteps={TOTAL}
        onStop={() => setStatus("stopped")}
      />
    </div>
  );
}

export default function Page() {
  const [run, setRun] = useState(0);
  const [determinate, setDeterminate] = useState(true);
  const [fail, setFail] = useState(false);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="One quiet line for a long AI wait. The phase slides in as it changes, a clock and step count keep time, a hairline shows progress, and the line settles into a receipt for done, failed or stopped."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { StreamStatus } from "@/components/bjork-ui/ai/stream-status";

export function Status({ phase, step, stop }: { phase: string; step: number; stop: () => void }) {
  return <StreamStatus phase={phase} step={step} totalSteps={5} onStop={stop} />;
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[460px] scale-[1.35]"
      onReset={() => {
        setDeterminate(true);
        setFail(false);
        setRun((r) => r + 1);
      }}
      controls={
        <>
          <ShellActions>
            <BjorkButton variant="secondary" size="sm" onClick={() => setRun((r) => r + 1)}>
              Replay
            </BjorkButton>
          </ShellActions>
          <ShellSwitch label="Determinate" checked={determinate} onCheckedChange={setDeterminate} />
          <ShellSwitch
            label="Fail"
            checked={fail}
            onCheckedChange={(checked) => {
              setFail(checked);
              setRun((r) => r + 1);
            }}
          />
        </>
      }
    >
      <Demo key={run} determinate={determinate} fail={fail} />
    </SimpleComponentDemoPage>
  );
}
