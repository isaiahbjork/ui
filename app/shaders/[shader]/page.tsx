import { notFound } from "next/navigation";
import { WebsiteShaderDemo } from "@/components/bjork-ui/shaders/website-shader";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

const shaderIds = [
  "aurora-veil",
  "kinetic-dots",
] as const;

export function generateStaticParams() {
  return shaderIds.map((shader) => ({
    shader,
  }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ shader: string }>;
}) {
  const { shader } = await params;

  if (!shaderIds.includes(shader as (typeof shaderIds)[number])) {
    notFound();
  }
  const shaderId = shader as (typeof shaderIds)[number];

  const item = getGalleryItem(`shader-${shaderId}`);

  if (!item) {
    notFound();
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A compact, single-draw WebGL shader for website backdrops, hero accents, cards, and product moments. It caps pixel density, avoids textures, respects reduced motion, and pauses when offscreen."
      dependencies={["React", "WebGL", "framer-motion", "next-themes", "lucide-react", "clsx"]}
      usageCode={`import { WebsiteShaderCanvas } from "@/components/bjork-ui/shaders/website-shader";

export function HeroBackdrop() {
  return (
    <WebsiteShaderCanvas
      preset="${shaderId}"
      className="h-[420px] w-full rounded-2xl"
      maxPixelRatio={1.35}
      maxCanvasPixels={620000}
    />
  );
}`}
      previewScaleClassName="w-[920px] scale-[0.9]"
      previewInnerClassName="p-3 sm:p-6"
    >
      <WebsiteShaderDemo
        preset={shaderId}
        className="w-[860px] max-w-none lg:w-full lg:max-w-[900px]"
      />
    </SimpleComponentDemoPage>
  );
}
