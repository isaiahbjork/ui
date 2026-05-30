"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

interface PortfolioGalleryProps {
  title?: string;
  archiveButton?: {
    text: string;
    href: string;
  };
  images?: Array<{
    src: string;
    alt: string;
    title?: string;
  }>;
  className?: string;
  maxHeight?: number;
  spacing?: string;
  onImageClick?: (index: number) => void;
  /**
   * Whether to pause marquee animation on hover (mobile only)
   * @default true
   */
  pauseOnHover?: boolean;
  /**
   * Number of times to repeat the content in marquee (mobile only)
   * @default 4
   */
  marqueeRepeat?: number;
}

export function PortfolioGallery({
  title = "Browse my creative library",
  archiveButton = {
    text: "View archives",
    href: "/work"
  },
  images: customImages,
  className = "",
  maxHeight = 120,
  spacing = "-space-x-72 md:-space-x-80",
  onImageClick,
  pauseOnHover = true,
  marqueeRepeat = 4
}: PortfolioGalleryProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()
  const isLight = mounted && resolvedTheme === "light"
  const palette = {
    section: isLight ? "text-[#171717]" : "text-[#ededed]",
    shell: isLight
      ? "border-[#ded7ca] bg-[#eee9df]"
      : "border-[#232323] bg-[#111111]",
    eyebrow: isLight ? "text-[#171717]/42" : "text-[#ededed]/38",
    title: isLight ? "text-[#171717]" : "text-[#ededed]",
    button: isLight
      ? "bg-[#171717] text-[#ededed] hover:bg-[#26221c]"
      : "bg-[#eee9df] text-[#171717] hover:bg-[#f6f2ea]",
    imageRing: isLight ? "ring-[#d6cdbc]" : "ring-[#2a2a2a]",
    imageShadow: isLight
      ? `rgba(57, 46, 33, 0.04) 0.796192px 0px 0.796192px 0px,
         rgba(57, 46, 33, 0.07) 2.41451px 0px 2.41451px 0px,
         rgba(57, 46, 33, 0.12) 6.38265px 0px 6.38265px 0px,
         rgba(57, 46, 33, 0.22) 20px 0px 20px 0px`
      : `rgba(0, 0, 0, 0.04) 0.796192px 0px 0.796192px 0px,
         rgba(0, 0, 0, 0.10) 2.41451px 0px 2.41451px 0px,
         rgba(0, 0, 0, 0.20) 6.38265px 0px 6.38265px 0px,
         rgba(0, 0, 0, 0.42) 20px 0px 20px 0px`,
  }

  useEffect(() => {
    setMounted(true)
  }, [])
  
  const defaultImages = [
    {
      src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=600&fit=crop&q=80",
      alt: "SaaS Dashboard Design",
    },
    {
      src: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop&q=80",
      alt: "Web Development",
    },
    {
      src: "https://images.unsplash.com/photo-1553028826-f4804a6dba3b?w=800&h=600&fit=crop&q=80",
      alt: "E-Commerce Platform",
    },
    {
      src: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop&q=80",
      alt: "Mobile App Design",
    },
    {
      src: "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&h=600&fit=crop&q=80",
      alt: "Brand Identity",
    },
    {
      src: "https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=800&h=600&fit=crop&q=80",
      alt: "Marketing Campaign",
    },
    {
      src: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=800&h=600&fit=crop&q=80",
      alt: "Product Photography",
    },
    {
      src: "https://images.unsplash.com/photo-1542744094-3a31f272c490?w=800&h=600&fit=crop&q=80",
      alt: "Packaging Design",
    },
    {
      src: "https://images.unsplash.com/photo-1553028826-f4804a6dba3b?w=800&h=600&fit=crop&q=80",
      alt: "Tech Innovation",
    },
    {
      src: "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800&h=600&fit=crop&q=80",
      alt: "Future Vision",
    },
  ]
  
  const images = customImages || defaultImages

  return (
    <section
      aria-label={title}
      className={cn("relative min-h-[620px] px-4 py-16", palette.section, className)}
      id="archives"
    >
      <div className={cn("mx-auto max-w-7xl overflow-hidden rounded-[22px] border", palette.shell)}>
        {/* Header Section */}
        <div className="relative z-10 px-8 pb-8 pt-14 text-center">
          <p className={cn("mb-4 font-mono text-[11px] uppercase tracking-[0.18em]", palette.eyebrow)}>
            Archive
          </p>
          <h2 className={cn("mb-8 text-balance text-4xl font-semibold leading-[0.95] md:text-6xl", palette.title)}>{title}</h2>

          <Link
            href={archiveButton.href}
            className={cn(
              "group mb-20 inline-flex items-center gap-3 rounded-full px-6 py-3 text-sm font-medium transition-colors",
              palette.button
            )}
          >
            <span>{archiveButton.text}</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Desktop 3D overlapping layout - hidden on mobile */}
        <div className="hidden md:block relative overflow-hidden h-[400px] -mb-[200px]">
          <div className={`flex ${spacing} pb-8 pt-40 items-end justify-center`}>
            {images.map((image, index) => {
              // Calculate stagger height - peak in middle, descending to edges
              const totalImages = images.length
              const middle = Math.floor(totalImages / 2)
              const distanceFromMiddle = Math.abs(index - middle)
              const staggerOffset = maxHeight - distanceFromMiddle * 20

              const zIndex = totalImages - index

              const isHovered = hoveredIndex === index
              const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index

              // When hovering: hovered card moves to consistent top position, others move to baseline
              const yOffset = isHovered ? -120 : isOtherHovered ? 0 : -staggerOffset

              return (
                <motion.div
                  key={index}
                  className="group cursor-pointer flex-shrink-0"
                  style={{
                    zIndex: zIndex,
                  }}
                  initial={{
                    transform: `perspective(5000px) rotateY(-45deg) translateY(200px)`,
                    opacity: 0,
                  }}
                  animate={{
                    transform: `perspective(5000px) rotateY(-45deg) translateY(${yOffset}px)`,
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0.2, // Much faster hover animation
                    delay: index * 0.05, // Faster entrance stagger
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  onHoverStart={() => setHoveredIndex(index)}
                  onHoverEnd={() => setHoveredIndex(null)}
                  onClick={() => onImageClick?.(index)}
                >
                  <div
                    className={cn(
                      "relative aspect-video w-64 overflow-hidden rounded-[14px] ring-1 transition-transform duration-300 group-hover:scale-105 md:w-80 lg:w-96",
                      palette.imageRing
                    )}
                    style={{
                      boxShadow: palette.imageShadow,
                    }}
                  >
                    <img
                      src={image.src || "/placeholder.svg"}
                      alt={image.alt}
                      className="w-full h-full object-cover object-left-top"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Mobile marquee layout */}
        <div className="block md:hidden relative pb-8">
          <div
            className={cn(
              "group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)]",
              "flex-row"
            )}
          >
            {Array(marqueeRepeat)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex shrink-0 justify-around [gap:var(--gap)]",
                    "animate-marquee flex-row",
                    {
                      "group-hover:[animation-play-state:paused]": pauseOnHover,
                    }
                  )}
                >
                  {images.map((image, index) => (
                    <div
                      key={`${i}-${index}`}
                      className="group cursor-pointer flex-shrink-0"
                      onClick={() => onImageClick?.(index)}
                    >
                      <div
                        className={cn(
                          "relative aspect-video w-64 overflow-hidden rounded-[14px] ring-1 transition-transform duration-300 group-hover:scale-105",
                          palette.imageRing
                        )}
                        style={{
                          boxShadow: palette.imageShadow,
                        }}
                      >
                        <img
                          src={image.src || "/placeholder.svg"}
                          alt={image.alt}
                          className="w-full h-full object-cover object-left-top"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  )
}
