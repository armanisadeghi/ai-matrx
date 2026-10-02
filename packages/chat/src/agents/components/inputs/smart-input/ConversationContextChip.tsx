"use client";

/**
 * ConversationContextChip — EVERY value the next turn carries, in one chip.
 *
 *   [eye  Notes  32]  → a table: Item | Include | Chars | Inline max
 *
 * The rows are `selectResolvedContextRows` — the same rows the send path turns
 * into the request (`buildRequestContext` → `buildContextWire`), so the table
 * is exactly what will be sent. A change writes the person's saved rule
 * (`saveContextRule`), which the server reads itself on every turn. After a
 * turn, the server's receipt is compared with what was shown; any difference
 * turns this chip amber (common-docs context-delivery RULES.md §6).
 *
 * The page's master switch (see the whole page / not) stays: it is the
 * surface on/off, and only exists when a page is in play.
 */

import { useEffect, useState } from "react";
import { ContextRulesChip } from "@ai-matrx/agents/context/react";
import {
  CONTEXT_RULES_FEATURE,
  type SavedContextRule,
} from "@ai-matrx/agents/context";
import { useAppDispatch, useAppSelector } from "@host/lib/redux/hooks";
import { useIsMobile } from "@host/hooks/use-mobile";
import { ensureSurfaceFeatureLoaded } from "../../../../surfaces/redux/userStateSlice";
import { selectPageContextOff } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setPageContextEnabled } from "../../../redux/execution-system/thunks/page-context.thunk";
import { getSurfaceDisplayLabel } from "../../../../surfaces/utils/surface-display";
import { useConversationDisplayRows } from "./useConversationDisplayRows";
import { useIsPageOwnConversation } from "../../../../surfaces/runtime/SurfaceRuntimeContext";
import {
  agentContextLayerKnown,
  selectContextInlineCap,
} from "../../../redux/execution-system/context-rules/request-context";
import {
  ensureAgentContextLayer,
  reloadContextRules,
  saveContextRule,
} from "../../../redux/execution-system/context-rules/context-rules.thunks";
import { resolveMandateKillSwitch } from "../../../redux/execution-system/context-rules/mandate-kill-switch";
import type { AnyMandateKey } from "@host/features/mandates/mandate-key";
import { useMachineFramesVisible } from "../../shared/transcript-audience";

/** The Mandate's context kill switch for this conversation (false until known). */
export function useMandateKillSwitch(mandateKey: AnyMandateKey | null | undefined): boolean {
  const [state, setState] = useState<{ key: AnyMandateKey | null; on: boolean }>({
    key: null,
    on: false,
  });
  useEffect(() => {
    if (!mandateKey) return undefined;
    let live = true;
    void resolveMandateKillSwitch(mandateKey).then((on) => {
      if (live) setState({ key: mandateKey, on });
    });
    return () => {
      live = false;
    };
  }, [mandateKey]);
  return Boolean(mandateKey) && state.key === mandateKey && state.on;
}

/** The person's change → their saved rule (null = back to the defaults). */
export function useSaveContextRule() {
  const dispatch = useAppDispatch();
  return (key: string, surfaceKey: string, next: SavedContextRule | null) => {
    void dispatch(
      saveContextRule({
        surfaceKey,
        key,
        rule:
          next === null
            ? null
            : { include: next.include, max_inline_chars: next.max_inline_chars },
      }),
    );
  };
}

/**
 * True when the chip has anything to show (values, or a page switched off)
 * AND its reader may see the machinery. Every mount asks this one hook.
 *
 * The table (Item · Include · Chars · Inline max over Route Brief, Lane,
 * Workspace state…) is a builder's instrument. On an expert-audience
 * transcript — the Masterwork interview — it showed as "Rulebook 35", a count
 * of context items beside a panel counting her rules (cold walk 23, defect
 * E). Creator mode still shows it: see shared/transcript-audience.tsx.
 */
export function useConversationContextChipShown(conversationId: string): boolean {
  const machineFramesVisible = useMachineFramesVisible();
  const mandateKey = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.mandateKey ?? null,
  );
  const killSwitch = useMandateKillSwitch(mandateKey);
  // DISPLAY rows: what the server added on the last turn counts too, so a chat
  // whose next turn sends nothing of its own still shows (and governs) them.
  const rows = useConversationDisplayRows(conversationId, killSwitch);
  const stamped = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.surfaceName ?? null,
  );
  const off = useAppSelector(selectPageContextOff(conversationId));
  const ownPage = useIsPageOwnConversation(conversationId);
  if (!machineFramesVisible) return false;
  return rows.length > 0 || (!ownPage && (Boolean(stamped) || Boolean(off?.previousSurfaceName)));
}

export function ConversationContextChip({
  conversationId,
  onOpenFullView,
}: {
  conversationId: string;
  /** Open the full view, optionally on one value. */
  onOpenFullView: (key?: string) => void;
}) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const save = useSaveContextRule();

  // The person's saved rules — loaded as soon as a composer shows, so the
  // first send never waits on them.
  useEffect(() => {
    void dispatch(ensureSurfaceFeatureLoaded(CONTEXT_RULES_FEATURE));
    // Another tab or device may have changed a rule: coming back re-reads them.
    const onFocus = () => void dispatch(reloadContextRules());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [dispatch]);

  const mandateKey = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.mandateKey ?? null,
  );
  const killSwitch = useMandateKillSwitch(mandateKey);
  const rows = useConversationDisplayRows(conversationId, killSwitch);
  const cap = useAppSelector((state) => selectContextInlineCap(state, conversationId));
  const receiptEntry = useAppSelector(
    (state) => state.instanceContext.receiptByConversationId[conversationId],
  );
  const stamped = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.surfaceName ?? null,
  );
  const off = useAppSelector(selectPageContextOff(conversationId));
  // The page's OWN conversation never shares the page (it IS the page), so its
  // chip names no page and offers no page switch — even when an older launch
  // stamped one on it. Reactive: the page's provider may register after the
  // chip first renders (a route swap remounts it).
  const ownPage = useIsPageOwnConversation(conversationId);
  const surfaceName = ownPage
    ? null
    : (stamped ?? off?.previousSurfaceName ?? null);

  // The agent's own layer (Context Policies, kill switch) decides what each
  // row delivers. Until its definition is read, the chip shows the count and
  // claims no per-row delivery; it loads it now.
  const agentLayerKnown = useAppSelector((state) => agentContextLayerKnown(state, conversationId));
  const agentReadFailed = useAppSelector((state) => {
    const agentId = state.conversations.byConversationId[conversationId]?.agentId;
    return Boolean(agentId && state.agentDefinition.agents?.[agentId]?._error);
  });
  useEffect(() => {
    if (!agentLayerKnown) void dispatch(ensureAgentContextLayer(conversationId));
  }, [dispatch, agentLayerKnown, conversationId]);

  // Nothing to show and no page to switch: no chip at all (never "Context 0").
  if (!surfaceName && rows.length === 0) return null;

  if (!agentLayerKnown) {
    const label = surfaceName ? getSurfaceDisplayLabel(surfaceName) : "Context";
    return (
      <span
        role="status"
        aria-busy={!agentReadFailed}
        title={agentReadFailed ? "Couldn't read this agent's context rules" : "Reading this agent's context rules"}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
      >
        {label}
        <span className="tabular-nums">{agentReadFailed ? "—" : rows.length}</span>
      </span>
    );
  }

  const mismatches = receiptEntry?.mismatches ?? [];
  const resetAll = () => {
    for (const row of rows) {
      if (row.userRule) save(row.key, row.surfaceKey, null);
    }
  };

  return (
    <ContextRulesChip
      label={surfaceName ? getSurfaceDisplayLabel(surfaceName) : "Context"}
      rows={rows}
      cap={cap}
      on={surfaceName ? !off : undefined}
      onToggleAll={
        surfaceName
          ? (next) => void dispatch(setPageContextEnabled({ conversationId, enabled: next }))
          : undefined
      }
      modelReadsContext={receiptEntry?.receipt.model_reads_context !== false}
      onChange={save}
      onResetAll={resetAll}
      onOpenFullView={() => onOpenFullView()}
      onOpenRow={(key) => onOpenFullView(key)}
      mismatchCount={mismatches.length}
      mismatches={mismatches}
      isMobile={isMobile}
    />
  );
}
