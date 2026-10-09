"use client";

import { useState } from "react";
import {
  ApprovalGate,
  SAMPLE_APPROVAL_REQUESTS,
  type ApprovalDecision,
} from "@/components/bjork-ui/ai/approval-gate";
import {
  ShellActions,
  ShellSegmented,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("approval-gate");

const RISKS = ["high", "medium", "low"] as const;
type Risk = (typeof RISKS)[number];
const DEFAULT_RISK: Risk = "high";
const DEFAULT_TIMEOUT = true;

function Demo({
  risk,
  timeout,
  run,
  last,
  onDecision,
}: {
  risk: Risk;
  timeout: boolean;
  run: number;
  last: ApprovalDecision | null;
  onDecision: (decision: ApprovalDecision) => void;
}) {
  const isPreview = usePreviewMode();
  const request = SAMPLE_APPROVAL_REQUESTS.find((r) => r.risk === risk) ?? SAMPLE_APPROVAL_REQUESTS[0];

  if (isPreview) {
    return (
      <div className="w-[min(540px,calc(100vw-56px))]">
        <ApprovalGate
          request={SAMPLE_APPROVAL_REQUESTS[0]}
          requireHold
          timeoutMs={30_000}
          pose={{ hold: 0.58, remaining: 0.64 }}
        />
      </div>
    );
  }

  return (
    <div className="flex w-[min(540px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <ApprovalGate
        key={`${run}-${risk}-${timeout}`}
        request={request}
        requireHold
        timeoutMs={timeout ? 30_000 : undefined}
        onDecision={onDecision}
      />
      <p className="min-h-5 text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
        {last
          ? `onDecision → ${last.status}${last.reason ? ` · "${last.reason}"` : ""}${last.alwaysAllow ? " · always allow" : ""}`
          : "High risk asks you to hold Approve. Hover the card to pause the countdown."}
      </p>
    </div>
  );
}

export default function Page() {
  const [risk, setRisk] = useState<Risk>(DEFAULT_RISK);
  const [timeout, setTimeoutOn] = useState(DEFAULT_TIMEOUT);
  const [run, setRun] = useState(0);
  const [last, setLast] = useState<ApprovalDecision | null>(null);

  const reset = () => {
    setRisk(DEFAULT_RISK);
    setTimeoutOn(DEFAULT_TIMEOUT);
    setLast(null);
    setRun((r) => r + 1);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A human-in-the-loop check before a tool runs: the action, its target, a risk level with a reason, the arguments and side effects. High-risk calls ask you to hold Approve, and an optional countdown denies on its own."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { ApprovalGate, SAMPLE_APPROVAL_REQUESTS } from "@/components/bjork-ui/ai/approval-gate";

export function Demo() {
  return (
    <ApprovalGate
      request={SAMPLE_APPROVAL_REQUESTS[0]}
      requireHold
      timeoutMs={30_000}
      onDecision={(d) => console.log(d.status, d.reason, d.alwaysAllow)}
    />
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[540px] scale-[0.88]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Risk"
            value={risk}
            options={RISKS.map((value) => ({ value, label: value }))}
            onChange={(value) => {
              setRisk(value);
              setLast(null);
            }}
          />
          <ShellSwitch label="30s timeout" checked={timeout} onCheckedChange={setTimeoutOn} />
          <ShellActions>
            <BjorkButton variant="ghost" size="sm" onClick={reset}>
              Reset
            </BjorkButton>
          </ShellActions>
        </>
      }
    >
      <Demo risk={risk} timeout={timeout} run={run} last={last} onDecision={setLast} />
    </SimpleComponentDemoPage>
  );
}
