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

import { useConversationDisplayRows } from "../inputs/smart-input/useConversationDisplayRows";
import * as contextReact from "@ai-matrx/agents/context/react";
import * as contextCore from "@ai-matrx/agents/context";
import { ContextRulesPanelBody } from "@ai-matrx/agents/context/react";
import type { ResolvedContextRow } from "@ai-matrx/agents/context";
import { MatrxDynamicPanelHost } from "@host/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppSelector } from "@host/lib/redux/hooks";
import { useIsMobile } from "@host/hooks/use-mobile";
import { selectAgentContextPolicies } from "../../redux/agent-definition/selectors";
import {
  selectContextInlineCap,
} from "../../redux/execution-system/context-rules/request-context";
import {
  useMandateKillSwitch,
  useSaveContextRule,
} from "../inputs/smart-input/ConversationContextChip";
import { AgentEditAccessBadge } from "@host/features/agents/components/context-policies-management/AgentEditAccessControl";
import { decodeAgentEditAccess } from "../../utils/agent-edit-access";
import { docKindForContextKey } from "../../utils/workingDocumentContext";
import type { ContextObjectType } from "../../types/agent-api-types";
import { ContextValueBody } from "./ContextValueBody";
import { ContextDeliveredBlock } from "./ContextDeliveredBlock";
import type { ContextDeliveredFields } from "../../redux/execution-system/context-rules/receipt-check";

/**
 * @ai-matrx/agents ≥ 0.27.0 renders what the agent received in the panel
 * detail itself (`ContextDeliveredValue`); an older installed build does not,
 * so the host renders it. Retire with the 0.27.0 adoption.
 */
const PACKAGE_SHOWS_DELIVERED = "ContextDeliveredValue" in contextReact;

/**
 * RULES.md §5a: the server states these values itself and drops the page's
 * copy, so before any receipt the detail never shows the page's guess as what
 * will be sent. @ai-matrx/agents ≥ 0.28.0 exports the registry (and its panel
 * detail says so itself); the fallback is that table, retired with adoption.
 */
const PACKAGE_KNOWS_SERVER_OWNED = "isServerAuthoritativeKey" in contextCore;
const SERVER_OWNED_FALLBACK = new Set(["user", "client", "organization", "active_scopes"]);
export function isServerOwnedContextKey(key: string): boolean {
  const fromPackage = (contextCore as { isServerAuthoritativeKey?: (k: string) => boolean })
    .isServerAuthoritativeKey;
  return fromPackage ? fromPackage(key) : SERVER_OWNED_FALLBACK.has(key);
}
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
  const rows = useConversationDisplayRows(conversationId, killSwitch);
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
    const delivered = row as ResolvedContextRow & ContextDeliveredFields;
    const received = Boolean(delivered.delivered || delivered.onRequest);
    const serverOwned = !received && isServerOwnedContextKey(row.key);
    const value =
      row.value && typeof row.value === "object" && !Array.isArray(row.value) && "content" in row.value
        ? (row.value as { content: unknown }).content
        : row.value;
    return (
      <div className="flex flex-col gap-3">
        {policy?.description || row.description ? (
          <p className="text-xs text-muted-foreground">{policy?.description ?? row.description}</p>
        ) : null}
        {received ? (
          PACKAGE_SHOWS_DELIVERED ? null : <ContextDeliveredBlock fields={delivered} />
        ) : serverOwned ? (
          PACKAGE_KNOWS_SERVER_OWNED ? null : (
            <p data-testid="context-server-fills" className="text-xs text-muted-foreground">
              Filled in by the server
            </p>
          )
        ) : (
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
