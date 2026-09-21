"use client";

/**
 * DecisionComparisonWindow — the floating home of the decision comparison,
 * mounted through the SAME `WindowPanel` primitive as the Runs, Context and
 * Run-settings windows. Not a new panel system beside them.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { DecisionComparisonTable } from "./DecisionComparisonTable";

interface DecisionComparisonWindowProps {
  id: string;
  onClose: () => void;
}

export function DecisionComparisonWindow({
  id,
  onClose,
}: DecisionComparisonWindowProps) {
  return (
    <WindowPanel
      id={id}
      title="Decisions"
      width={920}
      height={620}
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="h-full overflow-auto">
        <DecisionComparisonTable />
      </div>
    </WindowPanel>
  );
}
