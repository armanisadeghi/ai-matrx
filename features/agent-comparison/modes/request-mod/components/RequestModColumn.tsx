"use client";

/**
 * RequestModColumn
 *
 * Per-column body uses the shared BoundColumn with `hideInput=false`
 * — Request Mod's whole point is that each column has its own
 * variables + user message. SmartAgentInput already renders both.
 */

import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { BoundColumn } from "../../../shared/BoundColumn";
import { BlindColumnHeader } from "../../../shared/BlindColumnHeader";
import { selectBlindActive } from "../../../redux/selectors";
import { RequestModColumnHeader } from "./RequestModColumnHeader";
import {
  REQUEST_MOD_SURFACE_KEY,
  removeColumnFromRequestModBattle,
} from "../redux/thunks";
import type { RequestModColumn as RequestModColumnType } from "../types";

interface Props {
  column: RequestModColumnType;
  onToggleCollapse: () => void;
}

export function RequestModColumn({ column, onToggleCollapse }: Props) {
  const dispatch = useAppDispatch();
  const blindActive = useAppSelector(selectBlindActive);

  if (column.collapsed) {
    return <CollapsedView column={column} onExpand={onToggleCollapse} />;
  }
  return (
    <div className="h-full flex flex-col min-w-0 min-h-0 bg-background">
      {blindActive ? (
        <BlindColumnHeader
          columnId={column.columnId}
          collapsed={column.collapsed}
          onToggleCollapse={onToggleCollapse}
          onRemove={() =>
            dispatch(
              removeColumnFromRequestModBattle({ columnId: column.columnId }),
            )
          }
        />
      ) : (
        <RequestModColumnHeader
          column={column}
          onToggleCollapse={onToggleCollapse}
        />
      )}
      <div className="flex-1 overflow-hidden flex justify-center min-w-0">
        <BoundColumn
          conversationId={column.conversationId}
          surfaceKey={REQUEST_MOD_SURFACE_KEY}
        />
      </div>
    </div>
  );
}

function CollapsedView({
  column,
  onExpand,
}: {
  column: RequestModColumnType;
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
