"use client";

/**
 * ErrorInspectorTrayChip — the minimized-window preview for the Error Inspector.
 *
 * Shown in the body of the Error Inspector's minimized window shell. It turns
 * the live captured-error tallies into a single glanceable mark: a bug icon
 * coloured by the LOUDEST tier present (blue when clear, then yellow → amber →
 * red), the total distinct-error count, and a tiny per-tier breakdown.
 *
 * State isolation (the whole point of a minimized preview):
 *  - Reads the **module-level** capture store via `useCapturedErrorStats`
 *    (`useSyncExternalStore`). It is NOT Redux and NOT page state — a captured
 *    error re-renders ONLY this leaf, never the page the user is working on.
 *  - This leaf lives inside the portalled WindowPanel (mounted off the page
 *    tree in DeferredSingletons), so even its own re-renders can't touch the
 *    active route. It only mounts while the window is minimized.
 *
 * The colour language matches `errorTiers.ts` and the rest of the inspector;
 * the layout is the shared `TrayStatusChip` primitive.
 */

import { Bug } from "lucide-react";
import { useCapturedErrorStats } from "@/lib/diagnostics/useCapturedErrors";
import {
  TrayStatusChip,
  type TrayStatusSegment,
  type TrayStatusTone,
} from "@/features/window-panels/WindowTray/TrayStatusChip";

export default function ErrorInspectorTrayChip() {
  const { red, orange, yellow, unseenRed, unseenOrange } =
    useCapturedErrorStats();

  const total = red + orange + yellow;

  // Loudest present tier wins the icon colour; blue ("monitoring") when clear.
  const tone: TrayStatusTone =
    red > 0
      ? "critical"
      : orange > 0
        ? "elevated"
        : yellow > 0
          ? "warning"
          : "info";

  // Pulse while there's something the admin hasn't seen since they minimized.
  const pulse = unseenRed + unseenOrange > 0;

  const segments: TrayStatusSegment[] = [
    { count: red, tone: "critical", label: "clear errors" },
    { count: orange, tone: "elevated", label: "minor" },
    { count: yellow, tone: "warning", label: "silent" },
  ];

  return (
    <TrayStatusChip
      icon={Bug}
      tone={tone}
      count={total > 0 ? total : undefined}
      caption={total > 0 ? undefined : "No errors"}
      segments={segments}
      pulse={pulse}
    />
  );
}
