"use client";

/**
 * ContextSlotItemsPopover
 *
 * Collapsed summary chip for multiple context entries on a user message.
 * Click → popover list; row click → detail sheet.
 */

import { useState } from "react";
import { Boxes } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
  CONTEXT_TYPE_CHIP_CLASS,
} from "./contextSlotIcons";
import { contextSlotValuePreview } from "./contextSlotPreview";
import { ContextSlotDetailSheet } from "./ContextSlotDetailSheet";

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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const count = entries.length;

  const openDetail = (key: string) => {
    setSelectedKey(key);
    setPopoverOpen(false);
    setDetailOpen(true);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none cursor-pointer transition-colors hover:brightness-95 active:brightness-90",
              "bg-muted/60 text-foreground border-border",
              className,
            )}
          >
            <Boxes className="w-2.5 h-2.5 flex-shrink-0 text-muted-foreground" />
            <span>Context Items ({count})</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-72 max-w-[92vw] p-1"
        >
          <div className="max-h-64 overflow-y-auto">
            {entries.map((entry) => {
              const slot = slotByKey.get(entry.key);
              const type: ContextObjectType = slot?.type ?? entry.type;
              const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
              const chipClass =
                CONTEXT_TYPE_CHIP_CLASS[type] ?? CONTEXT_TYPE_CHIP_CLASS.text;
              const label =
                slot?.label?.trim() || entry.label?.trim() || entry.key;
              const preview = contextSlotValuePreview(entry.value, type);

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => openDetail(entry.key)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      chipClass,
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {label}
                    </span>
                    {preview ? (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {preview}
                      </span>
                    ) : (
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {entry.key}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selectedKey && (
        <ContextSlotDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          conversationId={conversationId}
          agentId={agentId}
          contextKey={selectedKey}
        />
      )}
    </>
  );
}
