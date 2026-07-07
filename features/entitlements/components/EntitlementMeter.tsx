// features/entitlements/components/EntitlementMeter.tsx
//
// The "limits visible BEFORE the cap" primitive (TRUST mandate, README §6).
// Drop next to any metered action; it renders "X of Y left this month" (and any
// burst window) ahead of the cap so the user is never ambushed. Renders NOTHING
// when the capability is unlimited / permissive — so it's safe to leave mounted
// everywhere and it only speaks when there's a real limit to show.

"use client";

import { useEntitlement } from "../hooks";
import type { Capability } from "../registry";
import type { EntitlementWindow } from "../types";
import { cn } from "@/lib/utils";

const PERIOD_LABEL: Record<string, string> = {
  rolling_1h: "in the last hour",
  rolling_5h: "in the last 5 hours",
  day: "today",
  week: "this week",
  month: "this month",
  lifetime: "total",
};

function windowLabel(w: EntitlementWindow): string {
  const left = Math.max(w.limit - w.used, 0);
  return `${left} of ${w.limit} left ${PERIOD_LABEL[w.period] ?? ""}`.trim();
}

export function EntitlementMeter({
  capability,
  className,
  /** Show every window (monthly + burst), not just the binding one. */
  showAllWindows = false,
}: {
  capability: Capability;
  className?: string;
  showAllWindows?: boolean;
}) {
  const ent = useEntitlement(capability);

  // Nothing to say when unlimited / permissive / still loading.
  if (ent.isLoading || ent.windows.length === 0 || ent.limit == null) return null;

  const windows = showAllWindows
    ? ent.windows
    : ent.windows.filter((w) => w.period === ent.period);

  const atCap = !ent.allowed;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]",
        atCap ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className,
      )}
    >
      {windows.map((w, i) => (
        <span key={w.period}>
          {i > 0 && <span className="mr-2 opacity-40">·</span>}
          {windowLabel(w)}
        </span>
      ))}
    </span>
  );
}
