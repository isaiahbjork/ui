"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Rewind, FastForward } from "lucide-react";
import { useIsDarkTheme } from "@/hooks/use-is-dark-theme";
import { cn } from "@/lib/utils";

export interface CarouselItem {
  id: number;
  title: string;
}

type InfiniteCarouselItem = Omit<CarouselItem, "id"> & {
  id: string;
  originalIndex: number;
};

// Create infinite items by triplicating the array
const createInfiniteItems = (originalItems: CarouselItem[]) => {
  const items: InfiniteCarouselItem[] = [];
  for (let i = 0; i < 3; i++) {
    originalItems.forEach((item, index) => {
      items.push({
        ...item,
        id: `${i}-${item.id}`,
        originalIndex: index,
      });
    });
  }
  return items;
};

// Item geometry shared by the track layout and the centering math below.
const ITEM_WIDTH = 400;
const ITEM_GAP = 100;

const RulerLines = ({
  top = true,
  // Odd count: index 50 sits exactly on 50%, so the centre tick is the true centre.
  totalLines = 101,
  isDark,
}: {
  top?: boolean;
  totalLines?: number;
  isDark: boolean;
}) => {
  const lines = [];
  const lineSpacing = 100 / (totalLines - 1);
  const centerIndex = (totalLines - 1) / 2;

  for (let i = 0; i < totalLines; i++) {
    // Majors every 5th tick; 0..100 is symmetric around the centre for 101 ticks.
    const isFifth = i % 5 === 0;
    const isCenter = i === centerIndex;

    let height = "h-3";
    let color = isDark ? "#ededed55" : "#17171733";

    if (isCenter) {
      height = "h-8";
      color = "#ec5c13";
    } else if (isFifth) {
      height = "h-4";
      color = isDark ? "#edededcc" : "#171717aa";
    }

    const positionClass = top ? "" : "bottom-0";

    // -translate-x-1/2 centres the 2px hairline on its percentage position.
    lines.push(
      <div
        key={i}
        className={`absolute w-0.5 -translate-x-1/2 ${height} ${positionClass}`}
        style={{ left: `${i * lineSpacing}%`, backgroundColor: color }}
      />
    );
  }

  // Ticks live in the content box (inset-x-4), not the padding box.
  return (
    <div className="relative h-8 w-full">
      <div className="absolute inset-x-4 inset-y-0">{lines}</div>
    </div>
  );
};

export function RulerCarousel({
  originalItems,
  tone,
}: {
  originalItems: CarouselItem[];
  tone?: "dark" | "light";
}) {
  const themeIsDark = useIsDarkTheme();
  const isDark = tone ? tone === "dark" : themeIsDark;
  const infiniteItems = createInfiniteItems(originalItems);
  const itemsPerSet = originalItems.length;

  // Start on the middle item of the middle set (index floor(N/2), e.g. ON CLOUD for 9 items).
  const startIndex = itemsPerSet + Math.floor(itemsPerSet / 2);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [isResetting, setIsResetting] = useState(false);
  const previousIndexRef = useRef(startIndex);

  const handleItemClick = (newIndex: number) => {
    if (isResetting) return;

    // Find the original item index (0-8)
    const targetOriginalIndex = newIndex % itemsPerSet;

    // Find all instances of this item across the 3 copies
    const possibleIndices = [
      targetOriginalIndex, // First copy
      targetOriginalIndex + itemsPerSet, // Second copy
      targetOriginalIndex + itemsPerSet * 2, // Third copy
    ];

    // Find the closest index to current position
    let closestIndex = possibleIndices[0];
    let smallestDistance = Math.abs(possibleIndices[0] - activeIndex);

    for (const index of possibleIndices) {
      const distance = Math.abs(index - activeIndex);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestIndex = index;
      }
    }

    previousIndexRef.current = activeIndex;
    setActiveIndex(closestIndex);
  };

  const handlePrevious = () => {
    if (isResetting) return;
    setActiveIndex((prev) => prev - 1);
  };

  const handleNext = () => {
    if (isResetting) return;
    setActiveIndex((prev) => prev + 1);
  };

  // Handle infinite scrolling
  useEffect(() => {
    if (isResetting) return;

    // If we're in the first set, jump to the equivalent position in the middle set
    if (activeIndex < itemsPerSet) {
      setIsResetting(true);
      setTimeout(() => {
        setActiveIndex(activeIndex + itemsPerSet);
        setIsResetting(false);
      }, 0);
    }
    // If we're in the last set, jump to the equivalent position in the middle set
    else if (activeIndex >= itemsPerSet * 2) {
      setIsResetting(true);
      setTimeout(() => {
        setActiveIndex(activeIndex - itemsPerSet);
        setIsResetting(false);
      }, 0);
    }
  }, [activeIndex, itemsPerSet, isResetting]);

  // Add keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isResetting) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((prev) => prev - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isResetting]);

  // The track starts at the centre line (left-1/2) and items sit at pitch
  // (ITEM_WIDTH + ITEM_GAP). Shift so the active item's centre lands on the
  // centre line: works for any item count, no hardcoded offset.
  const pitch = ITEM_WIDTH + ITEM_GAP;
  const targetX = -(activeIndex * pitch + ITEM_WIDTH / 2);

  // Get current page info
  const currentPage = (activeIndex % itemsPerSet) + 1;
  const totalPages = itemsPerSet;

  return (
    <div className="flex h-full min-h-[440px] w-full flex-col items-center justify-center bg-transparent">
      <div className="relative flex h-[200px] w-full flex-col justify-center">
        <div className="flex items-center justify-center">
          <RulerLines top isDark={isDark} />
        </div>
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
          <motion.div
            className="absolute left-1/2 top-0 flex h-full items-center"
            style={{ gap: ITEM_GAP }}
            animate={{
              x: isResetting ? targetX : targetX,
            }}
            transition={
              isResetting
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    mass: 1,
                  }
            }
          >
            {infiniteItems.map((item, index) => {
              const isActive = index === activeIndex;

              return (
                <motion.button
                  key={item.id}
                  onClick={() => handleItemClick(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center whitespace-nowrap text-4xl font-bold tracking-[-0.055em] md:text-6xl",
                    // Cap-height centring: all-caps ink sits ~0.023em below the line box centre (1.36px at 60px), so lift it.
                    "-translate-y-[0.0227em]",
                    isActive
                      ? "text-[#ec5c13]"
                      : isDark
                        ? "text-[#ededed]/28 hover:text-[#ededed]/54"
                        : "text-[#171717]/28 hover:text-[#171717]/58"
                  )}
                  animate={{
                    scale: isActive ? 1 : 0.75,
                    opacity: isActive ? 1 : 0.4,
                  }}
                  transition={
                    isResetting
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          stiffness: 400,
                          damping: 25,
                        }
                  }
                  style={{
                    width: ITEM_WIDTH,
                  }}
                >
                  {item.title}
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        <div className="flex items-center justify-center">
          <RulerLines top={false} isDark={isDark} />
        </div>
      </div>

      <div className={cn("mt-10 flex items-center justify-center gap-4", isDark ? "text-[#ededed]/52" : "text-[#171717]/48")}>
        <button
          onClick={handlePrevious}
          disabled={isResetting}
          className="flex cursor-pointer items-center justify-center transition hover:text-[#ec5c13]"
          aria-label="Previous item"
        >
          {/* Blur test: left-pointing ink centroid sits ~1.25px right of the box centre; pull back left. */}
          <Rewind className="h-5 w-5 -translate-x-px" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums">
            {currentPage}
          </span>
          <span className="text-sm opacity-55">
            /
          </span>
          <span className="text-sm font-medium tabular-nums">
            {totalPages}
          </span>
        </div>

        <button
          onClick={handleNext}
          disabled={isResetting}
          className="flex cursor-pointer items-center justify-center transition hover:text-[#ec5c13]"
          aria-label="Next item"
        >
          {/* Mirror of Rewind: ink sits ~1.25px left of centre; push right. */}
          <FastForward className="h-5 w-5 translate-x-px" />
        </button>
      </div>
    </div>
  );
}
