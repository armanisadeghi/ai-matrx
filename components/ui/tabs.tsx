"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/styles/themes/utils"

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * Radix ids come from React's SSR-stable `useId` (verified against
 * @radix-ui/react-tabs 1.1.15 / react-id 1.1.2). The gate was actively
 * harmful — it deleted the ENTIRE tab bar + active panel from SSR and the
 * first client paint. See components/ui/context-menu/context-menu.tsx
 * (the precedent fix, D144).
 */
const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground gap-1",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

/**
 * INACTIVE PANELS UNMOUNT — Radix's default, restored 2026-08-15 (D193).
 *
 * This wrapper used to hardcode `forceMount`, so every tab panel in the app was
 * live at all times: its effects ran, its fetches fired, its subscriptions
 * opened, and it registered whatever a mounted component registers — while
 * invisible. That is not a theoretical cost. On the agent-apps executions page
 * both tabs' tables registered a `SurfaceRuntimeProvider` for the same surface
 * at the same depth, and the HIDDEN tab won the tie-break, so agents on the
 * visible tab were handed the other tab's rows (D194).
 *
 * `forceMount` is now OPT-IN: pass it on the panels that genuinely must survive
 * a tab switch — an in-flight editor, a scroll position, a live stream that
 * must not be torn down. The `data-[state=inactive]:hidden` class stays
 * unconditionally (it is inert when the panel unmounts), so passing the prop is
 * the whole opt-in; you do not also have to restore the hiding.
 *
 * Do NOT reach for `forceMount` to preserve a form draft. Lift that state to
 * the component that owns the `<Tabs>` — the panel is then free to unmount and
 * the draft survives a close/reopen too, which force-mounting never gave you.
 */
const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "data-[state=inactive]:hidden",
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))

TabsContent.displayName = TabsPrimitive.Content.displayName

const TabsTriggerCore = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
))
TabsTriggerCore.displayName = TabsPrimitive.Trigger.displayName



export { Tabs, TabsList, TabsTrigger, TabsContent, TabsTriggerCore }
