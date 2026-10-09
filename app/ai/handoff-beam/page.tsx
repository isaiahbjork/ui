"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  HandoffBeam,
  createSimulatedVoice,
  type BeamPhase,
} from "@/components/bjork-ui/ai/handoff-beam";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { cn } from "@/lib/utils";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("handoff-beam");

const PHASES: Array<{ value: BeamPhase; label: string }> = [
  { value: "idle", label: "Idle" },
  { value: "listening", label: "Listening" },
  { value: "thinking", label: "Thinking" },
  { value: "speaking", label: "Speaking" },
];

type Palette = "ember" | "mono";
const DEFAULT_PHASE: BeamPhase = "listening";
const DEFAULT_PALETTE: Palette = "ember";

const PALETTES: Array<{ value: Palette; label: string }> = [
  { value: "ember", label: "Ember" },
  { value: "mono", label: "Mono" },
];

// Preview pose: a fixed level tuple, so the 2.6s capture is deterministic.
const POSE_LEVEL: [number, number, number] = [0.6, 0.45, 0.3];
const POSE_LEVEL_FN = () => POSE_LEVEL;

function Composer({
  micOn,
  onMic,
}: {
  micOn: boolean;
  onMic: () => void;
}) {
  return (
    <div className="flex h-16 w-full items-center gap-2 rounded-[32px] border border-[color:var(--bjork-border,#232323)] bg-[color:var(--bjork-surface,#121212)] py-2 pr-2 pl-5 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-inset has-[input:focus-visible]:ring-[color:var(--bjork-accent)]">
      <input
        aria-label="Message"
        placeholder="Ask anything"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--bjork-text,#ededed)] outline-none placeholder:text-[color:var(--bjork-text-soft,rgba(237,237,237,0.36))]"
      />
      <button
        type="button"
        onClick={onMic}
        aria-label="Use microphone"
        aria-pressed={micOn}
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full border transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)] focus-visible:outline-none",
          micOn
            ? "border-transparent bg-[color:var(--bjork-accent-fill)] text-white"
            : "border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text-medium)]"
        )}
      >
        <Mic size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Send"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text-medium)] transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)] focus-visible:outline-none"
      >
        <ArrowUp size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function Page() {
  const isPreview = usePreviewMode();
  const attract = usePreviewSearchParam("attract") === "1";
  const [phase, setPhase] = useState<BeamPhase>(DEFAULT_PHASE);
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [mic, setMic] = useState<AnalyserNode | null>(null);
  const micRef = useRef<{ stream: MediaStream; context: AudioContext } | null>(null);

  const voiceListen = useMemo(() => createSimulatedVoice(11), []);
  const voiceSpeak = useMemo(() => createSimulatedVoice(29), []);

  // Release the microphone when the page unmounts.
  useEffect(() => {
    const held = micRef;
    return () => {
      const current = held.current;
      if (!current) return;
      current.stream.getTracks().forEach((track) => track.stop());
      void current.context.close();
    };
  }, []);

  // Only a click requests the microphone. Nothing asks on load.
  const useMicrophone = () => {
    // A second click releases the microphone and falls back to the simulated voice.
    const held = micRef.current;
    if (held) {
      held.stream.getTracks().forEach((track) => track.stop());
      void held.context.close();
      micRef.current = null;
      setMic(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const context = new AudioContext();
        const node = context.createAnalyser();
        node.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(node);
        micRef.current = { stream, context };
        setMic(node);
      })
      .catch(() => {
        // Permission denied: the simulated voice stays in place.
      });
  };

  const level = phase === "speaking" ? voiceSpeak : voiceListen;

  if (isPreview) {
    return (
      <SimpleComponentDemoPage
        item={item}
        description="A hairline of light on the bottom edge of an input. It listens, thinks and speaks."
        previewScaleClassName="w-[360px]"
        previewCaptureScaleClassName="w-[560px] scale-[1.2]"
      >
        <div className="w-[min(560px,calc(100vw-56px))]">
          <HandoffBeam phase="listening" level={POSE_LEVEL_FN} palette="ember" className="w-full shadow-[var(--bjork-shadow-surface)]">
            <Composer micOn={false} onMic={() => {}} />
          </HandoffBeam>
        </div>
      </SimpleComponentDemoPage>
    );
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A hairline of light on the bottom edge of an input. It listens, thinks and speaks, and morphs between them without a blink."
      usageCode={`import { HandoffBeam } from "@/components/bjork-ui/ai/handoff-beam";

<HandoffBeam phase="listening" level={() => voice.level()} radius={32}>
  <Composer />
</HandoffBeam>

// Or drive it from a microphone analyser
<HandoffBeam phase={phase} analyser={analyser} palette="ember" />`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[560px] scale-[1.2]"
      optionsDefaultOpen={false}
      onReset={() => {
        setPhase(DEFAULT_PHASE);
        setPalette(DEFAULT_PALETTE);
      }}
      controls={
        <>
          <ShellSegmented
            label="Phase"
            value={phase}
            options={PHASES}
            onChange={(value) => setPhase(value as BeamPhase)}
          />
          <ShellSegmented
            label="Palette"
            value={palette}
            options={PALETTES}
            onChange={(value) => setPalette(value as Palette)}
          />
        </>
      }
    >
      <div className="flex w-[min(560px,calc(100vw-56px))] flex-col items-center gap-6">
        <HandoffBeam
          phase={phase}
          level={level}
          analyser={mic}
          palette={palette}
          gatherOffset={0.5}
          attract={attract}
          className="w-full shadow-[var(--bjork-shadow-surface)]"
        >
          <Composer micOn={mic !== null} onMic={useMicrophone} />
        </HandoffBeam>
        <p className="text-center font-mono text-[12px] text-[color:var(--bjork-text-muted)]">
          {mic ? "Microphone live" : "Simulated voice. Use the mic button to listen to your own."}
        </p>
      </div>
    </SimpleComponentDemoPage>
  );
}
