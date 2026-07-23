"use client";

import { useActiveContextSelectionEngine } from "../quick-pick/useActiveContextSelectionEngine";
import { DrillDeckCore } from "./DrillDeck";

export interface ActiveDrillDeckProps {
  className?: string;
  rootLabel?: string;
}

/** Surface-A adapter: the reusable Drill Deck backed by appContextSlice. */
export function ActiveDrillDeck({
  className,
  rootLabel = "Working Context",
}: ActiveDrillDeckProps) {
  const { universe, engine } = useActiveContextSelectionEngine();

  return (
    <DrillDeckCore
      universe={universe}
      engine={engine}
      mode="active"
      rootLabel={rootLabel}
      className={className}
    />
  );
}
