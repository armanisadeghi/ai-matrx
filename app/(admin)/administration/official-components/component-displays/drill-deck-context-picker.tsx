"use client";

import { toast } from "sonner";
import type { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { DrillDeck } from "@/features/scopes/components/active-context/drill-deck/DrillDeck";
import { useSelectionEngine } from "@/features/scopes/components/active-context/quick-pick/engine";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const code = `const engine = useSelectionEngine(false);

<DrillDeck
  engine={engine}
  mode="assignment"
  selectableKinds={["item"]}
  includeEngagements={false}
  onCommit={attachContextValues}
/>`;

export default function DrillDeckContextPickerDisplay({
  component,
}: ComponentDisplayProps) {
  const engine = useSelectionEngine(false);
  if (!component) return null;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      className="block"
    >
      <div className="space-y-2">
        <p className="max-w-xl text-[11px] text-muted-foreground">
          The Smart Input Resource Picker uses this constrained face: navigation
          nodes drill, while only context-value leaves can be assigned.
        </p>
        <DrillDeck
          engine={engine}
          mode="assignment"
          selectableKinds={["item"]}
          includeEngagements={false}
          onCommit={(nodes) =>
            toast.success(
              `${nodes.length} context value${nodes.length === 1 ? "" : "s"} captured`,
            )
          }
          className="h-[420px] w-full max-w-[384px]"
        />
      </div>
    </ComponentDisplayWrapper>
  );
}
