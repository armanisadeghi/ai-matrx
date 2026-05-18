"use client";

/**
 * SettingsColumn
 *
 * One variant in the settings comparison. The body uses the shared
 * BoundColumn with `hideInput` — the user types the message ONCE in the
 * locked-input section at the top of the page, not per-column. The
 * CreatorRunPanel stays visible so the user still has access to the
 * column's full telemetry + advanced settings tabs.
 *
 * When collapsed, swaps to the same compact rotated-name affordance used
 * by the open-mode column.
 */

import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoundColumn } from "../../../shared/BoundColumn";
import { SettingsColumnHeader } from "./SettingsColumnHeader";
import { SETTINGS_SURFACE_KEY } from "../redux/thunks";
import type { SettingsColumn as SettingsColumnType } from "../types";

interface Props {
  column: SettingsColumnType;
  onToggleCollapse: () => void;
}

export function SettingsColumn({ column, onToggleCollapse }: Props) {
  if (column.collapsed) {
    return <CollapsedView column={column} onExpand={onToggleCollapse} />;
  }
  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <SettingsColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
      />
      <div className="flex-1 overflow-hidden flex justify-center min-w-0">
        <BoundColumn
          conversationId={column.conversationId}
          surfaceKey={SETTINGS_SURFACE_KEY}
          hideInput
        />
      </div>
    </div>
  );
}

function CollapsedView({
  column,
  onExpand,
}: {
  column: SettingsColumnType;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Expand "${column.label}"`}
      className={cn(
        "h-full w-full flex flex-col items-center justify-between py-2",
        "border-x border-dashed border-primary/40 bg-primary/5",
        "hover:bg-primary/10 hover:border-primary transition-colors",
        "group",
      )}
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-sm group-hover:scale-110 transition-transform">
        <ChevronsLeftRight className="w-3.5 h-3.5" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate max-h-full [writing-mode:vertical-rl] rotate-180 text-primary">
          {column.label}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        collapsed
      </span>
    </button>
  );
}

