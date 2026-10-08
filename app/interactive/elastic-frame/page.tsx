"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Hand, MousePointer2, Keyboard } from "lucide-react";
import { ComponentDemoShell, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import {
  ElasticFrame,
  pluck,
  type ElasticFrameHandle,
} from "@/components/bjork-ui/interactive/elastic-frame";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("elastic-frame");

function PlateCard({ tone }: { tone: BjorkTone }) {
  const p = BJORK_PALETTE[tone];
  return (
    <figure
      className="w-[340px] max-w-full overflow-hidden rounded-[8px] border"
      style={{ background: p.surface, borderColor: p.border }}
    >
      <div className="relative h-[200px] w-full">
        <Image src="/images/plates/plate-04.webp" alt="" fill priority sizes="340px" className="object-cover" />
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-4 pt-3 pb-3.5">
        <div className="min-w-0">
          <div className="font-bjork-alpha text-[16px] leading-6 font-semibold" style={{ color: p.text }}>
            Untitled 07
          </div>
          <div className="font-mono text-[12px] leading-5" style={{ color: p.textSoft }}>
            plate study, 2026
          </div>
        </div>
        <button
          type="button"
          aria-label="View Untitled 07"
          className="shrink-0 rounded-[8px] border px-2.5 py-1 font-mono text-[12px] transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:outline-none"
          style={{ borderColor: p.borderStrong, color: p.textMedium, background: p.raised }}
        >
          View
        </button>
      </figcaption>
    </figure>
  );
}

export default function ElasticFramePage() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const resolvedTone = useBjorkTone();
  const tone: BjorkTone = isPreview ? (previewTheme === "light" ? "light" : "dark") : resolvedTone;
  const frameRef = useRef<ElasticFrameHandle>(null);
  const [coupling, setCoupling] = useState("900");
  const [damping, setDamping] = useState("14");
  // A ref, not state: a click should not re-render the whole demo shell.
  const plucks = useRef(0);

  if (isPreview) {
    const p = BJORK_PALETTE[tone];
    return (
      <div
        className="flex min-h-screen items-center justify-center overflow-hidden"
        style={{ background: p.bg }}
      >
        <ElasticFrame
          tone={tone}
          debugState={{ at: 0.28, amount: 22 }}
          className="h-[460px] w-[720px]"
        >
          <PlateCard tone={tone} />
        </ElasticFrame>
      </div>
    );
  }

  if (!item) return null;

  const demo = (
    // lg:pt-24 keeps the frame clear of the shell's Options panel at the top right.
    <div className="flex h-full w-full items-center justify-center overflow-hidden p-3 sm:p-6 lg:pt-24">
      <ElasticFrame
        ref={frameRef}
        coupling={Number(coupling)}
        damping={Number(damping)}
        className="h-[360px] w-[560px] max-w-full"
      >
        <PlateCard tone={tone} />
      </ElasticFrame>
    </div>
  );

  return (
    <ComponentDemoShell
      item={item}
      description="A frame drawn as a tensioned string. Bring the pointer to an edge to pluck it, and it rings back to rest. Focus inside the frame sends a small breath through the string."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Pointer pluck",
          value: "Pass near an edge to bend the string. Pull harder and it stretches to its limit.",
        },
        {
          icon: <Keyboard className="size-5" />,
          label: "Focus breath",
          value: "Tabbing into a control sends an outward ripple through the whole outline.",
        },
        {
          icon: <Hand className="size-5" />,
          label: "Reduced motion",
          value: "The frame holds still. Children stay fully usable.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/elastic-frame"
      usageCode={`import { ElasticFrame } from "@/components/bjork-ui/interactive/elastic-frame";

export function Demo() {
  return (
    <ElasticFrame coupling={900} damping={14} radius={24} padding={32}>
      <Card className="rounded-[8px]" />
    </ElasticFrame>
  );
}`}
      controls={
        <>
          <ShellSegmented
            label="Coupling"
            value={coupling}
            options={[
              { value: "400", label: "400" },
              { value: "900", label: "900" },
              { value: "1600", label: "1600" },
            ]}
            onChange={setCoupling}
          />
          <ShellSegmented
            label="Damping"
            value={damping}
            options={[
              { value: "6", label: "6" },
              { value: "14", label: "14" },
              { value: "28", label: "28" },
            ]}
            onChange={setDamping}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                pluck(frameRef, (plucks.current * 0.31) % 1, 26);
                plucks.current += 1;
              }}
              className="rounded-[10px] border px-3 py-1 text-sm transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:outline-none"
              style={{ background: BJORK_PALETTE[tone].raised, borderColor: BJORK_PALETTE[tone].borderStrong, color: BJORK_PALETTE[tone].text }}
            >
              Pluck
            </button>
          </div>
        </>
      }
    >
      {demo}
    </ComponentDemoShell>
  );
}
