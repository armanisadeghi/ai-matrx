"use client";

/**
 * The chat package's Tabs: design-system primitives, with ONE addition — a tab activates on
 * `click`, not only on `mousedown` (Radix selects on mousedown/focus/Enter only, so a bare
 * synthetic click did nothing). A click focuses the trigger; Radix automatic activation does the rest.
 */
import * as React from "react";
import { Tabs, TabsContent } from "@ai-matrx/design-system";
import {
  TabsList,
  TabsTrigger as TabsTriggerPrimitive,
} from "@ai-matrx/design-system/controls";

type TriggerProps = React.ComponentPropsWithoutRef<typeof TabsTriggerPrimitive>;

function focusOnClick(onClick: TriggerProps["onClick"]): TriggerProps["onClick"] {
  return (event) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const trigger = event.currentTarget;
    if (trigger.disabled) return;
    if (document.activeElement !== trigger) trigger.focus();
  };
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsTriggerPrimitive>,
  TriggerProps
>(({ onClick, ...props }, ref) => (
  <TabsTriggerPrimitive {...props} ref={ref} onClick={focusOnClick(onClick)} />
));
TabsTrigger.displayName = "TabsTrigger";

export { Tabs, TabsContent, TabsList, TabsTrigger };
