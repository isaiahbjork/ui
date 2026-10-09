"use client";

import { useEffect, useMemo, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { DepthChart, createOrderBook, type BookLevel } from "@/components/bjork-ui/charts/depth-chart";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("depth-chart");
const PREVIEW_BOOK = createOrderBook(3).snapshot();

function useLiveBook(running: boolean) {
  const feed = useMemo(() => createOrderBook(3), []);
  const [book, setBook] = useState<{ bids: BookLevel[]; asks: BookLevel[] }>(() => feed.snapshot());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setBook(feed.next()), 500);
    return () => clearInterval(id);
  }, [running, feed]);
  return book;
}

// The feed lives in its own component, so each update re-renders the chart, not the page shell.
function LiveDepth({ running }: { running: boolean }) {
  const book = useLiveBook(running);
  return <DepthChart {...book} height={360} ariaLabel="ACME order book" />;
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [live, setLive] = useState(true);

  function reset() {
    setLive(true);
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Cumulative order book depth: bids in ink to the left of mid, asks in the accent to the right. Hover walks the book and reads what that size would cost, with the average fill marked on the axis and the impact from mid in basis points. Live updates ease in, and the y range never clips a wall of size."
      dependencies={["framer-motion"]}
      usageCode={`import { DepthChart } from "@/components/bjork-ui/charts/depth-chart";

<DepthChart
  bids={[{ price: 101.15, size: 120 }, { price: 101.1, size: 340 }]}
  asks={[{ price: 101.2, size: 90 }, { price: 101.25, size: 410 }]}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[780px] scale-[1.08]"
      onReset={reset}
      optionsDefaultOpen={false}
      controls={
        <>
          <ShellSwitch label="Feed" checked={live} onCheckedChange={setLive} />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[740px]">
          <DepthChart {...PREVIEW_BOOK} probe={{ side: "ask", level: 14 }} height={380} ariaLabel="ACME order book" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <LiveDepth running={live} />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
