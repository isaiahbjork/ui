"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { BjorkCard } from "@/components/bjork-ui/primitives/card";

export interface Card {
  id: string;
  title: string;
  status: "completed" | "updates-found" | "syncing";
}

interface AnimatedCardStatusListProps {
  title?: string;
  cards?: Card[];
  onSynchronize?: (cardId: string) => void;
  onAddCard?: () => void;
  onBack?: () => void;
  className?: string;
}

const defaultCards: Card[] = [
  { id: "1", title: "Import products from your store", status: "completed" },
  { id: "2", title: "Unique selling points", status: "completed" },
  { id: "3", title: "Primary customers", status: "completed" },
  { id: "4", title: "Common words & phrases", status: "updates-found" },
  { id: "5", title: "Company overview and offer details", status: "syncing" },
];

const statusListPalettes = {
  dark: {
    card: "border-[#161616] bg-[#121212] text-[#ededed]",
    title: "text-[#ededed]",
    iconButton:
      "border-[#232323] bg-[#090909] text-[#ededed]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-[#141414] hover:text-[#ededed]",
    row: "border-[#161616] bg-[#121212] text-[#ededed] shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)] hover:border-[#232323] hover:bg-[#161616]",
    rowTitle: "text-[#ededed]",
    statusText: "text-[#ededed]/42",
    syncButton:
      "border-[#2a2a2a] bg-[#090909] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-[#151515]",
    updatesGradient: "from-[#ec5c13]/14 to-transparent",
    syncingGradient: "from-[#22c55e]/12 to-transparent",
    spinnerActive: "#ffffff",
    spinnerInactive: "#6b7280",
  },
  light: {
    card:
      "border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_14px_24px_-10px_rgba(55,47,36,0.2)]",
    title: "text-[#171717]",
    iconButton:
      "border-[#d8d3c7] bg-[#eee9df] text-[#171717]/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:bg-[#e7e1d5] hover:text-[#171717]",
    row: "border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.58),inset_0_0.5px_0.5px_rgba(255,255,255,0.82),0_12px_20px_-14px_rgba(55,47,36,0.34)] hover:border-[#cbc3b5] hover:bg-[#eee9df]",
    rowTitle: "text-[#171717]",
    statusText: "text-[#171717]/44",
    syncButton:
      "border-[#d2c8b9] bg-[#eee9df] text-[#171717] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] hover:bg-[#e7e1d5]",
    updatesGradient: "from-[#ec5c13]/12 to-transparent",
    syncingGradient: "from-[#22c55e]/10 to-transparent",
    spinnerActive: "#171717",
    spinnerInactive: "#9a9286",
  },
};

type StatusListPalette = (typeof statusListPalettes)["dark"];

export function AnimatedCardStatusList({
  title = "Fundamentals",
  cards: initialCards = defaultCards,
  onSynchronize,
  onAddCard,
  onBack,
  className = ""
}: AnimatedCardStatusListProps = {}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [activeDashIndex, setActiveDashIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const palette: StatusListPalette =
    mounted && resolvedTheme === "light"
      ? statusListPalettes.light
      : statusListPalettes.dark;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cycle through dash indices every 100ms
  useEffect(() => {
    if (shouldReduceMotion) return;
    
    const interval = setInterval(() => {
      setActiveDashIndex(prev => (prev + 1) % 8);
    }, 100);
    
    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  const handleSynchronize = (cardId: string) => {
    // Call external handler if provided
    if (onSynchronize) {
      onSynchronize(cardId);
    }

    // Update internal state
    setCards(prev => prev.map(card => 
      card.id === cardId ? { ...card, status: "syncing" as const } : card
    ));

    // Simulate sync completion after 2.5 seconds
    setTimeout(() => {
      setCards(prev => prev.map(card => 
        card.id === cardId ? { ...card, status: "completed" as const } : card
      ));
    }, 2500);
  };

  const handleAddCard = () => {
    if (onAddCard) {
      onAddCard();
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
  };

  const getStatusIcon = (status: Card["status"]) => {
    switch (status) {
      case "completed":
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" className="drop-shadow-sm">
            <circle cx="8" cy="8" r="8" fill="#22c55e" />
            <path 
              d="M5 8l2.5 2.5 3.5-4" 
              stroke="white" 
              strokeWidth="1.5" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        );
      case "updates-found":
        return (
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path 
              d="M8 1.5L14.5 13H1.5L8 1.5Z" 
              fill="#eab308" 
              stroke="#eab308" 
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path 
              d="M8 6v3M8 11h0" 
              stroke="white" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
          </svg>
        );
      case "syncing":
        return (
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 16 16"
          >
            {/* Create 8 dashes around the circle */}
            {Array.from({ length: 8 }).map((_, index) => {
              const angle = (index * 45) - 90; // Start from top, -90 to offset
              const radian = (angle * Math.PI) / 180;
              const radius = 6;
              const dashLength = 1.8;
              
              // Calculate start and end points for each dash
              const startX = 8 + (radius - dashLength/2) * Math.cos(radian);
              const startY = 8 + (radius - dashLength/2) * Math.sin(radian);
              const endX = 8 + (radius + dashLength/2) * Math.cos(radian);
              const endY = 8 + (radius + dashLength/2) * Math.sin(radian);
              
              // Use the activeDashIndex to determine which dash is white
              const isActive = index === activeDashIndex;
              
              return (
                <line
                  key={index}
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={isActive ? palette.spinnerActive : palette.spinnerInactive}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        );
    }
  };

  const getStatusText = (status: Card["status"]) => {
    switch (status) {
      case "updates-found":
        return "UPDATES FOUND";
      case "syncing":
        return "SYNCING";
      default:
        return null;
    }
  };

  const getGradientClass = (status: Card["status"]) => {
    switch (status) {
      case "updates-found":
        return palette.updatesGradient;
      case "syncing":
        return palette.syncingGradient;
      default:
        return "";
    }
  };

  // Sort cards: completed first, then others
  const sortedCards = [...cards].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return -1;
    if (a.status !== "completed" && b.status === "completed") return 1;
    return 0;
  });

  return (
    <div className={cn("mx-auto w-full max-w-2xl p-6", className)}>
      <BjorkCard variant="elevated" padding="lg" className={cn("rounded-2xl", palette.card)}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <motion.button
            onClick={handleBack}
            className={cn(
              "cursor-pointer rounded-lg border p-2 transition-colors",
              palette.iconButton
            )}
            whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
            aria-label="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
          
          <h1 className={cn("text-xl font-medium tracking-[-0.02em]", palette.title)}>{title}</h1>
          
          <motion.button
            onClick={handleAddCard}
            className={cn(
              "cursor-pointer rounded-lg border p-2 transition-colors",
              palette.iconButton
            )}
            whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
            aria-label="Add card"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Cards */}
        <motion.div 
          className="space-y-3"
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.08,
                delayChildren: 0.1,
              }
            }
          }}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence>
            {sortedCards.map((card) => (
              <motion.div
                key={card.id}
                layout
                layoutId={card.id}
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.98 },
                  visible: { 
                    opacity: 1, 
                    y: 0, 
                    scale: 1,
                    transition: { 
                      type: "spring", 
                      stiffness: 300, 
                      damping: 30,
                      duration: shouldReduceMotion ? 0.2 : undefined
                    }
                  }
                }}
                exit={{ 
                  opacity: 0, 
                  y: -20, 
                  scale: 0.98,
                  transition: { 
                    duration: shouldReduceMotion ? 0.15 : 0.2,
                    ease: "easeInOut"
                  }
                }}
                transition={{
                  layout: { 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 30,
                    duration: shouldReduceMotion ? 0.2 : 0.5
                  }
                }}
                className="relative cursor-pointer"
                onMouseEnter={() => setHoveredCard(card.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <BjorkCard
                  variant="interactive"
                  padding="none"
                  className={cn("relative rounded-xl p-4", palette.row)}
                  whileHover={{
                    y: -1,
                    transition: { type: "spring", stiffness: 400, damping: 25 }
                  }}
                  animate={
                    card.status === "completed" ? {
                      scale: [1, 1.02, 1],
                      transition: {
                        duration: shouldReduceMotion ? 0 : 0.6,
                        ease: [0.04, 0.62, 0.23, 0.98],
                        times: [0, 0.3, 1],
                      }
                    } : {}
                  }
                >
                  {/* Gradient overlay for status */}
                  {(card.status === "updates-found" || card.status === "syncing") && (
                    <div className={`absolute inset-0 bg-gradient-to-l ${getGradientClass(card.status)} pointer-events-none`} 
                         style={{ 
                           backgroundSize: "40% 100%", 
                           backgroundPosition: "right",
                           backgroundRepeat: "no-repeat"
                         }} 
                    />
                  )}
                  
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Status Icon */}
                      <div className="w-5 h-5 flex items-center justify-center overflow-hidden">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={card.status}
                            initial={{ 
                              x: card.status === "completed" ? 24 : 0,
                              scale: 0.8, 
                              opacity: 0 
                            }}
                            animate={{ 
                              x: 0,
                              scale: 1, 
                              opacity: 1 
                            }}
                            exit={{ 
                              x: card.status === "syncing" ? -24 : 0,
                              scale: 0.8, 
                              opacity: 0 
                            }}
                            transition={{ 
                              type: "spring", 
                              stiffness: 400, 
                              damping: 25,
                              duration: shouldReduceMotion ? 0.15 : undefined
                            }}
                          >
                            {getStatusIcon(card.status)}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                      
                      {/* Title */}
                      <span className={cn("truncate", palette.rowTitle)}>{card.title}</span>
                    </div>

                    {/* Status Text or Synchronize Button */}
                    <div className="flex items-center min-w-0 h-8">
                      <AnimatePresence mode="wait">
                        {card.status === "updates-found" && hoveredCard === card.id ? (
                          <motion.button
                            key="sync-button"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            whileHover={{ 
                              scale: 1.02,
                              transition: { type: "spring", stiffness: 400, damping: 25 }
                            }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ 
                              type: "spring", 
                              stiffness: 400, 
                              damping: 25,
                              duration: shouldReduceMotion ? 0.15 : undefined
                            }}
                            onClick={() => handleSynchronize(card.id)}
                            className={cn(
                              "cursor-pointer whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                              palette.syncButton
                            )}
                          >
                            Synchronize
                          </motion.button>
                        ) : getStatusText(card.status) ? (
                          <motion.span
                            key="status-text"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={cn(
                              "whitespace-nowrap font-mono text-xs font-medium tracking-wider",
                              palette.statusText
                            )}
                          >
                            {getStatusText(card.status)}
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>
                </BjorkCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </BjorkCard>
    </div>
  );
}
