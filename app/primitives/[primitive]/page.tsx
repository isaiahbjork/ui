import { notFound } from "next/navigation";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { getPrimitiveMeta } from "../_components/primitive-meta";
import { PrimitivePageClient } from "../_components/primitive-page-client";

export default async function Page({
  params,
}: {
  params: Promise<{ primitive: string }>;
}) {
  const { primitive } = await params;
  const meta = getPrimitiveMeta(primitive);

  if (!meta) {
    notFound();
  }

  const item = getGalleryItem(`primitive-${primitive}`);

  if (!item) {
    notFound();
  }

  return <PrimitivePageClient slug={primitive} item={item} />;
}
