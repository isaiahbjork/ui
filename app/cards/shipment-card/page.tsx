"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ShipmentCard } from "@/components/bjork-ui/cards/shipment-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("shipment-card");

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Order tracking at a glance: when it arrives, where it is on the way, what is inside and the full scan history on demand. Delays and failed attempts turn the rail amber without losing progress."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Progress", value: "Ordered list with aria-current on the active step" },
        { label: "Tracking", value: "Copy strips spaces and confirms through a live region" },
        { label: "History", value: "Disclosure; newest scan first, times in the zone you pass" },
      ]}
      usageCode={`import { ShipmentCard } from "@/components/bjork-ui/cards/shipment-card";

<ShipmentCard
  orderNumber="HX-20418"
  carrier="Parcelline"
  service="Ground"
  trackingNumber="PL 7741 0952 3318"
  trackingUrl="https://track.example.com/PL774109523318"
  stage="out_for_delivery" // "ordered" | "shipped" | "delivered"
  etaFrom="2026-10-08T16:00:00Z"
  eta="2026-10-08T20:00:00Z"
  exception={{ label: "Delayed", detail: "Weather at the Oakland hub. New window tomorrow." }}
  items={[{ id: "i1", name: "Linen throw", color: "#d8c7a6" }]}
  events={scans}
  timeZone="America/Los_Angeles"
/>`}
      previewScaleClassName="w-[440px] scale-[0.82]"
    >
      <ShipmentCard trackingUrl="#" timeZone="America/Los_Angeles" />
    </SimpleComponentDemoPage>
  );
}
