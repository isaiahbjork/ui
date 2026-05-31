"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { useState, useRef, useEffect } from "react";

export interface Character {
  id?: string | number;
  emoji: string;
  name: string;
  online: boolean;
  backgroundColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  gradientColors?: string;
  avatar?: string; // Optional image URL
}

export interface MessageDockProps {
  // Character data
  characters?: Character[];
  
  // Event handlers
  onMessageSend?: (message: string, character: Character, characterIndex: number) => void;
  onCharacterSelect?: (character: Character, characterIndex: number) => void;
  onDockToggle?: (isExpanded: boolean) => void;
  
  // Styling & layout
  className?: string;
  expandedWidth?: number;
  position?: "bottom" | "top";
  positionStrategy?: "fixed" | "absolute";
  showSparkleButton?: boolean;
  showMenuButton?: boolean;
  
  // Animation settings
  enableAnimations?: boolean;
  animationDuration?: number;
  
  // UI customization
  placeholder?: (characterName: string) => string;
  theme?: "light" | "dark" | "auto";
  
  // Advanced settings
  autoFocus?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  closeOnSend?: boolean;
}

const defaultCharacters: Character[] = [
  { emoji: "✨", name: "Sparkle", online: false },
  {
    emoji: "🧙‍♂️",
    name: "Wizard",
    online: true,
    backgroundColor: "bg-green-300",
    gradientFrom: "from-green-300",
    gradientTo: "to-green-100",
    gradientColors: "#86efac, #dcfce7",
  },
  {
    emoji: "🦄",
    name: "Unicorn",
    online: true,
    backgroundColor: "bg-purple-300",
    gradientFrom: "from-purple-300",
    gradientTo: "to-purple-100",
    gradientColors: "#c084fc, #f3e8ff",
  },
  {
    emoji: "🐵",
    name: "Monkey",
    online: true,
    backgroundColor: "bg-yellow-300",
    gradientFrom: "from-yellow-300",
    gradientTo: "to-yellow-100",
    gradientColors: "#fde047, #fefce8",
  },
  {
    emoji: "🤖",
    name: "Robot",
    online: false,
    backgroundColor: "bg-red-300",
    gradientFrom: "from-red-300",
    gradientTo: "to-red-100",
    gradientColors: "#fca5a5, #fef2f2",
  },
];

const dockPalettes = {
  dark: {
    surface: "var(--bjork-surface)",
    border: "var(--bjork-border-muted)",
    shadow: "var(--bjork-shadow-surface)",
    divider: "rgba(237,237,237,0.09)",
    text: "text-[color:var(--bjork-text)]",
    placeholder: "placeholder:text-[color:var(--bjork-text-soft)]",
    icon: "text-[color:var(--bjork-text-muted)]",
    iconHover: "hover:bg-[var(--bjork-surface-hover)]",
    avatar: "bg-[var(--bjork-field)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)]",
    avatarSelected: "bg-[var(--bjork-surface-hover)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)]",
    avatarBorder: "border-[color:var(--bjork-border-muted)]",
    send: "bg-transparent text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
    online: "bg-[var(--bjork-accent)] border-[color:var(--bjork-surface)]",
  },
  light: {
    surface: "var(--bjork-surface)",
    border: "var(--bjork-border-muted)",
    shadow: "var(--bjork-shadow-surface)",
    divider: "rgba(23,23,23,0.1)",
    text: "text-[color:var(--bjork-text)]",
    placeholder: "placeholder:text-[color:var(--bjork-text-soft)]",
    icon: "text-[color:var(--bjork-text-muted)]",
    iconHover: "hover:bg-[var(--bjork-surface-hover)]",
    avatar: "bg-[var(--bjork-field)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)]",
    avatarSelected: "bg-[var(--bjork-surface-hover)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)]",
    avatarBorder: "border-[color:var(--bjork-border-muted)]",
    send: "bg-transparent text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
    online: "bg-[var(--bjork-accent)] border-[color:var(--bjork-surface)]",
  },
} as const;

export function MessageDock({
  characters = defaultCharacters,
  onMessageSend,
  onCharacterSelect,
  onDockToggle,
  className,
  expandedWidth = 448,
  position = "bottom",
  positionStrategy = "fixed",
  showSparkleButton = true,
  showMenuButton = true,
  enableAnimations = true,
  animationDuration = 1,
  placeholder = (name: string) => `Message ${name}...`,
  theme = "light",
  autoFocus = true,
  closeOnClickOutside = true,
  closeOnEscape = true,
  closeOnSend = true,
}: MessageDockProps) {
  const shouldReduceMotion = useReducedMotion();
  const [expandedCharacter, setExpandedCharacter] = useState<number | null>(
    null
  );
  const [messageInput, setMessageInput] = useState("");
  const [hoveredCharacterIndex, setHoveredCharacterIndex] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [collapsedWidth, setCollapsedWidth] = useState<number>(266); // Default fallback
  const [hasInitialized, setHasInitialized] = useState(false);
  const { resolvedTheme } = useTheme();

  // Measure the TRUE initial collapsed width only once on first mount
  useEffect(() => {
    if (dockRef.current && !hasInitialized) {
      const width = dockRef.current.offsetWidth;
      if (width > 0) {
        setCollapsedWidth(width);
        setHasInitialized(true);
      }
    }
  }, [hasInitialized]);

  // Click outside handler
  useEffect(() => {
    if (!closeOnClickOutside) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setExpandedCharacter(null);
        setMessageInput("");
        onDockToggle?.(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeOnClickOutside, onDockToggle]);

  const containerVariants = {
    hidden: {
      opacity: 0,
      y: 100,
      scale: 0.8,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const hoverAnimation = shouldReduceMotion
    ? { y: -1 }
    : {
        y: -4,
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 25,
        },
      };

  const getProximityScale = (index: number) => {
    if (hoveredCharacterIndex === null || isExpanded) return 1;

    const distance = Math.abs(index - hoveredCharacterIndex);

    if (distance === 0) return 1.12;
    if (distance === 1) return 1.06;
    return 1;
  };

  const handleCharacterClick = (index: number) => {
    const character = characters[index];
    
    if (expandedCharacter === index) {
      setExpandedCharacter(null);
      setMessageInput("");
      onDockToggle?.(false);
    } else {
      setExpandedCharacter(index);
      onCharacterSelect?.(character, index);
      onDockToggle?.(true);
    }
  };

  const handleSendMessage = () => {
    if (messageInput.trim() && expandedCharacter !== null) {
      const character = characters[expandedCharacter];
      
      // Call the onMessageSend callback
      onMessageSend?.(messageInput, character, expandedCharacter);
      
      setMessageInput("");
      
      if (closeOnSend) {
        setExpandedCharacter(null);
        onDockToggle?.(false);
      }
    }
  };

  const selectedCharacter =
    expandedCharacter !== null ? characters[expandedCharacter] : null;
  const isExpanded = expandedCharacter !== null;
  const activeTheme = theme === "auto" ? resolvedTheme : theme;
  const isDark = activeTheme === "dark";
  const palette = isDark ? dockPalettes.dark : dockPalettes.light;

  const positionClasses = cn(
    positionStrategy === "absolute" ? "absolute" : "fixed",
    "left-1/2 z-50 -translate-x-1/2",
    position === "top" ? "top-6" : "bottom-6"
  );

  return (
    <motion.div
      ref={dockRef}
      className={cn(positionClasses, className)}
      initial={enableAnimations ? "hidden" : "visible"}
      animate="visible"
      variants={enableAnimations ? containerVariants : {}}
    >
      <motion.div
        className="rounded-full border px-3 py-2"
        style={{
          borderColor: palette.border,
          boxShadow: palette.shadow,
        }}
        animate={{
          width: isExpanded ? expandedWidth : collapsedWidth,
          background: palette.surface,
        }}
        transition={enableAnimations ? { 
          type: "spring", 
          stiffness: isExpanded ? 300 : 500, 
          damping: isExpanded ? 30 : 35, 
          mass: isExpanded ? 0.8 : 0.6,
          background: {
            duration: 0.2 * animationDuration,
            ease: "easeInOut"
          }
        } : { duration: 0 }}
      >
        <div className="relative flex items-center gap-2">
          {/* Sparkle button - slides out when expanded */}
          {showSparkleButton && (
            <motion.div
            className="flex h-10 w-10 items-center justify-center"
            animate={{
              opacity: isExpanded ? 0 : 1,
              x: isExpanded ? -20 : 0,
              scale: isExpanded ? 0.8 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
              delay: isExpanded ? 0 : 0, // Remove delay when coming back
            }}
          >
            <motion.button
              className={cn("flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors", palette.iconHover)}
              whileHover={
                !isExpanded
                  ? {
                      scale: 1.02,
                      y: -1,
                      transition: {
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      },
                    }
                  : undefined
              }
              whileTap={{ scale: 0.95 }}
              aria-label="Sparkle"
            >
              <span className={cn("text-xl", palette.icon)}>✨</span>
            </motion.button>
          </motion.div>
          )}

          {/* First separator */}
          <motion.div
            className="h-6 w-px"
            style={{ backgroundColor: palette.divider }}
            animate={{
              opacity: isExpanded ? 0 : 1,
              scaleY: isExpanded ? 0 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: isExpanded ? 0 : 0.3,
            }}
          />

          {/* Character buttons */}
          {characters.slice(1, -1).map((character, index) => {
            const actualIndex = index + 1;
            const isSelected = expandedCharacter === actualIndex;

            return (
              <motion.div
                key={character.name}
                className={cn(
                  "relative",
                  isSelected && isExpanded && "absolute left-1 top-1 z-20"
                )}
                style={{
                  // When selected and expanded, don't take up space in flex layout
                  width: isSelected && isExpanded ? 0 : "auto",
                  minWidth: isSelected && isExpanded ? 0 : "auto",
                  overflow: "visible",
                }}
                animate={{
                  opacity: isExpanded && !isSelected ? 0 : 1,
                  y: isExpanded && !isSelected ? 60 : 0,
                  scale: isExpanded && !isSelected ? 0.8 : getProximityScale(actualIndex),
                  // Only use translateX for non-selected or non-expanded
                  x: isSelected && isExpanded ? 0 : 0,
                }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  delay:
                    isExpanded && !isSelected
                      ? index * 0.05
                      : isExpanded
                      ? 0.1
                      : 0, // Remove delay when coming back - immediate return
                }}
              >
                <motion.button
                  className={cn(
                    "relative -translate-y-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-xl",
                    isSelected && isExpanded ? palette.avatarSelected : palette.avatar,
                    palette.avatarBorder
                  )}
                  onClick={() => handleCharacterClick(actualIndex)}
                  onHoverStart={() => setHoveredCharacterIndex(actualIndex)}
                  onHoverEnd={() => setHoveredCharacterIndex(null)}
                  whileHover={!isExpanded ? hoverAnimation : { scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label={`Message ${character.name}`}
                >
                  <span className="text-2xl">{character.emoji}</span>

                  {/* Online indicator */}
                  {character.online && (
                    <motion.div
                      className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2", palette.online)}
                      initial={{ scale: 0 }}
                      animate={{ scale: isExpanded && !isSelected ? 0 : 1 }}
                      transition={{
                        delay: isExpanded
                          ? isSelected
                            ? 0.3
                            : 0
                          : (index + 1) * 0.1 + 0.5,
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                </motion.button>
              </motion.div>
            );
          })}

          {/* Text input - slides out from center */}
          <AnimatePresence>
            {isExpanded && (
              <motion.input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSendMessage();
                  }
                  if (e.key === "Escape" && closeOnEscape) {
                    setExpandedCharacter(null);
                    setMessageInput("");
                    onDockToggle?.(false);
                  }
                }}
                placeholder={placeholder(selectedCharacter?.name || "")}
                className={cn(
                  "absolute left-14 right-0 z-50 w-[300px] border-none bg-transparent text-sm font-medium outline-none",
                  palette.text,
                  palette.placeholder
                )}
                autoFocus={autoFocus}
                initial={{ opacity: 0, x: 20 }}
                animate={{ 
                  opacity: 1, 
                  x: 0,
                  transition: {
                    delay: 0.2,
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }
                }}
                exit={{ 
                  opacity: 0,
                  transition: {
                    duration: 0.1,
                    ease: "easeOut"
                  }
                }}
              />
            )}
          </AnimatePresence>

          {/* Second separator */}
          <motion.div
            className="h-6 w-px"
            style={{ backgroundColor: palette.divider }}
            animate={{
              opacity: isExpanded ? 0 : 1,
              scaleY: isExpanded ? 0 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: isExpanded ? 0 : 0, // Remove delay when coming back
            }}
          />

          {/* Menu button / Send button - transforms in place */}
          {showMenuButton && (
            <motion.div
              className={cn(
                "z-20 flex h-10 w-10 items-center justify-center",
                isExpanded && "absolute right-0"
              )}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <AnimatePresence mode="wait">
                {!isExpanded ? (
                <motion.button
                  key="menu"
                  className={cn("flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors", palette.iconHover)}
                  whileHover={{
                    scale: 1.02,
                    y: -1,
                    transition: {
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                    },
                  }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Menu"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={palette.icon}
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </motion.button>
                ) : (
                <motion.button
                  key="send"
                  onClick={handleSendMessage}
                  className={cn("relative z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-45", palette.send)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.9 }}
                  disabled={!messageInput.trim()}
                  initial={{ opacity: 0, scale: 0.92, rotate: -90 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    rotate: 0,
                    transition: {
                      delay: 0.25,
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }
                  }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0.92,
                    rotate: 90,
                    transition: {
                      duration: 0.1,
                      ease: "easeIn"
                    }
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-current"
                  >
                    <path d="m22 2-7 20-4-9-9-4z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
