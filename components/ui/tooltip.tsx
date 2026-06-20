"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/styles/themes/utils";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";

const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Hydration-safe Tooltip wrapper.
 * Radix UI generates dynamic IDs for aria-controls that can differ between
 * SSR and client, causing hydration mismatches. This wrapper defers rendering
 * until after hydration to prevent these errors.
 */
const Tooltip = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>
>(({ children, ...props }, ref) => {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>;
});
Tooltip.displayName = "Tooltip";

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  // Retarget the Radix portal into the popout document when this tooltip
  // renders inside a popped-out window-panel. Outside a popout, returns
  // `undefined` and Radix uses its default (`document.body`).
  const popoutContainer = usePopoutContainer();
  return (
    <TooltipPrimitive.Portal container={popoutContainer}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // Neutral, theme-aware surface (popover tokens) so tooltip text is
          // ALWAYS legible in both light and dark mode — including rich content
          // that uses `text-muted-foreground`. A brand-colored `bg-primary`
          // background broke legibility for any non-default content.
          "z-[9999] overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
