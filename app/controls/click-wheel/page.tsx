"use client";

import { useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ClickWheel, type ClickWheelItem } from "@/components/bjork-ui/controls/click-wheel";
import { BjorkSelect } from "@/components/bjork-ui/primitives/select";
import { BjorkSwitch } from "@/components/bjork-ui/primitives/switch";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("click-wheel");

const TRACKS: ClickWheelItem[] = [
  { id: "t01", label: "01 Low Orbit", meta: "3:42" },
  { id: "t02", label: "02 Paper Tide", meta: "4:05" },
  { id: "t03", label: "03 Night Relay", meta: "2:58" },
  { id: "t04", label: "04 Cold Signal", meta: "3:21" },
  { id: "t05", label: "05 Glass Hour", meta: "5:10" },
  { id: "t06", label: "06 Ember Route", meta: "3:33" },
  { id: "t07", label: "07 Dust Lane", meta: "4:47" },
  { id: "t08", label: "08 Quiet Stack", meta: "2:16" },
  { id: "t09", label: "09 Halflight", meta: "3:58" },
  { id: "t10", label: "10 Open Field", meta: "4:12" },
  { id: "t11", label: "11 Kilnwork", meta: "3:05" },
  { id: "t12", label: "12 Static Bloom", meta: "2:44" },
  { id: "t13", label: "13 Harbour Lines", meta: "4:31" },
  { id: "t14", label: "14 Sunday Grid", meta: "3:19" },
  { id: "t15", label: "15 Wire Choir", meta: "5:02" },
  { id: "t16", label: "16 Plain Sky", meta: "3:47" },
  { id: "t17", label: "17 Mercury Walk", meta: "2:52" },
  { id: "t18", label: "18 Last Freight", meta: "4:26" },
];

const INERTIA_OPTIONS = [
  { value: "0.90", label: "0.90" },
  { value: "0.94", label: "0.94" },
  { value: "0.97", label: "0.97" },
];

const DETENT_OPTIONS = [
  { value: "8", label: "8 detents" },
  { value: "12", label: "12 detents" },
  { value: "24", label: "24 detents" },
];

export default function Page() {
  const isPreview = usePreviewMode();
  const attractParam = usePreviewSearchParam("attract") === "1";
  const [inertia, setInertia] = useState("0.94");
  const [detents, setDetents] = useState("12");
  const [loop, setLoop] = useState(false);
  const [selected, setSelected] = useState("—");

  const details = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <BjorkSelect options={INERTIA_OPTIONS} value={inertia} onValueChange={setInertia} placeholder="Inertia" />
        <BjorkSelect options={DETENT_OPTIONS} value={detents} onValueChange={setDetents} placeholder="Detents" />
        <label className="flex items-center gap-2 font-mono text-[12px] text-[color:var(--bjork-text-medium)]">
          <BjorkSwitch checked={loop} onCheckedChange={setLoop} aria-label="Loop the list" />
          Loop
        </label>
      </div>
      <p className="font-mono text-[12px] text-[color:var(--bjork-text-muted)]" aria-live="polite">
        Selected: {selected}
      </p>
    </div>
  );

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A rotary list selector with real angular inertia and detents you can feel."
      usageCode={`<ClickWheel
  items={tracks}
  inertia={0.94}
  detentsPerRev={12}
  loop={false}
  onSelect={(item, index) => console.log(item.label, index)}
/>`}
      details={details}
      previewScaleClassName="w-[360px] scale-[0.9]"
      previewCaptureScaleClassName="w-[360px] scale-[1.08]"
      previewLayout={isPreview ? "list" : "single"}
    >
      {isPreview ? (
        // Preview pose: the wheel alone as the hero, centred in the 900x520 clip. Lit detent at value 4.
        <div className="flex w-full justify-center">
          <ClickWheel items={TRACKS} value={4} attract={false} layout="wheel-only" size={340} />
        </div>
      ) : (
        <ClickWheel
          items={TRACKS}
          defaultValue={0}
          inertia={Number(inertia)}
          detentsPerRev={Number(detents)}
          loop={loop}
          attract={attractParam}
          onSelect={(picked) => setSelected(picked.label)}
        />
      )}
    </SimpleComponentDemoPage>
  );
}
