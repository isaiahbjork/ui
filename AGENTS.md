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

```typescript
// ✅ Good - Hardware accelerated
animate={{ opacity: 1, scale: 1, y: 0 }}

// ❌ Bad - Triggers layout
animate={{ height: "auto", margin: "10px" }}
```

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

## Implementation Guidelines

### 14. **Component Structure**
- Always wrap animated components with motion elements
- Use AnimatePresence for mount/unmount animations
- Separate animation logic from business logic
- Create reusable animation variants

### 15. **Testing Animations**
- Test with reduced motion enabled
- Review animations the next day with fresh eyes
- Test interruption scenarios
- Verify performance on lower-end devices

### 16. **Animation Timing**
- **Micro-interactions**: 150-300ms
- **State transitions**: 300-500ms  
- **Page transitions**: 500-800ms
- **Reveal animations**: 400-600ms with stagger delays

Remember: Animations should feel effortless and enhance the user's mental model of the interface. When in doubt, err on the side of subtlety and performance.

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

### 17. **Sequential State Transitions**
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

### 18. **Contextual Animation Behavior**
Adapt animations based on interaction context:

```typescript
// Different hover animations based on component state
const hoverAnimation = !isExpanded 
  ? { scale: 1.05, y: -2 } // Playful when collapsed
  : { scale: 1.02 };        // Subtle when expanded

whileHover={hoverAnimation}
```

### 19. **Intelligent Exit Animations**
Remove problematic animations during state changes:

```typescript
// Clean exit without unwanted motion
exit={{ 
  opacity: 0,
  // NO y-translation during dock collapse!
  transition: { duration: 0.1, ease: "easeOut" }
}}
```

### 20. **Absolute Positioning for Complex Layouts**
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

### 21. **Dynamic Width Animations**
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

### 22. **Conditional Animation Variants**
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

### 23. **Input Focus Management**
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

### 24. **Progressive Enhancement Strategy**
Build components in layers for maximum compatibility:

1. **Static HTML structure** - Works without JavaScript
2. **Basic CSS transitions** - Smooth without Framer Motion
3. **Framer Motion enhancement** - Advanced spring physics
4. **Gesture integration** - Touch/drag interactions
5. **Accessibility refinements** - Screen reader optimizations

### 25. **Component Composition Patterns**
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

### 26. **Animation Performance Monitoring**
- Use browser DevTools Performance tab during development
- Monitor Composite layers in Rendering tab
- Avoid animations that trigger Layout or Paint
- Prefer `transform` and `opacity` for 60fps animations

### 27. **Conditional Rendering for Performance**
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

### 28. **Memory Management**
- Clean up event listeners in useEffect cleanup
- Use AnimatePresence properly to avoid memory leaks
- Avoid creating new animation objects on every render

Remember: These components go into production applications. Every animation should enhance the user experience while maintaining performance and accessibility standards.

---

## Theme-Aware Design & Component Lessons

### 29. **Always Use Theme-Aware Colors**
Our [globals.css](mdc:app/globals.css) defines comprehensive theme variables. **NEVER hardcode colors** - always use theme tokens:

```typescript
// ✅ Good - Theme aware
className="bg-background/60 border-border/50"
className="bg-muted text-muted-foreground"

// ❌ Bad - Hardcoded colors break themes
className="bg-black/20 border-gray-200"
className="bg-gray-100 text-gray-600"
```

### 30. **Blur Overlay Best Practices**
For backdrop blur overlays, use background theme colors instead of hardcoded black:

```typescript
// ✅ Good - Adapts to light/dark mode
className="absolute inset-0 bg-background/60 backdrop-blur-sm"

// ❌ Bad - Always dark, breaks light mode
className="absolute inset-0 bg-black/20 backdrop-blur-sm"
```

### 31. **Fast, Sophisticated Intro Animations**
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

### 32. **Sophisticated Blur-In Effects**
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

### 33. **Proper Border Styling**
Use theme-aware borders with proper opacity:

```typescript
// ✅ Good - Theme consistent
className="border border-border/50"
className="border-b border-border/50"

// ❌ Bad - Inconsistent with theme
className="border-gray-200"
className="border-background/40"
```

### 34. **Component Interface Best Practices**
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

### 35. **Export Convention**
Use named exports for reusable components:

```typescript
// ✅ Good - Named export for library components
export function HoverDetailCard({ ... }) { ... }

// ❌ Default export makes imports less explicit
export default function HoverDetailCard({ ... }) { ... }
```

### 36. **Essential UX Details**
Don't forget the small details that matter:

```typescript
// ✅ Good - Proper cursor states
className="cursor-pointer px-3 py-1.5 rounded-lg"

// ✅ Good - Proper alt text
alt={`${title} ${index + 1}`}

// ✅ Good - Semantic button elements
<motion.button> instead of <motion.div>
```

### 37. **Animation Performance Optimization**
Always consider performance implications:

```typescript
// ✅ Good - Hardware accelerated properties only
animate={{ scale: 0.85, opacity: 1 }}

// ✅ Good - Conditional animations
const shouldAnimate = enableAnimations && !shouldReduceMotion;

// ✅ Good - Transform-gpu for heavy elements
className="transform-gpu"
```

### 38. **Theme Variables Reference**
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

