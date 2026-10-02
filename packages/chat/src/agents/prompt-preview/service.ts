/**
 * Prompt-preview service — the live-draft "visualize the full prompt" call.
 *
 * Reuses `assembleManualRequest` so the previewed payload is byte-identical to
 * what a real manual run would send (draft model, settings, messages, tools,
 * structured system instruction, scope). Adds `dry_run:true` (don't call the
 * model) + `store:false` (write nothing) so the backend runs the FULL pre-LLM
 * assembly — context resolution, system-prompt render, tool merge — and returns
 * it as JSON without calling the model or persisting anything.
 */

import type { ChatRootState } from "../../store/root-state";
import { selectEndpointOverrideConfig } from "../../host/server/api-config";
import { resolveEndpointPath } from "@ai-matrx/agents/matrx";
import {
  buildMatrxRequestUrl,
  ENDPOINTS,
  getUserMessage,
  readMatrxJsonResponse,
  sendMatrxRequest,
} from "@ai-matrx/agents/matrx";
import { resolveBackendForConversation } from "../redux/execution-system/thunks/resolve-base-url";
import { assembleManualRequest } from "../redux/execution-system/thunks/execute-manual-instance.thunk";
import type { PromptPreview } from "./types";

export async function requestPromptPreview(
  state: ChatRootState,
  conversationId: string,
): Promise<PromptPreview> {
  const payload = await assembleManualRequest(state, conversationId);
  if (!payload) {
    throw new Error(
      "This agent isn't ready to preview yet — choose a model and fill any required inputs.",
    );
  }

  // Same backend resolution as the REAL manual run (execute-manual): one
  // channel decision (global / sandbox override / local engine / EC2) and one
  // header set — Authorization (or guest fingerprint) PLUS the mandatory
  // `X-Organization-Id` org admission the server's AuthMiddleware requires
  // (matrx-connect, 2026-08-30). Previewing through a different transport
  // than the run it previews would lie.
  const backend = resolveBackendForConversation(state, conversationId);
  if (!backend) {
    throw new Error(
      "No backend base URL configured (apiConfigSlice / NEXT_PUBLIC_BACKEND_URL_*).",
    );
  }
  if (!backend.headers["Authorization"]) {
    throw new Error(
      "Not signed in — previewing the prompt needs an authenticated session.",
    );
  }

  const path = resolveEndpointPath(
    ENDPOINTS.ai.manual,
    selectEndpointOverrideConfig(state),
  );

  // Dry-run + ephemeral: full assembly, no LLM turn, nothing persisted.
  // `store:false` is what makes it write nothing — `dry_run` only says "don't
  // call the model" and has nothing to do with conversation identity. The wire
  // conversation_id comes from assembleManualRequest (minted per send) and is
  // required on every start request.
  const body = {
    ...payload,
    dry_run: true,
    stream: false,
    store: false,
  };

  // THE shared request pipeline (`@ai-matrx/agents/matrx`): the URL, the
  // send, and the one error classifier — the server's own sentence.
  const response = await sendMatrxRequest(
    buildMatrxRequestUrl(backend.baseUrl.replace(/\/+$/, ""), path),
    {
      method: "POST",
      headers: backend.headers,
      body: JSON.stringify(body),
    },
  );
  try {
    return await readMatrxJsonResponse<PromptPreview>(response);
  } catch (error) {
    throw new Error(`Prompt preview failed: ${getUserMessage(error)}`);
  }
}
