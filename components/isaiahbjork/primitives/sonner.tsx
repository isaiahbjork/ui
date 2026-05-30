"use client";

import type { CSSProperties } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { BjorkButton } from "./button";

export function BjorkSonnerDemo() {
  return (
    <>
      <BjorkButton
        variant="secondary"
        onClick={() =>
          toast("Draft synced", {
            description: "Component state copied into the working canvas.",
          })
        }
      >
        <Bell aria-hidden="true" />
        Send toast
      </BjorkButton>
      <Toaster
        style={
          {
            "--normal-bg": "var(--bjork-field)",
            "--normal-text": "var(--bjork-text)",
            "--normal-border": "var(--bjork-border)",
          } as CSSProperties
        }
        toastOptions={{
          style: {
            background: "var(--bjork-field)",
            border: "1px solid var(--bjork-border)",
            color: "var(--bjork-text)",
            borderRadius: "18px",
            boxShadow: "var(--bjork-shadow-surface)",
          },
          classNames: {
            toast:
              "rounded-[18px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] px-4 py-4 text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)]",
            title: "text-sm font-medium text-[color:var(--bjork-text-strong)]",
            description: "text-sm leading-6 text-[color:var(--bjork-text-muted)]",
          },
        }}
      />
    </>
  );
}
