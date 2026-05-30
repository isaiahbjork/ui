"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Rewind, FastForward } from "lucide-react";
import { useTheme } from "next-themes";
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

const RulerLines = ({
  top = true,
  totalLines = 100,
  isDark,
}: {
  top?: boolean;
  totalLines?: number;
  isDark: boolean;
}) => {
  const lines = [];
  const lineSpacing = 100 / (totalLines - 1);

  for (let i = 0; i < totalLines; i++) {
    const isFifth = i % 5 === 0;
    const isCenter = i === Math.floor(totalLines / 2);

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

    lines.push(
      <div
        key={i}
        className={`absolute w-0.5 ${height} ${positionClass}`}
        style={{ left: `${i * lineSpacing}%`, backgroundColor: color }}
      />
    );
  }

  return <div className="relative w-full h-8 px-4">{lines}</div>;
};

export function RulerCarousel({
  originalItems,
}: {
  originalItems: CarouselItem[];
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const infiniteItems = createInfiniteItems(originalItems);
  const itemsPerSet = originalItems.length;

  // Start with the middle set, item 4 (UNIQLO)
  const [activeIndex, setActiveIndex] = useState(itemsPerSet + 4);
  const [isResetting, setIsResetting] = useState(false);
  const previousIndexRef = useRef(itemsPerSet + 4);

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

  // Calculate target position - center the active item
  const centerPosition = 5; // We want item 5 (index 4) to be centered initially
  const targetX = -500 + (centerPosition - (activeIndex % itemsPerSet)) * 500;

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
            className="flex items-center gap-[100px]"
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
                    width: "400px",
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
          <Rewind className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {currentPage}
          </span>
          <span className="text-sm opacity-55">
            /
          </span>
          <span className="text-sm font-medium">
            {totalPages}
          </span>
        </div>

        <button
          onClick={handleNext}
          disabled={isResetting}
          className="flex cursor-pointer items-center justify-center transition hover:text-[#ec5c13]"
          aria-label="Next item"
        >
          <FastForward className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
