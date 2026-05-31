"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Send, AudioLines, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIVoiceInputProps {
  placeholder?: string;
  onSend?: (message: string) => void;
  onVoiceStart?: () => void;
  onVoiceStop?: (duration: number) => void;
  enableAnimations?: boolean;
  className?: string;
  disabled?: boolean;
  
  // Voice settings
  visualizerBars?: number;
  demoMode?: boolean;
  demoInterval?: number;
}

export function AIVoiceInput({
  placeholder = "Send message...",
  onSend,
  onVoiceStart,
  onVoiceStop,
  enableAnimations = true,
  className,
  disabled = false,
  demoMode = false,
  demoInterval = 3000,
}: AIVoiceInputProps) {
  const [message, setMessage] = useState("");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceTime, setVoiceTime] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [isDemo, setIsDemo] = useState(demoMode);

  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;

    if (isVoiceActive) {
      onVoiceStart?.();
      intervalId = setInterval(() => {
        setVoiceTime((t) => t + 1);
      }, 1000);
    } else {
      onVoiceStop?.(voiceTime);
      setVoiceTime(0);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isVoiceActive, voiceTime, onVoiceStart, onVoiceStop]);

  // Demo mode effect
  useEffect(() => {
    if (!isDemo) return;

    let timeoutId: NodeJS.Timeout;
    const runAnimation = () => {
      setIsVoiceActive(true);
      timeoutId = setTimeout(() => {
        setIsVoiceActive(false);
        timeoutId = setTimeout(runAnimation, 1000);
      }, demoInterval);
    };

    const initialTimeout = setTimeout(runAnimation, 100);
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(initialTimeout);
    };
  }, [isDemo, demoInterval]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (message.trim() && onSend && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleVoiceClick = () => {
    if (isDemo) {
      setIsDemo(false);
      setIsVoiceActive(false);
    } else {
      setIsVoiceActive(prev => !prev);
    }
  };

  return (
    <motion.div
      className={cn(
        "relative mx-auto w-full overflow-hidden rounded-[20px]",
        "border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] backdrop-blur-md",
        "transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-out",
        "focus-within:border-[color:var(--bjork-border-strong)] focus-within:ring-2 focus-within:ring-[color:var(--bjork-border-strong)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--bjork-ring-offset)]",
        disabled && "opacity-50",
        className
      )}
      initial={shouldAnimate ? { opacity: 0, y: 8 } : {}}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      }}
    >
      <div className="relative p-4">
        <AnimatePresence>
          {isVoiceActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-[18px] border border-[color:var(--bjork-border)] bg-[var(--bjork-menu)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl"
            >
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  aria-label="Stop voice input"
                  onClick={() => setIsVoiceActive(false)}
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-[11px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] text-[#ec5c13] shadow-[var(--bjork-shadow-inset)] transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[color:var(--bjork-border-strong)] hover:bg-[var(--bjork-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)]"
                >
                  <Square className="size-3" />
                </button>

                <span className="font-mono text-sm text-[color:var(--bjork-text-medium)]">
                  {formatTime(voiceTime)}
                </span>

                <div className="flex h-9 w-48 items-center justify-center gap-0.5">
                  {[...Array(24)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-0.5 rounded-full transition-all duration-300",
                        isVoiceActive
                          ? "animate-pulse bg-[var(--bjork-accent)] opacity-80"
                          : "h-1 bg-[var(--bjork-text-faint)] opacity-45"
                      )}
                      style={
                        isVoiceActive && isClient
                          ? {
                              height: `${30 + Math.random() * 70}%`,
                              animationDelay: `${i * 0.05}s`,
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>

                <p className="text-xs font-medium text-[color:var(--bjork-text-soft)]">
                  Listening...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-3 flex items-start gap-3">
          <div className="relative flex-1">
            <textarea
              aria-label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isVoiceActive}
              rows={1}
              className={cn(
                "w-full resize-none border-0 bg-transparent px-0 py-1",
                "text-base leading-6 text-[color:var(--bjork-text)] placeholder:text-[color:var(--bjork-text-soft)]",
                "outline-none focus:outline-none focus:ring-0",
                "overflow-hidden selection:bg-[#ec5c13]/30 selection:text-[color:var(--bjork-text)]",
                "transition-[color,opacity] duration-200",
                (disabled || isVoiceActive) && "opacity-50 cursor-not-allowed",
                isVoiceActive && "opacity-30"
              )}
              style={{
                minHeight: "40px",
                maxHeight: "120px",
                height: "auto",
                outline: "none !important",
                boxShadow: "none !important",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
          </div>

          <AnimatePresence>
            {message.trim() && (
              <motion.button
                type="submit"
                onClick={handleSubmit}
                disabled={disabled || !message.trim()}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  "mt-1 flex size-9 shrink-0 transform-gpu items-center justify-center rounded-[13px]",
                  "border border-transparent bg-[var(--bjork-surface-active)] text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-soft)]",
                  "transition-[background-color,color,box-shadow,opacity] duration-150 ease-out hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)]",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                whileHover={shouldAnimate ? { scale: 1.1 } : {}}
                whileTap={shouldAnimate ? { scale: 0.9 } : {}}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                }}
              >
                <Send className="size-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end">
          <motion.button
            type="button"
            aria-pressed={isVoiceActive}
            onClick={handleVoiceClick}
            disabled={disabled}
            className={cn(
              "inline-flex h-9 transform-gpu items-center gap-2 rounded-[13px] px-3 text-sm font-medium",
              "border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-inset)]",
              "transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out hover:border-[color:var(--bjork-border-strong)] hover:bg-[var(--bjork-panel)] hover:text-[color:var(--bjork-text)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            whileHover={shouldAnimate ? { scale: 1.02 } : {}}
            whileTap={shouldAnimate ? { scale: 0.98 } : {}}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
            }}
          >
            <AudioLines className="size-3.5" aria-hidden="true" />
            <span>Voice</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
