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
 * It is the body of the host's canvas tab `conversation-context` (one per
 * conversation, `host/canvas-tabs.ts`); the pane header is its chrome, so it
 * draws no header or close of its own. The composer chip toggles that tab.
 */

import { useConversationDisplayRows } from "../inputs/smart-input/useConversationDisplayRows";
import { ContextRulesPanelBody } from "@ai-matrx/agents/context/react";
import {
  isServerAuthoritativeKey,
  type ContextViewLoader,
  type ResolvedContextRow,
} from "@ai-matrx/agents/context";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { selectAgentContextPolicies } from "../../redux/agent-definition/selectors";
import {
  selectContextInlineCap,
} from "../../redux/execution-system/context-rules/request-context";
import {
  useConversationContextHierarchy,
  useMandateKillSwitch,
  useSaveContextRule,
  useSaveContextRules,
} from "../inputs/smart-input/ConversationContextChip";
import { AgentEditAccessBadge } from "@host/features/agents/components/context-policies-management/AgentEditAccessControl";
import { decodeAgentEditAccess } from "../../utils/agent-edit-access";
import { docKindForContextKey } from "../../utils/workingDocumentContext";
import type { ContextObjectType } from "../../types/agent-api-types";
import { ContextValueBody } from "./ContextValueBody";
import {
  loadContextView,
  selectDisplayReceiptBlocks,
  selectDisplayReceiptMessageId,
} from "../../redux/execution-system/context-rules/context-viewer";

/**
 * RULES.md §5a: the server states these values itself and drops the page's
 * copy, so before any receipt the detail never shows the page's guess as what
 * will be sent (the package's panel detail says "Filled in by the server").
 */
export const isServerOwnedContextKey: (key: string) => boolean = isServerAuthoritativeKey;

import {
  WorkingDocumentBody,
  buildWorkingDocumentDrawerItem,
} from "../context-items/bodies/WorkingDocumentBody";

export function ContextRulesPanel({
  conversationId,
  agentId,
  selectedKey,
  onSelectedKeyChange,
  narrow = false,
}: {
  conversationId: string;
  agentId: string | null;
  selectedKey: string | null;
  onSelectedKeyChange: (key: string | null) => void;
  /** The space it has is one column (a narrow pane): list, then detail with Back. */
  narrow?: boolean;
}) {
  const isMobile = useIsMobile() || narrow;
  const dispatch = useAppDispatch();
  const save = useSaveContextRule();
  const saveMany = useSaveContextRules();
  // The same levels, groups and switches as the composer's chip.
  const hierarchy = useConversationContextHierarchy(conversationId);
  // THE VIEWER (RULES.md §5b): the turn the full view shows — the receipt's own
  // message, or the next turn before any receipt. Called only when a detail opens.
  const receiptMessageId = useAppSelector((state) =>
    selectDisplayReceiptMessageId(state, conversationId),
  );
  const blocks = useAppSelector((state) => selectDisplayReceiptBlocks(state, conversationId));
  const loadView: ContextViewLoader = (target) =>
    dispatch(loadContextView({ conversationId, messageId: receiptMessageId, agentId }, target));
  const mandateKey = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.mandateKey ?? null,
  );
  const killSwitch = useMandateKillSwitch(mandateKey);
  const displayRows = useConversationDisplayRows(conversationId, killSwitch);
  const rows = displayRows;
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
    // RULES.md §5: when the receipt says what the model read for this value,
    // THAT is the content — never the client's pre-send copy (Arman, 2026-10-01).
    // The package's panel detail shows what the agent received (fetched on open,
    // RULES.md §5b) and says a server-owned value is filled in by the server.
    const received = Boolean(row.delivered || row.onRequest);
    const serverOwned = !received && isServerOwnedContextKey(row.key);
    const value =
      row.value && typeof row.value === "object" && !Array.isArray(row.value) && "content" in row.value
        ? (row.value as { content: unknown }).content
        : row.value;
    return (
      <div className="flex flex-col gap-3">
        {/* A value's `description` is written for the AGENT (code names, wire shapes) — it never
            renders to a person (interface-text law: author-facing text stays off screen). */}
        {received || serverOwned ? null : (
          <>
            {value !== undefined && value !== null ? (
              <p className="text-xs font-medium">Will send</p>
            ) : null}
            <ContextValueBody
              type={(policy?.type ?? row.type ?? "text") as ContextObjectType}
              contextKey={row.key}
              value={value}
            />
          </>
        )}
        {policy ? <AgentEditAccessBadge access={decodeAgentEditAccess(policy).access} /> : null}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <ContextRulesPanelBody
        rows={rows}
        cap={cap}
        mismatches={mismatches}
        onChange={save}
        hierarchy={hierarchy}
        onSetInclude={saveMany}
        blocks={blocks}
        loadView={loadView}
        renderDetail={renderDetail}
        isMobile={isMobile}
        selectedKey={selectedKey}
        onSelectedKeyChange={onSelectedKeyChange}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
