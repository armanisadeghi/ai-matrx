"use client";

/**
 * ContextSlotDetailSheet
 *
 * Right-side sheet that shows the full detail of a single context slot value
 * attached to a request: key, type, label, description, inline policy, and
 * the value rendered by type (markdown / JSON / link / entity card).
 *
 * Reads the slot definition (if any) from the agent definition keyed by
 * `agentId`, and the live value from `state.instanceContext.byConversationId`.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectAgentContextSlots } from "@/features/agents/redux/agent-definition/selectors";
import { selectInstanceContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
  CONTEXT_TYPE_CHIP_CLASS,
} from "./contextSlotIcons";
import { WORKING_DOCUMENT_CONTEXT_KEY } from "@/features/agents/utils/workingDocumentContext";
import {
  KnownContextDetail,
  getKnownContextDefinition,
  isKnownContextKey,
  parseContextRecord,
  resolveContextEntryValue,
} from "./knownContextValues";
import {
  WorkingDocumentBody,
  buildWorkingDocumentDrawerItem,
} from "../context-items/bodies/WorkingDocumentBody";
import { cn } from "@/lib/utils";

const MarkdownStream = dynamic(() => import("@/components/MarkdownStream"), {
  ssr: false,
});

interface ContextSlotDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  agentId: string | null;
  contextKey: string;
  /** Frozen value from the message snapshot — required for ambient keys (user, client, …) that never live in `instanceContext`. */
  snapshotValue?: unknown;
}

export function ContextSlotDetailSheet({
  open,
  onOpenChange,
  conversationId,
  agentId,
  contextKey,
  snapshotValue,
}: ContextSlotDetailSheetProps) {
  const slot = useAppSelector((state: RootState): ContextSlot | undefined => {
    if (!agentId) return undefined;
    const slots = selectAgentContextSlots(state, agentId);
    return slots?.find((s) => s.key === contextKey);
  });

  const entry = useAppSelector(
    selectInstanceContextEntry(conversationId, contextKey),
  );

  const displayValue = useMemo(
    () =>
      resolveContextEntryValue(
        {
          key: contextKey,
          value: snapshotValue,
          label: entry?.label,
        },
        entry?.value,
      ),
    [contextKey, snapshotValue, entry?.label, entry?.value],
  );

  const type: ContextObjectType = slot?.type ?? entry?.type ?? "text";
  const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
  const chipClass =
    CONTEXT_TYPE_CHIP_CLASS[type] ?? CONTEXT_TYPE_CHIP_CLASS.text;

  const label = slot?.label?.trim() || entry?.label?.trim() || contextKey;
  const isWorkingDocument = contextKey === WORKING_DOCUMENT_CONTEXT_KEY;

  const workingDocItem = useMemo(
    () => buildWorkingDocumentDrawerItem(conversationId, label),
    [conversationId, label],
  );

  const inlinePolicyText = useMemo(() => {
    const mic = slot?.max_inline_chars;
    if (mic === undefined || mic === null)
      return "Default — inline if ≤ 200 chars.";
    if (mic === 0) return "Never inline — always fetched via ctx_get.";
    return `Custom ceiling — inline up to ${mic} chars.`;
  }, [slot?.max_inline_chars]);

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
              chipClass,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate">{label}</span>
        </span>
      }
      description={
        isWorkingDocument ? undefined : (
          <span className="font-mono">
            {contextKey} · {type}
          </span>
        )
      }
      expandButtonLabel="Context slot"
      position="right"
      defaultSize={isWorkingDocument ? 44 : 34}
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
    >
      {isWorkingDocument ? (
        <div className="min-h-0 flex-1">
          <WorkingDocumentBody item={workingDocItem} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {slot?.description && (
            <DetailSection title="Description">
              <p className="whitespace-pre-wrap text-xs text-foreground/85">
                {slot.description}
              </p>
            </DetailSection>
          )}

          <DetailSection title="Value">
            <ValueRenderer
              type={type}
              contextKey={contextKey}
              value={displayValue}
            />
          </DetailSection>

          <DetailSection title="Inline policy">
            <p className="text-xs text-muted-foreground">{inlinePolicyText}</p>
          </DetailSection>

          {slot?.summary_agent_id && (
            <DetailSection title="Summary sub-agent">
              <p className="break-all font-mono text-[11px] text-muted-foreground">
                {slot.summary_agent_id}
              </p>
            </DetailSection>
          )}

          {slot?.mutable && (
            <DetailSection title="Mutation">
              <p className="text-xs text-muted-foreground">
                Mutable · persist{" "}
                <span className="font-mono">{slot.persist ?? "never"}</span>
              </p>
              {slot.persist === "auto" && slot.source && (
                <pre className="mt-1.5 overflow-x-auto rounded border border-border bg-muted/40 p-2 font-mono text-[11px]">
                  {JSON.stringify(slot.source, null, 2)}
                </pre>
              )}
            </DetailSection>
          )}

          {!slot && (
            <DetailSection title="Ad-hoc key">
              <p className="text-[11px] text-muted-foreground">
                This key isn't declared on the agent. Type is inferred at
                runtime and ctx_get falls back to system defaults.
              </p>
            </DetailSection>
          )}
        </div>
      )}
    </MatrxDynamicPanelHost>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-4 py-3 last:border-b-0">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ValueRenderer({
  type,
  contextKey,
  value,
}: {
  type: ContextObjectType;
  contextKey: string;
  value: unknown;
}) {
  if (value === undefined || value === null) {
    return (
      <p className="text-[11px] italic text-muted-foreground/70">
        No value set for this conversation.
      </p>
    );
  }

  if (
    isKnownContextKey(contextKey) &&
    parseContextRecord(value) &&
    getKnownContextDefinition(contextKey)
  ) {
    return <KnownContextDetail contextKey={contextKey} value={value} />;
  }

  const v = value;

  if (type === "file_url" && typeof v === "string") {
    return (
      <a
        href={v}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 break-all text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="break-all">{v}</span>
      </a>
    );
  }

  if (type === "text" && typeof v === "string") {
    return (
      <div className="text-xs">
        <MarkdownStream content={v} hideCopyButton />
      </div>
    );
  }

  if (type === "variable" && (typeof v === "string" || typeof v === "number")) {
    return (
      <p className="break-words font-mono text-xs text-foreground">
        {String(v)}
      </p>
    );
  }

  let pretty: string;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      pretty = JSON.stringify(parsed, null, 2);
    } catch {
      pretty = v;
    }
  } else {
    try {
      pretty = JSON.stringify(v, null, 2);
    } catch {
      pretty = String(v);
    }
  }
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded border border-border bg-muted/40 p-2 font-mono text-[11px]">
      {pretty}
    </pre>
  );
}
