import type { MDXComponents } from 'mdx/types'
import { Badge } from "@/components/ui/badge"

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Allows customizing built-in components, e.g. to add styling.
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-3xl font-semibold mb-4 text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-2xl font-semibold mb-3 text-foreground">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="text-base leading-relaxed mb-4 text-muted-foreground">
        {children}
      </p>
    ),
    a: ({ href, children, ...props }) => (
      <a
        href={href}
        className="text-primary hover:text-primary/80 transition-colors font-medium underline underline-offset-4 decoration-primary/30 hover:decoration-primary/60"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="space-y-2 mb-4">
        {children}
      </ul>
    ),
    li: ({ children }) => (
      <li className="flex items-center space-x-3">
        <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
        <span>{children}</span>
      </li>
    ),
    // Custom components
    Badge,
    ...components,
  }
} 