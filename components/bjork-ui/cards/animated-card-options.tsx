"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode, useState } from "react";
import { BjorkCard } from "@/components/bjork-ui/primitives/card";
import { cn } from "@/lib/utils";

export interface CardOption {
  id: string;
  icon: ReactNode;
  name: string;
}

interface AnimatedCardOptionsProps {
  options: CardOption[];
  columns?: number;
  onSelect?: (option: CardOption) => void;
}

export function AnimatedCardOptions({ 
  options, 
  columns = 4, 
  onSelect 
}: AnimatedCardOptionsProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [fadingCards, setFadingCards] = useState<Set<string>>(new Set());

  const cardVariants = {
    initial: {
      opacity: 0,
      scale: 0.8,
      y: 20,
    },
    animate: (index: number) => ({
      opacity: 1,
      scale: [0.8, 1.01, 1], // Overshoot then settle
      y: 0,
      transition: {
        duration: 0.5,
        delay: index * 0.05, // Staggered delay of 50ms per card
        type: "spring",
        stiffness: 500,
        damping: 25,
        scale: {
          type: "tween", // Use tween for keyframes support
          duration: 0.5,
          ease: [0.175, 0.885, 0.32, 1.275], // Custom easing for overshoot
        },
      },
    }),
    exit: {
      opacity: 0,
      scale: 0.8,
      transition: {
        duration: 0.2,
      },
    },
  };

  const hoverVariants = {
    hover: {
      scale: 1.05,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 10,
      },
    },
  };

  const handleCardClick = (option: CardOption) => {
    if (selectedCard) return;
    
    setSelectedCard(option.id);
    
    // Create random delays for other cards to fade out
    const otherCards = options.filter(opt => opt.id !== option.id);
    
    otherCards.forEach((card) => {
      setTimeout(() => {
        setFadingCards(prev => new Set([...prev, card.id]));
      }, Math.random() * 300); // Random delay up to 300ms
    });
    
    onSelect?.(option);
  };

  const shouldShowCard = (cardId: string) => {
    if (!selectedCard) return true;
    if (selectedCard === cardId) return true;
    return !fadingCards.has(cardId);
  };

  return (
    <div
      className="relative mx-auto grid max-w-4xl gap-3"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option, index) => (
        <div key={option.id} className="relative">
          {/* Always maintain grid cell structure */}
          <AnimatePresence mode="wait">
            {shouldShowCard(option.id) ? (
              <motion.div
                key={`card-${option.id}`}
                className={`relative group cursor-pointer ${selectedCard === option.id ? 'z-10' : ''}`}
                variants={cardVariants}
                initial={false}
                animate="animate"
                exit="exit"
                custom={index}
                whileHover={selectedCard ? {} : "hover"}
                onClick={() => handleCardClick(option)}
              >
                <motion.div variants={hoverVariants}>
                  <BjorkCard
                    variant="interactive"
                    padding="none"
                    className={cn(
                      "h-24 w-full rounded-[18px]",
                      "border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_14px_24px_-18px_rgba(55,47,36,0.28)] hover:border-[#cfc6b8] hover:bg-[#eee9df]",
                      "dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_24px_-18px_rgba(0,0,0,0.85)] dark:hover:border-[#232323] dark:hover:bg-[#161616]",
                      selectedCard === option.id && "border-[#ec5c13]/40 bg-[#ec5c13]/10 dark:border-[#ec5c13]/34 dark:bg-[#ec5c13]/10"
                    )}
                  >
                    <div className="flex h-full items-center space-x-3 px-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] border border-[#d8d3c7] bg-[#eee9df] text-[#bd4514] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-opacity duration-200 group-hover:text-[#ec5c13] dark:border-[#232323] dark:bg-[#090909] dark:text-[#d86a2c] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] [&_svg]:size-5">
                        {option.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-pretty text-xs font-medium leading-snug text-[#171717]/78 transition-colors duration-200 group-hover:text-[#171717] dark:text-[#ededed]/72 dark:group-hover:text-[#ededed]">
                          {option.name}
                        </h3>
                      </div>
                    </div>
                  </BjorkCard>
                </motion.div>
              </motion.div>
            ) : (
              <div key={`placeholder-${option.id}`} className="h-24 w-full" />
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
