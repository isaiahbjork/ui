"use client";

import { motion, AnimatePresence, useReducedMotion, LayoutGroup } from "framer-motion";
import { useState, useEffect } from "react";
import { BookmarkIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewsCard {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  timeAgo: string;
  location: string;
  image: string;
  gradientColors?: string[];
  content?: string[];
}

interface StatusBar {
  id: string;
  category: string;
  subcategory: string;
  length: number; // 1-3 for different lengths
  opacity: number; // 0.3-1 for different opacities
}

interface NewsCardsProps {
  title?: string;
  subtitle?: string;
  statusBars?: StatusBar[];
  newsCards?: NewsCard[];
  enableAnimations?: boolean;
}

const defaultStatusBars: StatusBar[] = [
  {
    id: "1",
    category: "City Life",
    subcategory: "Transit",
    length: 3,
    opacity: 1,
  },
  {
    id: "2",
    category: "City Life",
    subcategory: "Transit",
    length: 2,
    opacity: 0.7,
  },
  {
    id: "3",
    category: "Science",
    subcategory: "Oceans",
    length: 1,
    opacity: 0.4,
  }
];

const abstractImage = (from: string, to: string, glow: string) =>
  `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='1600' height='900' fill='url(%23g)'/><circle cx='1120' cy='330' r='280' fill='${glow}' fill-opacity='.18'/><circle cx='520' cy='640' r='170' fill='%23f7f3ea' fill-opacity='.08'/></svg>`;

const defaultNewsCards: NewsCard[] = [
  {
    id: "1",
    title: "Port Alder council approves a riverside tram line for next spring",
    category: "City Life",
    subcategory: "Transit",
    timeAgo: "15 min ago",
    location: "Port Alder",
    image: abstractImage("%23ec5c13", "%23171717", "%23ec5c13"),
    gradientColors: ["from-[#ec5c13]/22", "to-[#8a7a60]/16"],
    content: [
      "The Port Alder city council voted on Tuesday to build a six-stop tram line along the old river wharf. Construction is scheduled to begin next spring, with the first trains expected to run within two years.",
      "Planners say the route will connect the ferry terminal, the market district and the northern housing estates. Early estimates put daily ridership at around twelve thousand, with most trips taking under fifteen minutes.",
      "Local shop owners raised concerns about several weeks of road closures during construction. The council said it will fund a temporary delivery corridor and a small business support scheme to offset the disruption.",
      "The project is expected to cost just under the amount set aside in the spring budget. A public consultation on station designs will open next month."
    ]
  },
  {
    id: "2",
    title: "Researchers map a new cold-water reef off the Halden coast",
    category: "Science",
    subcategory: "Oceans",
    timeAgo: "41 min ago",
    location: "Halden coast",
    image: abstractImage("%238a7a60", "%23171717", "%23f7f3ea"),
    gradientColors: ["from-[#ec5c13]/18", "to-[#171717]/18"],
    content: [
      "A survey team from the Halden Marine Institute has documented a previously unknown reef system at roughly 140 metres depth. The reef is built largely from slow-growing coral and sponge colonies.",
      "Using a remote camera sled over three weeks, the team recorded more than forty species, including several that had not been logged in the region before. Samples are being sent for genetic analysis.",
      "Marine biologists say the reef may serve as a refuge for fish populations during warm seasons, although they caution that its growth rate is very slow and that it will need protection from trawling.",
      "The institute plans to publish its full survey next year and has asked the regional government to consider a seasonal access limit for the area."
    ]
  },
  {
    id: "3",
    title: "Night market returns to the Lantern Quarter after a two-year break",
    category: "Culture",
    subcategory: "Food",
    timeAgo: "1 hour ago",
    location: "Lantern Quarter",
    image: abstractImage("%23ec5c13", "%238a7a60", "%23f7f3ea"),
    gradientColors: ["from-[#8a7a60]/18", "to-[#ec5c13]/12"],
    content: [
      "The Lantern Quarter night market reopens this weekend with about ninety stalls, after being paused since the redevelopment of its square. Organisers say the market will run every Friday and Saturday through the autumn.",
      "This year's lineup leans toward small producers, with bakers, fermentation makers and a growing number of stalls selling preserved fruit and tea. A rotating stage will host local musicians each evening.",
      "Residents have asked for quieter closing times, and the organisers have agreed to end music by ten o'clock on weeknights. Entry remains free, and a late bus route will run from the central station."
    ]
  }
];

export function NewsCards({
  title = "News Today",
  subtitle = "Stories from all over the world",
  statusBars = defaultStatusBars,
  newsCards = defaultNewsCards,
  enableAnimations = true,
}: NewsCardsProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<NewsCard | null>(null);
  const [bookmarkedCards, setBookmarkedCards] = useState<Set<string>>(new Set());
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const toggleBookmark = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarkedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const openCard = (card: NewsCard) => {
    setSelectedCard(card);
  };

  const closeCard = () => {
    setSelectedCard(null);
  };

  useEffect(() => {
    if (shouldAnimate) {
      const timer = setTimeout(() => setIsLoaded(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsLoaded(true);
    }
  }, [shouldAnimate]);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      }
    }
  };

  const headerVariants = {
    hidden: {
      opacity: 0,
      y: -20,
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
      }
    }
  };

  const statusBarContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.3,
      }
    }
  };

  const statusBarVariants = {
    hidden: {
      opacity: 0,
      scaleX: 0,
      x: -20,
    },
    visible: {
      opacity: 1,
      scaleX: 1,
      x: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25,
        scaleX: { type: "spring", stiffness: 400, damping: 30 }
      }
    }
  };

  const cardContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.8,
      }
    }
  };

  const cardVariants = {
    hidden: {
      opacity: 0,
      y: 30,
      scale: 0.9,
      filter: "blur(6px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 28,
        mass: 0.8,
      }
    }
  };

  return (
    <motion.div
      className="mx-auto w-full max-w-6xl p-6 text-foreground"
      initial={shouldAnimate ? "hidden" : "visible"}
      animate={isLoaded ? "visible" : "hidden"}
      variants={shouldAnimate ? containerVariants : {}}
    >
             {/* Header */}
       <motion.div
         className="mb-8"
         variants={shouldAnimate ? headerVariants : {}}
       >
         <h1 className="text-4xl font-bold mb-2">{title}</h1>
         <p className="text-muted-foreground text-lg">{subtitle}</p>

         {/* Simple Border Lines */}
         <motion.div
           className="mt-6 space-y-1"
           variants={shouldAnimate ? statusBarContainerVariants : {}}
         >
           {statusBars.map((bar, index) => (
             <motion.div
               key={bar.id}
             className={cn("h-0.5 rounded-full", bar.id === "1" ? "bg-[#ec5c13]" : bar.id === "2" ? "bg-[#ec5c13]/55" : "bg-[#8a7a60]/45")}
               style={{
                 opacity: bar.opacity,
                 width: `${(bar.length / 3) * 100}%`
               }}
               variants={shouldAnimate ? statusBarVariants : {}}
               initial={{ scaleX: 0 }}
               animate={{ scaleX: 1 }}
               transition={{
                 delay: 0.3 + (index * 0.1),
                 type: "spring",
                 stiffness: 400,
                 damping: 30
               }}
             />
           ))}
         </motion.div>
       </motion.div>

                    {/* News Cards with Shared Layout */}
       <LayoutGroup>
         <motion.div
           className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8"
           variants={shouldAnimate ? cardContainerVariants : {}}
         >
          {newsCards.map((card) => {
             if (selectedCard?.id === card.id) {
               return null; // Don't render the compact card when expanded
             }

             return (
               <motion.article
                 key={card.id}
                 layoutId={`card-${card.id}`}
                 className="group cursor-pointer overflow-hidden rounded-[20px] border border-[var(--bjork-border)] bg-[var(--bjork-surface)] text-[var(--bjork-text)] [box-shadow:var(--bjork-shadow-surface)] transition-[background-color,border-color,color,opacity,transform] duration-300 dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]"
                 variants={shouldAnimate ? cardVariants : {}}
                 whileHover={shouldAnimate ? {
                   y: -4,
                   scale: 1.01,
                   transition: { type: "spring", stiffness: 400, damping: 25 }
                 } : {}}
                 onClick={() => openCard(card)}
               >
                 {/* Image with gradient overlay */}
                 <motion.div
                   layoutId={`card-image-${card.id}`}
                   className="relative h-56 overflow-hidden bg-[var(--bjork-panel)] dark:bg-[#090909]"
                 >
                   <img
                     src={card.image}
                     alt={card.title}
                     className="w-full h-full object-cover transform-gpu group-hover:scale-105 transition-transform duration-700 ease-out"
                   />
                   <div className="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-background/80 to-transparent"></div>
                   {card.gradientColors && (
                     <div className={`absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t ${card.gradientColors[0]} ${card.gradientColors[1]} to-transparent`}></div>
                   )}

                   {/* Bookmark icon */}
                   <motion.div
                     className="absolute top-3 right-3"
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     transition={{ delay: 0.6, type: "spring", stiffness: 400, damping: 25 }}
                     whileHover={{ scale: 1.1 }}
                     whileTap={{ scale: 0.9 }}
                     onClick={(e) => toggleBookmark(card.id, e)}
                   >
                     <BookmarkIcon
                       className={`w-5 h-5 transition-colors cursor-pointer ${
                         bookmarkedCards.has(card.id)
                           ? 'fill-[#ec5c13] text-[#ec5c13]'
                           : 'text-white/80 hover:text-white'
                       }`}
                     />
                   </motion.div>

                   {/* Category and time info */}
                   <motion.div
                     className="absolute bottom-3 left-3 text-white"
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 25 }}
                   >
                     <div className="text-xs mb-1 opacity-90">
                       {card.category}, {card.subcategory}
                     </div>
                     <div className="text-xs opacity-75">
                       {card.timeAgo}, {card.location}
                     </div>
                   </motion.div>
                 </motion.div>

                 {/* Content */}
                 <motion.div
                   layoutId={`card-content-${card.id}`}
                   className="p-6"
                 >
                   <motion.h3
                     layoutId={`card-title-${card.id}`}
                     className="line-clamp-3 text-lg font-semibold leading-tight transition-colors group-hover:text-[#bd4514] dark:group-hover:text-[#d86a2c]"
                   >
                     {card.title}
                   </motion.h3>
                 </motion.div>
               </motion.article>
             );
           })}
         </motion.div>

         {/* Expanded Card Modal */}
         <AnimatePresence>
           {selectedCard && (
             <>
               {/* Backdrop */}
               <motion.div
                 className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={closeCard}
               />

               {/* Expanded Card */}
               <motion.div
                 layoutId={`card-${selectedCard.id}`}
                 className="fixed inset-4 z-50 overflow-hidden rounded-[20px] border border-[var(--bjork-border)] bg-[var(--bjork-surface)] text-[var(--bjork-text)] [box-shadow:var(--bjork-shadow-menu)] dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_24px_48px_-18px_rgba(0,0,0,0.95)] md:inset-8 lg:inset-16"
               >
                 {/* Close Button */}
                 <motion.button
                   className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/18 bg-[#090909]/78 text-white backdrop-blur-md transition-colors hover:bg-[#161616]"
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ delay: 0.2 }}
                   whileHover={{ scale: 1.1 }}
                   whileTap={{ scale: 0.9 }}
                   onClick={closeCard}
                 >
                   <X className="w-4 h-4" />
                 </motion.button>

                 <div className="h-full overflow-y-auto">
                   {/* Header Image */}
                   <motion.div
                     layoutId={`card-image-${selectedCard.id}`}
                     className="relative h-64 md:h-80"
                   >
                     <img
                       src={selectedCard.image}
                       alt={selectedCard.title}
                       className="w-full h-full object-cover"
                     />
                     <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/90 to-transparent"></div>
                     {selectedCard.gradientColors && (
                       <div className={`absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t ${selectedCard.gradientColors[0]} ${selectedCard.gradientColors[1]} to-transparent`}></div>
                     )}

                     {/* Image overlay info */}
                     <div className="absolute bottom-4 left-4 text-white">
                       <div className="text-sm mb-1 opacity-90">{selectedCard.category}, {selectedCard.subcategory}</div>
                       <div className="text-sm opacity-75">{selectedCard.timeAgo}, {selectedCard.location}</div>
                     </div>
                   </motion.div>

                   {/* Content */}
                   <motion.div
                     layoutId={`card-content-${selectedCard.id}`}
                     className="p-6 md:p-8"
                   >
                     <motion.h1
                       layoutId={`card-title-${selectedCard.id}`}
                       className="text-2xl md:text-3xl font-bold mb-6"
                     >
                       {selectedCard.title}
                     </motion.h1>

                     <motion.div
                       className="prose prose-lg max-w-none text-muted-foreground"
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ delay: 0.3, duration: 0.4 }}
                     >
                       {selectedCard.content ? (
                         selectedCard.content.map((paragraph, index) => (
                           <p key={index} className="mb-4">
                             {paragraph}
                           </p>
                         ))
                       ) : (
                         <>
                           <p className="mb-4">
                             Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                           </p>
                           <p className="mb-4">
                             Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                           </p>
                           <p className="mb-4">
                             Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
                           </p>
                           <p className="mb-4">
                             Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.
                           </p>
                           <p>
                             At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.
                           </p>
                         </>
                       )}
                     </motion.div>
                   </motion.div>
                 </div>
               </motion.div>
             </>
           )}
         </AnimatePresence>
       </LayoutGroup>
     </motion.div>
   );
}
