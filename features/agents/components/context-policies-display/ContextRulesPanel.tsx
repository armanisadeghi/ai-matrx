"use client";

/**
 * ContextRulesPanel — the full view of everything a conversation's next turn
 * carries, with full control.
 *
 *   ┌ sidebar ───────────────┐┌ detail ─────────────────────────────┐
 *   │ search                 ││ the value (rendered by type)        │
 *   │ Item | Include | Chars ││ Default / Page / Agent / You — per  │
 *   │ …every value…          ││ knob, the deciding layer marked     │
 *   └────────────────────────┘└─────────────────────────────────────┘
 *
 * Rows and changes come from the same door as the composer chip
 * (`selectResolvedContextRows`, `saveContextRule`), so this panel and the chip
 * can never disagree. Mobile: list, then detail with Back (inside the body).
 *
 * Mounted ONCE per rail at a stable position, so opening, closing or switching
 * values never remounts it.
 */

import { ContextRulesPanelBody } from "@ai-matrx/agents/context/react";
import type { ResolvedContextRow } from "@ai-matrx/agents/context";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { selectAgentContextPolicies } from "@/features/agents/redux/agent-definition/selectors";
import {
  selectContextInlineCap,
  selectResolvedContextRows,
} from "@/features/agents/redux/execution-system/context-rules/request-context";
import {
  useMandateKillSwitch,
  useSaveContextRule,
} from "@/features/agents/components/inputs/smart-input/ConversationContextChip";
import { AgentEditAccessBadge } from "@/features/agents/components/context-policies-management/AgentEditAccessControl";
import { decodeAgentEditAccess } from "@/features/agents/utils/agent-edit-access";
import { docKindForContextKey } from "@/features/agents/utils/workingDocumentContext";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
import { ContextValueBody } from "./ContextValueBody";
import {
  WorkingDocumentBody,
  buildWorkingDocumentDrawerItem,
} from "../context-items/bodies/WorkingDocumentBody";

export function ContextRulesPanel({
  open,
  onOpenChange,
  conversationId,
  agentId,
  selectedKey,
  onSelectedKeyChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  agentId: string | null;
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
}) {
  const isMobile = useIsMobile();
  const save = useSaveContextRule();
  const mandateKey = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.mandateKey ?? null,
  );
  const killSwitch = useMandateKillSwitch(mandateKey);
  const rows = useAppSelector(selectResolvedContextRows(conversationId, killSwitch));
  const cap = useAppSelector((state) => selectContextInlineCap(state, conversationId));
  const mismatches = useAppSelector(
    (state) => state.instanceContext.receiptByConversationId[conversationId]?.mismatches,
  );
  const policies = useAppSelector((state) =>
    agentId ? selectAgentContextPolicies(state, agentId) : undefined,
  );

  const renderDetail = (row: ResolvedContextRow) => {
    const docKind = docKindForContextKey(row.key);
    if (docKind !== null) {
      // Doc-like keys open the EDITABLE documents workspace, never a dump.
      return (
        <div className="min-h-[24rem]">
          <WorkingDocumentBody
            item={buildWorkingDocumentDrawerItem(conversationId, row.label, docKind)}
            initialKind={docKind}
          />
        </div>
      );
    }
    const policy = policies?.find((p) => p.key === row.key);
    const value =
      row.value && typeof row.value === "object" && !Array.isArray(row.value) && "content" in row.value
        ? (row.value as { content: unknown }).content
        : row.value;
    return (
      <div className="flex flex-col gap-3">
        {policy?.description || row.description ? (
          <p className="text-xs text-muted-foreground">{policy?.description ?? row.description}</p>
        ) : null}
        <ContextValueBody
          type={(policy?.type ?? row.type ?? "text") as ContextObjectType}
          contextKey={row.key}
          value={value}
        />
        {policy ? <AgentEditAccessBadge access={decodeAgentEditAccess(policy).access} /> : null}
      </div>
    );
  };

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title="Context"
      expandButtonLabel="Context"
      position="right"
      defaultSize={44}
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
    >
      <ContextRulesPanelBody
        rows={rows}
        cap={cap}
        mismatches={mismatches}
        onChange={save}
        renderDetail={renderDetail}
        isMobile={isMobile}
        selectedKey={selectedKey}
        onSelectedKeyChange={onSelectedKeyChange}
        className="min-h-0 flex-1"
      />
    </MatrxDynamicPanelHost>
  );
}
