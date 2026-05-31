# Animation Design & Micro-Interaction Principles

## Local Preview Workflow

- Before starting a dev server for this repo, always check whether the existing Next preview is already listening on `localhost:3001`.
- If `localhost:3001` is running, reuse it for UI verification instead of starting another `npm run dev` instance.
- For local website UI changes in this repo, use the Codex in-app Browser plugin instead of Chrome unless the user explicitly asks for Chrome.

## Philosophy: Animations That Feel Right

Our components follow Emil Kowalski's principle that **great animations feel right**. Every animation should enhance the user experience, not detract from it. We build components that are satisfying to interact with and create cohesive experiences.

## Core Animation Principles

### 1. **Performance First - Hardware Acceleration**
- **ALWAYS use `transform` and `opacity`** for animations - they only trigger the composite step
- Avoid animating `margin`, `padding`, `width`, `height` - these trigger expensive layout/paint steps
- Use CSS or WAAPI for main thread independence when needed
- For Framer Motion, prefer spring animations over `requestAnimationFrame` dependent animations
- For predetermined motion that must stay smooth while the page is busy, prefer CSS animations/transitions or WAAPI over JavaScript-driven animation.
- When using Framer Motion under heavy load, prefer animating a full `transform` string or CSS variables that affect only the animated element; shorthand values like `x`, `y`, and `scale` are convenient, but can still depend on the main thread.

```typescript
// ✅ Good - Hardware accelerated
animate={{ opacity: 1, scale: 1, y: 0 }}

// ❌ Bad - Triggers layout
animate={{ height: "auto", margin: "10px" }}
```

### Animation Decision Framework
Before adding motion, answer these questions in order:

1. **Should this animate at all?**

| Frequency | Decision |
| --- | --- |
| 100+ times/day, such as keyboard shortcuts or command palette toggles | No animation |
| Tens of times/day, such as repeated hover effects or list navigation | Remove it or make it extremely subtle |
| Occasional, such as modals, drawers, popovers, and toasts | Standard fast UI animation |
| Rare or first-time, such as onboarding or celebratory feedback | Can include more delight |

- Never animate keyboard-initiated actions that users repeat constantly. The interface should feel instant and directly connected to input.
- If the only reason for an animation is "it looks cool" and users will see it often, remove it.

2. **What purpose does the animation serve?**

- Spatial consistency: an element enters and exits from a direction that matches the user's mental model.
- State indication: the animation clarifies that something changed.
- Explanation: motion teaches how a feature works.
- Feedback: press, hover, drag, and completion states confirm the UI heard the user.
- Softening a jarring change: appearance/disappearance should not feel broken.

3. **What easing should it use?**

- Entering or exiting UI: use `ease-out` so feedback starts immediately.
- Moving or morphing on screen: use `ease-in-out`.
- Hover and color changes: use `ease`.
- Constant motion: use `linear`.
- Avoid `ease-in` for UI interactions; the slow start makes the interface feel late.

Use stronger custom curves instead of relying only on weak built-in CSS easings:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

4. **How fast should it be?**

| Element | Duration |
| --- | --- |
| Button press feedback | 100-160ms |
| Tooltips and small popovers | 125-200ms |
| Dropdowns and selects | 150-250ms |
| Modals and drawers | 200-500ms |
| Marketing or explanatory motion | Can be longer |

As a rule, functional UI animation should usually stay under 300ms. Perceived performance matters: a 180ms select often feels meaningfully better than a 400ms one even when the state change is identical.

### 2. **Accessibility & Reduced Motion**
**ALWAYS respect user preferences** with `useReducedMotion()`:

```typescript
import { useReducedMotion } from "framer-motion"

const shouldReduceMotion = useReducedMotion()
const easing = shouldReduceMotion ? "linear" : "easeOut"
const duration = shouldReduceMotion ? 0.3 : 2.5
```

### 3. **Interruptible Animations**
- Use Framer Motion's natural interruptibility
- Prefer CSS transitions over keyframes for interruptible animations
- Allow state changes at any time during animation
- Prefer transitions for dynamic UI that may be retargeted rapidly; keyframes restart from zero and can feel brittle during repeated state changes.
- Use springs for gesture-driven motion because they preserve velocity when interrupted.

```typescript
// ✅ Interruptible spring animation
animate={{ 
  y: isExpanded ? 0 : -100,
  opacity: isExpanded ? 1 : 0 
}}
transition={{ 
  type: "spring",
  stiffness: 300,
  damping: 25 
}}
```

## Component Animation Patterns

### 4. **Building in Layers**
**Start with base functionality, then enhance with micro-animations:**

1. **Layer 1**: Basic state changes and layout
2. **Layer 2**: Entry/exit animations 
3. **Layer 3**: Hover/tap micro-interactions
4. **Layer 4**: Advanced orchestration and staggering

### 5. **Spring Physics for Natural Feel**
Use spring animations with carefully tuned values:

```typescript
// Standard spring for cards/panels
transition={{
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
}}

// Snappier for buttons/small elements
transition={{
  type: "spring", 
  stiffness: 400,
  damping: 25,
}}

// Softer for large movements
transition={{
  type: "spring",
  stiffness: 200,
  damping: 25,
  mass: 1.2,
}}
```

- Use springs for drag interactions, gesture interruption, decorative mouse-tracking, and elements that should feel physically responsive.
- Keep bounce subtle, usually `0.1-0.3`, and avoid bounce in serious UI unless it is tied to a gesture or intentionally playful moment.
- For decorative mouse tracking, smooth direct pointer values through `useSpring()` so the motion has momentum instead of snapping to the cursor.

### 6. **Micro-Interactions & Overshooting**
Add subtle overshooting and scaling for satisfying interactions:

```typescript
// Hover states with subtle overshoot
whileHover={{ 
  scale: 1.05,
  y: -2,
  transition: { type: "spring", stiffness: 400, damping: 25 }
}}

// Tap feedback
whileTap={{ scale: 0.98 }}

// Logo/icon playfulness
whileHover={{ 
  scale: 1.1, 
  rotate: 5,
  transition: { type: "spring", stiffness: 400, damping: 25 }
}}
```

- Any pressable element should have an immediate active state, usually `scale(0.95)` to `scale(0.98)`.
- Never animate elements from `scale(0)`. Use `scale(0.9)` or higher plus opacity so the element feels like it already has a physical presence.

### 7. **Staggered Animations**
Create sophisticated entrance effects:

```typescript
// Container with stagger
variants={{
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    }
  }
}}

// Individual items
variants={{
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 30 }
  }
}}
```

### 8. **Text Animations**
Sophisticated text reveals and morphing:

```typescript
// Letter-by-letter reveal
{text.split("").map((letter, index) => (
  <motion.span
    key={index}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{
      delay: index * 0.08,
      type: "spring",
      damping: 8,
      stiffness: 200,
      mass: 0.8,
    }}
  >
    {letter}
  </motion.span>
))}
```

### 9. **Easing & Timing**
Use sophisticated easing curves:

```typescript
// For elegant, slower animations
ease: [0.04, 0.62, 0.23, 0.98]

// For natural spring feel  
ease: "easeOut"

// For quick snappy interactions
ease: "easeInOut"
```

- Use custom curves such as `[0.23, 1, 0.32, 1]` for strong ease-out UI responses and `[0.77, 0, 0.175, 1]` for deliberate in-place movement.
- Do not use `ease-in` for dropdowns, popovers, or other interactive UI reveals because the delayed start feels unresponsive.

### 10. **Progressive Disclosure**
Animate height and opacity together for smooth reveals:

```typescript
variants={{
  hidden: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }
  },
  visible: {
    opacity: 1,
    height: "auto", 
    transition: { 
      duration: 0.4, 
      ease: [0.04, 0.62, 0.23, 0.98],
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
}}
```

- For enter animations in CSS, prefer `@starting-style` when browser support is acceptable. It avoids extra React mount state for simple entry transitions.
- When `height: auto` is necessary, keep it scoped and consider whether a transform, clip, or opacity treatment can avoid layout work.

## Advanced Patterns

### 11. **SVG & Path Animations**
For complex graphics and UI elements:

```typescript
// Path drawing animation
initial={{ pathLength: 0 }}
animate={{ pathLength: 1 }}
transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
```

### 12. **Gesture Integration**
Combine animations with user gestures:

```typescript
// Drag with spring back
drag="y"
dragConstraints={{ top: 0, bottom: 100 }}
dragElastic={0.1}
onDragEnd={(_, info) => {
  if (info.offset.y > 50) {
    // Trigger action
  }
}}
```

- For dismissible gestures, consider both distance and velocity. A fast flick should dismiss even if it does not cross the full distance threshold.
- Apply damping or friction when users drag beyond natural boundaries instead of using hard stops.
- Use pointer capture once dragging starts so the gesture continues even if the pointer leaves the element.
- Ignore additional touch points after the initial drag begins to prevent jumps during multi-touch interactions.

### 13. **Coordinated Multi-Element Animations**
Orchestrate multiple elements:

```typescript
// Sequenced timing for related elements
const parentVariants = {
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
      when: "beforeChildren"
    }
  }
}
```

### 14. **Popover, Tooltip, and Anchored UI Details**
- Popovers should scale from their trigger using the library-provided transform origin, such as `var(--radix-popover-content-transform-origin)` or `var(--transform-origin)`.
- Modals are the exception: keep modal transform origin centered because they are anchored to the viewport, not a trigger.
- Tooltips should have an initial delay to avoid accidental activation. Once one tooltip in a toolbar is open, adjacent tooltips should appear instantly with little or no animation.
- Use `translateY(100%)` or `translateX(100%)` when hiding an element by its own size; percentage transforms are relative to the element itself and adapt to content.

### 15. **Clip-Path Techniques**
- Use `clip-path: inset(...)` for high-quality reveals, hold-to-confirm overlays, comparison sliders, image reveals, and perfect active-tab color transitions.
- For active tab color transitions, duplicate the tab layer, style the copy as active, then clip the active layer to the selected tab instead of trying to synchronize independent color transitions.
- For hold-to-delete or hold-to-confirm, animate a clipped overlay from `inset(0 100% 0 0)` to `inset(0 0 0 0)` while the button is active, then snap it back quickly on release.

## Implementation Guidelines

### 16. **Component Structure**
- Always wrap animated components with motion elements
- Use AnimatePresence for mount/unmount animations
- Separate animation logic from business logic
- Create reusable animation variants

### 17. **Testing Animations**
- Test with reduced motion enabled
- Review animations the next day with fresh eyes
- Test interruption scenarios
- Verify performance on lower-end devices
- When performance matters, inspect whether the animation triggers layout or paint, not just whether it looks smooth on a fast machine.

### 18. **Animation Timing**
- **Micro-interactions**: 150-300ms
- **State transitions**: 300-500ms  
- **Page transitions**: 500-800ms
- **Reveal animations**: 400-600ms with stagger delays

Remember: Animations should feel effortless and enhance the user's mental model of the interface. When in doubt, err on the side of subtlety and performance.

## UI Review Format

When reviewing UI, animation, or interaction code, lead with a markdown table that compares the current implementation with the recommended change:

| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms var(--ease-out), opacity 200ms var(--ease-out)` | Specify exact properties and avoid animating unrelated work |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Elements should not appear from nothing |
| `ease-in` on a dropdown | `var(--ease-out)` | UI should respond immediately to input |
| No `:active` state | `transform: scale(0.97)` on press | Pressable controls need instant feedback |

Keep review findings concrete and tied to user-visible behavior, performance, accessibility, or maintainability.

---

## AI Chain of Thought Framework

When working on animation and component requests, follow this systematic approach:

### 🧠 **Phase 1: Understanding & Planning**
1. **Fully comprehend the user's request** - What exactly are they asking for?
2. **Identify the core problem** - Animation issue, component enhancement, or new feature?
3. **Assess the scope** - Is this a quick fix or a comprehensive refactor?
4. **Consider dependencies** - What files/components need to be examined?

### 🔍 **Phase 2: Investigation**
1. **Read relevant code files** - Use tools to examine current implementation
2. **Understand the existing animation structure** - What patterns are already in use?
3. **Identify potential issues** - Performance bottlenecks, accessibility concerns, etc.
4. **Plan the solution approach** - Layer-by-layer enhancement or complete rebuild?

### ⚡ **Phase 3: Execution**
1. **Implement changes systematically** - Start with core functionality, then enhance
2. **Apply animation principles** - Use the guidelines above for consistent quality
3. **Test and iterate** - Make adjustments based on expected behavior
4. **Document changes** - Explain the reasoning behind implementation choices

### 🎯 **Decision Framework**
- **Don't overanalyze** - Focus on the specific request, not every possible edge case
- **Execute efficiently** - Solve the immediate problem well, then enhance if needed
- **Think in layers** - Build solid foundation first, then add polish
- **Consider reusability** - Every component should be production-ready

---

## Production-Ready Component Architecture

Our components are designed for real-world applications. Every component must be:

### 🚀 **Immediately Usable**
- **TypeScript interfaces** - Full type safety and IntelliSense support
- **Comprehensive props** - Make everything configurable that should be configurable
- **Event handlers** - Proper callbacks for all interactive elements
- **Default values** - Sensible defaults that work out of the box

### 🔧 **Highly Configurable**
```typescript
// Example: MessageDock component structure
interface ComponentProps {
  // Core data
  items?: Item[];
  
  // Event handlers
  onAction?: (item: Item, index: number) => void;
  onStateChange?: (isOpen: boolean) => void;
  
  // Styling & layout
  className?: string;
  size?: "sm" | "md" | "lg";
  position?: "top" | "bottom" | "left" | "right";
  
  // Animation controls
  enableAnimations?: boolean;
  animationDuration?: number;
  
  // Behavior options
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  autoFocus?: boolean;
}
```

### 🎨 **Theme-Aware Design**
- **Support light/dark themes** - Conditional styling based on theme prop
- **Respect system preferences** - Auto theme detection when applicable
- **Accessible color contrast** - Ensure readability in all themes

### ♿ **Accessibility First**
- **useReducedMotion()** - Always respect user motion preferences
- **Keyboard navigation** - Full keyboard support for all interactions
- **ARIA labels** - Proper semantic markup and screen reader support
- **Focus management** - Logical tab order and focus indicators

---

## Advanced Micro-Animation Patterns

### 19. **Sequential State Transitions**
When multiple elements need coordinated timing:

```typescript
// Dock expansion with orchestrated hiding/showing
const dockVariants = {
  collapsed: {
    width: "auto",
    transition: {
      width: { type: "spring", stiffness: 500, damping: 35 },
      when: "afterChildren", // Wait for children to hide first
    }
  },
  expanded: {
    width: 448,
    transition: {
      width: { type: "spring", stiffness: 300, damping: 30 },
      when: "beforeChildren", // Expand container before showing children
    }
  }
}
```

### 20. **Contextual Animation Behavior**
Adapt animations based on interaction context:

```typescript
// Different hover animations based on component state
const hoverAnimation = !isExpanded 
  ? { scale: 1.05, y: -2 } // Playful when collapsed
  : { scale: 1.02 };        // Subtle when expanded

whileHover={hoverAnimation}
```

### 21. **Intelligent Exit Animations**
Remove problematic animations during state changes:

```typescript
// Clean exit without unwanted motion
exit={{ 
  opacity: 0,
  // NO y-translation during dock collapse!
  transition: { duration: 0.1, ease: "easeOut" }
}}
```

### 22. **Absolute Positioning for Complex Layouts**
When elements need to stay in place during transformations:

```typescript
// Selected character stays positioned while others animate away
className={cn(
  "relative",
  isSelected && isExpanded && "absolute left-1 top-1 z-20"
)}
style={{
  width: isSelected && isExpanded ? 0 : "auto",
  minWidth: isSelected && isExpanded ? 0 : "auto",
  overflow: "visible",
}}
```

### 23. **Dynamic Width Animations**
Smooth container resizing with spring physics:

```typescript
animate={{
  width: isExpanded ? expandedWidth : measuredCollapsedWidth,
}}
transition={{ 
  type: "spring", 
  stiffness: isExpanded ? 300 : 500, // Faster collapse
  damping: isExpanded ? 30 : 35,     // More damping for collapse
  mass: isExpanded ? 0.8 : 0.6,      // Lighter mass for snappier collapse
}}
```

### 24. **Conditional Animation Variants**
Enable/disable animations while maintaining functionality:

```typescript
const shouldAnimate = enableAnimations && !shouldReduceMotion;

<motion.div
  initial={shouldAnimate ? "hidden" : "visible"}
  animate="visible"
  variants={shouldAnimate ? containerVariants : {}}
  transition={shouldAnimate ? springTransition : { duration: 0 }}
>
```

### 25. **Input Focus Management**
Smooth focus transitions for form elements:

```typescript
// Auto-focus with delay to avoid layout jump
<motion.input
  autoFocus={autoFocus}
  initial={{ opacity: 0, x: 20 }}
  animate={{ 
    opacity: 1, 
    x: 0,
    transition: { delay: 0.2 } // Focus after animation settles
  }}
/>
```

### 26. **Progressive Enhancement Strategy**
Build components in layers for maximum compatibility:

1. **Static HTML structure** - Works without JavaScript
2. **Basic CSS transitions** - Smooth without Framer Motion
3. **Framer Motion enhancement** - Advanced spring physics
4. **Gesture integration** - Touch/drag interactions
5. **Accessibility refinements** - Screen reader optimizations

### 27. **Component Composition Patterns**
Structure components for maximum reusability:

```typescript
// Composable animation wrapper
const AnimatedContainer = ({ children, ...props }) => (
  <motion.div variants={containerVariants} {...props}>
    {children}
  </motion.div>
);

// Use in multiple contexts
<AnimatedContainer className="dock">
  <DockContent />
</AnimatedContainer>
```

## Performance Optimization Techniques

### 28. **Animation Performance Monitoring**
- Use browser DevTools Performance tab during development
- Monitor Composite layers in Rendering tab
- Avoid animations that trigger Layout or Paint
- Prefer `transform` and `opacity` for 60fps animations

### 29. **Conditional Rendering for Performance**
```typescript
// Only render heavy animations when needed
{isVisible && enableAnimations && (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
  />
)}
```

### 30. **Memory Management**
- Clean up event listeners in useEffect cleanup
- Use AnimatePresence properly to avoid memory leaks
- Avoid creating new animation objects on every render

Remember: These components go into production applications. Every animation should enhance the user experience while maintaining performance and accessibility standards.

---

## Theme-Aware Design & Component Lessons

### 31. **Always Use Theme-Aware Colors**
Our [globals.css](mdc:app/globals.css) defines comprehensive theme variables. **NEVER hardcode colors** - always use theme tokens:

```typescript
// ✅ Good - Theme aware
className="bg-background/60 border-border/50"
className="bg-muted text-muted-foreground"

// ❌ Bad - Hardcoded colors break themes
className="bg-black/20 border-gray-200"
className="bg-gray-100 text-gray-600"
```

### 32. **Blur Overlay Best Practices**
For backdrop blur overlays, use background theme colors instead of hardcoded black:

```typescript
// ✅ Good - Adapts to light/dark mode
className="absolute inset-0 bg-background/60 backdrop-blur-sm"

// ❌ Bad - Always dark, breaks light mode
className="absolute inset-0 bg-black/20 backdrop-blur-sm"
```

### 33. **Fast, Sophisticated Intro Animations**
Users prefer snappy animations. Target **1 second total** for complete entrance effects:

```typescript
// ✅ Good - Fast timing
const containerVariants = {
  visible: {
    transition: {
      staggerChildren: 0.08,     // Tight stagger
      delayChildren: 0.1,        // Quick start
    }
  }
}

// ❌ Too slow - Takes 2-3 seconds
staggerChildren: 0.15,
delayChildren: 0.8,
```

### 34. **Sophisticated Blur-In Effects**
Use blur + transform combinations for premium feel:

```typescript
// ✅ Premium blur-in animation
const itemVariants = {
  hidden: { 
    opacity: 0, 
    x: -25,
    scale: 0.95,
    filter: "blur(4px)",  // Key for sophistication
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 28,
      mass: 0.6,
    },
  },
}
```

### 35. **Proper Border Styling**
Use theme-aware borders with proper opacity:

```typescript
// ✅ Good - Theme consistent
className="border border-border/50"
className="border-b border-border/50"

// ❌ Bad - Inconsistent with theme
className="border-gray-200"
className="border-background/40"
```

### 36. **Component Interface Best Practices**
Always create comprehensive TypeScript interfaces for production components:

```typescript
interface ComponentProps {
  // Core content
  title?: string;
  subtitle?: string;
  
  // Visual customization
  primaryButton?: {
    text: string;
    color?: string;
    hoverColor?: string;
    textColor?: string;
  };
  
  // Behavior controls
  enableAnimations?: boolean;
  onAction?: () => void;
}
```

### 37. **Export Convention**
Use named exports for reusable components:

```typescript
// ✅ Good - Named export for library components
export function HoverDetailCard({ ... }) { ... }

// ❌ Default export makes imports less explicit
export default function HoverDetailCard({ ... }) { ... }
```

### 38. **Essential UX Details**
Don't forget the small details that matter:

```typescript
// ✅ Good - Proper cursor states
className="cursor-pointer px-3 py-1.5 rounded-lg"

// ✅ Good - Proper alt text
alt={`${title} ${index + 1}`}

// ✅ Good - Semantic button elements
<motion.button> instead of <motion.div>
```

### 39. **Animation Performance Optimization**
Always consider performance implications:

```typescript
// ✅ Good - Hardware accelerated properties only
animate={{ scale: 0.85, opacity: 1 }}

// ✅ Good - Conditional animations
const shouldAnimate = enableAnimations && !shouldReduceMotion;

// ✅ Good - Transform-gpu for heavy elements
className="transform-gpu"
```

### 40. **Theme Variables Reference**
Key theme tokens from our [globals.css](mdc:app/globals.css):

- **Backgrounds**: `bg-background`, `bg-card`, `bg-muted`
- **Borders**: `border-border`, `border-border/50`
- **Text**: `text-foreground`, `text-muted-foreground`
- **Interactive**: `bg-primary`, `bg-secondary`, `bg-accent`
- **States**: Use opacity variations like `/60`, `/80` for overlays

These tokens automatically adapt between light and dark modes, ensuring consistent theming across all components.

When working directly with SVGs use next-themes and the const isDark = theme === "dark" to determine the color of the svg.
- useTheme() to get the current theme.
This will ensure that the svg is always the correct color in both light and dark mode in our demos.
