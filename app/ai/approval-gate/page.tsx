"use client";

import { useState } from "react";
import {
  ApprovalGate,
  SAMPLE_APPROVAL_REQUESTS,
  type ApprovalDecision,
} from "@/components/bjork-ui/ai/approval-gate";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { BjorkSwitch } from "@/components/bjork-ui/primitives/switch";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("approval-gate");

const RISKS = ["high", "medium", "low"] as const;

function Demo() {
  const isPreview = usePreviewMode();
  const [risk, setRisk] = useState<(typeof RISKS)[number]>("high");
  const [timeout, setTimeoutOn] = useState(true);
  const [run, setRun] = useState(0);
  const [last, setLast] = useState<ApprovalDecision | null>(null);
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

  const reset = () => {
    setLast(null);
    setRun((r) => r + 1);
  };

  return (
    <div className="flex w-[min(540px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <ApprovalGate
        key={`${run}-${risk}-${timeout}`}
        request={request}
        requireHold
        timeoutMs={timeout ? 30_000 : undefined}
        onDecision={setLast}
      />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <BjorkButtonGroup role="group" aria-label="Risk">
          {RISKS.map((value) => (
            <BjorkButton
              key={value}
              aria-pressed={risk === value}
              variant={risk === value ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setRisk(value);
                setLast(null);
              }}
            >
              {value}
            </BjorkButton>
          ))}
        </BjorkButtonGroup>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[color:var(--bjork-text-muted)]">
          <BjorkSwitch aria-label="Timeout" size="sm" checked={timeout} onCheckedChange={setTimeoutOn} />
          30s timeout
        </label>
        <BjorkButton variant="secondary" size="sm" onClick={reset}>
          Reset
        </BjorkButton>
      </div>
      <p className="min-h-5 text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
        {last
          ? `onDecision → ${last.status}${last.reason ? ` · "${last.reason}"` : ""}${last.alwaysAllow ? " · always allow" : ""}`
          : "High risk asks you to hold Approve. Hover the card to pause the countdown."}
      </p>
    </div>
  );
}

export default function Page() {
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
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
