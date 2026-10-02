"use client";

/**
 * useContextPreview — fetches the SERVER-RESOLVED agent context for the
 * user's current settings from `POST /ai/context/preview`.
 *
 * TRUTHFULNESS CONTRACT: the endpoint builds its block with the ONE function
 * the agent-run path calls (`turn_context.assemble_turn_context`, plus
 * `resolve_scope_bindings` when an agent is given) with the same arguments —
 * the response is what the model actually receives, not a recreation, and it
 * says so in `provenance` (function, module, git sha). Never replace this with
 * a client-side approximation.
 *
 * organization_id is local-first: an existing conversation's durable org
 * overrides the active app org, while an agent-only preview inherits the
 * active app org from callApi. project_id / task_id still inherit active
 * app context; scope_ids are passed explicitly from the active selections.
 *
 * THE ONE DOOR: for a conversation, the request carries the context fields a
 * send of that conversation would carry — `context`, `context_withheld`, the
 * page rule `page_context` and the surface — from `buildPreviewRequestContext`
 * (the same `buildRequestContext` call every request builder makes). So the
 * preview's receipt is the turn's, the page's own conversation (a battle
 * column) and a switched-off page included (RULES.md §0).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@host/lib/redux/hooks";
import { callApi } from "@host/lib/api/call-api";
import { selectScopeSelectionsContext } from "@host/lib/redux/slices/appContextSlice";
import { selectConversationScopeIds } from "../../redux/execution-system/conversations/conversations.selectors";
import {
  buildPreviewRequestContext,
  pageContextFor,
  selectResolvedContextRows,
} from "../../redux/execution-system/context-rules/request-context";
import { extractErrorMessage } from "@host/utils/errors";
import type { components } from "@host/types/python-generated/api-types";

export type ContextSelection = components["schemas"]["ContextSelection"];

/** The server's answer; `receipt` is the run path's gate over this turn (RULES.md §5). */
export type ContextPreviewResponse = components["schemas"]["ContextPreviewResponse"];

export type ContextPreviewStatus = "idle" | "loading" | "ready" | "error";

export interface ContextPreviewState {
  status: ContextPreviewStatus;
  data: ContextPreviewResponse | null;
  error: string | null;
  refresh: () => void;
}

/**
 * Which resolver answers. `old` — the current context system (what every run
 * delivers today). `both` — the old side's values, plus `compare` carrying both
 * resolvers side by side with every difference classed (lane SC-3').
 */
export type ContextPreviewPath = "old" | "both";

export function useContextPreview(opts: {
  conversationId?: string;
  agentId?: string;
  /** Fetch only while the preview surface is actually open. */
  enabled: boolean;
  path?: ContextPreviewPath;
  /**
   * The context inspector's drill-down (Organization → Scope type → Scope →
   * Context item) — the server's own `ContextSelection`. When given it is the
   * WHOLE selection: it replaces the active selections, and its organization is
   * the request's (access is personal — the object names its organization; the
   * active selection and the picker are never consulted for it, ORG-GATE-AUDIT,
   * VERIFIER-20 #2). The server expands it once for both sides of the compare.
   */
  selection?: ContextSelection;
}): ContextPreviewState {
  const { conversationId, agentId, enabled, path = "old" } = opts;
  const chosen = opts.selection ?? null;
  const dispatch = useAppDispatch();

  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const conversationScope = useAppSelector(
    selectConversationScopeIds(conversationId ?? ""),
  );
  // Keyed by VALUE (a string), and empty while a selection is given: the active selections
  // are not this request's, so their object identity changing must never refetch it.
  const activeKey = chosen
    ? ""
    : Object.values(scopeSelections)
        .filter((v): v is string => !!v)
        .join(",");
  const scopeIds = useMemo(() => activeKey.split(",").filter(Boolean), [activeKey]);
  // One stable key per selection, so a re-render with an equal object never refetches.
  const selectionKey = chosen ? JSON.stringify(chosen) : null;
  // The door's inputs: a change to the rows the composer shows, or to the page
  // rule, re-resolves the preview (the fields themselves are read at send time).
  const doorRows = useAppSelector((state) =>
    conversationId ? selectResolvedContextRows(conversationId)(state) : null,
  );
  const pageRuleKey = useAppSelector((state) =>
    conversationId ? JSON.stringify(pageContextFor(state, conversationId)) : "",
  );

  // Starts in "loading": the hook fetches on mount (the panel only mounts
  // while open). Later selection changes silently re-resolve — the previous
  // result stays on screen until the fresh one lands.
  const [status, setStatus] = useState<ContextPreviewStatus>("loading");
  const [data, setData] = useState<ContextPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  // No synchronous setState — safe to call from the effect below; state only
  // changes when the response lands. The manual Refresh button wraps this
  // with an immediate "loading" flip (event handler, so that's allowed).
  // The object's organization (explicit) wins over a conversation's durable one.
  const requestOrganizationId =
    chosen?.organization_id ?? conversationScope.organizationId ?? null;
  const fetchPreview = useCallback(() => {
    const seq = ++requestSeq.current;
    const doorFields = conversationId
      ? dispatch((_d, getState) => buildPreviewRequestContext(getState(), conversationId))
      : {};
    void dispatch(
      callApi({
        path: "/ai/context/preview",
        method: "POST",
        // A preview that re-fires as the selection changes — never a question.
        interactiveOrganization: false,
        body: {
          conversation_id: conversationId ?? null,
          agent_id: agentId ?? null,
          ...(selectionKey
            ? { selection: JSON.parse(selectionKey) as ContextSelection }
            : { scope_ids: scopeIds }),
          ...(path !== "old" ? { path } : {}),
          ...doorFields,
        },
        scopeOverrides: requestOrganizationId
          ? { organization_id: requestOrganizationId }
          : undefined,
      }),
    ).then((result) => {
      if (seq !== requestSeq.current) return; // superseded
      if (result.error) {
        setStatus("error");
        // `extractErrorMessage` answers the string "Unknown error" for an
        // absent detail — truthy — so an `||` chain could never reach the
        // server's own message, and every failure without a `detail` body
        // rendered as "Unknown error" with the real sentence one property
        // away. Ask it only when there IS a detail.
        const detail = result.error.serverDetail
          ? extractErrorMessage(result.error.serverDetail)
          : "";
        setError(detail || result.error.message || "Unknown error");
        return;
      }
      setData((result.data ?? null) as ContextPreviewResponse | null);
      setError(null);
      setStatus("ready");
    });
  }, [
    conversationId,
    agentId,
    scopeIds,
    selectionKey,
    path,
    requestOrganizationId,
    doorRows,
    pageRuleKey,
    dispatch,
  ]);

  const refresh = useCallback(() => {
    setStatus("loading");
    setError(null);
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    if (!enabled) return;
    fetchPreview();
  }, [enabled, fetchPreview]);

  return { status, data, error, refresh };
}
