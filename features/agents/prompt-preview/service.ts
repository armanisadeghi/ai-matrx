/**
 * Prompt-preview service — the live-draft "visualize the full prompt" call.
 *
 * Reuses `assembleManualRequest` so the previewed payload is byte-identical to
 * what a real manual run would send (draft model, settings, messages, tools,
 * structured system instruction, scope). Adds `dry_run:true` + an ephemeral
 * conversation (`conversation_id:null` + `is_new:false`) so the backend runs the
 * FULL pre-LLM assembly — context resolution, system-prompt render, tool merge —
 * and returns it as JSON without calling the model or persisting anything.
 */

import type { RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import {
  selectResolvedBaseUrl,
  selectEndpointOverrideConfig,
} from "@/lib/redux/slices/apiConfigSlice";
import { resolveEndpointPath } from "@/lib/api/resolve-endpoint-path";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { assembleManualRequest } from "@/features/agents/redux/execution-system/thunks/execute-manual-instance.thunk";
import type { PromptPreview } from "./types";

const trimRoot = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

export async function requestPromptPreview(
  state: RootState,
  conversationId: string,
): Promise<PromptPreview> {
  const payload = await assembleManualRequest(state, conversationId);
  if (!payload) {
    throw new Error(
      "This agent isn't ready to preview yet — choose a model and fill any required inputs.",
    );
  }

  const baseUrl = selectResolvedBaseUrl(state);
  if (!baseUrl) {
    throw new Error(
      "No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).",
    );
  }

  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error(
      "Not signed in — previewing the prompt needs an authenticated session.",
    );
  }

  const path = resolveEndpointPath(
    ENDPOINTS.ai.manual,
    selectEndpointOverrideConfig(state),
  );
  const url = `${trimRoot(baseUrl)}${path}`;

  // Dry-run + ephemeral: full assembly, no LLM turn, nothing persisted.
  const body = {
    ...payload,
    dry_run: true,
    stream: false,
    is_new: false,
    conversation_id: null,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const err: unknown = await response.json();
      if (err && typeof err === "object" && "detail" in err) {
        detail = String((err as { detail: unknown }).detail);
      }
    } catch {
      // non-JSON error body — keep the status line
    }
    throw new Error(`Prompt preview failed: ${detail}`);
  }

  return (await response.json()) as PromptPreview;
}
