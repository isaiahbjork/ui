"use client";

import { useMemo, useState } from "react";
import {
  ShellSegmented,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import {
  DEFAULT_STATUS_ROWS,
  Status,
  StatusPanel,
  type StatusState,
} from "@/components/bjork-ui/hud/status";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("hud-status");

type View = "panel" | "pill";

export default function Page() {
  const [view, setView] = useState<View>("panel");
  const [linkState, setLinkState] = useState<StatusState>("ok");
  const [pulse, setPulse] = useState(true);

  function resetControls() {
    setView("panel");
    setLinkState("ok");
    setPulse(true);
  }

  const rows = useMemo(
    () =>
      DEFAULT_STATUS_ROWS.map((row) =>
        row.label === "Link"
          ? {
              ...row,
              state: linkState,
              value: linkState === "fault" ? "TIMEOUT" : linkState === "waiting" ? "RETRY" : "14 MS",
            }
          : row,
      ),
    [linkState],
  );

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A compact status readout for system health. Each row carries a live state dot (green ok, amber waiting, red fault) and mono values. The single pill is still available as a variant."
      dependencies={["framer-motion", "next-themes"]}
      usageCode={`import { StatusPanel } from "@/components/bjork-ui/hud/status";

export function Demo() {
  return (
    <StatusPanel
      rows={[
        { label: "System", value: "NOMINAL", state: "ok" },
        { label: "Link", value: "14 MS", state: "ok" },
        { label: "Power", value: "82%", state: "ok" },
        { label: "Sync", value: "PENDING", state: "waiting" },
      ]}
    />
  );
}`}
      previewScaleClassName="w-[420px] scale-[0.95]"
      previewCaptureScaleClassName="w-[420px] scale-[1.4]"
      onReset={resetControls}
      controls={
        <>
          <ShellSegmented
            label="View"
            value={view}
            options={[
              { value: "panel", label: "Panel" },
              { value: "pill", label: "Pill" },
            ]}
            onChange={setView}
          />
          <ShellSegmented
            label="Link"
            value={linkState}
            options={[
              { value: "ok", label: "Ok" },
              { value: "waiting", label: "Waiting" },
              { value: "fault", label: "Fault" },
            ]}
            onChange={setLinkState}
          />
          <ShellSwitch label="Pulse" checked={pulse} onCheckedChange={setPulse} />
        </>
      }
    >
      <div className="flex min-h-[260px] w-full items-center justify-center py-8">
        {view === "panel" ? (
          <StatusPanel rows={rows} pulse={pulse} />
        ) : (
          <Status />
        )}
      </div>
    </SimpleComponentDemoPage>
  );
}
