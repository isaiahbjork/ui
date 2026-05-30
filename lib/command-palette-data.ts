import { galleryItems } from "@/lib/bjork-gallery";
import { primitiveMeta } from "@/app/primitives/_components/primitive-meta";

export type CommandPaletteItemKind = "page" | "component" | "primitive" | "action";

export interface CommandPaletteItem {
  id: string;
  title: string;
  group: string;
  value: string;
  kind: CommandPaletteItemKind;
  route?: string;
  hint?: string;
  keywords?: string[];
  shortcut?: string;
}

const pageItems: CommandPaletteItem[] = [
  {
    id: "page-home",
    title: "Home",
    group: "Pages",
    value: "~ / Home",
    kind: "page",
    route: "/",
    hint: "/",
    keywords: ["index", "landing"],
  },
  {
    id: "page-components",
    title: "Component archive",
    group: "Pages",
    value: "~ /#components Component archive",
    kind: "page",
    route: "/#components",
    hint: "/#components",
    keywords: ["components", "gallery", "archive"],
  },
  {
    id: "page-install",
    title: "Quick start",
    group: "Pages",
    value: "~ /#install Quick start",
    kind: "page",
    route: "/#install",
    hint: "/#install",
    keywords: ["install", "docs"],
  },
  {
    id: "page-primitives",
    title: "Primitives",
    group: "Pages",
    value: "~ /primitives/button Primitives",
    kind: "page",
    route: "/primitives/button",
    hint: "/primitives/button",
    keywords: ["base ui", "shadcn"],
  },
];

const primitiveItems: CommandPaletteItem[] = primitiveMeta.map((item) => ({
  id: `primitive-${item.slug}`,
  title: item.title,
  group: "Primitives",
  value: `~ /primitives/${item.slug} ${item.title} ${item.interactionType}`,
  kind: "primitive",
  route: `/primitives/${item.slug}`,
  hint: item.interactionType,
  keywords: [item.slug, item.description, item.interactionDescription],
}));

const componentItems: CommandPaletteItem[] = galleryItems.map((item) => ({
  id: `component-${item.slug}`,
  title: item.title,
  group: "Components",
  value: `~ ${item.route} ${item.title} ${item.collection}`,
  kind: "component",
  route: item.route,
  hint: item.collection,
  keywords: [item.slug, item.id, item.collection, item.tier],
}));

export const commandPaletteItems: CommandPaletteItem[] = [
  ...pageItems,
  ...primitiveItems,
  ...componentItems,
];
