"use client";

import { useRef, useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
import {
  DecodeText,
  type DecodeCharsetName,
  type DecodeOrder,
  type DecodeTextHandle,
} from "@/components/bjork-ui/text/decode-text";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("decode-text");

const charsets: DecodeCharsetName[] = ["blocks", "box", "braille", "katakana-half", "math", "binary"];
const orders: DecodeOrder[] = ["left", "center", "random"];
const WORDS = ["Signal received", "Archive unsealed", "Handshake done"];

export default function DecodeTextDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;

  const [charset, setCharset] = useState<DecodeCharsetName>("blocks");
  const [order, setOrder] = useState<DecodeOrder>("left");
  const [cycle, setCycle] = useState(true);
  const ref = useRef<DecodeTextHandle>(null);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A scramble that resolves into real text. Each cell holds the width of its final glyph, so the line never shifts while blocks, box rules, braille or half-width katakana churn through it. Glyphs lock in with randomised timing and a brief accent flash."
      usageCode={`import { DecodeText, type DecodeTextHandle } from "@/components/bjork-ui/text/decode-text";

const ref = useRef<DecodeTextHandle>(null);

<DecodeText
  ref={ref}
  words={["Signal received", "Archive unsealed", "Handshake done"]}
  charset="blocks"     // "box" | "braille" | "katakana-half" | "math" | "binary" | any string
  order="left"         // "center" | "random"
  trigger="inView"     // "mount" | "hover" | "manual"
  duration={1.15}
  interval={2.4}
  seed={7}
/>

ref.current?.replay();`}
      previewScaleClassName="w-[344px]"
      previewCaptureScaleClassName="w-[860px] scale-[0.98]"
    >
      <div className="flex w-[min(880px,calc(100vw-72px))] max-w-full flex-col items-center gap-8">
        {!isPreview ? (
          <div className="flex flex-col items-center gap-3">
            <BjorkButtonGroup aria-label="Glyph set" className="flex-wrap justify-center">
              {charsets.map((c) => (
                <BjorkButton
                  key={c}
                  size="sm"
                  variant={charset === c ? "secondary" : "ghost"}
                  aria-pressed={charset === c}
                  onClick={() => {
                    setCharset(c);
                    requestAnimationFrame(() => ref.current?.replay());
                  }}
                >
                  {c}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <BjorkButtonGroup aria-label="Resolve order">
                {orders.map((o) => (
                  <BjorkButton
                    key={o}
                    size="sm"
                    variant={order === o ? "secondary" : "ghost"}
                    aria-pressed={order === o}
                    onClick={() => {
                      setOrder(o);
                      requestAnimationFrame(() => ref.current?.replay());
                    }}
                  >
                    {o}
                  </BjorkButton>
                ))}
              </BjorkButtonGroup>
              <BjorkButtonGroup aria-label="Playback">
                <BjorkButton size="sm" variant={cycle ? "secondary" : "ghost"} aria-pressed={cycle} onClick={() => setCycle((v) => !v)}>
                  cycle words
                </BjorkButton>
                <BjorkButton size="sm" variant="ghost" onClick={() => ref.current?.replay()}>
                  replay
                </BjorkButton>
              </BjorkButtonGroup>
            </div>
          </div>
        ) : null}
        <DecodeText
          ref={ref}
          key={cycle ? "cycle" : "single"}
          tone={tone}
          text={WORDS[0]}
          words={cycle ? WORDS : undefined}
          charset={charset}
          order={order}
          frozenProgress={isPreview ? 0.5 : undefined}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
