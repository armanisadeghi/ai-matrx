"use client";

/**
 * THE HOST'S TABS. The primitives live in `@ai-matrx/design-system`, which
 * carries both standing rulings:
 *
 * - THE ROOT RENDERS UNCONDITIONALLY. The hydration mount gate a wrapper once
 *   had deleted the ENTIRE tab bar and active panel from SSR and the first
 *   client paint.
 * - INACTIVE PANELS UNMOUNT; `forceMount` is opt-in. Force-mounting every
 *   panel kept hidden tabs live — effects running, subscriptions open — and on
 *   the agent-apps executions page a HIDDEN tab won a provider tie-break and
 *   served the VISIBLE tab the other tab's rows (D193/D194).
 *
 * 🚨 AND ONE THIS FILE ADDS: A TAB ACTIVATES ON `click`, NOT ONLY ON
 * `mousedown` (2026-09-12).
 *
 * Radix's `TabsTrigger` selects a tab from three events and three only:
 * `mousedown`, `focus` (automatic activation), and Enter/Space. A plain
 * `click` event with no mouse sequence in front of it does NOTHING — the
 * trigger looks live, reports `aria-selected="false"`, and swallows the
 * activation in silence. That is every click-only activation path:
 * `element.click()` from a script or extension, an accessibility "perform
 * default action" from a screen reader, and any driver that synthesises a
 * click without a preceding button press. Observed on
 * `/administration/mandates/<key>` (production walk, 2026-09-12): the tab bar
 * stayed on Definition through repeated activation attempts while the
 * "Assign a Holder" banner button — an ordinary React `onClick` — moved the
 * same state instantly.
 *
 * The fix is the primitive's OWN activation path, not a synthetic event: a
 * click on a tab focuses it, which is exactly what a real browser click
 * already does, and Radix's automatic activation then selects it. Under a real
 * mouse the tab is already selected and already focused by the time `click`
 * fires, so this is a no-op there; under `activationMode="manual"` focusing on
 * click remains correct and selection stays with Enter/Space.
 */

import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger as TabsTriggerPrimitive,
  TabsTriggerCore as TabsTriggerCorePrimitive,
} from "@ai-matrx/design-system";

type TriggerProps = React.ComponentPropsWithoutRef<
  typeof TabsTriggerPrimitive
>;

/**
 * Give the trigger the focus a real click would have given it. Radix's
 * automatic activation does the rest; a manual-activation tab bar keeps its
 * Enter/Space contract.
 */
function focusOnClick(
  onClick: TriggerProps["onClick"],
): TriggerProps["onClick"] {
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

const TabsTriggerCore = React.forwardRef<
  React.ElementRef<typeof TabsTriggerCorePrimitive>,
  React.ComponentPropsWithoutRef<typeof TabsTriggerCorePrimitive>
>(({ onClick, ...props }, ref) => (
  <TabsTriggerCorePrimitive
    {...props}
    ref={ref}
    onClick={focusOnClick(onClick as TriggerProps["onClick"])}
  />
));
TabsTriggerCore.displayName = "TabsTriggerCore";

export { Tabs, TabsContent, TabsList, TabsTrigger, TabsTriggerCore };
