"use client";

/**
 * ContextPolicyDetail
 *
 * The full detail of a single context value a SENT message carried: key,
 * type, label, description, inline policy, and the value rendered by type
 * (markdown / JSON / link / entity card). A plain body: the host shows it in a
 * canvas tab (kind `context-value`, `contextValueTab.ts`), whose pane header
 * carries the label and the close.
 *
 * The value, label and type come from the message's snapshot ONLY — never
 * from live conversation context (a sent turn showing today's value is the
 * lie this view used to tell). The policy definition is read from the agent.
 */

import { useMemo } from "react";
import { EntityRef } from "@host/components/official/entity-ref/EntityRef";
import { useAppSelector } from "../../../store/hooks";
import type { ChatRootState } from "../../../store/root-state";
import { selectAgentContextPolicies } from "../../redux/agent-definition/selectors";
import type {
  ContextObjectType,
  ContextPolicy,
} from "../../types/agent-api-types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
  CONTEXT_TYPE_CHIP_CLASS,
} from "./contextPolicyIcons";
import { AgentEditAccessBadge } from "@host/features/agents/components/context-policies-management/AgentEditAccessControl";
import {
  AGENT_EDIT_SAVE_SUMMARY,
  decodeAgentEditAccess,
} from "../../utils/agent-edit-access";
import { docKindForContextKey } from "../../utils/workingDocumentContext";
import { resolveContextEntryValue } from "./knownContextValues";
import { ContextValueBody } from "./ContextValueBody";
import {
  WorkingDocumentBody,
  buildWorkingDocumentDrawerItem,
} from "../context-items/bodies/WorkingDocumentBody";
import { cn } from "@ai-matrx/design-system";

export interface ContextPolicyDetailProps {
  conversationId: string;
  agentId: string | null;
  contextKey: string;
  /** Frozen value from the message snapshot. */
  snapshotValue?: unknown;
  /** Frozen label from the message snapshot. */
  snapshotLabel?: string;
  /** Frozen type from the message snapshot. */
  snapshotType?: ContextObjectType;
}

export function ContextPolicyDetail({
  conversationId,
  agentId,
  contextKey,
  snapshotValue,
  snapshotLabel,
  snapshotType,
}: ContextPolicyDetailProps) {
  const policy = useAppSelector((state: ChatRootState): ContextPolicy | undefined => {
    if (!agentId) return undefined;
    const policies = selectAgentContextPolicies(state, agentId);
    return policies?.find((s) => s.key === contextKey);
  });

  const displayValue = useMemo(
    () =>
      resolveContextEntryValue({
        key: contextKey,
        value: snapshotValue,
        label: snapshotLabel,
      }),
    [contextKey, snapshotValue, snapshotLabel],
  );

  const type: ContextObjectType = policy?.type ?? snapshotType ?? "text";
  const Icon = CONTEXT_TYPE_ICON[type] ?? FALLBACK_CONTEXT_ICON;
  const chipClass =
    CONTEXT_TYPE_CHIP_CLASS[type] ?? CONTEXT_TYPE_CHIP_CLASS.text;

  const label = policy?.label?.trim() || snapshotLabel?.trim() || contextKey;
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {docKind !== null ? null : (
        <div className="flex min-w-0 shrink-0 items-center gap-2.5 border-b border-border px-4 py-2">
          <span
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
              chipClass,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {contextKey} · {type}
          </span>
        </div>
      )}
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
    </div>
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
