"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { MessageCircle, MousePointer2, Sparkles } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { MessageDock, Character } from "@/components/bjork-ui/hud/message-dock";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("message-dock");

const customCharacters: Character[] = [
  { emoji: "✨", name: "Sparkle", online: false },
  {
    emoji: "🧙‍♂️",
    name: "Wizard",
    online: true,
    backgroundColor: "bg-green-300",
    gradientColors: "#86efac, #dcfce7",
  },
  {
    emoji: "🦄",
    name: "Unicorn",
    online: true,
    backgroundColor: "bg-purple-300",
    gradientColors: "#c084fc, #f3e8ff",
  },
  {
    emoji: "🐵",
    name: "Monkey",
    online: true,
    backgroundColor: "bg-yellow-300",
    gradientColors: "#fde047, #fefce8",
  },
  {
    emoji: "🤖",
    name: "Robot",
    online: false,
    backgroundColor: "bg-red-300",
    gradientColors: "#fca5a5, #fef2f2",
  },
];

export default function Page() {
  const isPreview = usePreviewMode();
    const previewTheme = usePreviewSearchParam("theme");

  const handleMessageSend = (message: string, character: Character, index: number) => {
    console.log("Message sent:", { message, character: character.name, index });
  };

  const handleCharacterSelect = (character: Character) => {
    console.log("Character selected:", character.name);
  };

  const handleDockToggle = (isExpanded: boolean) => {
    console.log("Dock expanded:", isExpanded);
  };

  const demo = (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden">
      <MessageDock 
        characters={customCharacters}
        onMessageSend={handleMessageSend}
        onCharacterSelect={handleCharacterSelect}
        onDockToggle={handleDockToggle}
        expandedWidth={500}
        positionStrategy="absolute"
        position="bottom"
        placeholder={(name) => `Send a message to ${name}...`}
        theme="auto"
        enableAnimations={true}
        closeOnSend={true}
        autoFocus={true}
      />
    </div>
  );

  if (isPreview) {
    return (
      <div
        className={`flex min-h-screen items-center justify-center bg-[var(--bjork-bg)] ${
          previewTheme === "light" ? "light" : "dark"
        }`}
      >
        <div className="relative h-[520px] w-[900px] overflow-hidden">
          <MessageDock
            characters={customCharacters}
            onMessageSend={handleMessageSend}
            onCharacterSelect={handleCharacterSelect}
            onDockToggle={handleDockToggle}
            expandedWidth={500}
            positionStrategy="absolute"
            position="bottom"
            placeholder={(name) => `Send a message to ${name}...`}
            theme={previewTheme === "light" ? "light" : "dark"}
            enableAnimations={false}
            closeOnSend={true}
            autoFocus={false}
            className="!bottom-[220px] origin-center scale-[1.55]"
          />
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A compact character dock that expands into a focused message composer. The selected avatar anchors in place while the input, actions, and supporting characters animate around it without losing the collapsed dock footprint."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Click-to-expand dock",
          value: "Selecting a character expands the composer and preserves the selected avatar position.",
        },
        {
          icon: <MessageCircle className="size-5" />,
          label: "Message callbacks",
          value: "Send, select, and toggle events are surfaced as production callbacks.",
        },
        {
          icon: <Sparkles className="size-5" />,
          label: "Interruptible springs",
          value: "Expansion, collapse, hover, and send states use spring motion and reduced-motion guards.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/message-dock"
      usageCode={`import { MessageDock } from "@/components/bjork-ui/hud/message-dock";

export function Demo() {
  return (
    <MessageDock
      characters={characters}
      onMessageSend={(message, character) => console.log(message, character)}
      expandedWidth={500}
      theme="light"
      closeOnSend
    />
  );
}`}
    >
      {demo}
    </ComponentDemoShell>
  );
}
