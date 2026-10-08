"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { MorphLoader, type MorphState, type MorphTarget } from "@/components/bjork-ui/feedback/morph-loader";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("morph-loader");

const targetOptions = [
  { value: "check", label: "Check" },
  { value: "cross", label: "Cross" },
  { value: "arrow-down", label: "Arrow" },
  { value: "spark", label: "Spark" },
];

const stateOptions = [
  { value: "loading", label: "Load" },
  { value: "done", label: "Done" },
  { value: "error", label: "Error" },
  { value: "idle", label: "Idle" },
];

type DeployPhase = "idle" | "deploying" | "deployed";

// Row 1: a button that shows a 16px loader, then morphs to a check.
function DeployButton() {
  const [phase, setPhase] = useState<DeployPhase>("idle");

  useEffect(() => {
    if (phase !== "deploying") return;
    const id = window.setTimeout(() => setPhase("deployed"), 1800);
    return () => window.clearTimeout(id);
  }, [phase]);

  const label = phase === "idle" ? "Deploy" : phase === "deploying" ? "Deploying…" : "Deployed";

  return (
    <BjorkButton
      type="button"
      onClick={() => setPhase("deploying")}
      className="min-w-[156px] justify-center has-[>[role=status]:first-child]:pl-3.5"
    >
      {phase !== "idle" ? (
        <MorphLoader size={16} state={phase === "deploying" ? "loading" : "done"} labels={{ loading: "", done: "" }} />
      ) : null}
      {label}
    </BjorkButton>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] tabular-nums tracking-[0.02em] text-[color:var(--bjork-text-soft,rgba(237,237,237,0.4))]">
      {children}
    </span>
  );
}

// Canvas tile: 300 x 242 with a 96px loader, a caption and attract on.
function TileSample() {
  return (
    <div className="flex h-[242px] w-[min(300px,calc(100vw-56px))] flex-col items-center justify-center gap-4 rounded-[14px] border border-[color:var(--bjork-border,#232323)] bg-[color:var(--bjork-surface,#121212)]">
      <MorphLoader size={96} state="loading" attract tone="dark" />
      <span className="font-mono text-[11px] tracking-[0.02em] text-[color:var(--bjork-text-muted,rgba(237,237,237,0.52))]">
        Deploying
      </span>
    </div>
  );
}

export default function Page() {
  const preview = usePreviewMode();
  const [target, setTarget] = useState<MorphTarget>("check");
  const [rowState, setRowState] = useState<MorphState>("done");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A spinner whose segments become the result. When the work finishes, the ring re-forms into a check, a cross or your own glyph."
      usageCode={`<MorphLoader state={status} />

// A finished morph into a custom glyph, with a callback
<MorphLoader
  state={status}
  target="arrow-down"
  onMorphComplete={() => setReady(true)}
/>

// Your own glyph, as a 24-unit path
<MorphLoader state="done" target="M6 12 L10 16 L18 8" />`}
      details={<TileSample />}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[640px] scale-[1.15]"
    >
      <div className="flex w-[min(640px,calc(100vw-56px))] flex-col items-center gap-12 py-6">
        <div className="flex flex-col items-center gap-3">
          <DeployButton />
        </div>

        <div className="flex items-end justify-center gap-12">
          <div className="flex flex-col items-center gap-3">
            <MorphLoader size={24} state="loading" />
            <Caption>24 · loading</Caption>
          </div>
          <div className="flex flex-col items-center gap-3">
            <MorphLoader size={40} state="done" />
            <Caption>40 · done</Caption>
          </div>
          <div className="flex flex-col items-center gap-3">
            <MorphLoader size={64} state="error" />
            <Caption>64 · error</Caption>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <MorphLoader size={64} state={rowState} target={target} progress={preview ? 0.75 : undefined} />
          {!preview ? (
            <div className="flex w-[min(320px,calc(100vw-56px))] flex-col gap-2">
              <ShellSegmented
                label="Target"
                value={target}
                options={targetOptions}
                onChange={(value) => setTarget(value as MorphTarget)}
              />
              <ShellSegmented
                label="State"
                value={rowState}
                options={stateOptions}
                onChange={(value) => setRowState(value as MorphState)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </SimpleComponentDemoPage>
  );
}
