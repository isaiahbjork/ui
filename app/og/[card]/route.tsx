import { notFound } from "next/navigation";

import { renderShareCard } from "@/lib/og";
import { shareCards, getShareCard } from "@/lib/og-cards";

// Every card is drawn once at build and served as a static PNG. Nothing here
// runs per request, so the fonts and previews never have to ship with a function.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return shareCards.map((card) => ({ card: `${card.id}.png` }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ card: string }> }
) {
  const { card: file } = await params;
  const card = getShareCard(file.replace(/\.png$/, ""));

  if (!card) {
    notFound();
  }

  return renderShareCard(card);
}
