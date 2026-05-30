"use client";

import { AnimatedCardStatusList, type Card } from "@/components/isaiahbjork/cards/animated-card-status-list";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

const demoCards: Card[] = [
  { id: "1", title: "Import products from your store", status: "completed" },
  { id: "2", title: "Unique selling points", status: "completed" },
  { id: "3", title: "Primary customers", status: "completed" },
  { id: "4", title: "Common words & phrases", status: "updates-found" },
  { id: "5", title: "Company overview and offer details", status: "syncing" },
];

export default function Page() {
  const item = getGalleryItem("animated-card-status-list");

  const handleSynchronize = (cardId: string) => {
    console.log("Synchronizing card:", cardId);
  };

  const handleAddCard = () => {
    console.log("Add new card clicked");
  };

  const handleBack = () => {
    console.log("Back button clicked");
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A compact status-list card for setup flows, imports, and background sync jobs. Each row can report completed, updated, or syncing states while exposing callbacks for retry, add, and back actions."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { AnimatedCardStatusList } from "@/components/isaiahbjork/cards/animated-card-status-list";

const cards = [
  { id: "1", title: "Import products from your store", status: "completed" },
  { id: "2", title: "Unique selling points", status: "updates-found" },
  { id: "3", title: "Company overview", status: "syncing" },
];

export function Demo() {
  return <AnimatedCardStatusList title="Fundamentals" cards={cards} />;
}`}
      previewScaleClassName="w-[560px] scale-[0.88]"
    >
      <AnimatedCardStatusList 
        title="Fundamentals Demo"
        cards={demoCards}
        onSynchronize={handleSynchronize}
        onAddCard={handleAddCard}
        onBack={handleBack}
      />
    </SimpleComponentDemoPage>
  );
}
