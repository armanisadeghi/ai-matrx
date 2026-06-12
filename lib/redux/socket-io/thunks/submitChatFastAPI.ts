/**
 * submitChatFastAPI — Drop-in replacement for createAndSubmitTask.
 *
 * Same signature, same return shape, dispatches to the same Redux slices.
 * Components can switch by changing ONE import.
 *
 * This thunk transforms the OLD socket payload shape (chat_config.model_id, etc.)
 * into the NEW POST /api/ai/chat body shape (ai_model_id, etc.).
 * Pass conversation_id in taskData.chat_config to continue an existing conversation.
 * Omit for a new conversation — the server streams it back.
 *
 * Usage:
 *   // Before:
 *   import { createAndSubmitTask } from '@/lib/redux/socket-io/thunks/submitTaskThunk';
 *   // After:
 *   import { submitChatFastAPI as createAndSubmitTask } from '@/lib/redux/socket-io/thunks/submitChatFastAPI';
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { RootState } from "../../store";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { parseHttpError } from "@/lib/api/errors";
import { logApiTarget } from "@/lib/api/log-api-target";
import { ENDPOINTS, BACKEND_URLS } from "@/lib/api/endpoints";
import type {
  ChunkPayload,
  ErrorPayload,
  PhasePayload,
} from "@/types/python-generated/stream-events";
import type { ChatRequestBody } from "@/lib/api/types";

import {
  addResponse,
  appendTextChunk,
  updateDataResponse,
  updateInfoResponse,
  updateErrorResponse,
  markResponseEnd,
} from "../slices/socketResponseSlice";

import {
  initializeTask,
  setTaskListenerIds,
  setTaskStreaming,
  completeTask,
  setTaskError,
} from "../slices/socketTasksSlice";

import { selectAccessToken } from "../../slices/userSlice";
import { selectResolvedBaseUrl } from "../../slices/apiConfigSlice";

interface SubmitChatPayload {
  service: string;
  taskName: string;
  taskData: Record<string, unknown>;
  connectionId?: string;
  customTaskId?: string;
}

/**
 * Fields the POST /api/ai/chat endpoint actually accepts.
 * Anything NOT in this set is stripped from the request to prevent 422 errors.
 *
 * Type-checked: if ChatRequestBody adds/removes a field, TypeScript will error
 * here because the satisfies clause enforces that every key in this array is a
 * valid ChatRequestBody key.
 */
const CHAT_REQUEST_FIELDS = [
  "ai_model_id",
  "messages",
  "conversation_id",
  "stream",
  "debug",
  "max_iterations",
  "max_retries_per_iteration",
  "system_instruction",
  "max_output_tokens",
  "temperature",
  "top_p",
  "top_k",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning_effort",
  "reasoning_summary",
  "thinking_level",
  "include_thoughts",
  "thinking_budget",
  "response_format",
  "stop_sequences",
  "internal_web_search",
  "internal_url_context",
  "store",
  "metadata",
  "tts_voice",
  "audio_format",
  "model",
  "verbosity",
  "size",
  "quality",
  "count",
  "seconds",
  "fps",
  "steps",
  "seed",
  "guidance_scale",
  "output_quality",
  "negative_prompt",
  "output_format",
  "width",
  "height",
  "frame_images",
  "reference_images",
  "disable_safety_checker",
  "config_overrides",
  "client_tools",
  "ide_state",
] as const satisfies readonly (keyof ChatRequestBody)[];

const UNIFIED_API_ALLOWED_FIELDS = new Set<string>(CHAT_REQUEST_FIELDS);

/**
 * The backend expects response_format as Dict[str, Any] | null.
 * The old frontend sends it as a bare string like "text" or "json_object".
 * This converts string values to the proper dict format or strips them if
 * they represent the default behavior (no need to send "text").
 */
function normalizeResponseFormat(
  value: unknown,
): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;

  // Already a dict — pass through
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    // "text" is the default — no need to send it at all
    if (value === "text" || value === "") return null;
    // Convert known string shorthand to proper dict
    return { type: value };
  }

  return null;
}

/**
 * Transforms a legacy socket-era chatConfig into the new POST /api/ai/chat body.
 *
 * 1. Renames old fields to new names
 * 2. Strips frontend-only fields the backend doesn't accept (image_urls, file_urls, etc.)
 * 3. Passes conversation_id through if present (optional — omit for new conversations)
 * 4. Strips is_new_conversation (removed from API entirely)
 * 5. Normalizes response_format from string -> dict
 * 6. Logs deprecation warnings for old field names
 */
function transformChatConfigToUnifiedBody(
  chatConfig: Record<string, unknown>,
  callerContext: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  body.messages = chatConfig.messages;
  body.stream = chatConfig.stream ?? true;

  // Rename model_id -> ai_model_id
  if (chatConfig.model_id !== undefined) {
    console.warn(
      `%c⚠️ FASTAPI MIGRATION [${callerContext}]: Caller is passing "model_id" — rename to "ai_model_id" at the source.`,
      "font-weight: bold; color: orange; font-size: 14px;",
    );
    body.ai_model_id = chatConfig.model_id;
  } else if (chatConfig.ai_model_id !== undefined) {
    body.ai_model_id = chatConfig.ai_model_id;
  }

  // Safety net: normalizer should have already converted these at the Redux boundary.
  if (chatConfig.max_tokens !== undefined) {
    console.debug(
      `[${callerContext}] Legacy "max_tokens" detected — converting to "max_output_tokens"`,
    );
    body.max_output_tokens = chatConfig.max_tokens;
  }

  const rawFormat = chatConfig.output_format ?? chatConfig.response_format;
  if (rawFormat !== undefined) {
    if (chatConfig.output_format !== undefined) {
      console.debug(
        `[${callerContext}] Legacy "output_format" detected — converting to "response_format"`,
      );
    }
    const normalized = normalizeResponseFormat(rawFormat);
    if (normalized !== null) {
      body.response_format = normalized;
    }
  }

  // Copy all other allowed fields directly.
  // conversation_id is now allowed in the body (pass-through). is_new_conversation is gone.
  const skipFields = new Set([
    "messages",
    "stream",
    "model_id",
    "ai_model_id",
    "max_tokens",
    "output_format",
    "response_format",
    "is_new_conversation",
  ]);
  const droppedFields: string[] = [];

  for (const [key, value] of Object.entries(chatConfig)) {
    if (skipFields.has(key)) continue;
    if (value === undefined || value === null) continue;

    if (UNIFIED_API_ALLOWED_FIELDS.has(key)) {
      body[key] = value;
    } else {
      droppedFields.push(key);
    }
  }

  if (droppedFields.length > 0) {
    console.warn(
      `%c⚠️ FASTAPI MIGRATION [${callerContext}]: Stripped ${droppedFields.length} fields not accepted by /api/ai/chat: ${droppedFields.join(", ")}`,
      "font-weight: bold; color: #ff9800; font-size: 12px;",
    );
  }

  return body;
}

export const submitChatFastAPI = createAsyncThunk<
  { taskId: string; submitResult: string[] },
  SubmitChatPayload,
  { state: RootState }
>(
  "socketTasks/submitChatFastAPI",
  async (
    { service, taskName, taskData, customTaskId },
    { dispatch, getState },
  ) => {
    const state = getState();
    const accessToken = selectAccessToken(state);
    const BACKEND_URL =
      selectResolvedBaseUrl(state as any) ?? BACKEND_URLS.production;

    const taskId = customTaskId || uuidv4();
    const listenerId = taskId;
    const callerContext = `${service}.${taskName}`;

    console.log(`[submitChatFastAPI] BACKEND_URL=${BACKEND_URL}`);

    console.warn(
      `%c🔄 FASTAPI MIGRATION [${callerContext}]: This call flows through submitChatFastAPI → POST /api/ai/chat. ` +
        `The calling component should be updated to call the conversation API directly and pass the new field names (ai_model_id, max_output_tokens, response_format, tts_voice, audio_format). ` +
        `This bridge thunk will be removed once all callers are updated.`,
      "font-weight: bold; color: #ff9800; font-size: 12px;",
    );

    dispatch(
      initializeTask({
        taskId,
        service,
        taskName,
        connectionId: "fastapi",
      }),
    );
    dispatch(addResponse({ listenerId, taskId }));
    dispatch(setTaskListenerIds({ taskId, listenerIds: [listenerId] }));

    const chatConfig =
      (taskData as { chat_config?: Record<string, unknown> }).chat_config ||
      taskData;
    const requestBody = transformChatConfigToUnifiedBody(
      chatConfig as Record<string, unknown>,
      callerContext,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    console.log(
      "[submitChatFastAPI] Final request body keys:",
      Object.keys(requestBody),
      "\n[submitChatFastAPI] Full body:",
      JSON.stringify(requestBody, null, 2),
    );

    const chatUrl = `${BACKEND_URL}${ENDPOINTS.ai.chat}`;

    // Final resolved target — BACKEND_URL is locked in above and cannot change.
    logApiTarget(chatUrl, {
      source: "submitChatFastAPI",
      method: "POST",
      channel: "global",
      activeServer: (state as any)?.apiConfig?.activeServer,
      callerContext,
    });

    let response: Response;
    try {
      response = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (networkError) {
      const errMsg =
        networkError instanceof Error ? networkError.message : "Network error";
      dispatch(
        updateErrorResponse({
          listenerId,
          error: { message: errMsg, type: "network_error" },
        }),
      );
      dispatch(markResponseEnd(listenerId));
      dispatch(setTaskError({ taskId, error: errMsg }));
      throw new Error(errMsg);
    }

    if (!response.ok) {
      let rawErrorBody: string | undefined;
      try {
        rawErrorBody = await response.clone().text();
      } catch {
        /* ignore */
      }
      console.error(
        `[submitChatFastAPI] HTTP ${response.status} from ${BACKEND_URL}${ENDPOINTS.ai.chat}`,
        "\nResponse body:",
        rawErrorBody,
      );

      const apiError = await parseHttpError(response);
      dispatch(
        updateErrorResponse({
          listenerId,
          error: {
            message: apiError.detail,
            type: apiError.code,
            user_message: apiError.userMessage,
          },
        }),
      );
      dispatch(markResponseEnd(listenerId));
      dispatch(setTaskError({ taskId, error: apiError.userMessage }));
      throw apiError;
    }

    const { events } = parseNdjsonStream(response);
    let isFirstChunk = true;

    try {
      for await (const event of events) {
        switch (event.event) {
          case "chunk": {
            if (isFirstChunk) {
              dispatch(setTaskStreaming({ taskId, isStreaming: true }));
              isFirstChunk = false;
            }
            const { text } = event.data as unknown as ChunkPayload;
            dispatch(appendTextChunk({ listenerId, text }));
            break;
          }

          case "phase": {
            const phaseData = event.data as unknown as PhasePayload;
            dispatch(
              updateInfoResponse({
                listenerId,
                info: {
                  status:
                    phaseData.phase === "complete" ? "confirm" : "processing",
                  system_message: phaseData.phase,
                },
              }),
            );
            break;
          }

          case "tool_event": {
            break;
          }

          case "error": {
            const errData = event.data as unknown as ErrorPayload;
            dispatch(
              updateErrorResponse({
                listenerId,
                error: {
                  message: errData.message,
                  type: errData.error_type,
                  user_message: errData.user_message,
                  code: errData.code || undefined,
                  details: errData.details,
                },
              }),
            );
            break;
          }

          case "data": {
            const dataPayload = event.data as Record<string, unknown> | null;
            if (dataPayload && dataPayload.type === "audio_output") {
              dispatch(
                updateDataResponse({
                  listenerId,
                  data: {
                    type: "audio_output",
                    url: dataPayload.url as string,
                    mime_type: dataPayload.mime_type as string,
                  },
                }),
              );
            } else {
              dispatch(
                updateDataResponse({
                  listenerId,
                  data: event.data,
                }),
              );
            }
            break;
          }

          case "completion":
          case "heartbeat":
          case "end":
            break;
        }
      }
    } catch (streamError) {
      if (streamError instanceof Error && streamError.name !== "AbortError") {
        const errMsg = streamError.message;
        dispatch(
          updateErrorResponse({
            listenerId,
            error: { message: errMsg, type: "stream_error" },
          }),
        );
      }
    }

    dispatch(setTaskStreaming({ taskId, isStreaming: false }));
    dispatch(markResponseEnd(listenerId));
    dispatch(completeTask(taskId));

    return { taskId, submitResult: [listenerId] };
  },
);
