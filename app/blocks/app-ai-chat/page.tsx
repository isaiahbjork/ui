"use client";

import { AppAiChat } from "@/components/bjork-ui/blocks/app-ai-chat";
import { AppBlockFrame } from "../app-block-frame";

export default function AppAiChatDemo() {
  return (
    <AppBlockFrame
      slug="app-ai-chat"
      description="A complete chat app: searchable history grouped by day, a model picker, streamed replies you can stop, light markdown with copyable code blocks, copy, feedback and regenerate on each answer, edit-and-resend for your last message, file attachments by picker, paste or drop, and a jump-to-latest button when you scroll up. It runs on a local simulator until you pass your own streaming function."
      usageCode={`import { AppAiChat } from "@/components/bjork-ui/blocks/app-ai-chat";

export function Chat() {
  return (
    <div className="h-dvh">
      <AppAiChat
        conversations={[]}
        models={[{ id: "fast", name: "Fast", hint: "Quick answers" }]}
        // Yield text chunks as they arrive; stop when the signal aborts.
        respond={async function* ({ messages, model, signal }) {
          const res = await fetch("/api/chat", {
            method: "POST",
            body: JSON.stringify({ messages, model }),
            signal,
          });
          const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) return;
            yield value;
          }
        }}
        onConversationsChange={(all) => localStorage.setItem("chats", JSON.stringify(all))}
      />
    </div>
  );
}`}
    >
      {({ theme }) => <AppAiChat theme={theme} />}
    </AppBlockFrame>
  );
}
