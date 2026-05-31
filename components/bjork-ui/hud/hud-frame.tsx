import { cn } from "@/lib/utils"
import type React from "react"

interface HudFrameProps {
  children?: React.ReactNode
  backgroundImage?: string
  backgroundColor?: string
  backgroundVideo?: string
  fixedFrame?: boolean
}

export function HudFrame({ children, backgroundImage, backgroundColor, backgroundVideo, fixedFrame = true }: HudFrameProps) {
  const frameSurfaceClass = backgroundColor ?? (backgroundImage || backgroundVideo ? "bg-transparent" : "bg-foreground")

  return (
    <div className="relative w-full h-full">
      {/* Content area - this is where children will render */}
      <div className="w-full h-full relative z-20">{children}</div>

      {/* HUD Frame Overlay */}
      <div
        className={cn(
          "pointer-events-none z-10",
          fixedFrame ? "fixed left-0 top-0 h-screen w-screen" : "absolute inset-0 h-full w-full"
        )}
        style={
          {
            "--frame-thickness": "8px",
            "--corner-chamfer": "16px",
            "--notch-width": "240px",
            "--notch-depth": "16px",
            "--notch-chamfer": "12px",
            "--frame-padding": "8px",
            "--edge-radius": "50px",
            "--border-width": "0px",
          } as React.CSSProperties
        }
      >
        {/* Optional border layer (behind) */}
        <div
          className="w-full h-full bg-transparent"
          style={{
            clipPath: `polygon(
        calc(var(--frame-padding) - var(--border-width)) calc(var(--corner-chamfer) + var(--frame-padding) - var(--border-width)),
        calc(var(--corner-chamfer) + var(--frame-padding) - var(--border-width)) calc(var(--frame-padding) - var(--border-width)),
        calc(50% - var(--notch-width)/2) calc(var(--frame-padding) - var(--border-width)),
        calc(50% - var(--notch-width)/2 + var(--notch-chamfer)) calc(var(--notch-depth) + var(--frame-padding) - var(--border-width)),
        calc(50% + var(--notch-width)/2 - var(--notch-chamfer)) calc(var(--notch-depth) + var(--frame-padding) - var(--border-width)),
        calc(50% + var(--notch-width)/2) calc(var(--frame-padding) - var(--border-width)),
        calc(100% - var(--corner-chamfer) - var(--frame-padding) + var(--border-width)) calc(var(--frame-padding) - var(--border-width)),
        calc(100% - var(--frame-padding) + var(--border-width)) calc(var(--corner-chamfer) + var(--frame-padding) - var(--border-width)),
        calc(100% - var(--frame-padding) + var(--border-width)) calc(50% - var(--notch-width)/2),
        calc(100% - var(--notch-depth) - var(--frame-padding) + var(--border-width)) calc(50% - var(--notch-width)/2 + var(--notch-chamfer)),
        calc(100% - var(--notch-depth) - var(--frame-padding) + var(--border-width)) calc(50% + var(--notch-width)/2 - var(--notch-chamfer)),
        calc(100% - var(--frame-padding) + var(--border-width)) calc(50% + var(--notch-width)/2),
        calc(100% - var(--frame-padding) + var(--border-width)) calc(100% - var(--corner-chamfer) - var(--frame-padding) + var(--border-width)),
        calc(100% - var(--corner-chamfer) - var(--frame-padding) + var(--border-width)) calc(100% - var(--frame-padding) + var(--border-width)),
        calc(50% + var(--notch-width)/2) calc(100% - var(--frame-padding) + var(--border-width)),
        calc(50% + var(--notch-width)/2 - var(--notch-chamfer)) calc(100% - var(--notch-depth) - var(--frame-padding) + var(--border-width)),
        calc(50% - var(--notch-width)/2 + var(--notch-chamfer)) calc(100% - var(--notch-depth) - var(--frame-padding) + var(--border-width)),
        calc(50% - var(--notch-width)/2) calc(100% - var(--frame-padding) + var(--border-width)),
        calc(var(--corner-chamfer) + var(--frame-padding) - var(--border-width)) calc(100% - var(--frame-padding) + var(--border-width)),
        calc(var(--frame-padding) - var(--border-width)) calc(100% - var(--corner-chamfer) - var(--frame-padding) + var(--border-width)),
        calc(var(--frame-padding) - var(--border-width)) calc(50% + var(--notch-width)/2),
        calc(var(--notch-depth) + var(--frame-padding) - var(--border-width)) calc(50% + var(--notch-width)/2 - var(--notch-chamfer)),
        calc(var(--notch-depth) + var(--frame-padding) - var(--border-width)) calc(50% - var(--notch-width)/2 + var(--notch-chamfer)),
        calc(var(--frame-padding) - var(--border-width)) calc(50% - var(--notch-width)/2)
      )`,
            borderRadius: "var(--edge-radius)",
          }}
        />

        {/* Main frame layer with background image */}
        <div
          className={cn(
            "absolute inset-0 h-full w-full bg-cover bg-center bg-no-repeat",
            frameSurfaceClass,
          )}
          style={{
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
            clipPath: `polygon(
        var(--frame-padding) calc(var(--corner-chamfer) + var(--frame-padding)),
        calc(var(--corner-chamfer) + var(--frame-padding)) var(--frame-padding),
        calc(50% - var(--notch-width)/2) var(--frame-padding),
        calc(50% - var(--notch-width)/2 + var(--notch-chamfer)) calc(var(--notch-depth) + var(--frame-padding)),
        calc(50% + var(--notch-width)/2 - var(--notch-chamfer)) calc(var(--notch-depth) + var(--frame-padding)),
        calc(50% + var(--notch-width)/2) var(--frame-padding),
        calc(100% - var(--corner-chamfer) - var(--frame-padding)) var(--frame-padding),
        calc(100% - var(--frame-padding)) calc(var(--corner-chamfer) + var(--frame-padding)),
        calc(100% - var(--frame-padding)) calc(50% - var(--notch-width)/2),
        calc(100% - var(--notch-depth) - var(--frame-padding)) calc(50% - var(--notch-width)/2 + var(--notch-chamfer)),
        calc(100% - var(--notch-depth) - var(--frame-padding)) calc(50% + var(--notch-width)/2 - var(--notch-chamfer)),
        calc(100% - var(--frame-padding)) calc(50% + var(--notch-width)/2),
        calc(100% - var(--frame-padding)) calc(100% - var(--corner-chamfer) - var(--frame-padding)),
        calc(100% - var(--corner-chamfer) - var(--frame-padding)) calc(100% - var(--frame-padding)),
        calc(50% + var(--notch-width)/2) calc(100% - var(--frame-padding)),
        calc(50% + var(--notch-width)/2 - var(--notch-chamfer)) calc(100% - var(--notch-depth) - var(--frame-padding)),
        calc(50% - var(--notch-width)/2 + var(--notch-chamfer)) calc(100% - var(--notch-depth) - var(--frame-padding)),
        calc(50% - var(--notch-width)/2) calc(100% - var(--frame-padding)),
        calc(var(--corner-chamfer) + var(--frame-padding)) calc(100% - var(--frame-padding)),
        var(--frame-padding) calc(100% - var(--corner-chamfer) - var(--frame-padding)),
        var(--frame-padding) calc(50% + var(--notch-width)/2),
        calc(var(--notch-depth) + var(--frame-padding)) calc(50% + var(--notch-width)/2 - var(--notch-chamfer)),
        calc(var(--notch-depth) + var(--frame-padding)) calc(50% - var(--notch-width)/2 + var(--notch-chamfer)),
        var(--frame-padding) calc(50% - var(--notch-width)/2)
      )`,
            borderRadius: "var(--edge-radius)",
          }}
        >
          {/* Background Video */}
          {backgroundVideo && (
            <video
              className="absolute inset-0 w-full h-full object-cover"
              src={backgroundVideo}
              autoPlay
              loop
              muted
              playsInline
            />
          )}

          {/* Inner transparent cutout */}
          <div
            className="w-full h-full bg-transparent"
            style={{
              clipPath: `polygon(
          calc(var(--frame-thickness) + var(--frame-padding)) calc(var(--corner-chamfer) + var(--frame-thickness) + var(--frame-padding)),
          calc(var(--corner-chamfer) + var(--frame-thickness) + var(--frame-padding)) calc(var(--frame-thickness) + var(--frame-padding)),
          calc(50% - var(--notch-width)/2) calc(var(--frame-thickness) + var(--frame-padding)),
          calc(50% - var(--notch-width)/2 + var(--notch-chamfer)) calc(var(--notch-depth) + var(--frame-thickness) + var(--frame-padding)),
          calc(50% + var(--notch-width)/2 - var(--notch-chamfer)) calc(var(--notch-depth) + var(--frame-thickness) + var(--frame-padding)),
          calc(50% + var(--notch-width)/2) calc(var(--frame-thickness) + var(--frame-padding)),
          calc(100% - var(--corner-chamfer) - var(--frame-thickness) - var(--frame-padding)) calc(var(--frame-thickness) + var(--frame-padding)),
          calc(100% - var(--frame-thickness) - var(--frame-padding)) calc(var(--corner-chamfer) + var(--frame-thickness) + var(--frame-padding)),
          calc(100% - var(--frame-thickness) - var(--frame-padding)) calc(50% - var(--notch-width)/2),
          calc(100% - var(--notch-depth) - var(--frame-thickness) - var(--frame-padding)) calc(50% - var(--notch-width)/2 + var(--notch-chamfer)),
          calc(100% - var(--notch-depth) - var(--frame-thickness) - var(--frame-padding)) calc(50% + var(--notch-width)/2 - var(--notch-chamfer)),
          calc(100% - var(--frame-thickness) - var(--frame-padding)) calc(50% + var(--notch-width)/2),
          calc(100% - var(--frame-thickness) - var(--frame-padding)) calc(100% - var(--corner-chamfer) - var(--frame-thickness) - var(--frame-padding)),
          calc(100% - var(--corner-chamfer) - var(--frame-thickness) - var(--frame-padding)) calc(100% - var(--frame-thickness) - var(--frame-padding)),
          calc(50% + var(--notch-width)/2) calc(100% - var(--frame-thickness) - var(--frame-padding)),
          calc(50% + var(--notch-width)/2 - var(--notch-chamfer)) calc(100% - var(--notch-depth) - var(--frame-thickness) - var(--frame-padding)),
          calc(50% - var(--notch-width)/2 + var(--notch-chamfer)) calc(100% - var(--notch-depth) - var(--frame-thickness) - var(--frame-padding)),
          calc(50% - var(--notch-width)/2) calc(100% - var(--frame-thickness) - var(--frame-padding)),
          calc(var(--corner-chamfer) + var(--frame-thickness) + var(--frame-padding)) calc(100% - var(--frame-thickness) - var(--frame-padding)),
          calc(var(--frame-thickness) + var(--frame-padding)) calc(100% - var(--corner-chamfer) - var(--frame-thickness) - var(--frame-padding)),
          calc(var(--frame-thickness) + var(--frame-padding)) calc(50% + var(--notch-width)/2),
          calc(var(--notch-depth) + var(--frame-thickness) + var(--frame-padding)) calc(50% + var(--notch-width)/2 - var(--notch-chamfer)),
          calc(var(--notch-depth) + var(--frame-thickness) + var(--frame-padding)) calc(50% - var(--notch-width)/2 + var(--notch-chamfer)),
          calc(var(--frame-thickness) + var(--frame-padding)) calc(50% - var(--notch-width)/2)
        )`,
              borderRadius: "calc(var(--edge-radius) - 2px)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
