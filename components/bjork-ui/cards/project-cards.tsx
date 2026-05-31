"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, MapPin } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface Project {
  id: string
  title: string
  pricePerHour: string
  status: "Paid" | "Not Paid"
  categories: string[]
  description: string
  location: string
  timeAgo: string
  logoColor: string
  logoIcon: string
}

interface ProjectCardsProps {
  projects: Project[]
}

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
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
    },
  },
  hover: {
    y: -2,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
}

const expandedContentVariants = {
  hidden: {
    opacity: 0,
    height: 0,
    transition: {
      duration: 0.3,
      ease: [0.04, 0.62, 0.23, 0.98],
    },
  },
  visible: {
    opacity: 1,
    height: "auto",
    transition: {
      duration: 0.4,
      ease: [0.04, 0.62, 0.23, 0.98],
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

const childVariants = {
  hidden: {
    opacity: 0,
    y: 10,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
    },
  },
}

const pillVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
  hover: {
    scale: 1.05,
    y: -1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
  tap: {
    scale: 0.98,
  },
}

const logoVariants = {
  hover: {
    scale: 1.1,
    rotate: 5,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
}

const chevronVariants = {
  hover: {
    scale: 1.1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
  tap: {
    scale: 0.95,
  },
}

function ProjectCard({ project }: { project: Project }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      className="group cursor-pointer border-b border-[#d6d0c5] py-4 first:pt-4 last:border-b-0 last:pb-4 dark:border-[#25211d]"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <motion.div
            variants={logoVariants}
            whileHover="hover"
            className={cn(
              "flex size-12 flex-shrink-0 items-center justify-center rounded-[14px] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]",
              project.logoColor
            )}
          >
            {project.logoIcon}
          </motion.div>

          <div className="flex-1 min-w-0">
            <motion.div className="flex items-center gap-3 mb-2" variants={childVariants}>
              <h3 className="text-sm font-medium text-[#191716] dark:text-[#f3efe8]">{project.title}</h3>
              <div className="h-3 w-px bg-[#bdb5aa] dark:bg-[#37312b]" />
              <motion.span
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                  project.status === "Paid"
                    ? "bg-[#302820] text-[#f1d6c6] ring-1 ring-[#ec5c13]/20 dark:bg-[#27221e] dark:text-[#e7caba]"
                    : "bg-[#dad4c8] text-[#5b554e] dark:bg-[#24211d] dark:text-[#b6aea4]"
                )}
              >
                {project.status === "Paid" && (
                  <span className="mr-1.5 inline-block size-1.5 rounded-full bg-[#ec5c13]/80 align-middle" />
                )}
                {project.status}
              </motion.span>
            </motion.div>

            <motion.p className="mb-4 text-sm font-medium text-[#6f675d] dark:text-[#9b9288]" variants={childVariants}>
              {project.pricePerHour}
            </motion.p>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  variants={expandedContentVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="overflow-hidden"
                >
                  <motion.div className="flex gap-2 mb-4" variants={childVariants}>
                    {project.categories.map((category, index) => (
                      <motion.span
                        key={index}
                        variants={pillVariants}
                        whileHover="hover"
                        whileTap="tap"
                        custom={index}
                        className="cursor-pointer select-none rounded-full bg-[#ded8ce] px-4 py-2 text-sm font-medium text-[#5e574e] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-[#211f1c] dark:text-[#aaa197] dark:shadow-none"
                      >
                        {category}
                      </motion.span>
                    ))}
                  </motion.div>

                  <motion.p className="mb-4 max-w-xl text-sm leading-relaxed text-[#6b6359] dark:text-[#8f877d]" variants={childVariants}>
                    {project.description}
                  </motion.p>

                  <motion.div className="flex items-center gap-2 text-sm text-[#8c8377] dark:text-[#746e68]" variants={childVariants}>
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <MapPin className="w-4 h-4" />
                    </motion.div>
                    <span className="text-xs font-medium">{project.location}</span>
                    <div className="mx-1 h-3 w-px bg-[#c8c0b5] dark:bg-[#302b26]" />
                    <span className="text-xs">{project.timeAgo}</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.button
          variants={chevronVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(!isExpanded)
          }}
          className="ml-3 flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-[#ded8ce] text-[#5a534b] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-colors hover:bg-[#d3cabd] dark:bg-[#211f1c] dark:text-[#aba299] dark:shadow-none dark:hover:bg-[#282520]"
          aria-label={isExpanded ? "Collapse project" : "Expand project"}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
            }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </motion.button>
      </div>
    </motion.div>
  )
}

export function ProjectCards({ projects }: ProjectCardsProps) {
  return (
    <div className="mx-auto w-full max-w-4xl rounded-[22px] bg-[#ebe6dc] px-4 py-0 text-[#191716] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:bg-[#151515] dark:text-[#f3efe8] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        {projects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              delay: index * 0.1 + 0.3,
              mass: 0.8,
            }}
          >
            <ProjectCard project={project} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
