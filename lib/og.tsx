import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CSSProperties, ReactNode } from "react";

import { ImageResponse } from "next/og";

import { mosaicPreviews, type ShareCard } from "@/lib/og-cards";

export const ogSize = { width: 1200, height: 630 };

// The house palette: near-black ground, warm off-white ink, one ember accent.
const GROUND = "#070707";
const PANEL = "#111111";
const INK = "#f4f2ee";
const MUTED = "#a3a3a3";
const FAINT = "#6b6b6b";
const HAIRLINE = "rgba(255, 255, 255, 0.10)";
const ACCENT = "#ec5c13";

// Satori reads TTF only. These are TTF builds of the library's own faces:
// Bjork Grotesk Display for names, Bjork Grotesk Alpha for text, Geist Mono
// for labels. The cards are prerendered at build (app/og/[card]), and
// next.config traces these files and the previews into the route as well.
const FONT_DIR = path.join(process.cwd(), "lib", "og-fonts");
const PREVIEW_DIR = path.join(process.cwd(), "public", "component-previews");

async function loadFonts() {
  const [display, text, mono] = await Promise.all([
    readFile(path.join(FONT_DIR, "BjorkGroteskDisplay-Medium.ttf")),
    readFile(path.join(FONT_DIR, "BjorkGroteskAlpha-Regular.ttf")),
    readFile(path.join(FONT_DIR, "GeistMono-Regular.ttf")),
  ]);
  return [
    { name: "Bjork Display", data: display, style: "normal" as const, weight: 500 as const },
    { name: "Bjork Text", data: text, style: "normal" as const, weight: 400 as const },
    { name: "Geist Mono", data: mono, style: "normal" as const, weight: 400 as const },
  ];
}

// Gallery previews (900 x 520, dark) live in public/component-previews.
async function loadPreview(slug: string) {
  try {
    const file = await readFile(path.join(PREVIEW_DIR, `${slug}.png`));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

const PREVIEW_RATIO = 520 / 900;

const mono: CSSProperties = {
  display: "flex",
  fontFamily: "Geist Mono",
  fontSize: 17,
  letterSpacing: 2.2,
  textTransform: "uppercase",
  color: FAINT,
};

// Small registration marks on the frame's corners, like a print sheet.
function Corner({ x, y }: { x: "left" | "right"; y: "top" | "bottom" }) {
  const line = `1px solid ${MUTED}`;
  const style: CSSProperties = {
    position: "absolute",
    display: "flex",
    width: 14,
    height: 14,
  };
  if (x === "left") Object.assign(style, { left: -1, borderLeft: line });
  else Object.assign(style, { right: -1, borderRight: line });
  if (y === "top") Object.assign(style, { top: -1, borderTop: line });
  else Object.assign(style, { bottom: -1, borderBottom: line });
  return <div style={style} />;
}

// The ground and the hairline frame every card shares. A backdrop, when
// given, runs full bleed under the frame.
function Sheet({ children, backdrop }: { children: ReactNode; backdrop?: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        background: GROUND,
        padding: 28,
        overflow: "hidden",
      }}
    >
      {backdrop}
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          border: `1px solid ${HAIRLINE}`,
        }}
      >
        {children}
        <Corner x="left" y="top" />
        <Corner x="right" y="top" />
        <Corner x="left" y="bottom" />
        <Corner x="right" y="bottom" />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ ...mono, fontSize: 16, letterSpacing: 1.2, textTransform: "none", color: FAINT }}>
      Björk UI · ui.isaiahbjork.com
    </div>
  );
}

// The CLI line, shortened to the registry name when the slug is long.
function installLine(registry: string) {
  const full = `npx shadcn add @bjork-ui/${registry}`;
  return full.length <= 40 ? full : `@bjork-ui/${registry}`;
}

function titleSize(title: string) {
  const longest = Math.max(...title.split(" ").map((word) => word.length));
  if (title.length <= 10 && longest <= 9) return 88;
  if (title.length <= 18 && longest <= 11) return 74;
  if (longest <= 13) return 62;
  return 54;
}

// A quiet field of dots for components without a still preview.
function dotField(width: number, height: number) {
  const gap = 22;
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(cx, cy);
  let dots = "";
  for (let y = gap / 2; y < height; y += gap) {
    for (let x = gap / 2; x < width; x += gap) {
      const d = Math.hypot(x - cx, y - cy) / reach;
      const alpha = Math.max(0, 0.42 - d * 0.46);
      if (alpha < 0.03) continue;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4" fill="#f4f2ee" fill-opacity="${alpha.toFixed(3)}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${dots}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function PreviewPanel({
  src,
  width,
  label,
}: {
  src: string | null;
  width: number;
  label: string;
}) {
  const height = Math.round(width * PREVIEW_RATIO);
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: width + 2,
        height: height + 2,
        borderRadius: 18,
        border: `1px solid ${HAIRLINE}`,
        background: PANEL,
        overflow: "hidden",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={width} height={height} alt="" style={{ display: "flex" }} />
      ) : (
        <div style={{ display: "flex", width, height, alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dotField(width, height)}
            width={width}
            height={height}
            alt=""
            style={{ position: "absolute", left: 0, top: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ ...mono, fontSize: 14, letterSpacing: 2.4, marginBottom: 16 }}>Live demo</div>
            <div
              style={{
                display: "flex",
                padding: "12px 22px",
                borderRadius: 999,
                border: `1px solid ${HAIRLINE}`,
                background: GROUND,
                fontFamily: "Geist Mono",
                fontSize: 20,
                color: INK,
              }}
            >
              {label}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export async function renderComponentCard(card: ShareCard) {
  const [fonts, preview] = await Promise.all([
    loadFonts(),
    card.preview ? loadPreview(card.preview) : Promise.resolve(null),
  ]);
  const size = titleSize(card.title);

  return new ImageResponse(
    (
      <Sheet>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "40px 40px 38px 46px",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: 380,
              paddingRight: 16,
            }}
          >
            <div style={{ ...mono }}>{`Björk UI / ${card.collection}`}</div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", width: 44, height: 3, background: ACCENT, marginBottom: 30 }} />
              <div
                style={{
                  display: "flex",
                  fontFamily: "Bjork Display",
                  fontWeight: 500,
                  fontSize: size,
                  lineHeight: 1.0,
                  letterSpacing: size >= 70 ? -2.4 : -1.6,
                  color: INK,
                }}
              >
                {card.title}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {card.registry ? (
                <div
                  style={{
                    ...mono,
                    fontSize: 15,
                    letterSpacing: 0,
                    textTransform: "none",
                    color: MUTED,
                    marginBottom: 14,
                  }}
                >
                  {installLine(card.registry)}
                </div>
              ) : null}
              <Brand />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <PreviewPanel src={preview} width={690} label={card.route} />
          </div>
        </div>
      </Sheet>
    ),
    { ...ogSize, fonts }
  );
}

// A tilted wall of real previews, full bleed on the right of the card.
async function Mosaic({ slugs, columns }: { slugs: string[]; columns: number }) {
  const sources = await Promise.all(slugs.map(loadPreview));
  const tileW = 340;
  const tileH = Math.round(tileW * PREVIEW_RATIO);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < sources.length; i += columns) rows.push(sources.slice(i, i + columns));

  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        left: 440,
        top: -96,
        transform: "rotate(-8deg)",
      }}
    >
      {rows.map((row, r) => (
        <div
          key={r}
          style={{
            display: "flex",
            marginBottom: 20,
            marginLeft: r % 2 === 1 ? -120 : 0,
          }}
        >
          {row.map((src, c) => (
            <div
              key={c}
              style={{
                display: "flex",
                width: tileW + 2,
                height: tileH + 2,
                marginRight: 20,
                borderRadius: 14,
                border: `1px solid ${HAIRLINE}`,
                background: PANEL,
                overflow: "hidden",
              }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} width={tileW} height={tileH} alt="" style={{ display: "flex" }} />
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Home and docs: the name over a wall of the library's own previews.
export async function renderIndexCard(variant: "home" | "docs") {
  const [fonts, mosaic] = await Promise.all([
    loadFonts(),
    Mosaic({ slugs: mosaicPreviews[variant], columns: 3 }),
  ]);
  const isHome = variant === "home";

  const backdrop = (
    <div
      style={{
        position: "absolute",
        display: "flex",
        left: 0,
        top: 0,
        width: 1200,
        height: 630,
      }}
    >
      {mosaic}
      {/* Fade the wall into the ground under the type. */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 0,
          top: 0,
          width: 1200,
          height: 630,
          backgroundImage: `linear-gradient(90deg, ${GROUND} 0%, ${GROUND} 38%, rgba(7,7,7,0.82) 52%, rgba(7,7,7,0.2) 74%, rgba(7,7,7,0) 100%)`,
        }}
      />
    </div>
  );

  return new ImageResponse(
    (
      <Sheet backdrop={backdrop}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "40px 46px 38px",
          }}
        >
          <div style={{ ...mono }}>{isHome ? "Björk UI / Components" : "Björk UI / Docs"}</div>
          <div style={{ display: "flex", flexDirection: "column", width: 540 }}>
            <div style={{ display: "flex", width: 44, height: 3, background: ACCENT, marginBottom: 30 }} />
            <div
              style={{
                display: "flex",
                fontFamily: "Bjork Display",
                fontWeight: 500,
                fontSize: isHome ? 120 : 104,
                lineHeight: 0.96,
                letterSpacing: -4,
                color: INK,
              }}
            >
              {isHome ? "Björk UI" : "Quick start"}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 26,
                fontFamily: "Bjork Text",
                fontSize: 27,
                lineHeight: 1.36,
                color: MUTED,
              }}
            >
              {isHome
                ? "Production-ready interface pieces. Copy a component, drop it into your app, tune the details."
                : "One command copies a component's source into your app, ready to tune."}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {isHome ? null : (
              <div
                style={{
                  ...mono,
                  fontSize: 15,
                  letterSpacing: 0,
                  textTransform: "none",
                  color: MUTED,
                  marginBottom: 14,
                }}
              >
                npx shadcn add @bjork-ui/donut-chart
              </div>
            )}
            <Brand />
          </div>
        </div>
      </Sheet>
    ),
    { ...ogSize, fonts }
  );
}

export function renderShareCard(card: ShareCard) {
  if (card.id === "home") return renderIndexCard("home");
  if (card.id === "docs") return renderIndexCard("docs");
  return renderComponentCard(card);
}
