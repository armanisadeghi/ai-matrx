"use client";

// features/war-room/components/room/SessionContextButton.tsx
//
// Session-level context control in the room header. Sets the org/scope default
// that every tile inherits. Writes only to the session record — never to
// appContextSlice (global active context).

import { Building2, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  asScopeIds,
  selectSessionById,
} from "@/features/war-room/redux/selectors";
import { setSessionContextThunk } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";
import { WarRoomContextPicker } from "../shared/WarRoomContextPicker";

export function SessionContextButton({ sessionId }: { sessionId: string }) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSessionById(sessionId));
  const organizationId = session?.organization_id ?? null;
  const scopeIds = asScopeIds(session?.context_scope_ids);
  const hasContext = !!organizationId || scopeIds.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-7 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            hasContext
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
          aria-label="War Room context"
          title="War Room context — inherited by every tile"
        >
          <Building2 className="size-3.5" />
          <span>
            {hasContext
              ? scopeIds.length > 0
                ? `Context · ${scopeIds.length}`
                : "Context"
              : "Set context"}
          </span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="mb-2">
          <p className="text-xs font-semibold text-foreground">
            War Room context
          </p>
          <p className="text-[11px] text-muted-foreground">
            The default org &amp; scope every tile inherits.
          </p>
        </div>
        <WarRoomContextPicker
          value={{ organizationId, scopeIds }}
          onChange={(next) =>
            dispatch(
              setSessionContextThunk(sessionId, {
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
