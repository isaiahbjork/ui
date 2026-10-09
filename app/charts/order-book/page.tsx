"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  OrderBook,
  createOrderBookFeed,
  type MyOrder,
  type OrderBookHandle,
  type OrderBookLayout,
  type OrderBookLevelInfo,
  type OrderBookSnapshot,
} from "@/components/bjork-ui/charts/order-book";
import { DepthChart } from "@/components/bjork-ui/charts/depth-chart";
import { formatFixed } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("order-book");
const TICKS = [0.05, 0.1, 0.25, 0.5, 1];

// A fixed book for the preview card: the same seeded feed, stepped forward.
const PREVIEW = (() => {
  const feed = createOrderBookFeed({ seed: 11 });
  let last: number | undefined;
  for (let i = 0; i < 40; i++) last = feed.step().last ?? last;
  return { ...feed.snapshot(), last };
})();

function myOrdersAround(book: OrderBookSnapshot): MyOrder[] {
  const b = book.bids[3]?.price;
  const a = book.asks[5]?.price;
  return [
    ...(b !== undefined ? [{ id: "o1", side: "bid" as const, price: b, size: 40 }] : []),
    ...(a !== undefined ? [{ id: "o2", side: "ask" as const, price: a, size: 25 }] : []),
  ];
}

function LiveBook() {
  const feed = useMemo(() => createOrderBookFeed({ seed: 7 }), []);
  const bookRef = useRef<OrderBookHandle>(null);
  const [layout, setLayout] = useState<OrderBookLayout>("auto");
  const [rows, setRows] = useState(12);
  const [live, setLive] = useState(true);
  const [mine, setMine] = useState(true);
  const [picked, setPicked] = useState<OrderBookLevelInfo | null>(null);
  const [depth, setDepth] = useState<OrderBookSnapshot>(() => feed.snapshot());
  const myOrders = useMemo(() => (mine ? myOrdersAround(feed.snapshot()) : undefined), [mine, feed]);

  // The feed stands in for an exchange socket: one snapshot, then deltas.
  useEffect(() => feed.subscribe((msg) => bookRef.current?.apply(msg)), [feed]);
  useEffect(() => feed.setPaused(!live), [feed, live]);

  // The depth chart reads the same book, twice a second.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      const snap = bookRef.current?.getSnapshot();
      if (snap) setDepth(snap);
    }, 500);
    return () => clearInterval(id);
  }, [live]);

  return (
    <>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-10">
        <div className={layout === "side-by-side" ? "w-full" : "w-full min-w-0 max-w-[440px] flex-1 basis-[360px]"}>
          <OrderBook
            ref={bookRef}
            layout={layout}
            rows={rows}
            tickSizes={TICKS}
            priceLabel="Price (USD)"
            sizeLabel="Size (KSTL)"
            myOrders={myOrders}
            onPriceSelect={setPicked}
            ariaLabel="KSTL-USD order book"
          />
        </div>
        {layout !== "side-by-side" && (
          <div className="min-w-0 flex-[1.4] basis-[320px]">
            <DepthChart bids={depth.bids} asks={depth.asks} height={300} ariaLabel="KSTL-USD depth" />
          </div>
        )}
      </div>
      <p aria-live="polite" className="min-h-4 text-center font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-muted)]">
        {picked
          ? `Limit ${picked.side === "ask" ? "buy" : "sell"} ${formatFixed(picked.price, 2)} · ${picked.size.toLocaleString("en-US")} on the level`
          : "Click a level to fill the order ticket"}
      </p>
      <ControlRow>
        <OptionGroup
          label="Layout"
          value={layout}
          options={[
            { label: "Auto", value: "auto" },
            { label: "Stacked", value: "stacked" },
            { label: "Side by side", value: "side-by-side" },
          ]}
          onChange={setLayout}
        />
        <OptionGroup
          label="Rows per side"
          value={rows}
          options={[
            { label: "8", value: 8 },
            { label: "12", value: 12 },
            { label: "16", value: 16 },
          ]}
          onChange={setRows}
        />
      </ControlRow>
      <ControlRow>
        <ToggleButton pressed={live} onClick={() => setLive((v) => !v)}>
          {live ? "Pause feed" : "Resume feed"}
        </ToggleButton>
        <ToggleButton onClick={() => feed.burst(2600)}>Burst</ToggleButton>
        <ToggleButton pressed={mine} onClick={() => setMine((v) => !v)}>
          My orders
        </ToggleButton>
      </ControlRow>
    </>
  );
}

export default function Page() {
  const isPreview = usePreviewMode();

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A live order book: asks above the spread and bids below, or side by side, with cumulative depth bars behind every level. Snapshots and deltas are batched to one paint a frame, changed levels flash, and the spread row reads last price with its direction. Hover or arrow through the levels for size, notional and distance from mid; click one to send its price to your order form."
      dependencies={["framer-motion"]}
      usageCode={`import { useEffect, useRef } from "react";
import { OrderBook, createOrderBookFeed, type OrderBookHandle } from "@/components/bjork-ui/charts/order-book";

const book = useRef<OrderBookHandle>(null);

// Swap the simulated feed for your socket: send the snapshot, then deltas (size 0 removes a level).
useEffect(() => {
  const feed = createOrderBookFeed();
  return feed.subscribe((msg) => book.current?.apply(msg));
}, []);

<OrderBook
  ref={book}
  tickSizes={[0.05, 0.1, 0.5, 1]}
  onPriceSelect={(level) => setLimitPrice(level.price)}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[780px] scale-[1.08]"
    >
      {isPreview ? (
        <div className="w-[740px]">
          <OrderBook
            bids={PREVIEW.bids}
            asks={PREVIEW.asks}
            lastPrice={PREVIEW.last}
            layout="side-by-side"
            rows={10}
            tickSizes={TICKS}
            priceLabel="Price (USD)"
            sizeLabel="Size (KSTL)"
            myOrders={myOrdersAround(PREVIEW)}
            activeLevel={{ side: "ask", depth: 6 }}
            showImbalance
            ariaLabel="KSTL-USD order book"
          />
        </div>
      ) : (
        <DemoColumn width={960}>
          <LiveBook />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
