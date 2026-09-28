"use client";

/**
 * PageContextChip — the PAGE the chat can see, as ONE chip in the composer's
 * context rail (Arman, 2026-09-27). A surface hands the chat dozens of values;
 * one chip per value buried the composer, so everything the page's surface
 * contributed collapses into this chip:
 *
 *   on  → [eye  <page name>  N]  — click: the values, listed vertically, and
 *          the switch that turns the page off for this chat.
 *   off → [eye-off]  in the same spot — click: the same list header with the
 *          switch to turn it back on (which reads the page again at once).
 *
 * Only the keys the SURFACE contributed live here (`selectSurfaceContextKeys`);
 * anything attached by hand or by another source keeps its own chip.
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openAfterCurrentLayerCloses } from "@/components/dialogs/confirm/after-current-layer-closes";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
} from "@/features/agents/components/context-policies-display/contextPolicyIcons";
import { selectPageContextOff } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setPageContextEnabled } from "@/features/agents/redux/execution-system/thunks/page-context.thunk";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import { contextEntryLabel } from "@/features/agents/components/context-policies-display/contextEntryLabel";

export function usePageContextChipShown(conversationId: string): boolean {
  const stamped = useAppSelector((state) => state.conversations.byConversationId[conversationId]?.surfaceName ?? null);
  const off = useAppSelector(selectPageContextOff(conversationId));
  return Boolean(stamped) || Boolean(off?.previousSurfaceName);
}

export function PageContextChip({
  conversationId,
  entries,
  onOpenEntry,
}: {
  conversationId: string;
  /** The context entries the page's surface contributed. */
  entries: readonly InstanceContextEntry[];
  onOpenEntry: (entry: InstanceContextEntry) => void;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const stamped = useAppSelector((state) => state.conversations.byConversationId[conversationId]?.surfaceName ?? null);
  const off = useAppSelector(selectPageContextOff(conversationId));
  const surfaceName = stamped ?? off?.previousSurfaceName ?? null;
  if (!surfaceName) return null;
  const on = !off;
  const label = getSurfaceDisplayLabel(surfaceName);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={on ? `This chat sees ${label} — ${entries.length} values` : `This chat does not see ${label}`}
          title={on ? `Sees ${label}` : `Not seeing ${label} — click to turn it back on`}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border text-[11px] font-medium transition-colors",
            on
              ? "border-primary/30 bg-primary/5 px-2 text-primary hover:bg-primary/10"
              : "w-6 justify-center border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {on ? <Eye className="h-3 w-3 shrink-0" /> : <EyeOff className="h-3 w-3 shrink-0" />}
          {on ? (
            <>
              <span className="max-w-[8rem] truncate">{label}</span>
              {entries.length > 0 ? <span className="tabular-nums opacity-70">{entries.length}</span> : null}
            </>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — one line per value, the page name above; a content-sized box would jump as values load */
        side="top"
        align="start"
        sideOffset={6}
        className="w-72 p-1"
      >
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm text-foreground hover:bg-accent">
          {on ? <Eye className="h-4 w-4 shrink-0 text-primary" /> : <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <Switch
            checked={on}
            onCheckedChange={(next) => void dispatch(setPageContextEnabled({ conversationId, enabled: next }))}
            aria-label={`Let this chat see ${label}`}
          />
        </label>
        {on ? (
          entries.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              {entries.map((entry) => {
                const Icon = CONTEXT_TYPE_ICON[entry.type] ?? FALLBACK_CONTEXT_ICON;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void openAfterCurrentLayerCloses(() => onOpenEntry(entry));
                    }}
                    className="flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 text-left text-sm text-foreground hover:bg-accent"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{contextEntryLabel(entry)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-2.5 py-1.5 text-xs text-muted-foreground">The page's values arrive with your next message.</p>
          )
        ) : (
          <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Turn it on to let the chat see this page.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
