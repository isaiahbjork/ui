"use client";

import { ProjectCards } from "@/components/bjork-ui/cards/project-cards";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

interface Project {
  id: string;
  title: string;
  pricePerHour: string;
  status: "Paid" | "Not Paid";
  categories: string[];
  description: string;
  location: string;
  timeAgo: string;
  logoColor: string;
  logoIcon: string;
}

const projects: Project[] = [
  {
    id: "1",
    title: "Web development project",
    pricePerHour: "$85/hour",
    status: "Paid",
    categories: ["Remote", "Part-time"],
    description:
      "Frontend implementation, backend wiring, and third-party API integration for a dashboard workflow.",
    location: "Germany",
    timeAgo: "2h ago",
    logoColor: "bg-[#5a4538]",
    logoIcon: "W",
  },
  {
    id: "2",
    title: "Copyright review",
    pricePerHour: "$120/hour",
    status: "Not Paid",
    categories: ["Remote"],
    description:
      "Legal documentation and asset-rights cleanup for a digital product launch.",
    location: "United States",
    timeAgo: "5h ago",
    logoColor: "bg-gray-700",
    logoIcon: "C",
  },
  {
    id: "3",
    title: "Interface design pass",
    pricePerHour: "$95/hour",
    status: "Paid",
    categories: ["Remote", "Full-time"],
    description:
      "Responsive product UI redesign with card motion, status states, and route-level polish.",
    location: "Canada",
    timeAgo: "1d ago",
    logoColor: "bg-[#34302b]",
    logoIcon: "D",
  },
];

export default function Page() {
  const item = getGalleryItem("project-cards");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Expandable project cards for marketplaces, work boards, or internal assignment queues. Each card keeps the scan-friendly summary visible and progressively reveals detail on selection."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { ProjectCards } from "@/components/bjork-ui/cards/project-cards";

export function Demo() {
  return <ProjectCards projects={projects} />;
}`}
      previewScaleClassName="w-[820px] scale-[0.86]"
    >
      <div className="w-full max-w-3xl">
        <ProjectCards projects={projects} />
      </div>
    </SimpleComponentDemoPage>
  );
}
