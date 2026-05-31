"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { AIVoiceInput } from "@/components/bjork-ui/ai/ai-voice-input";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("ai-voice-input");

export default function AIVoiceInputDemo() {
  const handleSend = (message: string) => {
    console.log("Message sent:", message);
  };

  const handleVoiceStart = () => {
    console.log("Voice recording started");
  };

  const handleVoiceStop = (duration: number) => {
    console.log("Voice recording stopped. Duration:", duration, "seconds");
  };

  return (
    <SimpleComponentDemoPage item={item} description="A chat input with voice recording overlay, waveform feedback, and message submission callbacks." previewScaleClassName="w-[760px] scale-[0.82]">
      <AIVoiceInput placeholder="Send message..." onSend={handleSend} onVoiceStart={handleVoiceStart} onVoiceStop={handleVoiceStop} />
    </SimpleComponentDemoPage>
  );
}
