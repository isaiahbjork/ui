import fs from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryUrl = "https://ui.isaiahbjork.com";
const homepage = "https://ui.isaiahbjork.com";

const ignoredPackages = new Set(["react", "react-dom", "next"]);
const binaryAssetExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".mp4",
  ".png",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const bjorkCssVars = {
  light: {
    "bjork-bg": "#f7f3ea",
    "bjork-surface": "#fffcf6",
    "bjork-surface-muted": "rgba(250, 246, 237, 0.94)",
    "bjork-surface-hover": "#f5efe3",
    "bjork-surface-active": "#efe7d8",
    "bjork-panel": "#f8f2e7",
    "bjork-menu": "rgba(255, 252, 246, 0.98)",
    "bjork-field": "rgba(255, 252, 246, 0.96)",
    "bjork-field-muted": "rgba(248, 242, 231, 0.82)",
    "bjork-field-inset": "rgba(239, 231, 216, 0.72)",
    "bjork-error-bg": "#fff0e8",
    "bjork-text": "#171717",
    "bjork-text-strong": "rgba(23, 23, 23, 0.9)",
    "bjork-text-medium": "rgba(23, 23, 23, 0.72)",
    "bjork-text-muted": "rgba(23, 23, 23, 0.52)",
    "bjork-text-soft": "rgba(23, 23, 23, 0.36)",
    "bjork-text-faint": "rgba(23, 23, 23, 0.22)",
    "bjork-inverted-text": "#fff8f0",
    "bjork-border": "#eee6db",
    "bjork-border-muted": "#f5ede2",
    "bjork-border-strong": "#e1d7c8",
    "bjork-thumb": "#a49b8e",
    "bjork-track": "#ded6ca",
    "bjork-accent": "#ec7d43",
    "bjork-accent-hover": "#f0935f",
    "bjork-accent-soft": "rgba(236, 125, 67, 0.1)",
    "bjork-accent-muted": "rgba(236, 125, 67, 0.2)",
    "bjork-accent-badge": "rgba(236, 125, 67, 0.16)",
    "bjork-accent-badge-foreground": "#8d421d",
    "bjork-accent-foreground": "#3f2112",
    "bjork-shadow-surface":
      "inset 0 7px 14px rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.92), inset 1px 0 0 rgba(88, 72, 49, 0.026), inset -1px 0 0 rgba(255, 255, 255, 0.68), 0 14px 22px -9px rgba(66, 52, 33, 0.11)",
    "bjork-shadow-soft":
      "inset 0 1px 0 rgba(88, 72, 49, 0.045), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.86)",
    "bjork-shadow-panel":
      "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.64), 0 18px 38px -30px rgba(66, 52, 33, 0.2)",
    "bjork-shadow-menu":
      "inset 0 1px 0 rgba(88, 72, 49, 0.04), inset 0 12px 24px rgba(88, 72, 49, 0.022), inset 1px 0 0 rgba(88, 72, 49, 0.024), inset -1px 0 0 rgba(255, 255, 255, 0.62), 0 22px 44px -26px rgba(66, 52, 33, 0.22)",
    "bjork-shadow-inset":
      "inset 0 1px 10px rgba(88, 72, 49, 0.12), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.72)",
    "bjork-ring-offset": "#f7f3ea",
  },
  dark: {
    "bjork-bg": "#111111",
    "bjork-surface": "#121212",
    "bjork-surface-muted": "rgba(22, 22, 22, 0.92)",
    "bjork-surface-hover": "#161616",
    "bjork-surface-active": "#202020",
    "bjork-panel": "#0d0d0d",
    "bjork-menu": "rgba(18, 18, 18, 0.98)",
    "bjork-field": "rgba(18, 18, 18, 0.95)",
    "bjork-field-muted": "rgba(18, 18, 18, 0.55)",
    "bjork-field-inset": "rgba(9, 9, 9, 0.75)",
    "bjork-error-bg": "#130d0a",
    "bjork-text": "#ededed",
    "bjork-text-strong": "rgba(237, 237, 237, 0.9)",
    "bjork-text-medium": "rgba(237, 237, 237, 0.72)",
    "bjork-text-muted": "rgba(237, 237, 237, 0.52)",
    "bjork-text-soft": "rgba(237, 237, 237, 0.36)",
    "bjork-text-faint": "rgba(237, 237, 237, 0.22)",
    "bjork-inverted-text": "#080808",
    "bjork-border": "#232323",
    "bjork-border-muted": "#1c1c1c",
    "bjork-border-strong": "#343434",
    "bjork-thumb": "#626262",
    "bjork-track": "#090909",
    "bjork-accent": "#ec5c13",
    "bjork-accent-hover": "#f07832",
    "bjork-accent-soft": "rgba(236, 92, 19, 0.12)",
    "bjork-accent-muted": "rgba(236, 92, 19, 0.24)",
    "bjork-accent-badge": "#ec5c13",
    "bjork-accent-badge-foreground": "#fff2ea",
    "bjork-accent-foreground": "#fff2ea",
    "bjork-shadow-surface":
      "inset 0 7px 14px rgba(255, 255, 255, 0.03), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.06), 0 14px 20px -6px rgba(0, 0, 0, 0.45)",
    "bjork-shadow-soft": "inset 0 1px 0 rgba(255, 255, 255, 0.045)",
    "bjork-shadow-panel":
      "inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 18px 36px -28px rgba(0, 0, 0, 0.9)",
    "bjork-shadow-menu":
      "inset 0 1px 0 rgba(255, 255, 255, 0.055), inset 0 12px 24px rgba(255, 255, 255, 0.018), inset 0 -18px 26px rgba(0, 0, 0, 0.24), 0 22px 42px -22px rgba(0, 0, 0, 0.9)",
    "bjork-shadow-inset": "inset 0 1px 10px rgba(0, 0, 0, 0.45)",
    "bjork-ring-offset": "#080808",
  },
};

const bjorkCss = {
  ".bjork-range": {
    "box-shadow":
      "inset 0 1px 1px rgba(255, 255, 255, 0.04), 0 0 14px rgba(189, 69, 20, 0.06)",
  },
  ".bjork-range::-webkit-slider-thumb": {
    appearance: "none",
    width: "16px",
    height: "8px",
    border: "0",
    "border-radius": "999px",
    background: "var(--bjork-thumb)",
    "box-shadow":
      "inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.42)",
  },
  ".bjork-range::-moz-range-thumb": {
    width: "16px",
    height: "8px",
    border: "0",
    "border-radius": "999px",
    background: "var(--bjork-thumb)",
    "box-shadow":
      "inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.42)",
  },
  ".bjork-layered-button-accent, .bjork-layered-button-raised": {
    position: "relative",
    isolation: "isolate",
    appearance: "none",
    overflow: "hidden",
    border: "0",
    "border-radius": "13px",
    "box-shadow":
      "inset 0 1px 0 #ffffff38, 0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a",
    transition: "filter 150ms ease-out, box-shadow 150ms ease-out",
  },
  ".bjork-layered-button-accent::after, .bjork-layered-button-raised::after": {
    position: "absolute",
    inset: "0",
    "pointer-events": "none",
    content: "\"\"",
    border: "1.5px solid transparent",
    "border-radius": "inherit",
    background:
      "linear-gradient(#ffffffb8, #0000003d 41% 75%, #ffffff47) border-box",
    "mix-blend-mode": "overlay",
    "-webkit-mask-image": "linear-gradient(#000, #000), linear-gradient(#000, #000)",
    "mask-image": "linear-gradient(#000, #000), linear-gradient(#000, #000)",
    "-webkit-mask-clip": "padding-box, border-box",
    "mask-clip": "padding-box, border-box",
    "-webkit-mask-origin": "padding-box, border-box",
    "mask-origin": "padding-box, border-box",
    "-webkit-mask-composite": "xor",
    "mask-composite": "exclude",
  },
  ".bjork-layered-button-accent": {
    color: "oklch(100% 0 0)",
    "text-shadow": "0 -1px #00000040",
    background:
      "radial-gradient(ellipse at -20px top, rgba(255, 255, 255, 0.14), transparent), linear-gradient(180deg, #ec5c13 0%, #ec5c13 62%, color-mix(in oklab, #ec5c13 84%, black 16%) 100%)",
  },
  ".bjork-layered-button-raised": {
    color: "oklch(100% 0 0)",
    "text-shadow": "0 -1px #00000026",
    background:
      "radial-gradient(ellipse at -20px top, #ffffff38, #fff0), linear-gradient(180deg, oklch(0.1881 0.006 265), oklch(0.5493 0.0081 265))",
  },
  ".dark .bjork-layered-button-raised": {
    color: "oklch(0.2574 0.0056 265)",
    "text-shadow": "0 -1px #00000026",
    background:
      "radial-gradient(ellipse at -20px top, #ffffff38, #fff0), linear-gradient(180deg, color-mix(in oklab, oklch(0.9674 0.0013 265) 80%, oklch(0.2574 0.0056 265) 20%), color-mix(in oklab, oklch(0.669 0.0107 265) 80%, oklch(0.2574 0.0056 265) 20%))",
  },
  "@media (hover: hover)": {
    ".bjork-layered-button-accent:hover": {
      filter: "brightness(1.08) saturate(1.04)",
    },
    ".bjork-layered-button-raised:hover": {
      filter: "brightness(1.08) contrast(0.9)",
    },
  },
};

const gallerySource = await readFile(
  path.join(root, "lib/bjork-gallery.ts"),
  "utf8",
);

const items = parseGalleryItems(gallerySource).map(createRegistryItem);
const registry = {
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  name: "bjork-ui",
  homepage,
  items,
};

await writeFile(
  path.join(root, "registry.json"),
  `${JSON.stringify(registry, null, 2)}\n`,
);

console.log(`Generated registry.json with ${items.length} items.`);
console.log(`Registry URL: ${registryUrl}/{name}.json`);

function parseGalleryItems(source) {
  return [...source.matchAll(/\{\n\s+id: "bjork[\s\S]*?\n\s+\},/g)]
    .map((match) => {
      const block = match[0];
      return {
        slug: readStringProperty(block, "slug"),
        title: readStringProperty(block, "title"),
        route: readStringProperty(block, "route"),
        sourcePath: readStringProperty(block, "sourcePath"),
        tier: readStringProperty(block, "tier"),
        collection: readStringProperty(block, "collection"),
      };
    })
    .filter((item) => item.slug && item.title && item.sourcePath);
}

function createRegistryItem(item) {
  const dependencyState = createDependencyState();
  collectFile(item.sourcePath, dependencyState);

  return stripEmpty({
    name: item.slug,
    type: "registry:component",
    title: item.title,
    description: describeItem(item),
    homepage: `${homepage}${item.route}`,
    dependencies: [...dependencyState.packages].sort(),
    cssVars: bjorkCssVars,
    css: bjorkCss,
    files: [...dependencyState.files].map(toRegistryFile),
    meta: {
      collection: item.collection,
      registryUrl: `${registryUrl}/${item.slug}.json`,
      installCommand: `npx shadcn@latest add ${registryUrl}/${item.slug}.json`,
    },
  });
}

function createDependencyState() {
  return {
    files: new Set(),
    packages: new Set(),
    seen: new Set(),
  };
}

function collectFile(relativePath, state) {
  const normalized = toPosixPath(relativePath);

  if (state.seen.has(normalized)) return;
  state.seen.add(normalized);

  if (shouldSkipFile(normalized)) return;

  const absolutePath = path.join(root, normalized);
  state.files.add(normalized);

  let source;

  try {
    source = readFileSyncUtf8(absolutePath);
  } catch {
    return;
  }

  for (const specifier of getImportSpecifiers(source)) {
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const resolved = resolveLocalImport(specifier, normalized);
      if (resolved) {
        collectFile(resolved, state);
      }
      continue;
    }

    const packageName = getPackageName(specifier);
    if (!packageName || ignoredPackages.has(packageName)) continue;

    state.packages.add(packageName);
  }

  for (const assetPath of getPublicAssetPaths(source)) {
    collectFile(`public${assetPath}`, state);
  }
}

function readFileSyncUtf8(filePath) {
  return globalThis.__registryFileCache?.get(filePath) ?? readFileCached(filePath);
}

function readFileCached(filePath) {
  globalThis.__registryFileCache ??= new Map();
  const value = fs.readFileSync(filePath, "utf8");
  globalThis.__registryFileCache.set(filePath, value);
  return value;
}

function getImportSpecifiers(source) {
  const imports = new Set();
  const importRegex =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

  for (const match of source.matchAll(importRegex)) {
    imports.add(match[1]);
  }

  return imports;
}

function getPublicAssetPaths(source) {
  const paths = new Set();
  const assetRegex =
    /["'`](\/(?:images|logos|stamps|textures|videos)\/[^"'`\s)]+)["'`]/g;

  for (const match of source.matchAll(assetRegex)) {
    const assetPath = match[1];
    const extension = path.extname(assetPath).toLowerCase();

    if (binaryAssetExtensions.has(extension)) continue;
    paths.add(assetPath);
  }

  return paths;
}

function resolveLocalImport(specifier, fromRelativePath) {
  const fromDirectory = path.dirname(path.join(root, fromRelativePath));
  const absoluteBase = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : path.resolve(fromDirectory, specifier);

  const candidates = [
    absoluteBase,
    `${absoluteBase}.tsx`,
    `${absoluteBase}.ts`,
    `${absoluteBase}.jsx`,
    `${absoluteBase}.js`,
    path.join(absoluteBase, "index.tsx"),
    path.join(absoluteBase, "index.ts"),
  ];

  for (const candidate of candidates) {
    const relative = toPosixPath(path.relative(root, candidate));
    if (!relative.startsWith("..") && fileExists(candidate)) {
      return relative;
    }
  }

  return null;
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function shouldSkipFile(relativePath) {
  return binaryAssetExtensions.has(path.extname(relativePath).toLowerCase());
}

function toRegistryFile(relativePath) {
  const file = {
    path: relativePath,
    type: getRegistryFileType(relativePath),
  };
  const target = getRegistryTarget(relativePath);

  if (target) file.target = target;

  return file;
}

function getRegistryFileType(relativePath) {
  if (relativePath.startsWith("components/ui/")) return "registry:ui";
  if (relativePath.startsWith("components/")) return "registry:component";
  if (relativePath.startsWith("hooks/")) return "registry:hook";
  if (relativePath.startsWith("lib/")) return "registry:lib";
  return "registry:file";
}

function getRegistryTarget(relativePath) {
  if (relativePath.startsWith("components/ui/")) {
    return `@ui/${relativePath.slice("components/ui/".length)}`;
  }

  if (relativePath.startsWith("components/")) {
    return `@components/${relativePath.slice("components/".length)}`;
  }

  if (relativePath.startsWith("hooks/")) {
    return `@hooks/${relativePath.slice("hooks/".length)}`;
  }

  if (relativePath.startsWith("lib/")) {
    return `@lib/${relativePath.slice("lib/".length)}`;
  }

  if (relativePath.startsWith("public/")) {
    return `~/${relativePath}`;
  }

  if (relativePath.startsWith("app/")) {
    return `~/${relativePath}`;
  }

  return undefined;
}

function getPackageName(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }

  return specifier.split("/")[0];
}

function describeItem(item) {
  if (item.collection === "Shaders") {
    return `${item.title} is a compact WebGL website shader from BJORK UI, packaged for shadcn registries.`;
  }

  return `${item.title} is a production-ready ${item.collection.toLowerCase()} component from BJORK UI, packaged for shadcn registries.`;
}

function readStringProperty(block, property) {
  return block.match(new RegExp(`${property}:\\s*"([^"]+)"`))?.[1] ?? "";
}

function stripEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) return entry.length > 0;
      return entry !== undefined && entry !== null && entry !== "";
    }),
  );
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}
