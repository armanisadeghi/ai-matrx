"use client";

// features/war-room/components/thread/ThreadContextOverride.tsx
//
// Per-tile context control. Shows the tile's effective context (inherited from
// the session by default) and lets the user override it to a more specific
// org/scope, or reset back to the session. Writes only to the tile record.

import { Building2, RotateCcw } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectThreadEffectiveContext } from "@/features/war-room/redux/selectors";
import {
  clearThreadContextOverrideThunk,
  setThreadContextOverrideThunk,
} from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { WarRoomContextPicker } from "../shared/WarRoomContextPicker";

export function ThreadContextOverride({
  threadId,
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  threadId: string;
  /** Controlled open state — supply with `hideTrigger` to drive from elsewhere (e.g. the options menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render only an invisible anchor instead of the button (the popover is opened externally). */
  hideTrigger?: boolean;
}) {
  const dispatch = useAppDispatch();
  const ctx = useAppSelector((s) => selectThreadEffectiveContext(threadId)(s));

  const hasContext = !!ctx.organizationId || ctx.scopeIds.length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {hideTrigger ? (
        <PopoverAnchor />
      ) : (
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label="Tile context"
            title={
              ctx.isOverridden
                ? "Tile context (overridden)"
                : hasContext
                  ? "Tile context (inherited from session)"
                  : "Set tile context"
            }
            className={cn(
              "grid place-items-center size-6 rounded-md transition-colors relative",
              ctx.isOverridden
                ? "text-primary hover:bg-accent"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Building2 className="size-3.5" />
            {ctx.scopeIds.length > 0 ? (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 size-1.5 rounded-full",
                  ctx.isOverridden ? "bg-primary" : "bg-muted-foreground/60",
                )}
              />
            ) : null}
          </button>
        </PopoverTrigger>
      )}
      <PopoverContent
        className="w-72"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">
            Tile context
          </span>
          {ctx.isOverridden ? (
            <button
              type="button"
              onClick={() => dispatch(clearThreadContextOverrideThunk(threadId))}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Reset to the War Room's context"
            >
              <RotateCcw className="size-3" />
              Reset to session
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">Inherited</span>
          )}
        </div>
        <WarRoomContextPicker
          value={{ organizationId: ctx.organizationId, scopeIds: ctx.scopeIds }}
          onChange={(next) =>
            dispatch(
              setThreadContextOverrideThunk(threadId, {
                organizationId: next.organizationId,
                scopeIds: next.scopeIds,
              }),
            )
          }
        />
      </PopoverContent>
    </Popover>
  );
}
