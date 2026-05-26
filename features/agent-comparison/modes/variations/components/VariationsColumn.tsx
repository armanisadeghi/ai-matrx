"use client";

/**
 * VariationsColumn
 *
 * Body is just the bound conversation surface — the streamed response for
 * this variation. Editing the variation's full agent definition happens in
 * the floating editor window (opened via the header's "Edit" button), so the
 * column stays compact for side-by-side response comparison.
 */

import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { BoundColumn } from "../../../shared/BoundColumn";
import { BlindColumnHeader } from "../../../shared/BlindColumnHeader";
import { selectBlindActive } from "../../../redux/selectors";
import { VariationsColumnHeader } from "./VariationsColumnHeader";
import {
  VARIATIONS_SURFACE_KEY,
  removeColumnFromVariationsBattle,
} from "../redux/thunks";
import type { VariationColumn as VariationColumnType } from "../types";

interface Props {
  column: VariationColumnType;
  onToggleCollapse: () => void;
  onEdit: () => void;
}

export function VariationsColumn({ column, onToggleCollapse, onEdit }: Props) {
  const dispatch = useAppDispatch();
  const blindActive = useAppSelector(selectBlindActive);

  if (column.collapsed) {
    return <CollapsedView column={column} onExpand={onToggleCollapse} />;
  }

  if (blindActive) {
    return (
      <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
        <BlindColumnHeader
          columnId={column.columnId}
          collapsed={column.collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={() =>
            dispatch(
              removeColumnFromVariationsBattle({ columnId: column.columnId }),
            )
          }
        />
        <div className="flex-1 overflow-hidden flex justify-center min-w-0">
          <BoundColumn
            conversationId={column.conversationId}
            surfaceKey={VARIATIONS_SURFACE_KEY}
            hideInput
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      <VariationsColumnHeader
        column={column}
        onToggleCollapse={onToggleCollapse}
        onEdit={onEdit}
      />
      {column.paused && (
        <div className="shrink-0 px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-500 bg-amber-500/10 border-b border-amber-500/30 text-center">
          Paused — skipped on Submit All
        </div>
      )}
      <div
        className={cn(
          "flex-1 overflow-hidden flex justify-center min-w-0 transition-opacity",
          column.paused && "opacity-50",
        )}
      >
        <BoundColumn
          conversationId={column.conversationId}
          surfaceKey={VARIATIONS_SURFACE_KEY}
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
  column: VariationColumnType;
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
