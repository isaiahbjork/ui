"use client";
import { useState } from "react";

// Abstract generated tiles (gradient and rings in Björk tones). No photographs.
const TILE_TONES: [string, string][] = [
  ["#fffcf6", "#e9dfcc"],
  ["#f7f3ea", "#c9b99c"],
  ["#efe7d8", "#2b2a26"],
  ["#14532d", "#4ade80"],
  ["#166534", "#fffcf6"],
  ["#2b2a26", "#d9cdb8"],
  ["#121212", "#3f3a30"],
  ["#f5efe3", "#166534"],
  ["#d9cdb8", "#14532d"],
  ["#fffcf6", "#15803d"],
  ["#c9b99c", "#121212"],
];

const tileImage = (index: number) => {
  const [from, to] = TILE_TONES[index % TILE_TONES.length];
  const angle = (index * 33) % 180;
  const cx = 180 + ((index * 37) % 190);
  const cy = 160 + ((index * 53) % 230);
  const rings = [0.25, 0.5, 0.75, 1]
    .map(
      (k) =>
        `<circle cx="${cx}" cy="${cy}" r="${Math.round(60 + k * 260)}" fill="none" stroke="${to}" stroke-opacity="${(0.12 + k * 0.2).toFixed(2)}" stroke-width="1.5"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 550"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="550" y2="550" gradientTransform="rotate(${angle} 275 275)"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="550" height="550" fill="url(#g)"/>${rings}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const GENERATED_IMAGES = Array.from({ length: 11 }, (_, i) => tileImage(i));

interface HoverImageGalleryProps {
  images?: string[];
}

export function HoverImageGallery({
  images = GENERATED_IMAGES,
}: HoverImageGalleryProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;

    // Update mouse position for tooltip
    setMousePosition({ x, y });

    // Calculate which image to show based on horizontal position
    const imageIndex = Math.floor((x / width) * images.length);
    const clampedIndex = Math.max(0, Math.min(images.length - 1, imageIndex));

    setCurrentImageIndex(clampedIndex);
  };

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  return (
    <div className="relative group">
      <div
        className="relative w-[550px] h-[550px] overflow-hidden rounded-lg shadow-lg cursor-none"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Main displayed image */}
        <img
          src={images[currentImageIndex]}
          alt={`Gallery image ${currentImageIndex + 1}`}
          className="w-full h-full object-cover transition-[transform,opacity,filter] duration-150 ease-out motion-reduce:transition-none"
        />

        {/* Glassmorphic Tooltip with Both Chevrons */}
        {isHovering && (
          <div
            className="absolute pointer-events-none z-20 transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: mousePosition.x,
              top: mousePosition.y,
            }}
          >
            <div className="bg-white/20 backdrop-blur-md rounded-full p-2 shadow-lg border border-white/30 w-12 h-12 flex items-center justify-center">
              <div className="flex items-center space-x-1">
                {/* Left Chevron */}
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>

                {/* Right Chevron */}
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
