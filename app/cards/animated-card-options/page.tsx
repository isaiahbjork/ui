"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { AnimatedCardOptions, CardOption } from "@/components/bjork-ui/cards/animated-card-options";
import { getGalleryItem } from "@/lib/bjork-gallery";
import {
  AudioWaveform,
  Clapperboard,
  Disc3,
  Drum,
  Guitar,
  Headphones,
  Mic,
  Music,
  Music2,
  Piano,
  Radio,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";

const item = getGalleryItem("animated-card-options");

export default function Page() {
  const cardOptions: CardOption[] = [
    {
      id: "1",
      icon: <Music />,
      name: "Music Generation"
    },
    {
      id: "2", 
      icon: <Mic />,
      name: "Voice Synthesis"
    },
    {
      id: "3",
      icon: <Headphones />,
      name: "Audio Enhancement"
    },
    {
      id: "4",
      icon: <Music2 />,
      name: "Music Composition"
    },
    {
      id: "5",
      icon: <AudioWaveform />,
      name: "Voice Cloning"
    },
    {
      id: "6",
      icon: <Volume2 />,
      name: "Sound Effects"
    },
    {
      id: "7",
      icon: <Waves />,
      name: "Melody Creator"
    },
    {
      id: "8",
      icon: <SlidersHorizontal />,
      name: "Audio Mixing"
    },
    {
      id: "9",
      icon: <Piano />,
      name: "Instrument Synthesis"
    },
    {
      id: "10",
      icon: <Guitar />,
      name: "Guitar Effects"
    },
    {
      id: "11",
      icon: <Drum />,
      name: "Drum Programming"
    },
    {
      id: "12",
      icon: <Radio />,
      name: "Orchestral Arrangement"
    },
    {
      id: "13",
      icon: <Disc3 />,
      name: "String Section"
    },
    {
      id: "14",
      icon: <Sparkles />,
      name: "Circus Music"
    },
    {
      id: "15",
      icon: <Settings2 />,
      name: "Theatrical Scores"
    },
    {
      id: "16",
      icon: <Clapperboard />,
      name: "Film Scoring"
    }
  ];

  const handleCardSelect = (option: CardOption) => {
    console.log("Selected:", option.name);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A selectable option grid for AI tool pickers, onboarding steps, and dense control surfaces."
      previewScaleClassName="w-[880px] scale-[0.72]"
    >
      <AnimatedCardOptions options={cardOptions} columns={4} onSelect={handleCardSelect} />
    </SimpleComponentDemoPage>
  );
}
