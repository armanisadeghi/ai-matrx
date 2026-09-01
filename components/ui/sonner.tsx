"use client"

import { useEffect, useRef } from "react"
import { Toaster as Sonner, toast } from "sonner"
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

/**
 * 🚨 A TOAST THAT OUTLIVED ITS TAB IS A CLICK SHIELD OVER THE PAGE (FIX-11b).
 *
 * Sonner PAUSES a toast's dismiss timer while the document is hidden. In a
 * background tab — an agent browser pane, a second window, anything the person
 * is not looking at — nothing ever expires, so toasts stack. Measured live on
 * production: NINE stacked at once, and `document.elementFromPoint()` at the
 * centre of a sticky footer's Save button returned the sonner `<li>`, not the
 * button. The control was enabled, looked alive, and silently swallowed the
 * click. That is a dead control wearing an honest face, which the platform
 * forbids outright — and it is a strong candidate for the "a second save did
 * nothing / then broke" reports this fix wave was chasing.
 *
 * The rule, and it is this campaign's own (FIX-9): **the toast is the courtesy,
 * the panel is the record.** A notice about something that happened while
 * nobody was watching has already failed at being a notice; keeping it on
 * screen forever, on top of the page's primary action, is strictly worse than
 * dropping it. So when the tab comes back after being hidden long enough for
 * timers to have mattered, the backlog is cleared.
 *
 * Only the BACKLOG goes. A toast raised after the tab was visible again has a
 * running timer and is left alone.
 */
function useStaleToastSweepOnReturn() {
  const hiddenSince = useRef<number | null>(
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? Date.now()
      : null,
  )
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince.current ??= Date.now()
        return
      }
      const since = hiddenSince.current
      hiddenSince.current = null
      // Under a second is a tab flicker, not a backlog — and dismissing a toast
      // the person just watched appear would be its own small lie.
      if (since === null || Date.now() - since < 1000) return
      const stacked = document.querySelectorAll("li[data-sonner-toast]").length
      if (stacked === 0) return
      console.warn(
        `[toaster] dismissed ${stacked} toast(s) that could not expire while this tab was hidden — sonner pauses their timers, and a stacked toast sits on top of the page and swallows clicks. The screen itself carries the record; a toast is only the courtesy.`,
      )
      toast.dismiss()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeMode()
  useStaleToastHeightHeal()
  useStaleToastSweepOnReturn()

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
