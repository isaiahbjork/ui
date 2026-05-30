"use client";

import { DashboardCardModal } from "@/components/isaiahbjork/cards/dashboard-card-modal";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function DashboardCardModalDemo() {
  const item = getGalleryItem("dashboard-card-modal");

  const handleUpdatePolicy = (data: unknown) => {
    console.log("Policy update requested:", data);
  };

  const handleCopyId = () => {
    console.log("ID number copied to clipboard");
  };

  const handleCopyPolicy = () => {
    console.log("Policy number copied to clipboard");
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A dense dashboard card with inline copy actions and a modal update path. It is built for account, policy, or record-management surfaces where the summary card needs one focused edit action."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { DashboardCardModal } from "@/components/isaiahbjork/cards/dashboard-card-modal";

export function Demo() {
  return (
    <DashboardCardModal
      onUpdatePolicy={(data) => console.log(data)}
      onCopyId={() => console.log("copied id")}
      onCopyPolicy={() => console.log("copied policy")}
    />
  );
}`}
      previewScaleClassName="w-[700px] scale-[0.86]"
    >
      <DashboardCardModal
        onUpdatePolicy={handleUpdatePolicy}
        onCopyId={handleCopyId}
        onCopyPolicy={handleCopyPolicy}
      />
    </SimpleComponentDemoPage>
  );
}
