"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface GradientOption {
  id: string;
  label: string;
  value: string;
  color: string;
  gradientFrom: string;
  gradientTo: string;
}

interface GradientSelectorProps {
  options?: GradientOption[];
  defaultSelected?: string;
  onSelectionChange?: (option: GradientOption, index: number) => void;
  className?: string;
}

const defaultOptions: GradientOption[] = [
  {
    id: "100k",
    label: "$100K",
    value: "100000",
    color: "#8a7a60",
    gradientFrom: "#8a7a60",
    gradientTo: "#bd4514",
  },
  {
    id: "1m",
    label: "$1M",
    value: "1000000",
    color: "#bd4514",
    gradientFrom: "#bd4514",
    gradientTo: "#ec5c13",
  },
  {
    id: "5m",
    label: "$5M",
    value: "5000000",
    color: "#ec5c13",
    gradientFrom: "#ec5c13",
    gradientTo: "#f07a35",
  },
  {
    id: "10m",
    label: "$10M",
    value: "10000000",
    color: "#f07a35",
    gradientFrom: "#f07a35",
    gradientTo: "#d86a2c",
  },
  {
    id: "10m-plus",
    label: "$10M+",
    value: "10000000+",
    color: "#d86a2c",
    gradientFrom: "#d86a2c",
    gradientTo: "#8a7a60",
  },
];

export function GradientSelector({
  options = defaultOptions,
  defaultSelected,
  onSelectionChange,
  className
}: GradientSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(
    defaultSelected ? options.findIndex(opt => opt.id === defaultSelected) : -1
  );
  
  const [gradientPosition, setGradientPosition] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const circleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shouldReduceMotion = useReducedMotion();

  // Ensure minimum of 3 options
  const validOptions = options.length >= 3 ? options : defaultOptions.slice(0, Math.max(3, options.length));

  // Update gradient position when selection changes
  useEffect(() => {
    if (selectedIndex >= 0 && circleRefs.current[selectedIndex] && containerRef.current) {
      const circleElement = circleRefs.current[selectedIndex];
      const containerElement = containerRef.current;
      
      const circleRect = circleElement.getBoundingClientRect();
      const containerRect = containerElement.getBoundingClientRect();
      
      // Calculate position relative to container
      const relativeX = circleRect.left + (circleRect.width / 2) - containerRect.left;
      const relativeY = circleRect.top + (circleRect.height / 2) - containerRect.top;
      
      setGradientPosition({ x: relativeX, y: relativeY });
    } else {
      setGradientPosition(null);
    }
  }, [selectedIndex]);

  const handleCircleClick = (option: GradientOption, index: number) => {
    setSelectedIndex(index);
    onSelectionChange?.(option, index);
  };

  // Create orbital dots around a circle - dots match the circle's color
  const createOrbitalDots = (count: number, radius: number, color: string) => {
    const dots = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      dots.push(
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          initial={{ 
            opacity: 0, 
            scale: 0.3,
            rotate: shouldReduceMotion ? 0 : -90,
            x: x - 2, // Account for half the dot width
            y: y - 2  // Account for half the dot height
          }}
          animate={{ 
            opacity: 1, 
            scale: 1,
            rotate: 0,
            x: x - 2,
            y: y - 2
          }}
          transition={{
            duration: shouldReduceMotion ? 0.2 : 0.6,
            delay: shouldReduceMotion ? 0 : i * 0.03,
            type: "spring",
            stiffness: 400,
            damping: 25,
            ease: [0.04, 0.62, 0.23, 0.98]
          }}
          style={{
            backgroundColor: color,
            left: '50%',
            top: '50%',
          }}
        />
      );
    }
    return dots;
  };

  const getCircleSize = (index: number) => {
    if (index === 0) return "w-3 h-3";
    if (index === 1) return "w-3.5 h-3.5";
    return "w-4 h-4";
  };

  const getLineStyle = (lineIndex: number) => {
    const isLitUp = selectedIndex > lineIndex; // Line lights up when you progress past it
    const currentOption = validOptions[lineIndex];
    const nextOption = validOptions[lineIndex + 1];
    
    if (isLitUp) {
      // Fully lit with gradient
      return {
        background: `linear-gradient(to right, ${currentOption.gradientFrom}, ${nextOption?.gradientTo || currentOption.gradientTo})`
      };
    } else {
      return {
        background: `#8f877c`
      };
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative flex flex-col items-center gap-8 overflow-hidden rounded-[20px] border border-[#d8d3c7] bg-[#f4f1e9] p-8 text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]",
        className
      )}
    >
      {/* Radial gradient overlay */}
      {selectedIndex >= 0 && gradientPosition && (
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: `radial-gradient(circle at ${gradientPosition.x}px ${gradientPosition.y + 440}px, ${validOptions[selectedIndex].color}18 0%, ${validOptions[selectedIndex].color}10 30%, transparent 70%)`,
          }}
        />
      )}
      
      <div className="relative z-10 flex items-center gap-6 rounded-full border border-[#d8d3c7] bg-[#eee9df] p-6 shadow-[inset_0_12px_24px_rgba(68,54,34,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-[#232323] dark:bg-[#090909] dark:shadow-[inset_0_12px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.035)]">
        {validOptions.map((option, index) => (
          <div key={option.id} className="flex items-center gap-6">
            {/* Circle */}
            <div 
              ref={(el) => { circleRefs.current[index] = el; }}
              className={cn(
                "relative cursor-pointer transition-all duration-200 hover:scale-110",
                getCircleSize(index),
                "rounded-full border-2 border-transparent"
              )}
              onClick={() => handleCircleClick(option, index)}
              style={{
                backgroundColor: selectedIndex >= index ? option.color : '#8f877c',
                boxShadow: selectedIndex >= index 
                  ? `0 0 20px ${option.color}40, 0 0 40px ${option.color}20`
                  : 'none'
              }}
            >
              {selectedIndex === index && createOrbitalDots(12, 16, option.color)}
            </div>
            
            {/* Line (don't render after last circle) */}
            {index < validOptions.length - 1 && (
              <div 
                className={cn("w-24 rounded-full transition-all duration-300", 
                  index === 0 ? "h-1.5" : 
                  index === 1 ? "h-1.75" : 
                  index === 2 ? "h-2" : "h-2.25"
                )}
                style={getLineStyle(index)}
              />
            )}
          </div>
        ))}
      </div>
      
      {/* Labels */}
      <div className="relative z-10 flex items-center gap-4">
        {validOptions.map((option, index) => (
          <div key={`label-${option.id}`} className="flex items-center gap-2">
            <span 
              className={cn(
                "text-sm font-medium transition-colors duration-200 cursor-pointer",
                selectedIndex >= index ? "text-[#171717] dark:text-[#ededed]" : "text-[#171717]/42 dark:text-[#ededed]/34"
              )}
              onClick={() => handleCircleClick(option, index)}
              style={{
                color: selectedIndex >= index ? option.color : undefined
              }}
            >
              {option.label}
            </span>
            {index < validOptions.length - 1 && <div className="w-24" />}
          </div>
        ))}
      </div>
    </div>
  );
}
