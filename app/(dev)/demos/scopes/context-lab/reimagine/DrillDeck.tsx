"use client";

// Context Lab compatibility shim. The implementation is canonical now; this
// page supplies only its preview create callback.
import {
  DrillDeck as CanonicalDrillDeck,
  type DrillDeckProps,
} from "@/features/scopes/components/active-context/drill-deck/DrillDeck";

export function DrillDeck(props: DrillDeckProps) {
  return <CanonicalDrillDeck {...props} />;
}
