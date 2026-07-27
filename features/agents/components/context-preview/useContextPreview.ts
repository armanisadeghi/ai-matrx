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

export type ContextPreviewResponse =
  components["schemas"]["ContextPreviewResponse"];

export type ContextPreviewStatus = "idle" | "loading" | "ready" | "error";

export interface ContextPreviewState {
  status: ContextPreviewStatus;
  data: ContextPreviewResponse | null;
  error: string | null;
  refresh: () => void;
}

export function useContextPreview(opts: {
  conversationId?: string;
  agentId?: string;
  /** Fetch only while the preview surface is actually open. */
  enabled: boolean;
}): ContextPreviewState {
  const { conversationId, agentId, enabled } = opts;
  const dispatch = useAppDispatch();

  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const conversationScope = useAppSelector(
    selectConversationScopeIds(conversationId ?? ""),
  );
  const scopeIds = useMemo(
    () => Object.values(scopeSelections).filter((v): v is string => !!v),
    [scopeSelections],
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
  const fetchPreview = useCallback(() => {
    const seq = ++requestSeq.current;
    void dispatch(
      callApi({
        path: "/ai/context/preview",
        method: "POST",
        body: {
          conversation_id: conversationId ?? null,
          agent_id: agentId ?? null,
          scope_ids: scopeIds,
        },
        scopeOverrides: conversationScope.organizationId
          ? { organization_id: conversationScope.organizationId }
          : undefined,
      }),
    ).then((result) => {
      if (seq !== requestSeq.current) return; // superseded
      if (result.error) {
        setStatus("error");
        setError(
          extractErrorMessage(result.error.serverDetail) ||
            result.error.message,
        );
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
    conversationScope.organizationId,
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
