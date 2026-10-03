"use client";

/**
 * ContextPolicyItemsPopover
 *
 * Collapsed summary tile for multiple context entries on a user message.
 * Click → popover list; row click → the conversation's context-value canvas tab.
 */

import { useState } from "react";
import { Boxes } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import type {
  ContextObjectType,
  ContextPolicy,
} from "../../types/agent-api-types";
import type { InstanceContextEntry } from "../../types/instance.types";
import { CONTEXT_TYPE_ICON, FALLBACK_CONTEXT_ICON } from "./contextPolicyIcons";
import {
  CONTEXT_TYPE_TILE_LABEL,
  resolveContextPolicyTileTheme,
} from "./contextPolicyTile.theme";
import { contextPolicyEntryPreview } from "./contextPolicyPreview";
import { getKnownContextDefinition } from "./knownContextValues";
import { useContextValueTab } from "./contextValueTab";
import { ValueCountPill } from "./ValueCountPill";
import { contextEntryLabel } from "./contextEntryLabel";

interface ContextPolicyItemsPopoverProps {
  conversationId: string;
  agentId: string | null;
  entries: InstanceContextEntry[];
  policyByKey: Map<string, ContextPolicy>;
  className?: string;
}

export function ContextPolicyItemsPopover({
  conversationId,
  agentId,
  entries,
  policyByKey,
  className,
}: ContextPolicyItemsPopoverProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const valueTab = useContextValueTab(conversationId);

  const count = entries.length;

  const openDetail = (entry: InstanceContextEntry) => {
    setPopoverOpen(false);
    valueTab.open(
      {
        conversationId,
        agentId,
        contextKey: entry.key,
        snapshotValue: entry.value,
        snapshotLabel: entry.label,
        snapshotType: entry.type,
      },
      contextEntryLabel(entry, policyByKey.get(entry.key)?.label),
    );
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <ValueCountPill
            text={String(count)}
            icon={Boxes}
            aria-label={`${count} sent`}
            className={className}
          />
        </PopoverTrigger>
        <PopoverContent
          sizing="content"
          align="start"
          side="top"
          sideOffset={6}
          className="p-1.5"
        >
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {entries.map((entry) => {
              const policy = policyByKey.get(entry.key);
              const type: ContextObjectType = policy?.type ?? entry.type;
              const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
              const theme = resolveContextPolicyTileTheme(type);
              const typeLabel =
                getKnownContextDefinition(entry.key)?.typeLabel ??
                CONTEXT_TYPE_TILE_LABEL[type] ??
                "";
              const label =
                contextEntryLabel(entry, policy?.label);
              // The snapshot only — a sent turn never shows today's value.
              const preview = contextPolicyEntryPreview(entry, type);

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
    </>
  );
}
