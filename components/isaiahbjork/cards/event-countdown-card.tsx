"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Calendar, Clock, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { BjorkBadge } from "@/components/isaiahbjork/primitives/badge"
import { BjorkButton } from "@/components/isaiahbjork/primitives/button"
import { BjorkCard } from "@/components/isaiahbjork/primitives/card"

interface EventCountdownCardProps {
  title?: string
  date?: Date
  image?: string
  attendees?: number
  onJoin?: () => void
  enableAnimations?: boolean
  className?: string
}

export function EventCountdownCard({
  title = "React & AI Workshop",
  date,
  image = "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&h=600&fit=crop", // Tech meetup/workshop
  attendees = 42,
  onJoin,
  enableAnimations = true,
  className,
}: EventCountdownCardProps) {
  // Stable event date - only calculate once when no date prop is provided
  const [eventDate] = useState(() => 
    date || new Date(Date.now() + 2 * 24 * 3600 * 1000 + 5 * 3600 * 1000 + 30 * 60 * 1000)
  )
  
  // Initialize timeLeft with the correct calculation
  const [timeLeft, setTimeLeft] = useState(() => {
    const targetDate = date || eventDate
    return Math.max(0, Math.floor((+targetDate - Date.now()) / 1000))
  })
  const shouldReduceMotion = useReducedMotion()
  const shouldAnimate = enableAnimations && !shouldReduceMotion

  useEffect(() => {
    const targetDate = date || eventDate
    
    const update = () => {
      const remaining = Math.max(0, Math.floor((+targetDate - Date.now()) / 1000))
      setTimeLeft(remaining)
    }
    
    // Update immediately
    update()
    
    // Then update every second
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [date, eventDate])

  const getTimeUnits = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return { days, hours, minutes, seconds: secs }
  }

  const { days, hours, minutes, seconds } = getTimeUnits(timeLeft)

  const containerVariants = {
    hidden: {
      opacity: 0,
      y: 40,
      scale: 0.95,
      filter: "blur(8px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        staggerChildren: 0.08,
        delayChildren: 0.1,
      }
    },
    rest: { 
      scale: 1,
      y: 0,
      filter: "blur(0px)",
    },
    hover: shouldAnimate ? { 
      scale: 1.03, 
      y: -6,
      filter: "blur(0px)",
      transition: { 
        type: "spring", 
        stiffness: 300, 
        damping: 30,
        mass: 0.8,
      }
    } : {},
  }

  const numberVariants = {
    initial: { scale: 1, opacity: 1 },
    pulse: shouldAnimate ? {
      scale: [1, 1.15, 1],
      opacity: [1, 0.7, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut"
      }
    } : {},
  }

  const childVariants = {
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.95,
      filter: "blur(4px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 28,
        mass: 0.6,
      },
    },
  }

  const buttonVariants_motion = {
    hidden: {
      opacity: 0,
      y: 15,
      scale: 0.9,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25,
        mass: 0.7,
      },
    },
    rest: { scale: 1, y: 0 },
    hover: shouldAnimate ? { 
      scale: 1.05, 
      y: -2,
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 25 
      }
    } : {},
    tap: shouldAnimate ? { scale: 0.95 } : {},
  }

  return (
    <BjorkCard
      data-slot="event-countdown-card"
      variant="elevated"
      padding="none"
      initial={false}
      animate="visible"
      whileHover="hover"
      variants={containerVariants}
      className={cn(
        "group relative w-80 cursor-pointer overflow-hidden rounded-[20px]",
        "border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]",
        className
      )}
    >
      {/* Image Container */}
      <motion.div 
        className="relative overflow-hidden"
        variants={shouldAnimate ? childVariants : {}}
      >
        <motion.img 
          src={image} 
          alt={title} 
          className="h-48 w-full object-cover"
          initial={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/58 via-[#080808]/10 to-transparent" />
        
        {/* Urgency Badge */}
        {timeLeft > 0 && timeLeft < 86400 && ( // Less than 24 hours
          <BjorkBadge
            variant="outline"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute right-4 top-4 border-[#ec5c13]/28 bg-[#ec5c13]/14 text-[#d86a2c]"
          >
            Starts Soon!
          </BjorkBadge>
        )}
      </motion.div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Title & Meta */}
        <motion.div 
          className="space-y-2"
          variants={shouldAnimate ? childVariants : {}}
        >
          <motion.h3 
            className="text-xl font-semibold leading-tight tracking-[-0.03em] text-[#171717] dark:text-[#ededed]"
            initial={{ opacity: 0.9 }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {title}
          </motion.h3>
          
          <div className="flex items-center gap-4 text-sm text-[#171717]/50 dark:text-[#ededed]/42">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{(date || eventDate).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{attendees} attending</span>
            </div>
          </div>
        </motion.div>

        {/* Countdown Display */}
        {timeLeft > 0 ? (
          <motion.div 
            className="space-y-3"
            variants={shouldAnimate ? childVariants : {}}
          >
            <div className="flex items-center gap-1 text-sm font-medium text-[#171717]/52 dark:text-[#ededed]/46">
              <Clock className="w-4 h-4" />
              <span>Event starts in:</span>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              {[
                { value: days, label: "Days" },
                { value: hours, label: "Hours" },
                { value: minutes, label: "Min" },
                { value: seconds, label: "Sec" },
              ].map((unit, index) => (
                <motion.div
                  key={unit.label}
                  variants={index === 3 ? numberVariants : {}} // Only seconds pulse
                  initial="initial"
                  animate={index === 3 ? "pulse" : "initial"}
                  className="rounded-xl border border-[#d8d3c7] bg-[#eee9df] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-[#232323] dark:bg-[#090909] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="text-lg font-semibold tabular-nums text-[#bd4514] dark:text-[#d86a2c]">
                    {unit.value.toString().padStart(2, "0")}
                  </div>
                  <div className="text-xs font-medium text-[#171717]/46 dark:text-[#ededed]/36">
                    {unit.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            variants={shouldAnimate ? childVariants : {}}
            className="text-center py-4"
          >
            <div className="text-lg font-semibold text-[#bd4514] dark:text-[#d86a2c]">Event Started!</div>
            <div className="text-sm text-[#171717]/52 dark:text-[#ededed]/42">Join now to participate</div>
          </motion.div>
        )}

        {/* Action Button */}
        <BjorkButton
          variant="accent"
          onClick={onJoin}
          variants={buttonVariants_motion}
          initial={shouldAnimate ? "hidden" : "visible"}
          animate="visible"
          whileHover="hover"
          whileTap="tap"
          className="h-11 w-full"
        >
          {timeLeft > 0 ? "Reserve Your Spot" : "Join Event"}
        </BjorkButton>
      </div>
    </BjorkCard>
  )
}
