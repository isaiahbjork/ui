"use client";

import { useEffect, useState } from "react";
import {
  SAMPLE_TOOL_CALLS,
  ToolCallCard,
  ToolCallGroup,
  type ToolCallStatus,
} from "@/components/bjork-ui/ai/tool-call-card";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("tool-call-card");

// Fixed clock for the preview pose.
const POSE = 1_700_000_000_000;

const STREAMED_INPUT = JSON.stringify({ ticket_id: "TCK-4821", tone: "warm", max_words: 120, sign_off: "Ada, Support" }, null, 2);

const REPLY_OUTPUT = {
  ticket_id: "TCK-4821",
  words: 96,
  body:
    "Hi Maren, thanks for your patience. Your refund of $99.00 was sent on Oct 2 and should reach your Visa ending 4242 within 3 business days.",
  suggested_status: "pending_customer",
};

type Outcome = "success" | "error" | "denied";

function Demo() {
  const isPreview = usePreviewMode();
  const [run, setRun] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>("success");
  const [chars, setChars] = useState(0);
  const [phase, setPhase] = useState<ToolCallStatus>("input-streaming");
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);
  const [open, setOpen] = useState(true);

  // Stream the arguments a few characters at a time, then run, then settle.
  useEffect(() => {
    if (isPreview || phase !== "input-streaming") return;
    let c = 0;
    const id = window.setInterval(() => {
      c = Math.min(STREAMED_INPUT.length, c + 3);
      setChars(c);
      if (c < STREAMED_INPUT.length) return;
      window.clearInterval(id);
      if (outcome === "denied") setPhase("denied");
      else {
        setPhase("running");
        setStartedAt(Date.now());
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [isPreview, phase, outcome, run]);

  useEffect(() => {
    if (isPreview || phase !== "running") return;
    const id = window.setTimeout(() => setPhase(outcome === "error" ? "error" : "success"), 2200);
    return () => window.clearTimeout(id);
  }, [isPreview, phase, outcome]);

  const restart = (next: Outcome = outcome) => {
    setOutcome(next);
    setChars(0);
    setPhase("input-streaming");
    setStartedAt(undefined);
    setOpen(true);
    setRun((r) => r + 1);
  };

  const [first, second, third] = SAMPLE_TOOL_CALLS;

  if (isPreview) {
    return (
      <div className="flex w-[min(560px,calc(100vw-56px))] flex-col items-stretch">
        <ToolCallGroup>
          <ToolCallCard {...first} />
          <ToolCallCard {...second} defaultOpen maxLines={14} />
          <ToolCallCard {...third} startedAt={POSE} now={POSE + 1800} />
        </ToolCallGroup>
      </div>
    );
  }

  const settled = phase === "success" || phase === "error" || phase === "denied";

  return (
    <div className="flex w-[min(560px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <ToolCallGroup>
        <ToolCallCard {...first} />
        <ToolCallCard {...second} />
        <ToolCallCard
          key={run}
          name={third.name}
          summary={third.summary}
          status={phase}
          input={phase === "input-streaming" ? STREAMED_INPUT.slice(0, chars) : STREAMED_INPUT}
          output={phase === "success" ? REPLY_OUTPUT : undefined}
          error={phase === "error" ? "Upstream timeout: mailer.fieldnotes.dev did not respond in 2000ms" : undefined}
          startedAt={startedAt}
          durationMs={settled && phase !== "denied" ? 2200 : undefined}
          open={open}
          onOpenChange={setOpen}
        />
      </ToolCallGroup>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <BjorkButton variant="secondary" size="sm" onClick={() => restart()}>
          Replay
        </BjorkButton>
        <BjorkButtonGroup role="group" aria-label="Outcome">
          {(["success", "error", "denied"] as const).map((value) => (
            <BjorkButton
              key={value}
              aria-pressed={outcome === value}
              variant={outcome === value ? "default" : "ghost"}
              size="sm"
              onClick={() => restart(value)}
            >
              {value}
            </BjorkButton>
          ))}
        </BjorkButtonGroup>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="One tool invocation as a quiet row: status, name, summary and a live duration. It opens to tinted JSON input and output, with copy buttons and long results clamped."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { ToolCallCard, ToolCallGroup, SAMPLE_TOOL_CALLS } from "@/components/bjork-ui/ai/tool-call-card";

export function Demo() {
  return (
    <ToolCallGroup>
      {SAMPLE_TOOL_CALLS.map(({ id, ...call }) => (
        <ToolCallCard key={id} {...call} />
      ))}
    </ToolCallGroup>
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[560px] scale-[0.92]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
