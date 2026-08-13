"use client"

import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * @radix-ui/react-hover-card 1.1.17 generates no ids of its own at all, and
 * Radix ids generally come from React's SSR-stable `useId`. The gate was
 * actively harmful — the Trigger wraps ALWAYS-VISIBLE content, so
 * `return null` deleted it from SSR and the first client paint. See
 * components/ui/context-menu/context-menu.tsx (the precedent fix, D144).
 */
const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardTrigger, HoverCardContent }
