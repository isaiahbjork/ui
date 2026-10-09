"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageBranch,
  SAMPLE_ASSISTANT_VERSIONS,
  SAMPLE_USER_VERSIONS,
  type MessageVersion,
} from "@/components/bjork-ui/ai/message-branch";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("message-branch");

const REWRITES = [
  "Your drafts now live on your device first. Lose the connection mid-sentence and Fieldnotes simply carries on, then syncs the moment you're back.",
  "New: offline drafts. Fieldnotes saves locally and syncs later, so a flaky connection never eats your work.",
  "Write without a signal. Fieldnotes keeps drafts on your device and syncs them when you reconnect.",
];

function Demo() {
  const isPreview = usePreviewMode();
  const [user, setUser] = useState<MessageVersion[]>(SAMPLE_USER_VERSIONS);
  const [assistant, setAssistant] = useState<MessageVersion[]>(SAMPLE_ASSISTANT_VERSIONS);
  const [writing, setWriting] = useState<{ id: string; text: string; shown: number } | null>(null);
  const timers = useRef<number[]>([]);
  const rewrites = useRef(0);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Streams the pending rewrite into the newest assistant version, a few characters per tick.
  useEffect(() => {
    if (!writing) return;
    if (writing.shown >= writing.text.length) {
      const id = window.setTimeout(() => {
        setAssistant((list) => list.map((v) => (v.id === writing.id ? { ...v, streaming: false } : v)));
        setWriting(null);
      }, 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      const shown = Math.min(writing.text.length, writing.shown + 4);
      setAssistant((list) =>
        list.map((v) => (v.id === writing.id ? { ...v, content: writing.text.slice(0, shown) } : v)),
      );
      setWriting({ ...writing, shown });
    }, 28);
    return () => window.clearTimeout(id);
  }, [writing]);

  // A real backend would start a request here. The demo adds an empty streaming version after a short wait.
  const startRewrite = () => {
    const n = ++rewrites.current;
    const t = window.setTimeout(() => {
      const id = `rewrite-${n}`;
      setAssistant((list) => [...list, { id, content: "", model: "Halcyon 3 Pro", createdAt: Date.now(), streaming: true }]);
      setWriting({ id, text: REWRITES[(n - 1) % REWRITES.length], shown: 0 });
    }, 900);
    timers.current.push(t);
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setWriting(null);
    setUser(SAMPLE_USER_VERSIONS);
    setAssistant(SAMPLE_ASSISTANT_VERSIONS);
  };

  return (
    <div className="flex w-[min(560px,calc(100vw-56px))] flex-col gap-5">
      <MessageBranch
        role="user"
        versions={user}
        onEdit={(content) => {
          setUser((list) => [...list, { id: `u${list.length + 1}`, content, createdAt: Date.now() }]);
          startRewrite();
        }}
      />
      <MessageBranch
        role="assistant"
        versions={assistant}
        defaultIndex={1}
        onRegenerate={startRewrite}
      />
      {!isPreview && (
        <div className="flex justify-center pt-2">
          <BjorkButton variant="secondary" size="sm" onClick={reset}>
            Reset
          </BjorkButton>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A chat message with versions. Step between branches with the switcher or the arrow keys, copy, regenerate an answer or edit a prompt into a new branch, and the thread never jumps."
      dependencies={["lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { MessageBranch, type MessageVersion } from "@/components/bjork-ui/ai/message-branch";

export function Turn({ versions, regenerate }: { versions: MessageVersion[]; regenerate: () => void }) {
  return <MessageBranch role="assistant" versions={versions} onRegenerate={regenerate} />;
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[560px] scale-[1.2]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
