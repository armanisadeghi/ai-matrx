"use client";

/**
 * ContextSlotItemsPopover
 *
 * Collapsed summary tile for multiple context entries on a user message.
 * Click → popover list; row click → detail sheet.
 */

import { useMemo, useState } from "react";
import { Boxes } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { CONTEXT_TYPE_ICON, FALLBACK_CONTEXT_ICON } from "./contextSlotIcons";
import {
  CONTEXT_TYPE_TILE_LABEL,
  resolveContextSlotTileTheme,
} from "./contextSlotTile.theme";
import { contextSlotEntryPreview } from "./contextSlotPreview";
import { getKnownContextDefinition } from "./knownContextValues";
import { ContextSlotDetailSheet } from "./ContextSlotDetailSheet";
import { ContextSlotTile } from "./ContextSlotTile";

interface ContextSlotItemsPopoverProps {
  conversationId: string;
  agentId: string | null;
  entries: InstanceContextEntry[];
  slotByKey: Map<string, ContextSlot>;
  className?: string;
}

export function ContextSlotItemsPopover({
  conversationId,
  agentId,
  entries,
  slotByKey,
  className,
}: ContextSlotItemsPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] =
    useState<InstanceContextEntry | null>(null);

  const selectLiveEntries = useMemo(
    () => selectInstanceContextEntries(conversationId),
    [conversationId],
  );
  const liveEntries = useAppSelector(selectLiveEntries);
  const liveValueByKey = useMemo(
    () => new Map(liveEntries.map((e) => [e.key, e.value])),
    [liveEntries],
  );

  const count = entries.length;

  const openDetail = (entry: InstanceContextEntry) => {
    setSelectedEntry(entry);
    setPopoverOpen(false);
    setDetailOpen(true);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <ContextSlotTile
            typeLabel="Context"
            title={`Context Items (${count})`}
            icon={Boxes}
            themeKey="context-group"
            className={className}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={6}
          className="w-80 max-w-[92vw] p-1.5"
        >
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Context items
          </p>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {entries.map((entry) => {
              const slot = slotByKey.get(entry.key);
              const type: ContextObjectType = slot?.type ?? entry.type;
              const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
              const theme = resolveContextSlotTileTheme(type);
              const typeLabel =
                getKnownContextDefinition(entry.key)?.typeLabel ??
                CONTEXT_TYPE_TILE_LABEL[type] ??
                "Context";
              const label =
                slot?.label?.trim() || entry.label?.trim() || entry.key;
              const preview = contextSlotEntryPreview(
                entry,
                type,
                liveValueByKey.get(entry.key),
              );

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => openDetail(entry)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left",
                    "transition-colors hover:bg-accent/80",
                  )}
                >
                  <span className="mt-0.5 inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center">
                    <Icon className={cn("h-3.5 w-3.5", theme.icon)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {typeLabel}
                    </span>
                    <span className="block truncate text-xs font-medium text-foreground">
                      {label}
                    </span>
                    {preview ? (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {preview}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selectedEntry && (
        <ContextSlotDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          conversationId={conversationId}
          agentId={agentId}
          contextKey={selectedEntry.key}
          snapshotValue={selectedEntry.value}
        />
      )}
    </>
  );
}
