"use client";

/**
 * useContextPreview — fetches the SERVER-RESOLVED agent context for the
 * user's current settings from `POST /ai/context/preview`.
 *
 * TRUTHFULNESS CONTRACT: the endpoint calls the exact same functions the
 * agent-run path calls (`resolve_agent_context_block`, `build_agent_context`,
 * and `resolve_scope_bindings` when an agent is given) with the same
 * arguments — the response is what the model actually receives, not a
 * recreation. Never replace this with a client-side approximation.
 *
 * organization_id is local-first: an existing conversation's durable org
 * overrides the active app org, while an agent-only preview inherits the
 * active app org from callApi. project_id / task_id still inherit active
 * app context; scope_ids are passed explicitly from the active selections.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { selectScopeSelectionsContext } from "@/lib/redux/slices/appContextSlice";
import { selectConversationScopeIds } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { extractErrorMessage } from "@/utils/errors";
import type { components } from "@/types/python-generated/api-types";

export type ContextSelection = components["schemas"]["ContextSelection"];

export type ContextPreviewResponse =
  components["schemas"]["ContextPreviewResponse"];

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
  const scopeIds = useMemo(
    () => Object.values(scopeSelections).filter((v): v is string => !!v),
    [scopeSelections],
  );
  // One stable key per selection, so a re-render with an equal object never refetches.
  const selectionKey = chosen ? JSON.stringify(chosen) : null;

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
    void dispatch(
      callApi({
        path: "/ai/context/preview",
        method: "POST",
        body: {
          conversation_id: conversationId ?? null,
          agent_id: agentId ?? null,
          ...(selectionKey
            ? { selection: JSON.parse(selectionKey) as ContextSelection }
            : { scope_ids: scopeIds }),
          ...(path !== "old" ? { path } : {}),
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
