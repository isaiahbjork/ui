"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Upload, X, Play, Pause } from "lucide-react";
import { useTheme } from "next-themes";
import { BjorkCard } from "@/components/bjork-ui/primitives/card";

interface VideoUploadCardProps {
  className?: string;
  triggerAnimation?: boolean;
  onAnimationComplete?: () => void;
  title?: string;
  description?: string;
  tone?: "dark" | "light";
}

interface VideoComponentProps {
  isAnimating: boolean;
  onAnimationComplete?: () => void;
  filename?: string;
  onRemove?: () => void;
  videoUrl?: string;
  palette: UploadPalette;
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
    mask: "bg-[#121212]",
    drop: "bg-[#090909] shadow-[inset_0_12px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.035)]",
    dropHover:
      "hover:bg-[#0c0c0c] hover:shadow-[inset_0_16px_30px_rgba(0,0,0,0.56),inset_0_1px_0_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.025),0_10px_22px_-18px_rgba(0,0,0,0.9)]",
    dropDrag: "bg-[#140f0b] shadow-[inset_0_12px_24px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(236,92,19,0.18)]",
    dropUploading: "bg-[#160f0b] shadow-[inset_0_12px_24px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(236,92,19,0.14)]",
    dash: "border-[#2a2a2a]",
    dashActive: "border-[#bd4514]/70",
    icon: "text-[#464646]",
    iconActive: "text-[#d86a2c]",
    videoShell:
      "border border-[#242424] bg-[#121212] shadow-[inset_0_7px_14px_rgba(255,255,255,0.035),0_18px_34px_-16px_rgba(0,0,0,0.9)]",
    remove: "bg-[#2a1711] text-[#ffb087] hover:bg-[#3a1e14]",
    preview:
      "bg-[linear-gradient(135deg,rgba(189,69,20,0.2),rgba(237,237,237,0.035))] hover:bg-[linear-gradient(135deg,rgba(189,69,20,0.27),rgba(237,237,237,0.055))]",
    playBg: "bg-[#ec5c13]/16 hover:bg-[#ec5c13]/24",
    playText: "text-[#d86a2c]",
    overlay: "bg-[#181818]",
    spinner: "border-[#d86a2c]",
    title: "text-[#ededed]",
    description: "text-[#ededed]/46",
    filename: "text-[#ededed]/58",
    videoBorder: "border-[#2a2a2a]",
  },
  light: {
    card:
      "border-[#f5ede2] bg-[#fffcf6] text-[#171717] shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),inset_1px_0_0_rgba(88,72,49,0.026),inset_-1px_0_0_rgba(255,255,255,0.68),0_14px_22px_-9px_rgba(66,52,33,0.11)]",
    mask: "bg-[#fffcf6]",
    drop: "bg-[#fbf8f1] shadow-[inset_0_12px_24px_rgba(88,72,49,0.03),inset_0_1px_0_rgba(255,255,255,0.92)]",
    dropHover:
      "hover:bg-[#fffaf2] hover:shadow-[inset_0_16px_30px_rgba(88,72,49,0.04),inset_0_1px_0_rgba(255,255,255,0.94),inset_0_0_0_1px_rgba(88,72,49,0.026)]",
    dropDrag: "bg-[#fff5eb] shadow-[inset_0_12px_24px_rgba(88,72,49,0.045),inset_0_0_0_1px_rgba(236,92,19,0.16)]",
    dropUploading: "bg-[#fff4ea] shadow-[inset_0_12px_24px_rgba(88,72,49,0.045),inset_0_0_0_1px_rgba(236,92,19,0.14)]",
    dash: "border-[#e4dbcd]",
    dashActive: "border-[#bd4514]/65",
    icon: "text-[#a49b8e]",
    iconActive: "text-[#bd4514]",
    videoShell:
      "border border-[#f5ede2] bg-[#fffcf6] shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),0_14px_22px_-9px_rgba(66,52,33,0.11)]",
    remove: "bg-[#2a1711] text-[#ffb087] hover:bg-[#3a1e14]",
    preview:
      "bg-[linear-gradient(135deg,rgba(236,92,19,0.2),rgba(23,23,23,0.035))] hover:bg-[linear-gradient(135deg,rgba(236,92,19,0.27),rgba(23,23,23,0.055))]",
    playBg: "bg-[#ec5c13]/16 hover:bg-[#ec5c13]/24",
    playText: "text-[#bd4514]",
    overlay: "bg-[#f7f3ea]",
    spinner: "border-[#bd4514]",
    title: "text-[#171717]",
    description: "text-[#171717]/54",
    filename: "text-[#171717]/58",
    videoBorder: "border-[#eee6db]",
  },
};

type UploadPalette = (typeof uploadPalettes)["dark"];

// Utility function to truncate filename
const truncateFilename = (filename: string, maxLength: number = 30) => {
  if (filename.length <= maxLength) return filename;
  const extension = filename.split(".").pop();
  const nameWithoutExt = filename.replace(`.${extension}`, "");
  const truncatedName = nameWithoutExt.substring(
    0,
    maxLength - 3 - extension!.length
  );
  return `${truncatedName}...${extension}`;
};

const VideoComponent = ({
  isAnimating,
  onAnimationComplete,
  filename = "video.mp4",
  onRemove,
  videoUrl,
  palette,
}: VideoComponentProps) => {
  const [isRemoving, setIsRemoving] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Update shouldShow when isAnimating changes
  useEffect(() => {
    if (isAnimating) {
      setShouldShow(true);
    }
  }, [isAnimating]);

  // Reset video loaded state when video URL changes
  useEffect(() => {
    if (videoUrl) {
      setVideoLoaded(false);
    }
  }, [videoUrl]);

  // Don't render if we shouldn't show and we're not removing
  if (!shouldShow && !isRemoving) return null;

  const displayName = truncateFilename(filename);

  const handleRemove = () => {
    setIsRemoving(true);
    setIsPlaying(false);
  };

  const handleRemoveComplete = () => {
    setShouldShow(false);
    setIsRemoving(false);
    onRemove?.();
  };

  const handlePlayClick = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Handle video loading
  const handleVideoLoadedData = () => {
    setVideoLoaded(true);
    if (videoRef.current) {
      videoRef.current.addEventListener("ended", handleVideoEnd);
      // Pause immediately to show first frame
      videoRef.current.pause();
      // Set to a small time offset to show first frame
      videoRef.current.currentTime = 0.01;
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          className="absolute z-10" // Between border (z-20) and upload area (z-0)
          initial={{
            // Start way above the screen so you first see the bottom edge
            left: "50%",
            top: "-300px", // Way above the screen
            x: "-50%",
            y: 0,
            opacity: 1, // Fully visible from start
          }}
          animate={
            isRemoving
              ? {
                  scale: 0,
                  opacity: 0,
                  filter: "blur(8px)",
                  transition: {
                    duration: 0.4,
                    ease: [0.23, 1, 0.32, 1],
                  },
                }
              : {
                  // Vending machine drop - slow start, fast finish
                  left: "50%",
                  top: "calc(50% - 0px)", // Center of upload area
                  x: "-50%",
                  y: "-50%",
                  opacity: 1,
                  transition: {
                    duration: 1.2, // Slightly longer for dramatic effect
                    ease: [0.55, 0.055, 0.675, 0.19], // Vending machine gravity curve - slow start, fast finish
                  },
                }
          }
          exit={{
            scale: 0,
            opacity: 0,
            filter: "blur(8px)",
            transition: {
              duration: 0.4,
              ease: [0.23, 1, 0.32, 1],
            },
          }}
          style={{
            transformOrigin: "center",
          }}
          onAnimationComplete={
            isRemoving ? handleRemoveComplete : onAnimationComplete
          }
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={
              isRemoving
                ? {
                    scale: 0,
                    transition: { duration: 0.4 },
                  }
                : {
                    scale: 1.0,
                    transition: {
                      type: "spring",
                      stiffness: 250,
                      damping: 15, // Less damping for more bounce on landing
                      mass: 1.2,
                      delay: 0.7, // Delay until the drop is almost complete
                    },
                  }
            }
            className={cn(
              "relative group min-w-[400px] rounded-lg backdrop-blur-sm",
              palette.videoShell
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

            {/* Video Preview or Video Player */}
            <div className="relative">
              {videoUrl ? (
                <div className="relative">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className={cn(
                      "aspect-video w-full rounded-md border-l border-r border-t object-cover",
                      palette.videoBorder
                    )}
                    onEnded={handleVideoEnd}
                    onLoadedData={handleVideoLoadedData}
                    controls={false}
                    muted
                    playsInline
                  />
                  {/* Loading overlay - shows until video loads */}
                  {!videoLoaded && (
                    <div
                      className={cn(
                        "absolute inset-0 flex items-center justify-center rounded-md",
                        palette.overlay
                      )}
                    >
                      <div
                        className={cn(
                          "h-8 w-8 animate-spin rounded-full border-2 border-t-transparent",
                          palette.spinner
                        )}
                      ></div>
                    </div>
                  )}
                  {/* Play button in bottom left corner */}
                  <button
                    onClick={handlePlayClick}
                    className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200 group"
                  >
                    {isPlaying ? (
                      <Pause size={14} className="text-white ml-0.5" />
                    ) : (
                      <Play size={14} className="text-white ml-0.5" />
                    )}
                  </button>
                </div>
              ) : (
                <div
                  className={cn(
                    "flex aspect-[21/9] w-full cursor-pointer items-center justify-center rounded-md transition-colors duration-200",
                    palette.preview
                  )}
                >
                  <div
                    className={cn(
                      "flex h-20 w-20 items-center justify-center rounded-full transition-colors duration-200",
                      palette.playBg
                    )}
                  >
                    <Play size={28} className={cn("ml-1", palette.playText)} />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 px-2 pb-2">
              <span className={cn("block text-left text-xs font-medium", palette.filename)}>
                {displayName}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
      {/* Background upload area - z-0 */}
      <div
        className={cn(
          "relative z-0 flex min-h-[310px] items-center justify-center rounded-xl transition-[background-color,box-shadow] duration-200",
          // Add cursor pointer when clickable and not uploading
          !isUploading && cn("cursor-pointer", palette.dropHover),
          // Background color changes based on state
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
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
        <div className="relative z-10 w-full">{children}</div>
      </div>

      {/* Dashed border overlay - z-20, sits above video component */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl border-2 border-dashed pointer-events-none z-20",
          isUploading || isDragOver ? palette.dashActive : palette.dash
        )}
      />
    </div>
  );
};

export function VideoUploadCard({
  className,
  triggerAnimation = false,
  onAnimationComplete,
  title = "Upload Your Video",
  description = "Drop in your videos and start playing instantly.",
  tone,
}: VideoUploadCardProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
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
    const videoFile = files.find((file) => file.type.startsWith("video/"));

    if (videoFile) {
      setUploadedFile(videoFile);
      setIsUploading(true);

      // Create object URL for video preview
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);

      // Simulate upload process
      setTimeout(() => {
        setIsUploading(false);
        setIsAnimating(true); // Trigger animation after upload
      }, 200); // Much faster upload simulation
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith("video/")) {
        setUploadedFile(file);
        setIsUploading(true);

        // Create object URL for video preview
        const url = URL.createObjectURL(file);
        setVideoUrl(url);

        // Simulate upload process
        setTimeout(() => {
          setIsUploading(false);
          setIsAnimating(true); // Trigger animation after upload
        }, 200); // Much faster upload simulation
      }
    },
    []
  );

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    setIsAnimating(false);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    // Reset the file input so it can trigger onChange again for the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [videoUrl]);

  const handleBaseClick = useCallback(() => {
    if (!isUploading && !uploadedFile) {
      fileInputRef.current?.click();
    }
  }, [isUploading, uploadedFile]);

  return (
    <motion.div
      className={cn("relative w-full max-w-lg mx-auto", className)}
      initial={tone ? false : { opacity: 0, y: 20 }}
      animate={tone ? undefined : { opacity: 1, y: 0 }}
      transition={tone ? undefined : { type: "spring", stiffness: 300, damping: 30 }}
    >
      <BjorkCard
        variant="elevated"
        padding="none"
        className={cn(
          "relative text-center",
          palette.card
        )}
      >
        {/* Top masking area - z-30, covers video until it reaches upload area */}
        <div 
          className={cn("pointer-events-none absolute left-0 right-0 top-0 z-30", palette.mask)}
          style={{ 
            height: '24px', // Covers area above upload zone
            borderRadius: '12px 12px 0 0' 
          }}
        />

        <div className="flex flex-col justify-center space-y-8 p-6">
          <div className="relative w-full mx-auto">
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

              {/* Video Component - positioned relative to upload area */}
              <VideoComponent
                isAnimating={isAnimating}
                onAnimationComplete={handleAnimationComplete}
                filename={uploadedFile?.name}
                onRemove={handleRemoveFile}
                videoUrl={videoUrl || undefined}
                palette={palette}
              />

              {/* Hidden file input for click-to-upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
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
      </BjorkCard>
    </motion.div>
  );
}
