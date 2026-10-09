"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { NowPlayingCard } from "@/components/bjork-ui/cards/now-playing-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("now-playing-card");

export default function Page() {
  const isPreview = usePreviewMode();
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A now-playing card with a generated cover, scrubbable progress, transport controls, like and the next track. Playback runs on a simulated clock here; wire the callbacks to your player."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Seek", value: "Slider: drag, or arrows ±5s, Page Up/Down ±30s, Home, End" },
        { label: "Previous", value: "Restarts the track after 3 seconds, like every player" },
        { label: "Announce", value: "Track changes are read once through a live region" },
      ]}
      usageCode={`import { NowPlayingCard, type Track } from "@/components/bjork-ui/cards/now-playing-card";

const queue: Track[] = [
  { id: "t1", title: "Low Tide Radio", artist: "Marisol Vane", album: "Saltwater Hours", duration: 214, colors: ["#ec5c13", "#3b1d6e"] },
];

<NowPlayingCard
  tracks={queue}
  device="Studio speakers"
  onPlayingChange={(playing) => (playing ? audio.play() : audio.pause())}
  onSeek={(s) => (audio.currentTime = s)}
  onTrackChange={(track) => load(track.id)}
  onLikeChange={(id, liked) => api.like(id, liked)}
/>`}
      previewScaleClassName="w-[400px] scale-[1.08]"
    >
      <NowPlayingCard key={isPreview ? "preview" : "live"} defaultPosition={83} defaultLiked={["t1"]} defaultPlaying={!isPreview} />
    </SimpleComponentDemoPage>
  );
}
