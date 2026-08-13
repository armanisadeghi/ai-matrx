"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";
import { useNestedPortalContainer } from "@/hooks/use-nested-portal-container";

/**
 * THE ROOT RENDERS UNCONDITIONALLY — no mount gate. This wrapper used to defer
 * rendering until after hydration ("Radix generates dynamic aria-controls ids
 * that differ between SSR and client"), and that justification was false:
 * Radix ids come from React's SSR-stable `useId` (verified against
 * @radix-ui/react-popover 1.1.17 / react-id 1.1.2). The gate was actively
 * harmful — the Trigger wraps ALWAYS-VISIBLE content, so `return null`
 * deleted it from SSR and the first client paint. See
 * components/ui/context-menu/context-menu.tsx (the precedent fix, D144).
 */
const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(
  (
    { className, align = "center", sideOffset = 4, container, ...props },
    ref,
  ) => {
    const portalContainer = useNestedPortalContainer(container);
    return (
      <PopoverPrimitive.Portal container={portalContainer}>
        <PopoverPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            // Cap to the viewport space Radix measured and scroll — a popover taller
            // than the screen must never trap the user with unreachable content.
            // z must EQUAL the dialog layer (z-[10000]), never exceed it: with equal
            // z, DOM portal order decides, so a dialog opened FROM a popover stacks
            // above it, and a popover opened from a dialog still stacks above the
            // dialog. z-[10001] buried dialogs behind fullscreen popovers.
            "z-[10000] w-72 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
