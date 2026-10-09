import type { Metadata } from "next";

import {
  cardForRoute,
  cardForSlug,
  cardImagePath,
  homeCard,
  siteName,
  type ShareCard,
} from "@/lib/og-cards";

// One place for page titles and share cards. Each component page gets its
// own card (app/og/[card]), prerendered at build from the gallery preview.
export function shareMetadata(card: ShareCard, title: string): Metadata {
  const image = {
    url: cardImagePath(card),
    width: 1200,
    height: 630,
    alt: `${card.title} · ${siteName}`,
    type: "image/png",
  };

  return {
    title,
    description: card.description,
    alternates: { canonical: card.route },
    openGraph: {
      type: "website",
      siteName,
      title,
      description: card.description,
      url: card.route,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: card.description,
      images: [image],
    },
  };
}

export function componentMetadata(name: string, card?: ShareCard): Metadata {
  return shareMetadata(card ?? homeCard, `${name} — ${siteName}`);
}

function nameFromSegment(route: string) {
  const segment = route.split("/").filter(Boolean).pop() ?? "";
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function routeMetadata(route: string): Metadata {
  const card = cardForRoute(route);
  if (card) return componentMetadata(card.title, card);

  // A page with no card of its own shares the home card under its own name.
  const name = nameFromSegment(route);
  return componentMetadata(name, { ...homeCard, title: name, route });
}

export function slugMetadata(slug: string): Metadata {
  const card = cardForSlug(slug);
  return card ? componentMetadata(card.title, card) : {};
}
