import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getGalleryItem } from "@/lib/bjork-gallery";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const item = getGalleryItem(slug);

  if (!item) {
    return NextResponse.json({ error: "Component not found" }, { status: 404 });
  }

  const root = process.cwd();
  const sourcePath = path.join(root, item.sourcePath);
  const relativePath = path.relative(root, sourcePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  let source: string;

  try {
    source = await readFile(sourcePath, "utf8");
  } catch {
    return NextResponse.json(
      { error: "Source unavailable", path: item.sourcePath },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      source,
      path: item.sourcePath,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
