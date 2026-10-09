import { notFound } from "next/navigation";
import { componentMetadata } from "@/lib/component-metadata";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { getPrimitiveMeta } from "../_components/primitive-meta";
import { PrimitivePageClient } from "../_components/primitive-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ primitive: string }>;
}) {
  const { primitive } = await params;
  const item = getGalleryItem(`primitive-${primitive}`);

  return item ? componentMetadata(item.title) : {};
}

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
