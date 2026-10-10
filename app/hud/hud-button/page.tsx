"use client";

import { useState } from "react";
import { HudButton, type HudButtonVariant } from "@/components/bjork-ui/hud/hud-button";
import {
  ShellSegmented,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("hud-button");

type Size = "small" | "default" | "large";
type Show = "all" | HudButtonVariant;

const LABELS: Record<HudButtonVariant, string> = {
  primary: "Initialize",
  secondary: "Calibrate",
  ghost: "Dismiss",
};

export default function Page() {
  const [size, setSize] = useState<Size>("default");
  const [show, setShow] = useState<Show>("all");
  const [animate, setAnimate] = useState(true);

  function resetControls() {
    setSize("default");
    setShow("all");
    setAnimate(true);
  }

  const variants: HudButtonVariant[] = show === "all" ? ["primary", "secondary", "ghost"] : [show];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="HUD action buttons on one shape family. Primary carries the ember fill, secondary sits on the canon surface, and ghost is text until it lifts. Mono uppercase labels, corner ticks and a scanline on hover give the HUD flavour."
      dependencies={["framer-motion", "clsx"]}
      usageCode={`import { HudButton } from "@/components/bjork-ui/hud/hud-button";

export function Demo() {
  return (
    <div className="flex gap-3">
      <HudButton variant="primary">Initialize</HudButton>
      <HudButton variant="secondary">Calibrate</HudButton>
      <HudButton variant="ghost">Dismiss</HudButton>
    </div>
  );
}`}
      previewScaleClassName="w-[720px] scale-[0.92]"
      onReset={resetControls}
      controls={
        <>
          <ShellSegmented
            label="Show"
            value={show}
            options={[
              { value: "all", label: "All" },
              { value: "primary", label: "Primary" },
              { value: "secondary", label: "Second" },
              { value: "ghost", label: "Ghost" },
            ]}
            onChange={setShow}
          />
          <ShellSegmented
            label="Size"
            value={size}
            options={[
              { value: "small", label: "Small" },
              { value: "default", label: "Default" },
              { value: "large", label: "Large" },
            ]}
            onChange={setSize}
          />
          <ShellSwitch label="Motion" checked={animate} onCheckedChange={setAnimate} />
        </>
      }
    >
      <div className="flex min-h-[220px] w-full flex-wrap items-center justify-center gap-5 py-10">
        {variants.map((variant) => (
          <HudButton
            key={variant}
            variant={variant}
            size={size}
            enableAnimations={animate}
            onClick={() => console.log(`${variant} clicked`)}
          >
            {LABELS[variant]}
          </HudButton>
        ))}
      </div>
    </SimpleComponentDemoPage>
  );
}
