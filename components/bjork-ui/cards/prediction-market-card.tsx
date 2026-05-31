"use client";

import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Flame, Volleyball } from 'lucide-react';
import { BjorkBadge } from '@/components/bjork-ui/primitives/badge';
import { BjorkButton } from '@/components/bjork-ui/primitives/button';
import { BjorkCard } from '@/components/bjork-ui/primitives/card';
import { cn } from '@/lib/utils';

interface PredictionMarketCardProps {
  question?: string;
  teamLogo?: string;
  teamName?: string;
  initialTimeInSeconds?: number;
  totalBank?: number;
  yesBank?: number;
  noBank?: number;
  initialYesVotes?: number;
  initialNoVotes?: number;
  yesPlayers?: number;
  noPlayers?: number;
  onBetYes?: () => void;
  onBetNo?: () => void;
  enableAnimations?: boolean;
}

export function PredictionMarketCard({
  question = "Will Bayern win a corner in the next 3 minutes?",
  teamLogo = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/FC_Bayern_M%C3%BCnchen_logo_%282024%29.svg/1200px-FC_Bayern_M%C3%BCnchen_logo_%282024%29.svg.png",
  teamName = "Bayern",
  initialTimeInSeconds = 60,
  totalBank = 145450,
  yesBank = 64280,
  noBank = 81170,
  initialYesVotes = 42,
  initialNoVotes = 58,
  yesPlayers = 1457,
  noPlayers = 1899,
  onBetYes,
  onBetNo,
  enableAnimations = true,
}: PredictionMarketCardProps) {
  const [timeLeft, setTimeLeft] = useState(initialTimeInSeconds);
  const [yesVotes, setYesVotes] = useState(initialYesVotes);
  const [noVotes, setNoVotes] = useState(initialNoVotes);
  const [showBettingView, setShowBettingView] = useState(false);
  const [betType, setBetType] = useState<'yes' | 'no'>('yes');
  const [betAmount, setBetAmount] = useState('');
  const shouldReduceMotion = useReducedMotion();

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(2)}K`;
    }
    return `$${amount}`;
  };

  const handleBetYes = () => {
    setBetType('yes');
    setShowBettingView(true);
  };

  const handleBetNo = () => {
    setBetType('no');
    setShowBettingView(true);
  };

  const handleConfirmBet = () => {
    const adjustment = Math.floor(Math.random() * 3) + 1; // Random 1-3% change
    if (betType === 'yes') {
      setYesVotes(prev => Math.min(95, prev + adjustment));
      setNoVotes(prev => Math.max(5, prev - adjustment));
      onBetYes?.();
    } else {
      setNoVotes(prev => Math.min(95, prev + adjustment));
      setYesVotes(prev => Math.max(5, prev - adjustment));
      onBetNo?.();
    }
    setShowBettingView(false);
    setBetAmount('');
  };

  const handleBackToMain = () => {
    setShowBettingView(false);
    setBetAmount('');
  };

  const handleQuickAmount = (amount: number) => {
    setBetAmount(amount.toString());
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setBetAmount(value);
  };

  const totalVotes = yesVotes + noVotes;
  const progressValue = (yesVotes / totalVotes) * 100;
  const timerProgress = (timeLeft / initialTimeInSeconds) * 100; // Reversed: starts at 100%, goes to 0%

  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  // Animation variants
  const containerVariants = {
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
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      x: -15,
      scale: 0.95,
      filter: "blur(2px)",
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

  const badgeVariants = {
    hidden: { scale: 0, opacity: 0, filter: "blur(2px)" },
    visible: {
      scale: 1,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 25,
        mass: 0.5,
      },
    },
  };

  const progressBarVariants = {
    hidden: { scaleX: 0, opacity: 0 },
    visible: {
      scaleX: 1,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        delay: 0.4,
      },
    },
  };

  const buttonContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.5,
      },
    },
  };

  return (
    <BjorkCard
      variant="elevated"
      padding="none"
      className="mx-auto w-full max-w-md rounded-[20px] border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]"
      initial={shouldAnimate ? "hidden" : "visible"}
      animate="visible"
      variants={shouldAnimate ? containerVariants : {}}
    >
      <div className="relative h-auto">
        {/* Main Content */}
        <motion.div
          initial={false}
          animate={{
            y: showBettingView ? "-20px" : "0px",
            opacity: showBettingView ? 0.3 : 1,
            scale: showBettingView ? 0.95 : 1
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
          className="w-full"
        >
          <div className="p-3 space-y-3">
        {/* Header with badges and timer */}
        <motion.div
          className="flex items-center justify-between"
          variants={shouldAnimate ? itemVariants : {}}
        >
          <div className="flex items-center gap-2">
            <motion.div variants={shouldAnimate ? badgeVariants : {}}>
              <BjorkBadge variant="accent">
                <Flame className="w-3 h-3 mr-1" />
                HOT BET
              </BjorkBadge>
            </motion.div>
            <motion.div variants={shouldAnimate ? badgeVariants : {}}>
              <BjorkBadge variant="outline" className="border-[#d8d3c7] bg-[#eee9df] text-[#171717]/60 dark:border-[#232323] dark:bg-[#090909] dark:text-[#ededed]/55">
                <Volleyball className="w-3 h-3 mr-1" />
                SOCCER
              </BjorkBadge>
            </motion.div>
          </div>
          <motion.div variants={shouldAnimate ? badgeVariants : {}}>
            <BjorkBadge className="border-[#ec5c13]/24 bg-[#ec5c13]/12 font-mono text-[#bd4514] dark:text-[#d86a2c]">
              {formatTime(timeLeft)}
            </BjorkBadge>
          </motion.div>
        </motion.div>

        {/* Team info and question */}
        <motion.div
          className="flex items-start justify-center gap-3 pt-2"
          variants={shouldAnimate ? itemVariants : {}}
        >
          <motion.div variants={shouldAnimate ? badgeVariants : {}}>
            <Avatar className="w-10 h-10">
              <AvatarImage src={teamLogo} alt={teamName} />
              <AvatarFallback className="bg-[#ec5c13] text-[#080808]">
                {teamName.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          <motion.div variants={shouldAnimate ? itemVariants : {}}>
            <h3 className="text-lg font-semibold leading-tight text-foreground">
              {question}
            </h3>
          </motion.div>
        </motion.div>

        {/* Gradient separator */}
        <motion.div
          className="relative py-2"
          variants={shouldAnimate ? itemVariants : {}}
        >
          <Separator className="bg-gradient-to-r from-transparent dark:via-gray-500 via-gray-300 to-transparent" />
        </motion.div>

        {/* Bank information */}
        <motion.div
          className="flex justify-between items-center"
          variants={shouldAnimate ? itemVariants : {}}
        >
          <div className="text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Bank</p>
            <p className="text-xl font-bold text-[#bd4514] dark:text-[#d86a2c]">
              {formatCurrency(totalBank)}
            </p>
          </div>
          <div className="text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Bank <span className="font-bold">YES</span></p>
            <p className="text-xl font-bold text-[#7c8f5d] dark:text-[#a9bc82]">
              {formatCurrency(yesBank)}
            </p>
          </div>
          <div className="text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Bank <span className="font-bold">NO</span></p>
            <p className="text-xl font-bold text-[#b45f50] dark:text-[#d58473]">
              {formatCurrency(noBank)}
            </p>
          </div>
        </motion.div>
        <motion.div
          className="relative py-2"
          variants={shouldAnimate ? itemVariants : {}}
        >
          <Separator className="bg-gradient-to-r from-transparent dark:via-gray-500 via-gray-300 to-transparent" />
          </motion.div>

        {/* Voting statistics */}
        <motion.div
          className="space-y-2"
          variants={shouldAnimate ? itemVariants : {}}
        >
          <div className="flex items-center justify-between">
            <div className="text-left">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Voted <span className="font-bold">YES</span></p>
              <p className="text-2xl font-bold text-[#7c8f5d] dark:text-[#a9bc82]">{yesVotes}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Voted <span className="font-bold">NO</span></p>
              <p className="text-2xl font-bold text-[#b45f50] dark:text-[#d58473]">{noVotes}%</p>
            </div>
          </div>

          {/* Progress bar */}
          <motion.div
            className="relative h-3 overflow-hidden rounded-md bg-[#b45f50]"
            variants={shouldAnimate ? progressBarVariants : {}}
          >
            <div
              className="absolute left-0 top-0 h-full bg-[#7c8f5d] transition-all duration-500 ease-out"
              style={{ width: `${progressValue}%` }}
            />
            {/* Diagonal separator */}
            <div
              className="absolute top-0 h-full w-2 origin-bottom rotate-12 transform bg-[#f4f1e9] dark:bg-[#121212]"
              style={{
                left: `${progressValue}%`,
                transform: `translateX(-100%) skewX(-15deg)`,
                height: '150%',
                top: '-25%'
              }}
            />
          </motion.div>

          {/* Player counts */}
          <motion.div
            className="flex items-center justify-between text-sm text-muted-foreground"
            variants={shouldAnimate ? itemVariants : {}}
          >
            <span>{yesPlayers.toLocaleString()} PLAYERS</span>
            <span>{noPlayers.toLocaleString()} PLAYERS</span>
          </motion.div>
        </motion.div>

        {/* Betting buttons */}
        <motion.div
          className="grid grid-cols-2 gap-3 pt-1"
          variants={shouldAnimate ? buttonContainerVariants : {}}
        >
          <motion.div
            variants={shouldAnimate ? itemVariants : {}}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <BjorkButton
              onClick={handleBetYes}
              className="group relative w-full cursor-pointer overflow-hidden rounded-xl border border-[#7c8f5d]/35 bg-[#7c8f5d] py-3 font-semibold text-[#080808] transition-all duration-300 hover:bg-[#8fa36b]"
            >
              <span className="relative z-10">BET YES ↗</span>
              {/* Gradient shine effect */}
              <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[100%]" />
              {/* Subtle inner glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#5f7144]/30 to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </BjorkButton>
          </motion.div>
          <motion.div
            variants={shouldAnimate ? itemVariants : {}}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <BjorkButton
              onClick={handleBetNo}
              className="group relative w-full cursor-pointer overflow-hidden rounded-xl border border-[#b45f50]/35 bg-[#b45f50] py-3 font-semibold text-white transition-all duration-300 hover:bg-[#c66d5d]"
            >
              <span className="relative z-10">BET NO ↘</span>
              {/* Gradient shine effect */}
              <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[100%]" />
              {/* Subtle inner glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#854338]/30 to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </BjorkButton>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>

        {/* Betting View */}
        <motion.div
          initial={false}
          animate={{
            y: showBettingView ? "0%" : "100%",
            opacity: showBettingView ? 1 : 0
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
          className="absolute left-0 top-0 h-full w-full bg-[#f4f1e9] dark:bg-[#121212]"
        >
          <div className="p-3 space-y-4">
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
              <BjorkBadge className="border-[#ec5c13]/24 bg-[#ec5c13]/12 font-mono text-[#bd4514] dark:text-[#d86a2c]">
                {formatTime(timeLeft)}
              </BjorkBadge>
            </div>

            {/* Question header */}
            <div className="flex items-center justify-center gap-3">
              <Avatar className="w-8 h-8">
                <AvatarImage src={teamLogo} alt={teamName} />
                <AvatarFallback className="bg-[#ec5c13] text-[#080808] text-xs">
                  {teamName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-sm font-semibold leading-tight text-foreground">
                  {question}
                </h3>
              </div>
            </div>

            {/* Bet type indicator */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">YOUR BET</p>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                betType === 'yes'
                  ? 'border border-[#7c8f5d]/30 bg-[#7c8f5d]/18 text-[#5f7144] dark:text-[#a9bc82]'
                  : 'border border-[#b45f50]/30 bg-[#b45f50]/18 text-[#9b4f43] dark:text-[#d58473]'
              }`}>
                {betType === 'yes' ? 'YES ↗' : 'NO ↘'}
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-2xl font-bold text-muted-foreground">
                  $
                </div>
                <input
                  type="text"
                  value={betAmount}
                  onChange={handleAmountChange}
                  placeholder=""
                  className="w-full bg-transparent border border-border/50 rounded-xl pl-12 pr-4 py-4 text-xl font-semibold text-foreground placeholder-muted-foreground focus:outline-none focus:border-border transition-colors"
                />
              </div>

              {/* Quick amount buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 50, 100].map((amount) => (
                  <motion.button
                    key={amount}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleQuickAmount(amount)}
                    className="rounded-lg border border-[#d8d3c7] bg-[#eee9df] py-2 text-sm font-medium text-[#171717]/55 transition-all duration-200 hover:bg-[#e7e1d5] dark:border-[#232323] dark:bg-[#090909] dark:text-[#ededed]/45 dark:hover:bg-[#141414]"
                  >
                    +${amount}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Confirm button */}
            <motion.button
              whileHover={betAmount ? { scale: 1.02, y: -1 } : {}}
              whileTap={betAmount ? { scale: 0.98 } : {}}
              onClick={handleConfirmBet}
              disabled={!betAmount}
              className={`w-full relative overflow-hidden py-3 rounded-full font-semibold transition-all duration-300 ${
                betAmount
                  ? `${betType === 'yes' ? 'border-[#7c8f5d]/35 bg-[#7c8f5d] hover:bg-[#8fa36b] text-[#080808]' : 'border-[#b45f50]/35 bg-[#b45f50] hover:bg-[#c66d5d] text-white'} border cursor-pointer group`
                  : 'cursor-not-allowed border border-[#d8d3c7] bg-[#eee9df] text-[#171717]/38 dark:border-[#232323] dark:bg-[#090909] dark:text-[#ededed]/30'
              }`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                CONFIRM BET
                {betAmount && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </span>
              {betAmount && (
                <>
                  {/* Gradient shine effect */}
                  <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[100%]" />
                  {/* Subtle inner glow */}
                  <div className={cn("absolute inset-0 bg-gradient-to-t opacity-0 transition-opacity duration-300 group-hover:opacity-100", betType === 'yes' ? 'from-[#5f7144]/30 to-white/10' : 'from-[#854338]/30 to-white/10')} />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Timer progress bar - stays at bottom */}
      <motion.div
        className="px-0 pt-2"
        variants={shouldAnimate ? progressBarVariants : {}}
      >
        <div className="h-1 dark:bg-gray-700 bg-gray-300 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#bd4514] to-[#ec5c13] transition-all duration-1000 ease-linear"
            style={{ width: `${timerProgress}%` }}
          />
        </div>
      </motion.div>
    </BjorkCard>
  );
}
