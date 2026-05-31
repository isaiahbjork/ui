"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkSelect } from "@/components/bjork-ui/primitives/select";

interface TimeSlot {
  time: string;
  available: boolean;
}

interface DaySchedule {
  date: string;
  dayName: string;
  dayNumber: number;
  slots: TimeSlot[];
  hasAvailability: boolean;
}

interface Coach {
  name: string;
  title: string;
  location: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
}

interface CoachSchedulingProps {
  coach?: Coach;
  locations?: string[];
  weekSchedule?: DaySchedule[];
  onLocationChange?: (location: string) => void;
  onTimeSlotSelect?: (day: string, time: string) => void;
  onWeekChange?: (direction: "prev" | "next") => void;
  enableAnimations?: boolean;
  className?: string;
}

const defaultCoach: Coach = {
  name: "Michael Baumgardner",
  title: "Tennis coach",
  location: "New York",
  rating: 5.0,
  reviewCount: 7,
  imageUrl: "https://images.unsplash.com/photo-1660463532854-f887f2a6c674"
};

const defaultLocations = [
  "Riverbank State Park Tennis Courts",
  "Central Park Tennis Center",
  "Brooklyn Bridge Park Courts",
  "Prospect Park Tennis Center"
];

const defaultWeekSchedule: DaySchedule[] = [
  {
    date: "Aug 17",
    dayName: "Today",
    dayNumber: 17,
    hasAvailability: true,
    slots: [
      { time: "10:30 AM", available: true },
      { time: "11:00 AM", available: true },
      { time: "11:30 AM", available: true },
      { time: "12:00 PM", available: true },
      { time: "12:30 PM", available: true },
      { time: "01:00 PM", available: false },
      { time: "01:30 PM", available: true },
      { time: "02:00 PM", available: true },
      { time: "02:30 PM", available: true },
      { time: "03:00 PM", available: true }
    ]
  },
  {
    date: "Aug 18",
    dayName: "Tue",
    dayNumber: 18,
    hasAvailability: true,
    slots: [
      { time: "10:30 AM", available: true },
      { time: "11:00 AM", available: true },
      { time: "11:30 AM", available: true },
      { time: "12:00 PM", available: true },
      { time: "03:00 PM", available: true }
    ]
  },
  {
    date: "Aug 19",
    dayName: "Wed",
    dayNumber: 19,
    hasAvailability: true,
    slots: [
      { time: "11:00 AM", available: true },
      { time: "12:00 PM", available: true },
      { time: "12:30 PM", available: true },
      { time: "01:30 PM", available: false },
      { time: "02:00 PM", available: true },
      { time: "02:30 PM", available: true },
      { time: "03:00 PM", available: true }
    ]
  },
  {
    date: "Aug 20",
    dayName: "Thu",
    dayNumber: 20,
    hasAvailability: false,
    slots: []
  },
  {
    date: "Aug 21",
    dayName: "Fri",
    dayNumber: 21,
    hasAvailability: false,
    slots: []
  },
  {
    date: "Aug 22",
    dayName: "Sat",
    dayNumber: 22,
    hasAvailability: false,
    slots: []
  }
];

export function CoachSchedulingCard({
  coach = defaultCoach,
  locations = defaultLocations,
  weekSchedule = defaultWeekSchedule,
  onLocationChange,
  onTimeSlotSelect,
  onWeekChange,
  enableAnimations = true,
  className
}: CoachSchedulingProps) {
  const [selectedLocation, setSelectedLocation] = useState(locations[0]);
  const [weekRange] = useState("Aug 17 - Aug 22");
  const [showConfirmationView, setShowConfirmationView] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{day: string, time: string, dayName: string} | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const handleLocationChange = (location: string) => {
    setSelectedLocation(location);
    onLocationChange?.(location);
  };

  const handleTimeSlotClick = (day: string, time: string) => {
    const dayInfo = weekSchedule.find(d => d.date === day);
    setSelectedTimeSlot({
      day,
      time,
      dayName: dayInfo?.dayName || day
    });
    setShowConfirmationView(true);
    onTimeSlotSelect?.(day, time);
  };

  const handleBackToMain = () => {
    setShowConfirmationView(false);
    setSelectedTimeSlot(null);
  };

  const handleConfirmBooking = () => {
    // Handle booking confirmation logic here
    setShowConfirmationView(false);
    setSelectedTimeSlot(null);
  };

  const handleWeekNavigation = (direction: "prev" | "next") => {
    onWeekChange?.(direction);
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      }
    }
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      x: -25,
      scale: 0.95,
      filter: "blur(4px)"
    },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 28,
        mass: 0.6,
      },
    },
  };

  const timeSlotVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25,
      }
    }
  };

  return (
    <motion.div
      variants={shouldAnimate ? containerVariants : {}}
      initial={shouldAnimate ? "hidden" : "visible"}
      animate="visible"
      className={cn(
        "relative max-w-2xl overflow-hidden rounded-[20px] border border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]",
        className
      )}
    >
      <div className="relative h-auto">
        {/* Main Content */}
        <motion.div
          initial={false}
          animate={{
            y: showConfirmationView ? "-20px" : "0px",
            opacity: showConfirmationView ? 0.3 : 1,
            scale: showConfirmationView ? 0.95 : 1
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
          className="w-full"
        >
      {/* Coach Profile Header */}
      <motion.div
        variants={shouldAnimate ? itemVariants : {}}
        className="p-6 pb-6"
      >
        <div className="flex items-start justify-between gap-6">
          {/* Left Side - Profile Image */}
          <motion.div
            whileHover={shouldAnimate ? {
              scale: 1.05,
              transition: { type: "spring", stiffness: 400, damping: 25 }
            } : {}}
            className="flex-shrink-0"
          >
            <img
              src={coach.imageUrl}
              alt={coach.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
          </motion.div>

          {/* Center - Coach Info */}
          <div className="flex-1 min-w-0 space-y-4">
            <h2 className="text-xl font-semibold text-foreground">
              {coach.name}
            </h2>

            {/* Rating and Details Row */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-[#ec5c13] text-[#ec5c13]" />
                <span className="font-medium">{coach.rating}</span>
                <motion.button
                  whileHover={shouldAnimate ? {
                    scale: 1.05,
                    transition: { type: "spring", stiffness: 400, damping: 25 }
                  } : {}}
                  className="underline hover:text-foreground transition-colors"
                >
                  ({coach.reviewCount} reviews)
                </motion.button>
              </div>
              <span>•</span>
              <span>{coach.title}</span>
              <span>•</span>
              <span>{coach.location}</span>
            </div>
          </div>

          {/* Right Side - Pricing */}
          <motion.div
            initial={shouldAnimate ? {
              opacity: 0,
              scale: 0.8,
              x: 20,
              filter: "blur(4px)"
            } : {}}
            animate={shouldAnimate ? {
              opacity: 1,
              scale: 1,
              x: 0,
              filter: "blur(0px)"
            } : {}}
            transition={shouldAnimate ? {
              type: "spring",
              stiffness: 400,
              damping: 25,
              delay: 0.3,
              mass: 0.6
            } : {}}
            className="text-right flex-shrink-0"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Per Session</p>
            <motion.p
              className="text-2xl font-bold text-[#bd4514] dark:text-[#d86a2c]"
              initial={shouldAnimate ? { scale: 0.5 } : {}}
              animate={shouldAnimate ? { scale: 1 } : {}}
              transition={shouldAnimate ? {
                type: "spring",
                stiffness: 500,
                damping: 20,
                delay: 0.5
              } : {}}
            >
              $75
            </motion.p>
          </motion.div>
        </div>
      </motion.div>

      {/* Location Selector */}
      <motion.div
        variants={shouldAnimate ? itemVariants : {}}
        className="px-6 pb-4 relative z-50"
        style={{ overflow: 'visible' }}
      >
        <label className="block text-sm text-muted-foreground mb-2">
          Choose location
        </label>
        <BjorkSelect
          value={selectedLocation}
          onValueChange={handleLocationChange}
          variant="base"
          className="w-full"
          placeholder="Choose location"
          options={locations.map((location) => ({
            value: location,
            label: location,
          }))}
        />
      </motion.div>

      {/* Separator */}
      <motion.div
        variants={shouldAnimate ? itemVariants : {}}
        className="mx-6 border-t border-border/50"
      />

      {/* Week Navigation */}
      <motion.div
        variants={shouldAnimate ? itemVariants : {}}
        className="p-6 pb-4"
      >
        <div className="flex items-center justify-between">
                     <motion.button
             whileHover={shouldAnimate ? {
               scale: 1.05,
               transition: { type: "spring", stiffness: 400, damping: 25 }
             } : {}}
             whileTap={shouldAnimate ? { scale: 0.95 } : {}}
             onClick={() => handleWeekNavigation("prev")}
             aria-label="Previous week"
             className="rounded-lg border border-transparent p-2 text-[#171717]/55 transition-colors hover:border-[#d8d3c7] hover:bg-[#eee9df] hover:text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#ec5c13]/45 dark:text-[#ededed]/45 dark:hover:border-[#232323] dark:hover:bg-[#141414] dark:hover:text-[#ededed]"
           >
             <ChevronLeft className="w-5 h-5 text-muted-foreground" />
           </motion.button>

          <h3 className="font-semibold text-foreground">
            {weekRange}
          </h3>

                     <motion.button
             whileHover={shouldAnimate ? {
               scale: 1.05,
               transition: { type: "spring", stiffness: 400, damping: 25 }
             } : {}}
             whileTap={shouldAnimate ? { scale: 0.95 } : {}}
             onClick={() => handleWeekNavigation("next")}
             aria-label="Next week"
             className="rounded-lg border border-transparent p-2 text-[#171717]/55 transition-colors hover:border-[#d8d3c7] hover:bg-[#eee9df] hover:text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#ec5c13]/45 dark:text-[#ededed]/45 dark:hover:border-[#232323] dark:hover:bg-[#141414] dark:hover:text-[#ededed]"
           >
             <ChevronRight className="w-5 h-5 text-muted-foreground" />
           </motion.button>
        </div>
      </motion.div>

      {/* Daily Schedule */}
      <motion.div
        variants={shouldAnimate ? itemVariants : {}}
        className="px-6 pb-6 space-y-4"
      >
        {weekSchedule.map((day) => (
          <motion.div
            key={day.date}
            variants={shouldAnimate ? itemVariants : {}}
            className="space-y-3"
          >
            {/* Day Header */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">
                  {day.dayName}, {day.date}
                </h4>
              </div>
              {!day.hasAvailability && (
                <span className="text-sm text-muted-foreground">
                  No Availability
                </span>
              )}
            </div>

            {/* Time Slots */}
            {day.hasAvailability && (
              <motion.div
                variants={shouldAnimate ? containerVariants : {}}
                className="flex flex-wrap gap-2"
              >
                {day.slots.map((slot) => (
                                     <motion.button
                     key={`${day.date}-${slot.time}`}
                     variants={shouldAnimate ? timeSlotVariants : {}}
                     whileHover={shouldAnimate && slot.available ? {
                       scale: 1.05,
                       y: -2,
                       transition: { type: "spring", stiffness: 400, damping: 25 }
                     } : {}}
                     whileTap={shouldAnimate && slot.available ? { scale: 0.98 } : {}}
                     onClick={() => slot.available && handleTimeSlotClick(day.date, slot.time)}
                     disabled={!slot.available}
                     aria-label={`${slot.available ? 'Book' : 'Unavailable'} time slot at ${slot.time} on ${day.dayName}, ${day.date}`}
                     className={cn(
                       "px-3 py-1.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
                       slot.available
                         ? "cursor-pointer border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:border-[#ec5c13]/35 hover:bg-[#eee9df] dark:border-[#232323] dark:bg-[#090909] dark:text-[#ededed] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:border-[#ec5c13]/35 dark:hover:bg-[#141414]"
                         : "cursor-not-allowed border-[#d8d3c7]/70 bg-[#eee9df]/60 text-[#171717]/36 opacity-60 dark:border-[#232323]/70 dark:bg-[#090909]/50 dark:text-[#ededed]/28"
                     )}
                   >
                     {slot.time}
                   </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom Actions */}
      <motion.div
        variants={shouldAnimate ? itemVariants : {}}
        className="border-t border-border/50 p-6"
      >
                 <div className="flex gap-3">
           <BjorkButton variant="outline" className="flex-1">
             Cancel
           </BjorkButton>
           <BjorkButton variant="accent" className="flex-1">
             Next
           </BjorkButton>
         </div>
        </motion.div>
        </motion.div>

        {/* Confirmation View */}
        <motion.div
          initial={false}
          animate={{
            y: showConfirmationView ? "0%" : "100%",
            opacity: showConfirmationView ? 1 : 0
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
          className="absolute left-0 top-0 h-full w-full bg-[#f4f1e9] dark:bg-[#121212]"
        >
          <div className="p-6 space-y-6">
            {/* Header with back button */}
            <div className="flex items-center justify-between">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleBackToMain}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Back</span>
              </motion.button>
              <h3 className="text-lg font-semibold text-foreground">Confirm Booking</h3>
              <div></div> {/* Spacer for centering */}
            </div>

            {/* Coach info summary */}
            <div className="flex items-center gap-4 rounded-xl border border-[#d8d3c7] bg-[#eee9df] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-[#232323] dark:bg-[#090909] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <img
                src={coach.imageUrl}
                alt={coach.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div>
                <h4 className="font-semibold text-foreground">{coach.name}</h4>
                <p className="text-sm text-muted-foreground">{coach.title}</p>
              </div>
            </div>

            {/* Booking details */}
            {selectedTimeSlot && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">Your Booking</p>
                  <div className="rounded-xl border border-[#d8d3c7] bg-[#eee9df] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-[#232323] dark:bg-[#090909] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-lg font-semibold text-foreground">
                      {selectedTimeSlot.dayName}, {selectedTimeSlot.day}
                    </p>
                    <p className="text-xl font-bold text-[#bd4514] dark:text-[#d86a2c]">
                      {selectedTimeSlot.time}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="text-foreground font-medium">{selectedLocation}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="text-foreground font-medium">1 hour</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="text-foreground font-medium">$75</span>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm button */}
            <BjorkButton
              variant="accent"
              size="lg"
              onClick={handleConfirmBooking}
              className="w-full"
            >
              Confirm Booking
              <Check className="w-4 h-4" />
            </BjorkButton>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
