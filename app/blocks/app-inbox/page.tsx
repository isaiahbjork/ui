"use client";

import { AppInbox } from "@/components/bjork-ui/blocks/app-inbox";
import { AppBlockFrame } from "../app-block-frame";

export default function AppInboxDemo() {
  return (
    <AppBlockFrame
      slug="app-inbox"
      description="A three-pane mail client: folders and labels, a searchable thread list with multi-select and bulk actions, and a reader with folded older messages and an inline reply. Archive and delete offer undo. It is fully keyboard-driven (J and K to move, E to archive, S to star, ? for the rest), and on narrow containers the panes collapse to a list that opens into the reader."
      usageCode={`import { AppInbox, type InboxThread } from "@/components/bjork-ui/blocks/app-inbox";

const threads: InboxThread[] = [
  {
    id: "t1",
    subject: "Revenue chart feedback",
    folder: "inbox",
    labels: ["design"],
    unread: true,
    messages: [
      {
        id: "m1",
        from: { name: "Maren Okafor", email: "maren@fieldnote.studio" },
        date: "2026-10-08T09:12:00Z",
        body: "Four of five people read the dashed line as a forecast.",
      },
    ],
  },
];

export function Mail() {
  return (
    <div className="h-dvh">
      <AppInbox
        threads={threads}
        labels={[{ id: "design", name: "Design", color: "#ec7d43" }]}
        me={{ name: "Rhea Castillo", email: "rhea@halcyon.app" }}
        onReply={(threadId, body) => fetch(\`/api/threads/\${threadId}/reply\`, { method: "POST", body })}
        onThreadChange={(thread) => fetch(\`/api/threads/\${thread.id}\`, { method: "PATCH", body: JSON.stringify(thread) })}
      />
    </div>
  );
}`}
    >
      {({ isPreview, theme }) => <AppInbox theme={theme} disableAnimation={isPreview} />}
    </AppBlockFrame>
  );
}
