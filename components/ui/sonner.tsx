"use client"

import { useEffect } from "react"
import { Toaster as Sonner } from "sonner"
import { useThemeMode } from "@/styles/themes/useThemeMode"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Sonner measures a toast's height ONCE on mount (getBoundingClientRect) and
 * freezes it into --initial-height / --front-toast-height. If the toast mounts
 * while the window is hidden or zero-width (agent browser pane, background
 * boot), the text collapses into a ~34px-wide column and the recorded height is
 * thousands of px. Sonner never re-measures on resize, so the toast later
 * renders as a giant blank box that swallows clicks far outside its visible
 * content (height: var(--initial-height) applies in expanded/stacked states).
 *
 * This hook re-measures on resize/visibilitychange and corrects the CSS vars
 * in place. React's style diffing won't overwrite the manual DOM write because
 * sonner's own (stale) value is unchanged between renders.
 */
function useStaleToastHeightHeal() {
  useEffect(() => {
    const heal = () => {
      // Layout is valid whenever the viewport has width — visibility doesn't
      // matter (hidden documents still compute offsetHeight correctly).
      if (window.innerWidth === 0) return
      document
        .querySelectorAll<HTMLElement>("li[data-sonner-toast]")
        .forEach((li) => {
          const declared = parseFloat(li.style.getPropertyValue("--initial-height"))
          if (!Number.isFinite(declared)) return
          const prevHeight = li.style.height
          li.style.height = "auto"
          const actual = li.offsetHeight
          li.style.height = prevHeight
          if (actual > 0 && Math.abs(declared - actual) > 64) {
            li.style.setProperty("--initial-height", `${actual}px`)
            if (li.dataset.front === "true") {
              const ol = li.closest<HTMLElement>("ol[data-sonner-toaster]")
              ol?.style.setProperty("--front-toast-height", `${actual}px`)
            }
          }
        })
    }
    window.addEventListener("resize", heal)
    document.addEventListener("visibilitychange", heal)
    return () => {
      window.removeEventListener("resize", heal)
      document.removeEventListener("visibilitychange", heal)
    }
  }, [])
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeMode()
  useStaleToastHeightHeal()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
