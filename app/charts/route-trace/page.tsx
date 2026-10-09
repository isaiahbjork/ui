"use client";

import { useMemo, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { BjorkSlider } from "@/components/bjork-ui/primitives/slider";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  RouteTrace,
  type RouteEdge,
  type RouteNode,
} from "@/components/bjork-ui/charts/route-trace";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("route-trace");

const NODES: RouteNode[] = [
  { id: "client", label: "Client", sublabel: "web", col: 0, row: 1 },
  { id: "edge", label: "Edge", sublabel: "cdn", col: 1, row: 1 },
  { id: "gateway", label: "Gateway", sublabel: "api", col: 2, row: 1 },
  { id: "auth", label: "Auth", sublabel: "sessions", col: 3, row: 0 },
  { id: "search", label: "Search", sublabel: "index", col: 3, row: 1 },
  { id: "billing", label: "Billing", sublabel: "invoices", col: 3, row: 2 },
  { id: "postgres", label: "Postgres", sublabel: "primary", col: 4, row: 1 },
];

const EDGE_TEMPLATE: RouteEdge[] = [
  { from: "client", to: "edge", throughput: 0.9 },
  { from: "edge", to: "gateway", throughput: 0.85 },
  { from: "gateway", to: "auth", throughput: 0.3 },
  { from: "gateway", to: "search", throughput: 0.7 },
  { from: "gateway", to: "billing", throughput: 0.2 },
  { from: "search", to: "postgres", throughput: 0.6 },
  { from: "billing", to: "postgres", throughput: 0.15 },
  { from: "auth", to: "postgres", throughput: 0.25 },
];

// Five-node tile subset. Every edge is adjacent, so each one is a Z-route.
const TILE_NODES: RouteNode[] = [
  { id: "client", label: "Client", sublabel: "web", col: 0, row: 1 },
  { id: "gateway", label: "Gateway", sublabel: "api", col: 1, row: 1 },
  { id: "auth", label: "Auth", sublabel: "sessions", col: 2, row: 0 },
  { id: "search", label: "Search", sublabel: "index", col: 2, row: 1 },
  { id: "postgres", label: "Postgres", sublabel: "primary", col: 3, row: 1 },
];

const TILE_EDGES: RouteEdge[] = [
  { from: "client", to: "gateway", throughput: 0.8 },
  { from: "gateway", to: "auth", throughput: 0.3 },
  { from: "gateway", to: "search", throughput: 0.6 },
  { from: "auth", to: "postgres", throughput: 0.25 },
  { from: "search", to: "postgres", throughput: 0.5 },
];

// Five columns at 124px. Where that can't hold labels at 10px, the diagram turns to flow top to bottom.
const DEMO_CELL = { w: 124, h: 88 };

const usageCode = `import { RouteTrace } from "@/components/bjork-ui/charts/route-trace";

<RouteTrace
  nodes={[
    { id: "client", label: "Client", col: 0, row: 1 },
    { id: "gateway", label: "Gateway", col: 2, row: 1 },
    { id: "auth", label: "Auth", col: 3, row: 0 },
    { id: "search", label: "Search", col: 3, row: 1 },
  ]}
  edges={[
    { from: "client", to: "gateway", throughput: 0.9 },
    { from: "gateway", to: "auth", throughput: 0.3 },
    { from: "gateway", to: "search", throughput: 0.7, status: "degraded" },
  ]}
  onNodeSelect={(id) => console.log(id)}
/>`;

function TileDemo() {
  return (
    <div className="flex w-[min(560px,calc(100vw-56px))] items-center justify-center overflow-hidden">
      <RouteTrace nodes={TILE_NODES} edges={TILE_EDGES} attract ariaLabel="Route trace tile" />
    </div>
  );
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [downIds, setDownIds] = useState<Record<string, boolean>>({});
  const [searchThroughput, setSearchThroughput] = useState(0.7);
  const [speed, setSpeed] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const nodes = useMemo<RouteNode[]>(() => {
    if (isPreview) {
      return NODES.map((n) => (n.id === "billing" ? { ...n, status: "down" } : n));
    }
    return NODES.map((n) => ({ ...n, status: downIds[n.id] ? "down" : "ok" }));
  }, [isPreview, downIds]);

  const edges = useMemo<RouteEdge[]>(
    () =>
      EDGE_TEMPLATE.map((e) =>
        e.from === "gateway" && e.to === "search" ? { ...e, throughput: searchThroughput } : e,
      ),
    [searchThroughput],
  );

  const controls = (
    <div className="flex w-full min-w-0 flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {NODES.map((n) => {
          const isDown = Boolean(downIds[n.id]);
          return (
            <BjorkButton
              key={n.id}
              size="sm"
              variant={isDown ? "secondary" : "ghost"}
              aria-pressed={isDown}
              onClick={() => setDownIds((prev) => ({ ...prev, [n.id]: !prev[n.id] }))}
            >
              {`${n.label}: ${isDown ? "down" : "up"}`}
            </BjorkButton>
          );
        })}
      </div>
      <div className="flex w-full max-w-[420px] flex-col gap-2">
        <div className="flex items-center justify-between font-mono text-[12px] tabular-nums text-[color:var(--bjork-text-muted)]">
          <span>Gateway to Search throughput</span>
          <span>{`${Math.round(searchThroughput * 100)}%`}</span>
        </div>
        <BjorkSlider
          min={0}
          max={100}
          value={Math.round(searchThroughput * 100)}
          onValueChange={(v) => setSearchThroughput(v / 100)}
          aria-label="Gateway to Search throughput"
        />
      </div>
      <BjorkButtonGroup aria-label="Speed">
        {[0.5, 1, 2].map((value) => (
          <BjorkButton
            key={value}
            size="sm"
            variant={speed === value ? "secondary" : "ghost"}
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
            className="tabular-nums"
          >
            {`${value}×`}
          </BjorkButton>
        ))}
      </BjorkButtonGroup>
    </div>
  );

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A live system diagram routed like a circuit board. Traffic shows as packets, and failure shows as silence. It always fits its container: wide spaces flow left to right, narrow ones turn the flow top to bottom. Arrow keys walk the services, and the line underneath reads the focused one's traffic."
      dependencies={["framer-motion"]}
      usageCode={usageCode}
      details={
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[12px] text-[color:var(--bjork-text-muted)]">Tile, attract on</p>
          <TileDemo />
        </div>
      }
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[920px] scale-[0.82]"
    >
      <div className="flex w-full min-w-0 flex-col items-center gap-6">
        <div className={isPreview ? "w-[min(920px,calc(100vw-56px))] min-w-0" : "w-[min(760px,calc(100vw-56px))] lg:w-[min(760px,calc(50vw-128px))] min-w-0"}>
          <RouteTrace
            className="w-full"
            nodes={nodes}
            edges={edges}
            cell={DEMO_CELL}
            speed={speed}
            selectedId={selectedId}
            onNodeSelect={setSelectedId}
            ariaLabel="Route trace demo"
            frozen={isPreview}
            attract={false}
          />
        </div>
        {!isPreview && controls}
      </div>
    </SimpleComponentDemoPage>
  );
}
