"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { Hand, MousePointer2, RotateCw } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { DraggableRope } from "@/components/isaiahbjork/interactive/draggable-rope";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("draggable-rope");

export default function DraggableRopePage() {
  const isPreview = usePreviewMode();
  const demo = (
    <div className="flex h-[560px] w-full items-start justify-center overflow-hidden pt-8">
      <DraggableRope />
    </div>
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-start justify-center overflow-hidden bg-[#111111] pt-4">
        <div className="scale-[0.68]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A GSAP Draggable rope interaction with rotation bounds, inertia, and a gravity-like return swing. It is built as a playful physics input that can hold custom icons or product objects."
      dependencies={["gsap", "framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Hand className="size-5" />,
          label: "Drag rotation",
          value: "The object can be grabbed and rotated inside bounded angles.",
        },
        {
          icon: <RotateCw className="size-5" />,
          label: "Swing recovery",
          value: "Release restarts an easing loop based on the final drag angle.",
        },
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Configurable physics",
          value: "Gravity, rope size, minimum angle, and icon scale are component props.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/draggable-rope"
      usageCode={`import { DraggableRope } from "@/components/isaiahbjork/interactive/draggable-rope";

export function Demo() {
  return <DraggableRope gravity={18} initialAngle={8} />;
}`}
    >
      {demo}
    </ComponentDemoShell>
  );
}
