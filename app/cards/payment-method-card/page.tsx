"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { PaymentMethodCard } from "@/components/bjork-ui/cards/payment-method-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("payment-method-card");
const SAMPLE_NOW = Date.UTC(2026, 9, 8);

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Saved payment methods. The selected card tilts under the pointer and flips for billing details; the list below picks, defaults and removes cards and flags expired or expiring ones."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "List", value: "Radio group; arrow keys, Home and End move the selection" },
        { label: "Flip", value: "Toggle button with aria-pressed; crossfades under reduced motion" },
        { label: "Remove", value: "Inline confirm; the default card is protected while others exist" },
      ]}
      usageCode={`import { PaymentMethodCard, type PaymentMethod } from "@/components/bjork-ui/cards/payment-method-card";

const methods: PaymentMethod[] = [
  {
    id: "pm_1",
    network: "Orbit",
    issuer: "Halden",
    last4: "4821",
    holder: "Mara Okonjo",
    expMonth: 8,
    expYear: 2028,
    finish: "graphite", // "ember" | "sand" | "ink"
    billingPostal: "94110",
    addedOn: "2025-03-12",
  },
];

<PaymentMethodCard
  defaultMethods={methods}
  defaultDefaultId="pm_1"
  onDefaultChange={(id) => api.setDefault(id)}
  onRemove={(id) => api.detach(id)}
  onAdd={() => openCheckout()}
/>`}
      previewScaleClassName="w-[440px] scale-[0.78]"
    >
      <PaymentMethodCard now={SAMPLE_NOW} onAdd={() => {}} />
    </SimpleComponentDemoPage>
  );
}
