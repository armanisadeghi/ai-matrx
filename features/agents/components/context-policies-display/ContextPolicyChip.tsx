"use client";

/**
 * ContextPolicyChip
 *
 * One context policy value on a user message — tile layout matching
 * ResourceAttachmentTile. Click → ContextPolicyDetailSheet.
 */

import { useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import type {
  ContextObjectType,
  ContextPolicy,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { CONTEXT_TYPE_ICON, FALLBACK_CONTEXT_ICON } from "./contextPolicyIcons";
import { CONTEXT_TYPE_TILE_LABEL } from "./contextPolicyTile.theme";
import { contextPolicyEntryPreview } from "./contextPolicyPreview";
import { ContextPolicyDetailSheet } from "./ContextPolicyDetailSheet";
import { ContextPolicyTile } from "./ContextPolicyTile";

interface ContextPolicyChipProps {
  conversationId: string;
  agentId: string | null;
  entry: InstanceContextEntry;
  /** Matching policy definition if the key is declared on the agent. */
  policy?: ContextPolicy;
  className?: string;
}

export function ContextPolicyChip({
  conversationId,
  agentId,
  entry,
  policy,
  className,
}: ContextPolicyChipProps) {
  const [open, setOpen] = useState(false);

  const type: ContextObjectType = policy?.type ?? entry.type;
  const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
  const typeLabel = CONTEXT_TYPE_TILE_LABEL[type] ?? "Context";

  const label = policy?.label?.trim() || entry.label?.trim() || entry.key;
  const liveEntry = useAppSelector(
    selectInstanceContextEntry(conversationId, entry.key),
  );
  const preview = useMemo(
    () => contextPolicyEntryPreview(entry, type, liveEntry?.value),
    [entry, type, liveEntry?.value],
  );
  const tooltip = preview ? `${label} — ${preview}` : label;

  return (
    <>
      <ContextPolicyTile
        typeLabel={typeLabel}
        title={label}
        icon={Icon}
        themeKey={type}
        tooltip={tooltip}
        onClick={() => setOpen(true)}
        className={className}
      />
      <ContextPolicyDetailSheet
        open={open}
        onOpenChange={setOpen}
        conversationId={conversationId}
        agentId={agentId}
        contextKey={entry.key}
        snapshotValue={entry.value}
      />
    </>
  );
}
