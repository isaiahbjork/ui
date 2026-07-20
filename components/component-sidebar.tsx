"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

interface ComponentRoute {
  name: string;
  path: string;
  description?: string;
}

interface ComponentGroup {
  title: string;
  routes: ComponentRoute[];
  collapsible?: boolean;
}

const componentRoutes: ComponentGroup[] = [
  {
    title: "Docs",
    routes: [{ name: "Introduction", path: "/docs" }],
  },
  {
    title: "UI Primitives",
    routes: [
      { name: "Accordion", path: "/primitives/accordion" },
      { name: "Alerts", path: "/primitives/alerts" },
      { name: "Avatar", path: "/primitives/avatar" },
      { name: "Badge", path: "/primitives/badge" },
      { name: "Breadcrumb", path: "/primitives/breadcrumb" },
      { name: "Button", path: "/primitives/button" },
      { name: "Button Group", path: "/primitives/button-group" },
      { name: "Calendar", path: "/primitives/calendar" },
      { name: "Card", path: "/primitives/card" },
      { name: "Checkbox", path: "/primitives/checkbox" },
      { name: "Collapsible", path: "/primitives/collapsible" },
      { name: "Combobox", path: "/primitives/combobox" },
      { name: "Data Table", path: "/primitives/data-table" },
      { name: "Date Picker", path: "/primitives/date-picker" },
      { name: "Dialog", path: "/primitives/dialog" },
      { name: "Dropdown Menu", path: "/primitives/dropdown-menu" },
      { name: "Form", path: "/primitives/form" },
      { name: "Input", path: "/primitives/input" },
      { name: "Input Mask", path: "/primitives/input-mask" },
      { name: "Input OTP", path: "/primitives/input-otp" },
      { name: "Pagination", path: "/primitives/pagination" },
      { name: "Popover", path: "/primitives/popover" },
      { name: "Radio Group", path: "/primitives/radio-group" },
      { name: "Select", path: "/primitives/select" },
      { name: "Sheet", path: "/primitives/sheet" },
      { name: "Slider", path: "/primitives/slider" },
      { name: "Sonner", path: "/primitives/sonner" },
      { name: "Switch", path: "/primitives/switch" },
      { name: "Table", path: "/primitives/table" },
      { name: "Tabs", path: "/primitives/tabs" },
      { name: "Textarea", path: "/primitives/textarea" },
      { name: "Tooltip", path: "/primitives/tooltip" },
    ],
  },
  {
    title: "AI Components",
    routes: [
      { name: "AI Voice Input", path: "/ai/ai-voice-input" },
    ],
  },
  {
    title: "Cards & Lists",
    routes: [
      { name: "Animated Card Options", path: "/cards/animated-card-options" },
      {
        name: "Animated Card Status List",
        path: "/cards/animated-card-status-list",
      },
      { name: "Audio Upload Card", path: "/cards/audio-upload-card" },
      {
        name: "Bonuses Incentives Card",
        path: "/cards/bonuses-incentives-card",
      },
      { name: "Coach Scheduling", path: "/cards/coach-scheduling" },
      {
        name: "Dashboard Card with Modal",
        path: "/cards/dashboard-card-modal",
      },
      { name: "Event Countdown Card", path: "/cards/event-countdown-card" },
      { name: "Hover Detail Card", path: "/cards/hover-detail-card" },
      { name: "News Cards", path: "/cards/news-cards" },
      { name: "Onboarding Stages", path: "/cards/onboarding-stages" },
      { name: "Prediction Market Card", path: "/cards/prediction-market-card" },
      { name: "Product Reveal Card", path: "/cards/product-reveal-card" },
      { name: "Profile Hover Card", path: "/cards/profile-hover-card" },
      { name: "Project Cards", path: "/cards/project-cards" },
      { name: "Video Upload Card", path: "/cards/video-upload-card" },
    ],
  },
  {
    title: "Charts & Data",
    routes: [
      { name: "Animated Radial Chart", path: "/charts/animated-radial-chart" },
    ],
  },
  {
    title: "Heroes",
    routes: [
      { name: "Video Scroll Hero", path: "/heroes/video-scroll-hero" },
    ],
  },
  {
    title: "Shaders",
    collapsible: true,
    routes: [
      { name: "Aurora Veil", path: "/shaders/aurora-veil" },
      { name: "Kinetic Dots", path: "/shaders/kinetic-dots" },
    ],
  },
  {
    title: "Text",
    routes: [
      { name: "Reveal Text", path: "/heroes/reveal-text" },
    ],
  },
  {
    title: "HUD",
    collapsible: true,
    routes: [
      { name: "Glitchy 404", path: "/hud/glitchy-404" },
      { name: "HUD Button", path: "/hud/hud-button" },
      { name: "HUD Frame", path: "/hud/base" },
      { name: "HUD Graph", path: "/hud/hud-graph" },
      { name: "Overlay 2", path: "/hud/hud-2" },
      { name: "HUD Status", path: "/hud/hud-status" },
      { name: "Warning Graphic", path: "/hud/warning-graphic" },
    ],
  },
  {
    title: "Interactive Elements",
    routes: [
      { name: "Animated Download", path: "/buttons/animated-download" },
      { name: "Animated Status Badge", path: "/badges/animated-status-badge" },
      { name: "Draggable Rope", path: "/interactive/draggable-rope" },
      { name: "Gradient Selector", path: "/dropdowns/gradient-selector" },
      { name: "Message Dock", path: "/hud/message-dock" },
      { name: "Voice Powered Orb", path: "/interactive/voice-powered-orb" },
    ],
  },
  {
    title: "Layout & Navigation",
    routes: [
      { name: "Ruler Carousel", path: "/galleries/ruler-carousel" },
    ],
  },
  {
    title: "Media & Gallery",
    routes: [
      { name: "Hover Image Gallery", path: "/galleries/hover-image-gallery" },
      { name: "Portfolio Gallery", path: "/galleries/portfolio-gallery" },
    ],
  },
  {
    title: "Tables",
    routes: [
      { name: "Contacts Table", path: "/tables/contacts-table" },
      { name: "Financial Table", path: "/tables/financial-table" },
      { name: "Leads Table", path: "/tables/leads-table" },
      { name: "Periodic Table", path: "/tables/periodic-table" },
      { name: "Resizable Table", path: "/tables/resizable-table" },
      { name: "Server Management Table", path: "/tables/server-management" },
    ],
  },
];

interface ComponentSidebarProps {
  className?: string;
}

export function ComponentSidebar({ className }: ComponentSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["Charts & Data", "Tables"])
  );
  const [isOpen, setIsOpen] = useState(false);
  const [prefetchedRoutes, setPrefetchedRoutes] = useState<Set<string>>(
    new Set()
  );

  const toggleGroup = (groupTitle: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupTitle)) {
      newExpanded.delete(groupTitle);
    } else {
      newExpanded.add(groupTitle);
    }
    setExpandedGroups(newExpanded);
  };

  // Optimized hover prefetching with debounce and deduplication
  const handleHoverPrefetch = useCallback(
    (routePath: string) => {
      // Only prefetch if we haven't already prefetched this route
      if (!prefetchedRoutes.has(routePath)) {
        // Use Next.js router.prefetch for better integration
        router.prefetch(routePath);
        setPrefetchedRoutes((prev) => new Set([...prev, routePath]));
      }
    },
    [router, prefetchedRoutes]
  );

  const sidebarContent = (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Components</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6 py-4 overflow-auto">
        <div className="space-y-2">
          {componentRoutes.map((group) => (
            <div key={group.title}>
              {group.collapsible ? (
                <Button
                  variant="ghost"
                  className="w-full justify-between px-2 py-1.5 h-auto text-sm font-medium"
                  onClick={() => toggleGroup(group.title)}
                >
                  {group.title}
                  {expandedGroups.has(group.title) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <div className="px-2 py-1.5 text-sm font-medium text-foreground">
                  {group.title}
                </div>
              )}

              {(!group.collapsible || expandedGroups.has(group.title)) && (
                <div className="ml-2 space-y-1.5">
                  {group.routes.map((route) => (
                    <Link key={route.path} href={route.path} prefetch={false}>
                      <Button
                        variant={
                          pathname === route.path ? "secondary" : "ghost"
                        }
                        className="w-full justify-start px-2 py-1.5 h-auto text-sm font-normal cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => setIsOpen(false)}
                        onMouseEnter={() => handleHoverPrefetch(route.path)}
                      >
                        {route.name}
                      </Button>
                    </Link>
                  ))}
                </div>
              )}

              {group !== componentRoutes[componentRoutes.length - 1] && (
                <Separator className="my-2" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="outline"
        size="sm"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Single Sidebar - responsive */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-80 bg-card border-r border-border",
          "transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          className
        )}
      >
        {sidebarContent}
      </div>

      {/* Desktop spacer */}
      <div className="hidden lg:block w-80 flex-shrink-0" />
    </>
  );
}
