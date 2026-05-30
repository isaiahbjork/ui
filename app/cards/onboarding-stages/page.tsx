"use client";

import { OnboardingStages } from "@/components/isaiahbjork/cards/onboarding-stages";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function Page() {
  const item = getGalleryItem("onboarding-stages");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A progress card for onboarding, launch checklists, and account setup flows. The component supports theme presets, size variants, motion timing, and button callbacks without requiring a separate wrapper."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { OnboardingStages } from "@/components/isaiahbjork/cards/onboarding-stages";

export function Demo() {
  return (
    <OnboardingStages
      theme="orange"
      variant="expanded"
      percentage={65}
      buttonText="Continue Setup"
      onButtonClick={() => console.log("continue")}
    />
  );
}`}
      previewScaleClassName="w-[620px] scale-[0.88]"
    >
      <div className="flex w-full max-w-xl flex-col items-center">
        <OnboardingStages
          onButtonClick={() => console.log("Continue setup clicked")}
          className="w-full max-w-md"
          theme="orange"
          variant="expanded"
          title="ONBOARDING"
          percentage={65}
          buttonText="Continue Setup"
          animationDuration={1500}
          staggerDelay={0.1}
          rounded="xl"
          showPercentage
          enableAnimations
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
