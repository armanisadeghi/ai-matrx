"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * Radix ids come from React's SSR-stable `useId` (verified against
 * @radix-ui/react-collapsible 1.1.14 / react-id 1.1.2). The gate was actively
 * harmful — the Trigger wraps ALWAYS-VISIBLE content, so `return null`
 * deleted it from SSR and the first client paint. See
 * components/ui/context-menu/context-menu.tsx (the precedent fix, D144).
 */
const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
