"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

/**
 * Hydration-safe dark flag for components that paint SVG or inline colors.
 *
 * The server and the first client render both report dark (the default look).
 * The real theme is applied after mount. Reading `resolvedTheme` during the
 * first client render makes React keep the server-rendered attributes on
 * light pages, which leaves dark-only strokes and fills in place.
 */
export function useIsDarkTheme(): boolean {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted ? resolvedTheme !== "light" : true
}
