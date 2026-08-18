"use client";

/**
 * ContextPolicyDetailSheet
 *
 * Right-side sheet that shows the full detail of a single context policy value
 * attached to a request: key, type, label, description, inline policy, and
 * the value rendered by type (markdown / JSON / link / entity card).
 *
 * Reads the policy definition (if any) from the agent definition keyed by
 * `agentId`, and the live value from `state.instanceContext.byConversationId`.
 */

import { useMemo } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectAgentContextPolicies } from "@/features/agents/redux/agent-definition/selectors";
import { selectInstanceContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import type {
  ContextObjectType,
  ContextPolicy,
} from "@/features/agents/types/agent-api-types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
  CONTEXT_TYPE_CHIP_CLASS,
} from "./contextPolicyIcons";
import { AgentEditAccessBadge } from "@/features/agents/components/context-policies-management/AgentEditAccessControl";
import {
  AGENT_EDIT_SAVE_SUMMARY,
  decodeAgentEditAccess,
} from "@/features/agents/utils/agent-edit-access";
import { docKindForContextKey } from "@/features/agents/utils/workingDocumentContext";
import { resolveContextEntryValue } from "./knownContextValues";
import { ContextValueBody } from "./ContextValueBody";
import {
  WorkingDocumentBody,
  buildWorkingDocumentDrawerItem,
} from "../context-items/bodies/WorkingDocumentBody";
import { cn } from "@/lib/utils";

interface ContextPolicyDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  agentId: string | null;
  contextKey: string;
  /** Frozen value from the message snapshot — required for ambient keys (user, client, …) that never live in `instanceContext`. */
  snapshotValue?: unknown;
}

export function ContextPolicyDetailSheet({
  open,
  onOpenChange,
  conversationId,
  agentId,
  contextKey,
  snapshotValue,
}: ContextPolicyDetailSheetProps) {
  const policy = useAppSelector((state: RootState): ContextPolicy | undefined => {
    if (!agentId) return undefined;
    const policies = selectAgentContextPolicies(state, agentId);
    return policies?.find((s) => s.key === contextKey);
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

  const type: ContextObjectType = policy?.type ?? entry?.type ?? "text";
  const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
  const chipClass =
    CONTEXT_TYPE_CHIP_CLASS[type] ?? CONTEXT_TYPE_CHIP_CLASS.text;

  const label = policy?.label?.trim() || entry?.label?.trim() || contextKey;
  // Doc-like keys (working document, scratchpad, future doc kinds) route to
  // the EDITABLE documents workspace — never the readonly value dump below.
  const docKind = docKindForContextKey(contextKey);

  const workingDocItem = useMemo(
    () =>
      buildWorkingDocumentDrawerItem(
        conversationId,
        label,
        docKind ?? "working",
      ),
    [conversationId, label, docKind],
  );

  const inlinePolicyText = useMemo(() => {
    const mic = policy?.max_inline_chars;
    if (mic === undefined || mic === null)
      return "Default — inline if ≤ 200 chars.";
    if (mic === 0) return "Never inline — always fetched via ctx_get.";
    return `Custom ceiling — inline up to ${mic} chars.`;
  }, [policy?.max_inline_chars]);

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
        docKind !== null ? undefined : (
          <span className="font-mono">
            {contextKey} · {type}
          </span>
        )
      }
      expandButtonLabel="Context policy"
      position="right"
      defaultSize={docKind !== null ? 44 : 34}
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
    >
      {docKind !== null ? (
        <div className="min-h-0 flex-1">
          <WorkingDocumentBody item={workingDocItem} initialKind={docKind} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {policy?.description && (
            <DetailSection title="Description">
              <p className="whitespace-pre-wrap text-xs text-foreground/85">
                {policy.description}
              </p>
            </DetailSection>
          )}

          <DetailSection title="Value">
            <ContextValueBody
              type={type}
              contextKey={contextKey}
              value={displayValue}
            />
          </DetailSection>

          <DetailSection title="Inline policy">
            <p className="text-xs text-muted-foreground">{inlinePolicyText}</p>
          </DetailSection>

          {policy?.summary_agent_id && (
            <DetailSection title="Summary sub-agent">
              <EntityRef
                token="agent"
                id={policy.summary_agent_id}
                name={policy.summary_agent_id}
                openInNewTab
                wrap
                alwaysShowActions
                className="font-mono text-[11px] text-muted-foreground"
              />
            </DetailSection>
          )}

          {policy && (
            <DetailSection title="Agent access">
              <AgentEditAccessBadge access={decodeAgentEditAccess(policy).access} />
              {policy.mutable && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {AGENT_EDIT_SAVE_SUMMARY[policy.persist ?? "never"]}
                </p>
              )}
              {policy.mutable && policy.persist === "auto" && policy.source && (
                <pre className="mt-1.5 overflow-x-auto rounded border border-border bg-muted/40 p-2 font-mono text-[11px]">
                  {JSON.stringify(policy.source, null, 2)}
                </pre>
              )}
            </DetailSection>
          )}

          {!policy && (
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
