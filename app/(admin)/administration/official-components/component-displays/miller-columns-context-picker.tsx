"use client";

import { toast } from "sonner";
import type { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { Button } from "@/components/ui/button";
import { MillerColumns } from "@/features/scopes/components/active-context/miller-columns/MillerColumns";
import { MillerColumnsPopover } from "@/features/scopes/components/active-context/miller-columns/MillerColumnsPopover";
import { useSelectionEngine } from "@/features/scopes/components/active-context/quick-pick/engine";
import { useOpenContextSwitcherWindow } from "@/features/overlays/openers/contextSwitcherWindow";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

const code = `const engine = useSelectionEngine(false);

// Core — full or condensed
<MillerColumns
  engine={engine}
  mode="assignment"
  variant="condensed"
  onCommit={saveSelection}
/>

// Thin popover host (condensed by default)
<MillerColumnsPopover
  engine={engine}
  mode="assignment"
  onCommit={saveSelection}
/>

// Registered Surface-A WindowPanel
const openContextWindow = useOpenContextSwitcherWindow();
openContextWindow();`;

export default function MillerColumnsContextPickerDisplay({
  component,
}: ComponentDisplayProps) {
  const inlineEngine = useSelectionEngine(false);
  const popoverEngine = useSelectionEngine(false);
  const openContextWindow = useOpenContextSwitcherWindow();
  if (!component) return null;

  const commit = (count: number) =>
    toast.success(
      `${count} context selection${count === 1 ? "" : "s"} captured`,
    );

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      className="block"
    >
      <div className="w-full space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <MillerColumnsPopover
            engine={popoverEngine}
            mode="assignment"
            onCommit={(nodes) => commit(nodes.length)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => openContextWindow()}
          >
            Open full WindowPanel
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-foreground">
            Condensed core
          </div>
          <p className="text-[11px] text-muted-foreground">
            Five rows maximum per column; Project and Task live in the footer.
          </p>
          <MillerColumns
            engine={inlineEngine}
            mode="assignment"
            variant="condensed"
            onCommit={(nodes) => commit(nodes.length)}
            className="h-[300px] w-full"
          />
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}
