"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { INTEGRATION_SAMPLE, IntegrationCard } from "@/components/bjork-ui/cards/integration-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("integration-card");

export default function Page() {
  const isPreview = usePreviewMode();
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Connect a third-party app. Lists the permissions it asks for, walks through the OAuth hand-off with a live handshake, then shows the account, sync state and a guarded disconnect."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "States", value: "Not connected, connecting, connected, failed, needs attention" },
        { label: "Permissions", value: "Disclosure; required scopes locked, optional ones toggle before connecting" },
        { label: "Announcements", value: "Every state change is read by a polite live region" },
      ]}
      usageCode={`import { IntegrationCard } from "@/components/bjork-ui/cards/integration-card";

<IntegrationCard
  app={{ name: "Ledgerline", publisher: "Ledgerline Labs", description: "Sync invoices into your books.", color: "#2f6f5e" }}
  host={{ name: "Fieldwork", color: "#ec5c13" }}
  scopes={[
    { id: "invoices.read", label: "Read invoices", required: true },
    { id: "invoices.write", label: "Mark invoices paid" },
  ]}
  onConnect={async (scopes) => {
    const account = await startOAuth("ledgerline", scopes); // reject to show the error state
    return { name: account.email, connectedAt: Date.now(), lastSyncedAt: Date.now() };
  }}
  onDisconnect={() => api.revoke("ledgerline")}
  onSync={async () => (await api.sync("ledgerline")).finishedAt}
/>`}
      previewScaleClassName="w-[440px] scale-[0.86]"
    >
      <IntegrationCard
        key={isPreview ? "preview" : "live"}
        defaultStatus={isPreview ? "connected" : "disconnected"}
        defaultAccount={isPreview ? INTEGRATION_SAMPLE.account : undefined}
        now={isPreview ? INTEGRATION_SAMPLE.now : undefined}
      />
    </SimpleComponentDemoPage>
  );
}
