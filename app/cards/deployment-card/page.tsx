"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { DeploymentCard } from "@/components/bjork-ui/cards/deployment-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("deployment-card");

export default function Page() {
  const isPreview = usePreviewMode();
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A deployment as it happens: the commit, a four-stage pipeline with a live timer, streaming logs that follow the tail until you scroll away, and the right action for every outcome."
      dependencies={["lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Logs", value: "role=log, not live; stage changes are announced instead" },
        { label: "Tail", value: "Follows new lines until you scroll up; Latest jumps back" },
        { label: "Outcomes", value: "Ready, failed (failing stage and lines in red), canceled" },
      ]}
      usageCode={`import { DeploymentCard } from "@/components/bjork-ui/cards/deployment-card";

// Controlled, fed from your build events:
<DeploymentCard
  project="atlas-web"
  environment="Production"
  commit={{ sha: "a41f9c2", message: "Cache route segments", branch: "main", author: "Rowan Ellis" }}
  url="atlas-web.fieldwork.app"
  status={deploy.status} // "queued" | "building" | "ready" | "error" | "canceled"
  stage={deploy.stage} // "queued" | "build" | "checks" | "deploy"
  logs={deploy.lines} // { t, text, level, stage }[]
  elapsed={deploy.seconds}
  onCancel={() => api.cancel(deploy.id)}
  onRedeploy={() => api.redeploy(deploy.id)}
/>

// Or the built-in simulation:
<DeploymentCard simulateOutcome="error" defaultLogsOpen />`}
      previewScaleClassName="w-[460px] scale-[0.8]"
    >
      <DeploymentCard key={isPreview ? "preview" : "live"} simulateFinished={isPreview} defaultLogsOpen />
    </SimpleComponentDemoPage>
  );
}
