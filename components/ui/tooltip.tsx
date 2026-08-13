"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/styles/themes/utils";
import { useNestedPortalContainer } from "@/hooks/use-nested-portal-container";

const TooltipProvider = TooltipPrimitive.Provider;

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * Radix ids come from React's SSR-stable `useId` (verified against
 * @radix-ui/react-tooltip 1.2.10 / react-id 1.1.2). The gate was actively
 * harmful — the Trigger wraps ALWAYS-VISIBLE content, so `return null` deleted
 * the wrapped subtree from SSR and the first client paint. See
 * components/ui/context-menu/context-menu.tsx (the precedent fix, D144).
 */
const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const portalContainer = useNestedPortalContainer();
  return (
    <TooltipPrimitive.Portal container={portalContainer}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // Neutral, theme-aware surface (popover tokens) so tooltip text is
          // ALWAYS legible in both light and dark mode — including rich content
          // that uses `text-muted-foreground`. A brand-colored `bg-primary`
          // background broke legibility for any non-default content.
          "z-[10001] overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
