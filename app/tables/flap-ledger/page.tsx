"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
import {
  FLAP_LEDGER_SAMPLE_ROWS,
  FlapLedger,
  type FlapColumn,
  type FlapRow,
  type FlapStatus,
} from "@/components/bjork-ui/tables/flap-ledger";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("flap-ledger");

const columns: FlapColumn[] = [
  { key: "time", header: "Time", width: 5, charset: "0123456789: " },
  { key: "flight", header: "Flight", width: 6, charset: "alnum" },
  { key: "destination", header: "Destination", width: 12, charset: "alpha" },
  { key: "gate", header: "Gate", width: 3, charset: "alnum" },
  { key: "status", header: "Status", width: 11, charset: ["ON TIME", "BOARDING", "DELAYED", "GATE CLOSED", "DEPARTED"] },
];

const statusLed = (row: FlapRow): FlapStatus => {
  if (row.status === "ON TIME" || row.status === "BOARDING") return "ok";
  if (row.status === "DELAYED" || row.status === "GATE CLOSED") return "warn";
  return "off";
};

const narrowQuery = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useNarrowViewport() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

const sizes = ["sm", "md", "lg"] as const;
const cascades = ["changed", "left", "right"] as const;

export default function FlapLedgerDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const attractParam = usePreviewSearchParam("attract") === "1";
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;

  // The live demo opens at sm so the 958px md board fits the shell panel. Preview captures stay at md.
  const [sizeChoice, setSizeChoice] = useState<(typeof sizes)[number]>("sm");
  const [cascade, setCascade] = useState<(typeof cascades)[number]>("changed");
  const narrow = useNarrowViewport();
  const size = isPreview ? "md" : narrow ? "sm" : sizeChoice;

  const [step, setStep] = useState(0);
  const [inView, setInView] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Demo data updates every 6s while on screen. Preview captures stay on the first set.
  useEffect(() => {
    if (isPreview || attractParam || !inView) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % FLAP_LEDGER_SAMPLE_ROWS.length), 6000);
    return () => window.clearInterval(id);
  }, [isPreview, attractParam, inView]);

  const rows = FLAP_LEDGER_SAMPLE_ROWS[isPreview ? 0 : step];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A split-flap board for live data. Each column only flips through the characters it is allowed to show, and the cascade starts from the column that changed most."
      usageCode={`import { FlapLedger, type FlapColumn } from "@/components/bjork-ui/tables/flap-ledger";

const columns: FlapColumn[] = [
  { key: "time", header: "Time", width: 5, charset: "0123456789: " },
  { key: "status", header: "Status", width: 11, charset: ["ON TIME", "BOARDING", "DELAYED", "GATE CLOSED", "DEPARTED"] },
];

<FlapLedger
  columns={columns}
  rows={rows}
  status={(row) => (row.status === "DELAYED" ? "warn" : "ok")}
/>`}
      previewScaleClassName="w-[1000px] scale-[0.78]"
      previewLayout={isPreview ? "single" : "list"}
    >
      {!isPreview ? (
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <BjorkButtonGroup aria-label="Board size">
            {sizes.map((value) => (
              <BjorkButton
                key={value}
                size="sm"
                variant={sizeChoice === value ? "secondary" : "ghost"}
                aria-pressed={sizeChoice === value}
                onClick={() => setSizeChoice(value)}
              >
                {value}
              </BjorkButton>
            ))}
          </BjorkButtonGroup>
          <BjorkButtonGroup aria-label="Cascade origin">
            {cascades.map((value) => (
              <BjorkButton
                key={value}
                size="sm"
                variant={cascade === value ? "secondary" : "ghost"}
                aria-pressed={cascade === value}
                onClick={() => setCascade(value)}
              >
                {value}
              </BjorkButton>
            ))}
          </BjorkButtonGroup>
        </div>
      ) : null}
      <div ref={wrapRef} className="w-full min-w-0">
        <FlapLedger
          columns={columns}
          rows={rows}
          size={size}
          cascadeFrom={cascade}
          status={statusLed}
          ariaLabel="Departures"
          tone={tone}
          attract={attractParam}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
