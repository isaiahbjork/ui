"use client"

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell"
import { ProductRevealCard } from "@/components/bjork-ui/cards/product-reveal-card"
import { getGalleryItem } from "@/lib/bjork-gallery"

const item = getGalleryItem("product-reveal-card")

// Abstract, generated cover art: a warm field with concentric sound rings.
const COVER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a211a"/><stop offset="0.55" stop-color="#171412"/><stop offset="1" stop-color="#0d0c0b"/></linearGradient>
<radialGradient id="glow" cx="0.62" cy="0.46" r="0.55"><stop offset="0" stop-color="#ec5c13" stop-opacity="0.85"/><stop offset="0.35" stop-color="#c2491a" stop-opacity="0.42"/><stop offset="1" stop-color="#171412" stop-opacity="0"/></radialGradient>
<radialGradient id="core" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff3e3"/><stop offset="0.6" stop-color="#f3c39a"/><stop offset="1" stop-color="#e07a3c"/></radialGradient>
</defs>
<rect width="800" height="600" fill="url(#bg)"/>
<rect width="800" height="600" fill="url(#glow)"/>
<g fill="none" stroke="#f7f3ea" transform="translate(496 276)">
<circle r="64" stroke-opacity="0.5" stroke-width="1.5"/>
<circle r="108" stroke-opacity="0.32"/>
<circle r="156" stroke-opacity="0.2"/>
<circle r="208" stroke-opacity="0.12"/>
<circle r="264" stroke-opacity="0.07"/>
</g>
<circle cx="496" cy="276" r="34" fill="url(#core)"/>
<path d="M0 470 C 160 430 300 520 470 480 S 720 420 800 450 L800 600 L0 600Z" fill="#0d0c0b" fill-opacity="0.55"/>
</svg>`

const COVER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(COVER_SVG)}`

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A product reveal card for hover-led product storytelling, feature peeks, and compact commerce surfaces." previewScaleClassName="w-[560px] scale-[0.88]">
      <ProductRevealCard image={COVER_IMAGE} />
    </SimpleComponentDemoPage>
  )
}
