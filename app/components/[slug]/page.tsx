import { notFound } from "next/navigation";
import { componentMetadata } from "@/lib/component-metadata";
import { galleryItems, getGalleryItem } from "@/lib/bjork-gallery";
import { ComponentDetailClient } from "./component-detail-client";

export function generateStaticParams() {
  return galleryItems.map((item) => ({
    slug: item.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = getGalleryItem(slug);

  return item ? componentMetadata(item.title) : {};
}

export default async function ComponentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = getGalleryItem(slug);

  if (!item) {
    notFound();
  }

  return <ComponentDetailClient item={item} items={galleryItems} />;
}
