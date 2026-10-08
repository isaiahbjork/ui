"use client";

import { Anchor, Blend, Gauge } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { SceneStatesDemo } from "@/components/bjork-ui/interactive/scene-states-demo";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("scene-states");

export default function SceneStatesPage() {
  const isPreview = usePreviewMode();
  const isFull = usePreviewSearchParam("full") === "1";
  const themeParam = usePreviewSearchParam("theme");
  const resolved = useBjorkTone();
  const tone = themeParam === "light" ? "light" : themeParam === "dark" ? "dark" : resolved;

  if (isPreview) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${tone === "light" ? "bg-[#f2ede3]" : "bg-[#0d0d0d]"}`}>
        <div className="h-[520px] w-[900px]">
          <SceneStatesDemo tone={tone} preview />
        </div>
      </div>
    );
  }

  if (isFull) return <SceneStatesDemo tone={tone} />;

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="Sections declare camera poses with data attributes and scroll blends between them. A small engine with no three.js inside: it returns a pose and params, and a rig damps toward them frame-rate independently."
      dependencies={["three"]}
      interactionRows={[
        {
          icon: <Anchor className="size-5" />,
          label: "Declarative anchors",
          value: "data-scene-state, data-scene-lead, data-scene-hold and data-scene-immediate on any element.",
        },
        {
          icon: <Blend className="size-5" />,
          label: "Blending",
          value: "Smoothstep poses, shortest-arc theta, null theta to keep the last angle, easeOutQuad fade keys.",
        },
        {
          icon: <Gauge className="size-5" />,
          label: "Debug",
          value: "Add ?scene-debug to the URL to draw every anchor and the probe line.",
        },
      ]}
      cliCommand="npx shadcn add https://ui.isaiahbjork.com/scene-states.json"
      usageCode={`import { createSceneRig, poseToPosition, useSceneStates } from "@/components/bjork-ui/_core/scene-states";

const defs = {
  intro: { pose: { target: [0, 1, 0], radius: 10, phi: 1.1, theta: 0.6 }, params: { glow: 0 } },
  detail: { pose: { target: [0, 1, 0], radius: 3, phi: 1.3, theta: null }, params: { glow: 1 } },
};
const rig = createSceneRig(defs.intro);

export function Scene() {
  const states = useSceneStates(defs, { fadeKeys: ["glow"] });
  // In your render loop:
  //   const s = states.current?.sample();
  //   const { pose, params } = rig.update(s, dt);
  //   camera.position.set(...poseToPosition(pose)); camera.lookAt(...pose.target);
  return (
    <>
      <section data-scene-state="intro" />
      <section data-scene-state="detail" data-scene-lead="0.4" />
    </>
  );
}`}
      previewClassName="p-0"
    >
      <div className="relative h-[620px] w-full overflow-hidden rounded-[18px]">
        <iframe
          key={tone}
          title="Scene states demo"
          src={`/interactive/scene-states?full=1&theme=${tone}`}
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    </ComponentDemoShell>
  );
}
