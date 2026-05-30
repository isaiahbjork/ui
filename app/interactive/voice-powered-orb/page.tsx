"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { Activity, Mic, Waves } from "lucide-react";
import { ComponentDemoShell, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { VoicePoweredOrb } from "@/components/isaiahbjork/interactive/voice-powered-orb";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("voice-powered-orb");

export default function VoicePoweredOrbPage() {
  const isPreview = usePreviewMode();
  const [mode, setMode] = useState("idle");
  const [voiceDetected, setVoiceDetected] = useState(false);

  const isRecording = mode === "listen";

  const demo = (
    <div className="relative flex h-[420px] w-[420px] max-w-full items-center justify-center">
      <VoicePoweredOrb
        enableVoiceControl={isRecording}
        onVoiceDetected={setVoiceDetected}
      />
    </div>
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070707]">
        <div className="scale-[0.72]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A WebGL voice-reactive orb built with OGL. It renders a fragment shader on a full canvas and can optionally listen to microphone amplitude to modulate motion intensity."
      dependencies={["ogl", "framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Waves className="size-5" />,
          label: "Shader surface",
          value: "The orb is rendered as a live fragment shader, not a static image.",
        },
        {
          icon: <Mic className="size-5" />,
          label: "Voice input",
          value: voiceDetected ? "Microphone signal is currently detected." : "Microphone mode can be enabled from the control surface.",
        },
        {
          icon: <Activity className="size-5" />,
          label: "Continuous animation",
          value: "The render loop keeps the orb moving while respecting component lifecycle cleanup.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/voice-powered-orb"
      usageCode={`import { VoicePoweredOrb } from "@/components/isaiahbjork/interactive/voice-powered-orb";

export function Demo() {
  return (
    <VoicePoweredOrb
      enableVoiceControl={false}
      onVoiceDetected={(active) => console.log(active)}
    />
  );
}`}
      controls={
        <ShellSegmented
          label="Mic"
          value={mode}
          options={[
            { value: "idle", label: "Off" },
            { value: "listen", label: "On" },
          ]}
          onChange={setMode}
        />
      }
    >
      {demo}
    </ComponentDemoShell>
  );
}
