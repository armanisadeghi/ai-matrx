/**
 * messages slice — selectors.
 *
 * Every selector reads from `byId + orderedIds`. There is no bridge to any
 * legacy turn shape — consumers receive `MessageRecord` (matching
 * `cx_message.Row`) and derive display text from `record.content`, which is
 * the authoritative `MessagePart[]` the server stores (per the
 * python-generated discriminated union).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { MessageRecord } from "./messages.slice";
import type {
  ContentSegment,
  ContentSegmentText,
  ContentSegmentDbTool,
  ContentSegmentThinking,
} from "../active-requests/active-requests.selectors";
import {
  parseMessageContent,
  type ToolCallPart,
  type ThinkingPart,
  type MessagePart,
} from "@/types/python-generated/stream-events";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";

const EMPTY_RECORDS: MessageRecord[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_SEGMENTS: ContentSegment[] = [];

// ---------------------------------------------------------------------------
// Core reads
// ---------------------------------------------------------------------------

/** Ordered `MessageRecord[]` for a conversation. */
export const selectConversationMessages = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.messages.byConversationId[conversationId]?.orderedIds,
    (state: RootState) => state.messages.byConversationId[conversationId]?.byId,
    (orderedIds, byId): MessageRecord[] => {
      if (!orderedIds || !byId || orderedIds.length === 0) return EMPTY_RECORDS;
      const out: MessageRecord[] = [];
      for (const id of orderedIds) {
        const rec = byId[id];
        if (rec) out.push(rec);
      }
      return out.length === 0 ? EMPTY_RECORDS : out;
    },
  );

export const selectOrderedMessageIds =
  (conversationId: string) =>
  (state: RootState): string[] =>
    state.messages.byConversationId[conversationId]?.orderedIds ?? EMPTY_IDS;

/**
 * First (oldest currently loaded) message id. Used by the
 * `OlderMessagesSentinel` as a stable signal to detect that a prepend has
 * landed — it changes only when older history is appended on top.
 */
export const selectFirstMessageId =
  (conversationId: string) =>
  (state: RootState): string | undefined =>
    state.messages.byConversationId[conversationId]?.orderedIds?.[0];

// ---------------------------------------------------------------------------
// Pagination selectors — used exclusively by the older-history scroll
// sentinel. Kept narrow so the conversation display tree never subscribes
// to them; only the sentinel re-renders when these flip.
// ---------------------------------------------------------------------------

export const selectHasMoreOlderMessages =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.messages.byConversationId[conversationId]?.hasMoreOlder ?? false;

export const selectIsLoadingOlderMessages =
  (conversationId: string) =>
  (state: RootState): boolean =>
    state.messages.byConversationId[conversationId]?.isLoadingOlder ?? false;

export const selectOldestLoadedPosition =
  (conversationId: string) =>
  (state: RootState): number | null =>
    state.messages.byConversationId[conversationId]?.oldestPosition ?? null;

export const selectMessageById =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId];

export const selectMessageCount =
  (conversationId: string) =>
  (state: RootState): number =>
    state.messages.byConversationId[conversationId]?.orderedIds?.length ?? 0;

export const selectHasMessages =
  (conversationId: string) =>
  (state: RootState): boolean =>
    (state.messages.byConversationId[conversationId]?.orderedIds?.length ?? 0) >
    0;

// ---------------------------------------------------------------------------
// Narrow field selectors
//
// Heavy renderers (markdown, LaTeX, tool visualization) must NOT re-render
// when only a bookkeeping field changes. Subscribe through one of these
// per-field selectors instead of pulling the whole record.
// ---------------------------------------------------------------------------

export const selectMessageContent =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["content"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]?.content;

export const selectMessageStatus =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["status"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]?.status;

export const selectMessageClientStatus =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["_clientStatus"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]
      ?._clientStatus;

export const selectMessageRole =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["role"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]?.role;

export const selectMessagePosition =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["position"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]
      ?.position;

export const selectMessageAgentId =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["agentId"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]?.agentId;

export const selectMessageMetadata =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["metadata"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]
      ?.metadata;

export const selectMessageContentHistory =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["contentHistory"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]
      ?.contentHistory;

export const selectMessageStreamRequestId =
  (conversationId: string, messageId: string) =>
  (state: RootState): MessageRecord["_streamRequestId"] | undefined =>
    state.messages.byConversationId[conversationId]?.byId?.[messageId]
      ?._streamRequestId;

/**
 * True when `messageId` is the latest assistant message in the conversation
 * (no assistant message is positioned after it). Used by the action bar to
 * decide whether to stay visible (true) or only appear on hover (false) in
 * compact density mode.
 */
export const selectIsLatestAssistantMessage =
  (conversationId: string, messageId: string) =>
  (state: RootState): boolean => {
    const entry = state.messages.byConversationId[conversationId];
    if (!entry) return false;
    const ordered = entry.orderedIds;
    const byId = entry.byId;
    if (!ordered || !byId) return false;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const id = ordered[i];
      const rec = byId[id];
      if (rec?.role === "assistant") return id === messageId;
    }
    return false;
  };

// ---------------------------------------------------------------------------
// Conversation-level fields
// ---------------------------------------------------------------------------

export const selectApiEndpointMode =
  (conversationId: string) =>
  (state: RootState): ApiEndpointMode =>
    state.messages.byConversationId[conversationId]?.apiEndpointMode ?? null;

export const selectConversationTitle =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.messages.byConversationId[conversationId]?.title ?? null;

export const selectConversationDescription =
  (conversationId: string) =>
  (state: RootState): string | null =>
    state.messages.byConversationId[conversationId]?.description ?? null;

export const selectConversationKeywords =
  (conversationId: string) =>
  (state: RootState): string[] | null =>
    state.messages.byConversationId[conversationId]?.keywords ?? null;

// ---------------------------------------------------------------------------
// Display helpers — derived view shapes for rendering
// ---------------------------------------------------------------------------

/**
 * Flat text extracted from a MessageRecord's content blocks. Used by
 * components that render plain-text previews (copy buttons, TTS, etc.).
 */
export function extractFlatText(record: MessageRecord | undefined): string {
  if (!record) return "";
  const blocks = Array.isArray(record.content)
    ? (record.content as Array<{ type?: string; text?: string }>)
    : [];
  let out = "";
  for (const b of blocks) {
    if (typeof b?.text === "string" && b.text.length > 0) {
      if (out.length > 0) out += "\n";
      out += b.text;
    }
  }
  return out;
}

/**
 * Returns the content blocks as `MessagePart[]` — the python-generated
 * discriminated union that authoritatively describes `cx_message.content`.
 *
 * `record.content` is typed as `Json` at the slice level (matches Supabase),
 * so this selector is the single place we narrow it. Use `parseMessageContent`
 * from the python-generated module so new Python variants flow through here
 * automatically.
 */
export function extractContentBlocks(
  record: MessageRecord | undefined,
): MessagePart[] {
  if (!record) return [];
  return Array.isArray(record.content)
    ? parseMessageContent(record.content)
    : [];
}

/**
 * Projects a `MessageRecord.content` array into the `ContentSegment[]`
 * structure the renderers consume — interleaving text, thinking, and tool
 * calls. Tool calls are joined to the observability slice by `callId` so
 * the rendered output includes the full arguments + result payloads.
 *
 * `role: "tool"` messages are stubs in the V2 DB shape — their results are
 * inlined onto the preceding assistant message's tool_call segments. The
 * selector emits no segments for those messages to avoid double rendering.
 */
export const selectMessageInterleavedContent = (
  conversationId: string,
  messageId: string,
) =>
  createSelector(
    (state: RootState) =>
      state.messages.byConversationId[conversationId]?.byId?.[messageId],
    (state: RootState) => state.observability.toolCalls,
    (record, toolCallsById): ContentSegment[] => {
      if (!record) return EMPTY_SEGMENTS;
      if ((record.role as string) === "tool") return EMPTY_SEGMENTS;

      const parts = Array.isArray(record.content)
        ? (record.content as unknown as MessagePart[])
        : [];
      if (parts.length === 0) return EMPTY_SEGMENTS;

      const toolCallByCallId = new Map<
        string,
        (typeof toolCallsById)[string]
      >();
      for (const key in toolCallsById) {
        const rec = toolCallsById[key];
        if (rec?.callId) toolCallByCallId.set(rec.callId, rec);
      }

      const segments: ContentSegment[] = [];
      for (const part of parts) {
        switch (part.type) {
          case "text": {
            const text = (part as { text?: string }).text;
            if (text) {
              segments.push({
                type: "text",
                content: text,
              } satisfies ContentSegmentText);
            }
            break;
          }
          case "thinking": {
            const thinkingPart = part as ThinkingPart;
            let text = thinkingPart.text;

            // Known case: reasoning models (OpenAI o-series) emit no `.text`
            // and instead ship structured content in `summary[]`.
            // Reconstruct the text so the UI has something to render.
            if (
              !text &&
              Array.isArray(thinkingPart.summary) &&
              thinkingPart.summary.length > 0
            ) {
              const reconstructed = thinkingPart.summary
                .map((item) => {
                  if (typeof item === "string") return item;
                  if (item && typeof item === "object") {
                    const maybeText = (item as { text?: unknown }).text;
                    if (typeof maybeText === "string") return maybeText;
                  }
                  return "";
                })
                .filter(Boolean)
                .join("\n");
              if (reconstructed) {
                console.log(
                  "[selectMessageInterleavedContent] thinking.summary[] fallback used",
                  {
                    conversationId,
                    messageId,
                    summaryItemCount: thinkingPart.summary.length,
                  },
                );
                text = reconstructed;
              }
            }

            if (text) {
              segments.push({
                type: "thinking",
                content: text,
              } satisfies ContentSegmentThinking);
            }
            break;
          }
          case "tool_call": {
            // ToolCallPart now uses `call_id` (server migration). Pre-migration
            // persisted rows used `id`. Cast through `unknown` to access both
            // fields without fighting the new wire type.
            const tc = part as unknown as {
              call_id?: string;
              id?: string;
              name?: string;
              arguments?: Record<string, unknown>;
            };
            const callId = tc.call_id ?? tc.id ?? "unknown";
            const toolCallRecord =
              callId !== "unknown" ? toolCallByCallId.get(callId) : undefined;

            // Pick the first source that has *actual* data. `??` alone
            // is wrong here because an empty `{}` (e.g. a stream-time
            // record_reserved seed before tool_started lands) is truthy
            // and would shadow real args coming from the stub. Both the
            // cx_tool_call row AND the cx_message stub are authoritative —
            // either may carry the full arguments.
            const isPopulatedObject = (
              v: unknown,
            ): v is Record<string, unknown> =>
              !!v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              Object.keys(v as Record<string, unknown>).length > 0;

            const obsArgs = toolCallRecord?.arguments;
            const stubArgs = tc.arguments;
            const resolvedArguments: Record<string, unknown> =
              isPopulatedObject(obsArgs)
                ? obsArgs
                : isPopulatedObject(stubArgs)
                  ? stubArgs
                  : {};

            const resolvedResult =
              toolCallRecord?.outputPreview ?? toolCallRecord?.output ?? null;
            const resolvedIsError =
              toolCallRecord?.isError ??
              (toolCallRecord ? !toolCallRecord.success : false);

            segments.push({
              type: "db_tool",
              callId,
              toolName: toolCallRecord?.toolName ?? tc.name ?? "unknown_tool",
              arguments: resolvedArguments,
              result: resolvedResult,
              isError: resolvedIsError,
            } satisfies ContentSegmentDbTool);
            break;
          }
          case "media": {
            // Known case: Google Gemini File API returns assets with `file_uri`
            // rather than a public `url`. Accept either.
            const media = part as {
              kind?: string;
              url?: string | null;
              file_uri?: string | null;
              mime_type?: string | null;
            };
            const resolvedUrl = media.url ?? media.file_uri ?? null;
            if (!resolvedUrl) break;

            console.log(
              "[selectMessageInterleavedContent] media part rendered as text",
              {
                conversationId,
                messageId,
                kind: media.kind,
                viaFileUri: !media.url && !!media.file_uri,
                mimeType: media.mime_type ?? null,
              },
            );

            // Encode as markdown so the existing text-block renderer picks it
            // up without needing a new ContentSegment variant.
            const label = media.kind ?? "media";
            const markdown =
              media.kind === "image"
                ? `![${label}](${resolvedUrl})`
                : `[${label}](${resolvedUrl})`;
            segments.push({
              type: "text",
              content: markdown,
            } satisfies ContentSegmentText);
            break;
          }
          case "code_exec": {
            // Known case: Gemini code-execution feature emits the model-written
            // code as a dedicated part. Render it as a fenced code block.
            const codePart = part as { language?: string; code?: string };
            if (!codePart.code) break;

            console.log(
              "[selectMessageInterleavedContent] code_exec part rendered",
              {
                conversationId,
                messageId,
                language: codePart.language ?? null,
                codeChars: codePart.code.length,
              },
            );

            const fence = "```";
            segments.push({
              type: "text",
              content: `${fence}${codePart.language ?? ""}\n${codePart.code}\n${fence}`,
            } satisfies ContentSegmentText);
            break;
          }
          case "code_result": {
            // Known case: Gemini code-execution companion output (stdout/error).
            const resultPart = part as { output?: string; outcome?: string };
            if (!resultPart.output) break;

            console.log(
              "[selectMessageInterleavedContent] code_result part rendered",
              {
                conversationId,
                messageId,
                outcome: resultPart.outcome ?? null,
                outputChars: resultPart.output.length,
              },
            );

            const fence = "```";
            segments.push({
              type: "text",
              content: `${fence}\n${resultPart.output}\n${fence}`,
            } satisfies ContentSegmentText);
            break;
          }
          case "tool_result":
          default:
            break;
        }
      }

      return segments.length === 0 ? EMPTY_SEGMENTS : segments;
    },
  );
