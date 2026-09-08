"use client";

/**
 * HOST RE-EXPORT ONLY — Tabs lives in `@ai-matrx/design-system`, carrying both
 * rulings this file used to hold:
 *
 * - THE ROOT RENDERS UNCONDITIONALLY. The hydration mount gate a wrapper once
 *   had deleted the ENTIRE tab bar and active panel from SSR and the first
 *   client paint.
 * - INACTIVE PANELS UNMOUNT; `forceMount` is opt-in. Force-mounting every
 *   panel kept hidden tabs live — effects running, subscriptions open — and on
 *   the agent-apps executions page a HIDDEN tab won a provider tie-break and
 *   served the VISIBLE tab the other tab's rows (D193/D194).
 */

export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TabsTriggerCore,
} from "@ai-matrx/design-system";
