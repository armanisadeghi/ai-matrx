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
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { useIsMobile } from "@ai-matrx/kit/media-query";
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
import { ContextDeliveredBlock, type DeliveredRef, type DeliveredRefBlock } from "./ContextDeliveredBlock";
import {
  loadContextView,
  selectDisplayReceiptBlocks,
  selectDisplayReceiptMessageId,
  type ContextViewLoader,
} from "../../redux/execution-system/context-rules/context-viewer";

/**
 * @ai-matrx/agents ≥ 0.29.0 fetches what the agent received on demand in the
 * panel detail itself (`DeliveredSection`, `loadView`) and lists the receipt's
 * blocks under "Also sent" (`blocks`). An older installed build would render a
 * ref as an empty text, so the host strips the refs from its rows and renders
 * the detail itself. Retire with the 0.29.0 adoption.
 */
const PACKAGE_FETCHES_ON_DEMAND = "DeliveredSection" in contextReact;

/** Blocks the model read as part of a value (the package's `CONTEXT_ROW_BLOCKS` ≥ 0.29.0). */
const ROW_BLOCKS: Readonly<Record<string, readonly string[]>> =
  (contextCore as { CONTEXT_ROW_BLOCKS?: Record<string, readonly string[]> }).CONTEXT_ROW_BLOCKS ?? {
    organization: ["organization_catalog"],
  };

type RowRefs = { delivered?: DeliveredRef | null; onRequest?: DeliveredRef | null; deliveredBlocks?: DeliveredRefBlock[] };

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
  const dispatch = useAppDispatch();
  const save = useSaveContextRule();
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
  const refsByKey = new Map(displayRows.map((row) => [row.key, row as ResolvedContextRow & RowRefs]));
  const rows = PACKAGE_FETCHES_ON_DEMAND
    ? displayRows
    : displayRows.map((row) => {
        const { delivered: _d, onRequest: _o, ...rest } = row as ResolvedContextRow & RowRefs;
        return rest as ResolvedContextRow;
      });
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
    const refs = refsByKey.get(row.key) ?? (row as ResolvedContextRow & RowRefs);
    const received = Boolean(refs.delivered || refs.onRequest);
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
          PACKAGE_FETCHES_ON_DEMAND ? null : (
            <ContextDeliveredBlock
              rowKey={row.key}
              delivered={refs.delivered}
              onRequest={refs.onRequest}
              blocks={
                refs.deliveredBlocks ??
                (refs.delivered
                  ? blocks.filter((b) => (ROW_BLOCKS[row.key] ?? []).includes(b.id))
                  : undefined)
              }
              load={loadView}
            />
          )
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
        // Spread: @ai-matrx/agents < 0.29.0 has neither prop (it ignores them).
        {...({ blocks, loadView } as object)}
        renderDetail={renderDetail}
        isMobile={isMobile}
        selectedKey={selectedKey}
        onSelectedKeyChange={onSelectedKeyChange}
        className="min-h-0 flex-1"
      />
    </MatrxDynamicPanelHost>
  );
}
