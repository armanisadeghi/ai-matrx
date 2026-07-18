"use client";

import type { Resource } from "@/features/agents/resources/types";
import { DrillDeck } from "@/features/scopes/components/active-context/drill-deck/DrillDeck";
import { useSelectionEngine } from "@/features/scopes/components/active-context/quick-pick/engine";
import { contextValueResourceFromNode } from "./context-value-resource";

interface ContextValuesResourcePickerProps {
  onBack: () => void;
  onSelect: (resource: Resource) => void;
}

/** Resource Picker face: navigation nodes drill; only context-item cells select. */
export function ContextValuesResourcePicker({
  onBack,
  onSelect,
}: ContextValuesResourcePickerProps) {
  const engine = useSelectionEngine(false);

  return (
    <DrillDeck
      engine={engine}
      mode="assignment"
      rootLabel="Context Values"
      includeEngagements={false}
      selectableKinds={["item"]}
      onBack={onBack}
      onCommit={(nodes) => {
        for (const node of nodes) {
          const resource = contextValueResourceFromNode(node);
          if (resource) onSelect(resource);
        }
      }}
      className="h-[min(420px,68dvh)] w-full rounded-none border-0"
    />
  );
}
