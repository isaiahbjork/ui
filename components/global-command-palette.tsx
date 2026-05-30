"use client";

import * as React from "react";
import { BjorkCommandPalette } from "@/components/isaiahbjork/primitives";

export const BJORK_COMMAND_PALETTE_EVENT = "bjork-command-palette:open";

export function GlobalCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const openPalette = () => setOpen(true);
    const togglePalette = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((currentOpen) => !currentOpen);
      }
    };

    window.addEventListener(BJORK_COMMAND_PALETTE_EVENT, openPalette);
    window.addEventListener("keydown", togglePalette);

    return () => {
      window.removeEventListener(BJORK_COMMAND_PALETTE_EVENT, openPalette);
      window.removeEventListener("keydown", togglePalette);
    };
  }, []);

  return (
    <BjorkCommandPalette
      open={open}
      onOpenChange={setOpen}
      showTrigger={false}
    />
  );
}
