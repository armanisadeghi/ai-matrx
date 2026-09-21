"use client";

/**
 * /demos/lite-window — the three lightweight-window examples.
 *
 * The examples themselves live in `features/window-panels/lite-window/` so the
 * same page is reachable from the admin build at
 * `/administration/ui/lite-window` — the `(dev)` group is parked in the managed
 * preview profile, and a surface Arman has to approve in practice must be
 * reachable from the build he actually opens.
 */

import { LiteWindowExamples } from "@/features/window-panels/lite-window/LiteWindowExamples";

export default function LiteWindowDemoPage() {
  return <LiteWindowExamples />;
}
