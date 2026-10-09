import { galleryItems, type GalleryItem } from "@/lib/bjork-gallery";
import { componentDescriptions } from "@/lib/component-descriptions";

export const siteUrl = "https://ui.isaiahbjork.com";
export const siteName = "Björk UI";
export const siteDescription =
  "A small archive of production-ready interface pieces. Copy a component, drop it into your app, and tune the details from there.";

export interface ShareCard {
  /** The card's file name under /og, without the extension. */
  id: string;
  title: string;
  collection: string;
  description: string;
  /** Path on the site, used for og:url. */
  route: string;
  /** Gallery preview under public/component-previews, when there is one. */
  preview?: string;
  /** Registry name for the install line. */
  registry?: string;
}

// Pages that are not in the gallery but still have their own route.
const extraRoutes: { route: string; collection: string }[] = [
  { route: "/travel/passport", collection: "Interactive" },
  { route: "/type/bjork-font", collection: "Type" },
  { route: "/navigation/sidebar-08", collection: "Navigation" },
];

function nameFromSegment(route: string) {
  const segment = route.split("/").filter(Boolean).pop() ?? "";
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function fallbackDescription(title: string, collection: string) {
  const kind = collection.toLowerCase();
  const article = /^[aeiou]/.test(kind) ? "an" : "a";
  return `${title}, ${article} ${kind} piece from Björk UI. Open it live, then copy the source into your app and tune it from there.`;
}

function cardFromItem(item: GalleryItem): ShareCard {
  return {
    id: item.slug,
    title: item.title,
    collection: item.collection,
    description:
      componentDescriptions[item.slug] ?? fallbackDescription(item.title, item.collection),
    route: item.route,
    preview: item.studio || item.slug.startsWith("shader-") ? undefined : item.slug,
    registry: item.slug,
  };
}

const componentCards: ShareCard[] = [
  ...galleryItems.filter((item) => item.route.startsWith("/")).map(cardFromItem),
  ...extraRoutes.map(({ route, collection }) => {
    const id = route.split("/").filter(Boolean).pop() ?? route;
    const title = nameFromSegment(route);
    return {
      id,
      title,
      collection,
      description: componentDescriptions[id] ?? fallbackDescription(title, collection),
      route,
    };
  }),
];

export const homeCard: ShareCard = {
  id: "home",
  title: siteName,
  collection: "Components",
  description: siteDescription,
  route: "/",
};

export const docsCard: ShareCard = {
  id: "docs",
  title: "Docs",
  collection: "Quick start",
  description:
    "Install any Björk UI component with the shadcn CLI: one command copies the source into your app, ready to tune.",
  route: "/docs",
};

export const shareCards: ShareCard[] = [homeCard, docsCard, ...componentCards];

export function getShareCard(id: string) {
  return shareCards.find((card) => card.id === id);
}

export function cardForRoute(route: string) {
  return componentCards.find((card) => card.route === route);
}

export function cardForSlug(slug: string) {
  return componentCards.find((card) => card.id === slug);
}

export function cardImagePath(card: ShareCard) {
  return `/og/${card.id}.png`;
}

/** Previews used on the home and docs cards, in reading order. */
export const mosaicPreviews = {
  home: [
    "agent-trace",
    "donut-chart",
    "lattice-orb",
    "periodic-table",
    "weight-wave",
    "message-dock",
    "candlestick-chart",
    "aperture-dive",
    "calendar-heatmap",
  ],
  docs: [
    "changelog-table",
    "app-dashboard-shell",
    "treemap",
    "approval-gate",
    "model-selector",
    "spreadsheet-grid",
  ],
};
