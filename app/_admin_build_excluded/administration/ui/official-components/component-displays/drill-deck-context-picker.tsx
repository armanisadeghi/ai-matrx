"use client";

import { toast } from "@/lib/toast";
import type { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { Button } from "@/components/ui/button";
import { DrillDeck } from "@/features/scopes/components/active-context/drill-deck/DrillDeck";
import { DrillDeckPopover } from "@/features/scopes/components/active-context/drill-deck/DrillDeckPopover";
import { useSelectionEngine } from "@/features/scopes/components/active-context/quick-pick/engine";
import { useOpenDrillDeckContextWindow } from "@/features/overlays/openers/drillDeckContextWindow";

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
/>

// Thin popover host
<DrillDeckPopover
  engine={engine}
  mode="assignment"
  onCommit={saveSelection}
/>

// Registered Surface-A WindowPanel
const openContextWindow = useOpenDrillDeckContextWindow();
openContextWindow();`;

export default function DrillDeckContextPickerDisplay({
  component,
}: ComponentDisplayProps) {
  const inlineEngine = useSelectionEngine(false);
  const popoverEngine = useSelectionEngine(false);
  const openContextWindow = useOpenDrillDeckContextWindow();
  if (!component) return null;

  const commit = (count: number) =>
    toast.success(`${count} context value${count === 1 ? "" : "s"} captured`);

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      className="block"
    >
      <div className="space-y-5">
        <p className="max-w-xl text-[11px] text-muted-foreground">
          The Smart Input Resource Picker uses this constrained face: navigation
          nodes drill, while only context-value leaves can be assigned.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DrillDeckPopover
            engine={popoverEngine}
            mode="assignment"
            selectableKinds={["item"]}
            includeEngagements={false}
            rootLabel="Context Values"
            onCommit={(nodes) => commit(nodes.length)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => openContextWindow()}
          >
            Open WindowPanel
          </Button>
        </div>
        <DrillDeck
          engine={inlineEngine}
          mode="assignment"
          selectableKinds={["item"]}
          includeEngagements={false}
          onCommit={(nodes) => commit(nodes.length)}
          className="h-[420px] w-full max-w-[384px]"
        />
      </div>
    </ComponentDisplayWrapper>
  );
}
