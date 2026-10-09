"use client";

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

// Register GSAP plugins
if (typeof window !== "undefined") {
  gsap.registerPlugin(Draggable);
}

interface DraggableRopeProps {
  className?: string;
  minAngle?: number;
  initialAngle?: number;
  gravity?: number;
  ropeHeight?: number;
  ropeWidth?: number;
  iconSize?: number;
}

export function DraggableRope({ 
  className,
  minAngle = 8,
  initialAngle = 8,
  gravity = 18,
  ropeHeight = 290,
  ropeWidth = 2,
  iconSize = 120
}: DraggableRopeProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isLight = mounted && resolvedTheme === "light";
  const ropeRef = useRef<HTMLDivElement>(null);
  const swingAnimationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ropeRef.current) return;

    const rope = ropeRef.current;
    // Reduced motion: no automatic swing and no inertia throw; the rope still drags.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Settings from props
    const MIN_ANGLE = minAngle;
    let ANGLE = initialAngle;
    let DIRECTION = -1;
    const GRAVITY = gravity;

    // Start Swing Animation
    function startSwing() {
      swingAnimationRef.current = gsap.to(rope, {
        rotation: DIRECTION * ANGLE,
        duration: 1.8 + ANGLE / 50,
        ease: "power1.inOut",
        onComplete: () => {
          // Update swing angle for the next animation
          ANGLE = Math.max(ANGLE - GRAVITY, MIN_ANGLE);

          // Alternate swing direction
          DIRECTION *= -1;

          // Start the next swing
          startSwing();
        },
      });
    }

    // Start swinging
    if (!reduce) startSwing();

    // Make Rope Draggable
    const draggable = Draggable.create(rope, {
      type: "rotation",
      inertia: !reduce,
      bounds: { minRotation: -85, maxRotation: 85 },
      dragResistance: 0.5,
      throwResistance: 1600,
      edgeResistance: 1,
      onPress: function () {
        if (swingAnimationRef.current) {
          swingAnimationRef.current.kill();
        }
      },
      onRelease: function () {
        if (reduce) return;
        const instance = this as unknown as {
          rotation: number;
          tween?: gsap.core.Tween;
        };
        const delayMs = (instance.tween?.duration() ?? 0) * 900;
        setTimeout(() => {
          DIRECTION = instance.rotation >= 0 ? -1 : 1;
          ANGLE = Math.max(Math.abs(instance.rotation) - GRAVITY, MIN_ANGLE);
          startSwing();
        }, delayMs);
      },
    });

    // Cleanup
    return () => {
      if (swingAnimationRef.current) {
        swingAnimationRef.current.kill();
      }
      if (draggable && draggable[0]) {
        draggable[0].kill();
      }
    };
  }, [minAngle, initialAngle, gravity]);

  const ropePalette = {
    ink: isLight ? "#4b4135" : "#1d1d1b",
    rope: isLight ? "#8b8174" : "#3b3d40",
    blue: isLight ? "#5f9fc7" : "#85bfe9",
    blueSoft: isLight ? "#b8dbea" : "#cbe7f5",
    orange: isLight ? "#d97612" : "#f2910d",
    red: isLight ? "#cf3f32" : "#e7413e",
    lens: isLight ? "#315d76" : "#1f4863",
  };

  // On-material tag: the library surface (fill, muted border, inset highlight)
  // with a green accent, drawn in Björk tones.
  const tagFill = isLight ? "#fffcf6" : "#171717";
  const tagStroke = isLight ? "#d9cdb8" : "#2f2f2f";
  const Icon = (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="32" cy="9" r="4.5" fill="none" stroke={ropePalette.rope} strokeWidth="2.5" />
      <rect x="13" y="15" width="38" height="44" rx="10" fill={tagFill} stroke={tagStroke} strokeWidth="1" />
      <rect
        x="14.5"
        y="16.5"
        width="35"
        height="41"
        rx="8.5"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={isLight ? 0.9 : 0.05}
        strokeWidth="1"
      />
      <circle cx="32" cy="32" r="5" fill={isLight ? "#166534" : "#4ade80"} />
      <rect x="22" y="43" width="20" height="2.5" rx="1.25" fill={ropePalette.ink} fillOpacity="0.35" />
      <rect x="25" y="48.5" width="14" height="2.5" rx="1.25" fill={ropePalette.ink} fillOpacity="0.2" />
    </svg>
  );
  return (
    <div
      className={cn(
        "flex h-full min-h-[520px] flex-col items-center justify-center font-['Helvetica_Neue',Helvetica,sans-serif]",
        isLight ? "text-[#171717]" : "text-[#ededed]",
        className
      )}
    >
      <div
        ref={ropeRef}
        className="rope relative transform-gpu cursor-grab select-none"
        style={{
          width: ropeWidth,
          height: ropeHeight,
          backgroundColor: ropePalette.rope,
          transformOrigin: "top center",
          marginTop: "-3rem",
          marginBottom: "50px",
          willChange: "transform",
          transform: `rotate(${initialAngle}deg)`, // Set initial angle
        }}
      >
        <div
          className="icon absolute flex items-center justify-center cursor-grab transform-gpu"
          style={{
            width: iconSize,
            height: iconSize,
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            transition: "transform 400ms ease",
            willChange: "transform",
          }}
          onMouseEnter={(e) => {
            gsap.to(e.currentTarget, {
              scale: 1.16,
              duration: 0.4,
              ease: "power2.out",
            });
          }}
          onMouseLeave={(e) => {
            gsap.to(e.currentTarget, {
              scale: 1,
              duration: 0.4,
              ease: "power2.out",
            });
          }}
        >
          <div 
            style={{ 
              width: iconSize, 
              height: iconSize 
            }}
            className="-mt-10"
          >
            {Icon}
          </div>
        </div>
      </div>

      <p
        className="mt-auto mb-5 text-sm"
      >
      </p>
    </div>
  );
}
