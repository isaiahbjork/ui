"use client"

import { useState, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Loader2, Check } from "lucide-react"
import { BjorkBadge } from "@/components/bjork-ui/primitives/badge"
import { cn } from "@/lib/utils"

interface AnimatedStatusBadgeProps {
  trigger: boolean
  onAnimationComplete?: () => void
  className?: string
}

export function AnimatedStatusBadge({ 
  trigger, 
  onAnimationComplete,
  className = ""
}: AnimatedStatusBadgeProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)

  const startAnimation = () => {
    setIsAnimating(true)
    setIsCompleted(false)
    setTimeout(() => {
      setIsAnimating(false)
      setTimeout(() => {
        setIsCompleted(true)
        // Make completed badge disappear after 3 seconds
        setTimeout(() => {
          setIsCompleted(false)
          if (onAnimationComplete) {
            onAnimationComplete()
          }
        }, 3000)
      }, 300) // Delay the appearance of "Completed" badge
    }, 3000) // Animation duration
  }

  useEffect(() => {
    if (!isAnimating && !isCompleted) {
      setIsCompleted(false)
    }
  }, [isAnimating, isCompleted])

  useEffect(() => {
    if (trigger) {
      startAnimation()
    }
  }, [trigger])

  return (
    <>
      <AnimatePresence>
        {isAnimating && (
          <BjorkBadge
            variant="outline"
            className={cn(
              "absolute right-0 top-0 z-0 border-[#ec5c13]/28 bg-[#ec5c13]/12 text-xs font-medium text-[#bd4514] shadow-[0_12px_18px_-14px_rgba(236,92,19,0.5)] dark:text-[#d86a2c]",
              className
            )}
            initial={{ y: 40, opacity: 1 }}
            animate={{ y: -32, opacity: 1 }}
            exit={{
              y: [-37, 40], // First go up 5px, then slide down
              opacity: [1, 1, 0], // Maintain opacity until the end of the animation
              scale: [1, 0.8, 0.8], // Scale down as it starts to disappear
            }}
            transition={{
              duration: 0.5,
              times: [0, 0.2, 1], // Timing for the exit animation stages
              ease: "easeInOut",
            }}
          >
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
            <span>Running</span>
          </BjorkBadge>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isCompleted && (
          <BjorkBadge
            variant="accent"
            className={cn(
              "absolute right-0 top-0 z-0 text-xs font-medium shadow-[0_12px_18px_-14px_rgba(236,92,19,0.5)]",
              className
            )}
            initial={{ y: 40, opacity: 1 }}
            animate={{ y: -32, opacity: 1 }}
            exit={{
              y: [-37, 40], // First go up 5px, then slide down
              opacity: [1, 1, 0], // Maintain opacity until the end of the animation
              scale: [1, 0.8, 0.8], // Scale down as it starts to disappear
            }}
            transition={{
              duration: 0.5,
              times: [0, 0.2, 1], // Timing for the exit animation stages
              ease: "easeInOut",
            }}
          >
            <Check className="h-3 w-3 mr-1" />
            <span>Completed</span>
          </BjorkBadge>
        )}
      </AnimatePresence>
    </>
  )
}
