---
name: bjork-ui-design
description: Design rules for building interfaces in the Björk UI style. Dark base with colour on top, depth from light instead of hard lines, micro-motion that feels good, tabular type cut from Geist, charts that are good to touch, and the fewest taps to finish a task. Use when building or reviewing UI components, pages, charts, cards, tables or demos that should look and feel like Björk UI (ui.isaiahbjork.com).
---

# Björk UI design

Isaiah Bjorklund's design rules, as used across Björk UI (https://ui.isaiahbjork.com). The values below are the ones in the library's code. Where a token exists, use the token, never a copy of its value.

The short version: **a dark base with colour on top, edges made of light, motion you feel more than see, and nothing the user has to do that the interface could have done first.**

## 1. Principles

1. **Treat the page as a canvas.** Spacing, lines, colour and type are all decisions. Nothing is there by default.
2. **Dark base, colour on top.** Not black. A near-black stage, dark grey surfaces, an off-white text colour at a few strengths, and one warm accent. Status colours make things pop; neutrals do everything else.
3. **Depth from light, not lines.** A card's edge comes from a soft inset highlight and a shadow. A full-strength 1px border on a flat fill looks drawn. Light and shadow make it look lit.
4. **Micro-motion that earns its place.** Every press, open and number change should feel physical. Never do too much on one screen.
5. **Fewest taps.** Do the work before the user asks. Pre-select the likely answer, pre-compute the insight, open the thing they came for.
6. **Fast and mobile-friendly.** Load lazily into slots that already have their height. Stop loops off screen. Big enough targets on touch.

Influences: Emil Kowalski for motion craft, shadcn/ui as the baseline for spacing and clean surfaces, and the Vercel, Notion, OpenAI and 1X look: clean neutrals with status colour used to make things stand out.

## 2. Colour

### Dark (default)

| Role | Value |
|---|---|
| Page / stage | `#050505` page, `#111111` stage |
| Surface (cards, tables, rails) | `#121212` (`--bjork-surface`) |
| Raised / hover / active | `#161616` / `#161616` / `#202020` |
| Border, content surfaces | `#1c1c1c` (`--bjork-border-muted`) |
| Border, rails, groups, fields | `#232323` (`--bjork-border`) |
| Border, emphasis / hover | `#343434` (`--bjork-border-strong`) |
| Accent (ember) | `#ec5c13`; fill `#b84a12`; soft `rgba(236,92,19,0.12)` |
| Success / warning / error | `#4cc38a` / `#f2b544` / `#ff5c4d` |

### Text tiers

One text colour at several strengths, so hierarchy is nothing but value. Dark text is `#ededed`; light text is `#171717`.

| Tier | Dark | Light | Use |
|---|---|---|---|
| `--bjork-text` | 100% | 100% | Primary content |
| `--bjork-text-strong` | 90% | 90% | Headings on dense surfaces |
| `--bjork-text-medium` | 72% | 78% | Secondary content |
| `--bjork-text-muted` | 60% | 68% | Labels, metadata |
| `--bjork-text-soft` | 50% | 62% | The quietest text you are meant to read |
| `--bjork-text-faint` | 22% | 22% | Decoration, disabled, dividers. Never for text someone needs |

Every tier from soft up clears WCAG's 4.5:1 for body text on the surface it sits on (soft is about 4.7:1 on `#121212`). Check any new pairing; don't trust a round number.

### Light mode

Warm paper, never grey: page `#f7f5ef`, surface `#fffcf6`, raised `#f5efe3`, borders `#f5ede2` / `#eee6db` / `#e1d7c8`. Shadows in light mode are warm brown (`rgba(88,72,49,…)` and `rgba(66,52,33,…)`), because a grey shadow on warm paper looks dirty. The light accent is `#ec7d43`, with `#b4531f` for accent text.

### Status colour

Neutrals carry the layout. Status colour (success, warning, error, accent) is for the one thing that should pop: a live value, a state change, the selected item. If everything is coloured, nothing is.

## 3. Surfaces and depth

The canon surface is four layers on one element, with no wrappers or pseudo-elements:

1. A 1px border: `--bjork-border-muted` on content surfaces, `--bjork-border` on rails, groups and fields.
2. A 0.5px inset highlight along the top edge (the "second border" people notice without knowing why).
3. A soft inset glow falling from the top edge.
4. One soft drop shadow.

Layers 2 to 4 are one token, `--bjork-shadow-surface`:

```
dark:  inset 0 7px 14px rgba(255,255,255,0.03),
       inset 0 0.5px 0.5px rgba(255,255,255,0.06),
       0 14px 20px -6px rgba(0,0,0,0.45)

light: inset 0 7px 14px rgba(88,72,49,0.045),
       inset 0 0.5px 0.5px rgba(255,255,255,0.92),
       inset 1px 0 0 rgba(88,72,49,0.026),
       inset -1px 0 0 rgba(255,255,255,0.68),
       0 14px 22px -9px rgba(66,52,33,0.11)
```

Use exactly one elevation token per element:

| Token | For |
|---|---|
| `--bjork-shadow-surface` | Cards, accordions, tables, rails, primary fields |
| `--bjork-shadow-soft` | Quiet surfaces, secondary buttons |
| `--bjork-shadow-panel` | Large recessed panels |
| `--bjork-shadow-menu` | Anything floating: menus, popovers, tooltips, chart tooltips, toasts |
| `--bjork-shadow-inset` | Wells: inset fields, tracks, code blocks |

Rules:

- **No bare hairlines.** A 1px border with a fill and no inset layer is off-canon. It reads sharp next to everything else.
- **Hover changes fill and border, never the shadow.** The light in the room didn't move.
- **Components that pin their own tone** (canvas, SVG, anything that must look right in either theme) spread `surfaceVars(tone)` from `_core/surface.ts`, or read `BJORK_SURFACE[tone]`. Never keep a hand-typed copy of the tokens; copies drift.

## 4. Spacing and corners

- Spacing follows Tailwind's 4px steps, as shadcn does. Quiet surfaces, generous gaps, nothing fighting for attention.
- **Radius scale:** 24 preview stage · 22 options panel · 20 cards · 18 rails and tables · 16 menus · 13 controls · 12 / 10 chips · 8 / 6 badges. Pick from the scale; don't invent a 15.
- **Concentric corners:** an inner radius is the outer radius minus the padding between them (`r = R − p`). Equal radii make the gap bulge about 41% at every corner.
- Past 8px of padding the inner piece is content, not a nested part. Give it a radius from the scale, no more than `R − 8`.

## 5. Type

- **Faces:** Bjork Grotesk (a compact cut of Geist) for text and display; Geist Mono for labels, code and numerals.
- **Numbers are tabular** wherever they change: totals, prices, timers, table columns, chart readouts. A value that shuffles sideways as it ticks is noise.
- **Minimum sizes:**
  - Body text, values, buttons, chips, captions, any mixed-case or sans text: **11px minimum.**
  - Small uppercase labels in the mono face, with `0.1em` to `0.14em` letter-spacing: **10px minimum.**
  - Chart tick numerals in mono: 10px minimum.
- Headings track tight (around `-0.025em`); uppercase mono labels track wide.
- Hierarchy comes from the text tiers and weight before size. Don't add a new size when a tier will do.

## 6. Motion

Motion should feel physical and never get in the way. Import from `_core/motion.ts`; don't invent values.

| Thing | Value |
|---|---|
| Press | 140ms, scale to 0.97 (a whole card only to 0.995) |
| Tooltip | 160ms |
| Menu | 200ms |
| Panel | 280ms |
| Ease out | `cubic-bezier(0.23, 1, 0.32, 1)` |
| Ease in-out | `cubic-bezier(0.77, 0, 0.175, 1)` |
| Drawers and sheets | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Springs | `press` 500/30/0.6 · `snappy` 400/25/1 · `standard` 300/30/0.8 · `soft` 200/25/1.2 · `settle` 380/30/0.8 (stiffness / damping / mass) |

Rules:

- **Entrances** start at 0.9 scale or above, with a fade (and optionally a 4px blur). Never from `scale: 0`.
- **Never `transition: all`.** Name the properties. `all` catches layout properties you never meant to animate.
- **Interruptible.** Use springs for anything the user can reverse mid-way, and keep the velocity when they do.
- **Live numbers glide** to their new value from where they are. They never restart from zero.
- **Layout changes glide** (shared layout / FLIP) instead of jumping, with no bounce on structural moves.
- **When the motion is the point** (a split-flap board, a beam, a reveal), give it time to be seen. A change that's over in a blink reads as a glitch.
- **One moving idea per screen.** If two things are animating for attention at once, cut one.
- **Respect `prefers-reduced-motion`.** Autoplay stops; state changes snap or crossfade. Motion the user explicitly asks for (pressing "replay") may still play.

## 7. Charts

Charts should be informational, interactive and good to touch.

- **Palette (dark):** `#ec5c13` ember, `#d9d3c7` bone, `#8f877a` stone, `#5b8fb9` one cool counterpoint, `#b84a12` rust, `#f0a272` peach. Light: `#c94f10`, `#3a352d`, `#8a8174`, `#3f6f96`, `#8f3a0e`, `#d67a45`. Anchor on the accent, use neutral steps, keep one cool colour. Colour categories by rank so the largest series is ember.
- **Charts sit bare on the stage.** The chart is the content; don't box it in another card.
- **Tooltips** use the floating surface (`--bjork-shadow-menu` plus border), never a hard hairline box.
- **Touch:** chart surfaces use `touch-action: pan-y` so a vertical swipe still scrolls the page. A tap keeps its tooltip until the next tap, because the pointer leaves the moment the finger lifts.
- **Pre-compute the answer.** Find the deepest drawdown, the outlier or the biggest flow before the user looks, and select it.
- **Performance:** cap canvas pixel ratio at 2 (1.5 on touch screens) and stop every animation loop when the chart is off screen.

## 8. Fewest taps

- Count the taps to the thing the user came for, then remove one.
- Pre-render and pre-select what they'll most likely need.
- **Focus follows the person.** Move focus when the user opened something, never on page load. On phones a script-driven focus won't raise the keyboard anyway.
- Search should match what a thing does, not just what it's called.
- Hit targets are at least 44 × 44pt on touch screens.
- Hit Nielsen's limits: about 100ms feels instant, about 1s keeps the train of thought. Keep LCP under 2.5s, input response under 200ms, and layout shift near zero (lazy content loads into a slot that already has its height).

## 9. Demo pages (Björk UI library conventions)

- Demo options live in the demo shell's floating, draggable options panel at the top right (`controls` on `ComponentDemoShell`, with `ShellSegmented`, `ShellRange`, `ShellSwitch`, `ShellActions`). Never as a row of buttons inside the stage.
- Wide demos start with the panel closed (`optionsDefaultOpen={false}`) so it doesn't cover the component on a laptop.
- Components that only make sense on a desktop set `desktopOnly`; phones are sent to the index instead of shown a broken layout.
- Previews and share cards show the component as it really renders. Don't frame a component in a card it doesn't ship with.

## 10. Before you call it done

Open the page and look at it. Then ask:

- Does the softest text you're meant to read clear 4.5:1?
- Does the edge of every card come from light, or from a line?
- Do nested corners share a centre?
- Can every animation be interrupted, and does it keep its speed when it is?
- Does a live number glide to its new value, or restart?
- How many taps does it take to do the thing you came for?
- Is the work done before the user asks for it?
- If no rule told you, would you still see it was wrong?

The last one matters most. Rules get you to consistent. Feel is what's left when you stop checking and just use the thing.
