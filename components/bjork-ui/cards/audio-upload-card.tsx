"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Upload, X } from "lucide-react";
import { useTheme } from "next-themes";
import { BjorkCard } from "@/components/bjork-ui/primitives/card";

interface AudioUploadCardProps {
  className?: string;
  triggerAnimation?: boolean;
  onAnimationComplete?: () => void;
  title?: string;
  description?: string;
  tone?: "dark" | "light";
}

interface WaveformProps {
  width?: number;
  height?: number;
  bars?: number;
}

interface UploadCardBaseProps {
  children?: React.ReactNode;
  className?: string;
  isDragOver?: boolean;
  isUploading?: boolean;
  palette: UploadPalette;
}

const uploadPalettes = {
  dark: {
    card: "border-[#161616] bg-[#121212] text-[#ededed]",
    drop: "bg-[#090909] shadow-[inset_0_12px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.035)]",
    dropHover:
      "hover:bg-[#0c0c0c] hover:shadow-[inset_0_16px_30px_rgba(0,0,0,0.56),inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.025),0_10px_22px_-18px_rgba(0,0,0,0.9)]",
    dropDrag: "bg-[#140f0b] shadow-[inset_0_12px_24px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(236,92,19,0.18)]",
    dropUploading: "bg-[#160f0b] shadow-[inset_0_12px_24px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(236,92,19,0.14)]",
    dash: "border-[#2a2a2a]",
    dashActive: "border-[#bd4514]/70",
    icon: "text-[#464646]",
    iconActive: "text-[#d86a2c]",
    fileShell:
      "border border-[#242424] bg-[#121212] text-[#ededed] shadow-[inset_0_7px_14px_rgba(255,255,255,0.035),0_18px_34px_-16px_rgba(0,0,0,0.9)]",
    remove: "bg-[#2a1711] text-[#ffb087] hover:bg-[#3a1e14]",
    title: "text-[#ededed]",
    description: "text-[#ededed]/46",
    filename: "text-[#ededed]/58",
    waveform: "text-[#ededed]/44",
  },
  light: {
    card:
      "border-[#f5ede2] bg-[#fffcf6] text-[#171717] shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),inset_1px_0_0_rgba(88,72,49,0.026),inset_-1px_0_0_rgba(255,255,255,0.68),0_14px_22px_-9px_rgba(66,52,33,0.11)]",
    drop: "bg-[#fbf8f1] shadow-[inset_0_12px_24px_rgba(88,72,49,0.03),inset_0_1px_0_rgba(255,255,255,0.92)]",
    dropHover:
      "hover:bg-[#fffaf2] hover:shadow-[inset_0_16px_30px_rgba(88,72,49,0.04),inset_0_1px_0_rgba(255,255,255,0.94),inset_0_0_0_1px_rgba(88,72,49,0.026)]",
    dropDrag: "bg-[#fff5eb] shadow-[inset_0_12px_24px_rgba(88,72,49,0.045),inset_0_0_0_1px_rgba(236,92,19,0.16)]",
    dropUploading: "bg-[#fff4ea] shadow-[inset_0_12px_24px_rgba(88,72,49,0.045),inset_0_0_0_1px_rgba(236,92,19,0.14)]",
    dash: "border-[#e4dbcd]",
    dashActive: "border-[#bd4514]/65",
    icon: "text-[#a49b8e]",
    iconActive: "text-[#bd4514]",
    fileShell:
      "border border-[#f5ede2] bg-[#fffcf6] text-[#171717] shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),0_14px_22px_-9px_rgba(66,52,33,0.11)]",
    remove: "bg-[#2a1711] text-[#ffb087] hover:bg-[#3a1e14]",
    title: "text-[#171717]",
    description: "text-[#171717]/54",
    filename: "text-[#171717]/58",
    waveform: "text-[#171717]/42",
  },
};

type UploadPalette = (typeof uploadPalettes)["dark"];

const Waveform = ({ width = 300, height = 40, bars = 60 }: WaveformProps) => {
  const [barsArray, setBarsArray] = useState<React.ReactElement[]>([]);

  useEffect(() => {
    const barWidth = (width / bars) * 0.5; // Thinner bars (60% of available space)
    const spacing = (width / bars) * 0.4; // Spacing between bars
    const centerY = height / 2;
    const cornerRadius = barWidth * 0.7; // Rounded corners

    const newBarsArray = [];

    // Calculate total width of all bars and spacing
    const totalBarsWidth = (barWidth + spacing) * bars - spacing; // Subtract last spacing
    const startX = (width - totalBarsWidth) / 2; // Center the waveform

    for (let i = 0; i < bars; i++) {
      const x = startX + i * (barWidth + spacing);
      const barHeight = Math.random() * (height * 0.6) + height * 0.1; // Random height between 10% and 70% of total height
      const topY = centerY - barHeight / 2;

      newBarsArray.push(
        <rect
          key={i}
          x={x}
          y={topY}
          width={barWidth}
          height={barHeight}
          rx={cornerRadius}
          ry={cornerRadius}
          fill="currentColor"
        />
      );
    }

    setBarsArray(newBarsArray);
  }, [width, height, bars]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {barsArray}
    </svg>
  );
};

const UploadCardBase = ({
  children,
  className,
  isDragOver = false,
  isUploading = false,
  palette,
}: UploadCardBaseProps) => {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className="relative">
      <div
        className={cn(
          "relative z-0 flex min-h-[130px] items-center justify-center rounded-xl p-6 backdrop-blur-sm transition-[background-color,box-shadow] duration-200",
          !isUploading && cn("cursor-pointer", palette.dropHover),
          isUploading
            ? palette.dropUploading
            : isDragOver
              ? palette.dropDrag
              : palette.drop,
          className
        )}
      >
        {/* Upload icon in background - only shows when no children */}
        {!hasChildren && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Upload
              size={48}
              className={cn(
                "transition-colors duration-200",
                isDragOver || isUploading ? palette.iconActive : palette.icon
              )}
            />
          </div>
        )}

        {/* Content layer - above the background icon */}
        <div className="relative z-10 w-full">
          {children}
        </div>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 rounded-xl border-2 border-dashed",
          isUploading || isDragOver ? palette.dashActive : palette.dash
        )}
      />
    </div>
  );
};

interface AudioComponentProps {
  isAnimating: boolean;
  onAnimationComplete?: () => void;
  filename?: string;
  onRemove?: () => void;
  palette: UploadPalette;
}

// Utility function to truncate filename
const truncateFilename = (filename: string, maxLength: number = 20) => {
  if (filename.length <= maxLength) return filename;
  const extension = filename.split('.').pop();
  const nameWithoutExt = filename.replace(`.${extension}`, '');
  const truncatedName = nameWithoutExt.substring(0, maxLength - 3 - extension!.length);
  return `${truncatedName}...${extension}`;
};

const AudioComponent = ({
  isAnimating,
  onAnimationComplete,
  filename = "audio.mp3",
  onRemove,
  palette,
}: AudioComponentProps) => {
  const [isRemoving, setIsRemoving] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  // Update shouldShow when isAnimating changes
  useEffect(() => {
    if (isAnimating) {
      setShouldShow(true);
    }
  }, [isAnimating]);

  // Don't render if we shouldn't show and we're not removing
  if (!shouldShow && !isRemoving) return null;

  const displayName = truncateFilename(filename);

  const handleRemove = () => {
    setIsRemoving(true);
  };

  const handleRemoveComplete = () => {
    setShouldShow(false);
    setIsRemoving(false);
    onRemove?.();
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className="absolute z-20"
          initial={{
            // Start at bottom-right corner of the main card
            right: 20,
            bottom: 20,
            opacity: 0,
          }}
          animate={isRemoving ? {
            scale: 0,
            opacity: 0,
            filter: "blur(8px)",
            transition: {
              duration: 0.4,
              ease: [0.23, 1, 0.32, 1],
            }
          } : {
            // Move quickly from bottom-right to center  
            left: "50%",
            top: "calc(50% - 15px)", // Dynamic center of upload area
            x: "-50%",
            y: "-50%",
            opacity: 1,
            transition: {
              duration: 0.6, // Much faster
              ease: [0.23, 1, 0.32, 1],
            },
          }}
          exit={{
            scale: 0,
            opacity: 0,
            filter: "blur(8px)",
            transition: {
              duration: 0.4,
              ease: [0.23, 1, 0.32, 1],
            }
          }}
          style={{
            transformOrigin: "center",
          }}
          onAnimationComplete={isRemoving ? handleRemoveComplete : onAnimationComplete}
        >
          <motion.div 
            initial={{ scale: 1.5 }}
            animate={
              isRemoving
                ? {
                    scale: 0,
                    transition: { duration: 0.4 },
                  }
                : {
                    scale: [1.5, 1.1, 1],
                    transition: {
                      duration: 0.8,
                      ease: [0.68, -0.55, 0.265, 1.55],
                      times: [0, 0.35, 1],
                    },
                  }
            }
            className={cn(
              "relative group rounded-lg px-2 py-1.5 backdrop-blur-sm",
              palette.fileShell
            )}
          >
            {/* X button */}
            <button
              onClick={handleRemove}
              className={cn(
                "absolute -right-2 -top-2 z-30 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition duration-200 hover:scale-110 group-hover:opacity-100",
                palette.remove
              )}
            >
              <X size={12} />
            </button>

            <div className={cn("flex w-full items-center justify-center", palette.waveform)}>
              <Waveform width={180} height={32} bars={40} />
            </div>
            <div className="">
              <span className={cn("text-left text-xs font-medium", palette.filename)}>
                {displayName}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export function AudioUploadCard({
  className,
  triggerAnimation = false,
  onAnimationComplete,
  title = "Upload Your Audio",
  description = "Drop in your recordings and start transcribing instantly.",
  tone,
}: AudioUploadCardProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const palette =
    tone === "light" || (!tone && mounted && resolvedTheme === "light")
      ? uploadPalettes.light
      : uploadPalettes.dark;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (triggerAnimation) {
      setIsAnimating(true);
    }
  }, [triggerAnimation]);

  const handleAnimationComplete = () => {
    // Don't automatically stop the animation - keep it visible
    onAnimationComplete?.();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find(file => file.type.startsWith('audio/'));

    if (audioFile) {
      setUploadedFile(audioFile);
      setIsUploading(true);

      // Simulate upload process
      setTimeout(() => {
        setIsUploading(false);
        setIsAnimating(true); // Trigger animation after upload
      }, 200); // Much faster upload simulation
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setUploadedFile(file);
      setIsUploading(true);

      // Simulate upload process
      setTimeout(() => {
        setIsUploading(false);
        setIsAnimating(true); // Trigger animation after upload
      }, 200); // Much faster upload simulation
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    setIsAnimating(false);
    // Reset the file input so it can trigger onChange again for the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleBaseClick = useCallback(() => {
    if (!isUploading && !uploadedFile) {
      fileInputRef.current?.click();
    }
  }, [isUploading, uploadedFile]);
  return (
    <motion.div
      className={cn("relative w-full max-w-md mx-auto", className)}
      initial={tone ? false : { opacity: 0, y: 20 }}
      animate={tone ? undefined : { opacity: 1, y: 0 }}
      transition={tone ? undefined : { type: "spring", stiffness: 300, damping: 30 }}
    >
      <BjorkCard
        variant="elevated"
        padding="none"
        className={cn("relative text-center", palette.card)}
      >
        <div className="flex flex-col justify-center space-y-8 p-6">
          <div className="relative mx-auto w-full">
            <div
              className="relative"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBaseClick}
            >
              <UploadCardBase
                isDragOver={isDragOver}
                isUploading={isUploading}
                palette={palette}
              />

              {/* Hidden file input for click-to-upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="sr-only"
              />
            </div>
          </div>

          <div className="flex flex-col items-start">
            <h2 className={cn("text-left text-lg font-semibold", palette.title)}>
              {title}
            </h2>

            <p className={cn("text-left text-sm", palette.description)}>
              {description}
            </p>
          </div>
        </div>

        <AudioComponent
          isAnimating={isAnimating}
          onAnimationComplete={handleAnimationComplete}
          filename={uploadedFile?.name}
          onRemove={handleRemoveFile}
          palette={palette}
        />
      </BjorkCard>
    </motion.div>
  );
}
