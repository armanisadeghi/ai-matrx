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
  ContentSegmentRenderBlock,
} from "../active-requests/active-requests.selectors";
import {
  parseMessageContent,
  type ToolCallPart,
  type ThinkingPart,
  type MessagePart,
  type ImageMediaPart,
  type AudioMediaPart,
  type VideoMediaPart,
  type DocumentMediaPart,
  type YouTubeMediaPart,
} from "@/types/python-generated/stream-events";
import { fromCxMediaPart } from "@/features/files/blocks/image/adapters/from-cx-media-part";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";

const EMPTY_RECORDS: MessageRecord[] = [];
/** Stable empty list for selectors / hooks when no conversation is mounted yet. */
export const EMPTY_CONVERSATION_MESSAGES: MessageRecord[] = EMPTY_RECORDS;
const EMPTY_IDS: string[] = [];
const EMPTY_SEGMENTS: ContentSegment[] = [];

// Typed as the concrete selector signature, not `ReturnType<typeof
// createSelector>` — that overload-collapse resolved to `{}`, so every
// consumer saw `selectConversationMessages(id)` return `{}` and lost
// `MessageRecord[]` (broke `.length` / iteration at call sites).
const conversationMessagesSelectorCache = new Map<
  string,
  (state: RootState) => MessageRecord[]
>();

// ---------------------------------------------------------------------------
// Core reads
// ---------------------------------------------------------------------------

/** Ordered `MessageRecord[]` for a conversation. */
export const selectConversationMessages = (conversationId: string) => {
  if (!conversationMessagesSelectorCache.has(conversationId)) {
    conversationMessagesSelectorCache.set(
      conversationId,
      createSelector(
        (state: RootState) =>
          state.messages.byConversationId[conversationId]?.orderedIds,
        (state: RootState) =>
          state.messages.byConversationId[conversationId]?.byId,
        (orderedIds, byId): MessageRecord[] => {
          if (!orderedIds || !byId || orderedIds.length === 0)
            return EMPTY_RECORDS;
          const out: MessageRecord[] = [];
          for (const id of orderedIds) {
            const rec = byId[id];
            if (rec) out.push(rec);
          }
          return out.length === 0 ? EMPTY_RECORDS : out;
        },
      ),
    );
  }
  return conversationMessagesSelectorCache.get(conversationId)!;
};

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

/**
 * Id of the latest assistant message in the conversation, or undefined.
 * Primitive return — safe to subscribe to without memoization. Used by the
 * auto-voice hook to know which assistant turn to read aloud on completion.
 */
export const selectLatestAssistantMessageId =
  (conversationId: string) =>
  (state: RootState): string | undefined => {
    const entry = state.messages.byConversationId[conversationId];
    const ordered = entry?.orderedIds;
    const byId = entry?.byId;
    if (!ordered || !byId) return undefined;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const id = ordered[i];
      if (byId[id]?.role === "assistant") return id;
    }
    return undefined;
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
 * True when a message record represents a FAILED turn. The backend persists a
 * failed assistant turn as a real `cx_message` with `status='failed'` and a
 * structured top-level `error` jsonb (PRESENCE of `error` means failure). The
 * legacy `metadata.failed===true` signal is kept as a fallback for historical /
 * in-flight rows. Both the transcript grouping and the message renderer read
 * this so live and reloaded failures look identical. See
 * CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md.
 */
export function isFailedRecord(record: MessageRecord | undefined): boolean {
  if (!record) return false;
  if (record.status === "failed") return true;
  if (record.error) return true;
  const md = record.metadata;
  return (
    !!md &&
    typeof md === "object" &&
    !Array.isArray(md) &&
    (md as Record<string, unknown>).failed === true
  );
}

/**
 * The persisted error text for a failed turn. Prefers the structured top-level
 * `error.message`; falls back to the legacy `metadata.error` string, then to
 * the flat content text (the message `content` is also a single text block
 * holding the same error). Undefined when none exists (e.g. an in-session
 * failure where only the active request carries the error — the renderer reads
 * that separately).
 */
export function extractRecordError(
  record: MessageRecord | undefined,
): string | undefined {
  if (!record) return undefined;
  const structured = record.error?.message;
  if (typeof structured === "string" && structured.length > 0) return structured;
  const md = record.metadata;
  if (md && typeof md === "object" && !Array.isArray(md)) {
    const err = (md as Record<string, unknown>).error;
    if (typeof err === "string" && err.length > 0) return err;
  }
  const flat = extractFlatText(record);
  return flat.length > 0 ? flat : undefined;
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

type AnyMediaPart =
  | ImageMediaPart
  | AudioMediaPart
  | VideoMediaPart
  | DocumentMediaPart
  | YouTubeMediaPart;

/**
 * Convert a persisted `media:*` `MessagePart` into a canonical
 * `render_block` segment carrying the full UnifiedImageBlock (or, for
 * audio/video, the matching `*_output` data shape). The renderer
 * dispatches each segment through `BlockRenderer`, which routes images
 * to `UnifiedImageBlockRenderer` — keeping the signed-URL refresh
 * pipeline, copy/share/download action bar, lightbox, and rich preview
 * all live for DB-loaded messages.
 *
 * Returns null when there's nothing renderable yet (e.g. an image part
 * persisted with no canonical fields and no signed URL).
 */
function mediaPartToSegment(
  raw: AnyMediaPart,
): ContentSegmentRenderBlock | null {
  switch (raw.kind) {
    case "image": {
      // `fromCxMediaPart` lifts fileId, cdn_url, signed_url, visibility,
      // and every other canonical UnifiedImageBlock field back out of the
      // persisted `metadata` blob. The downstream renderer + URL hook
      // can then re-mint expired signed URLs from the fileId, so old
      // persisted images keep working indefinitely.
      const unified = fromCxMediaPart(raw);
      return {
        type: "render_block",
        blockType: "image_output",
        content: null,
        data: unified as unknown as Record<string, unknown>,
        metadata: raw.metadata as Record<string, unknown> | undefined,
      };
    }
    case "audio":
      return {
        type: "render_block",
        blockType: "audio_output",
        content: null,
        data: {
          type: "audio_output",
          url: raw.url ?? null,
          file_uri: raw.file_uri ?? null,
          mime_type: raw.mime_type ?? null,
          transcription_result: raw.transcription_result ?? null,
        },
        metadata: raw.metadata as Record<string, unknown> | undefined,
      };
    case "video":
      return {
        type: "render_block",
        blockType: "video_output",
        content: null,
        data: {
          type: "video_output",
          url: raw.url ?? null,
          file_uri: raw.file_uri ?? null,
          mime_type: raw.mime_type ?? null,
        },
        metadata: raw.metadata as Record<string, unknown> | undefined,
      };
    case "document":
    case "youtube":
    case undefined:
      // No canonical render type yet — skip rather than emit a broken
      // markdown link. When Python finalizes the document/youtube
      // rendering contract these can be lifted into their own block types.
      return null;
    default: {
      const _exhaustive: never = raw;
      void _exhaustive;
      return null;
    }
  }
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
        // Materialized artifacts are stored as plain text — `<artifact id=uuid>
        // body</artifact>` (vision R1) — so they flow through the normal `text`
        // path below; the splitter detects the tag and BlockRenderer renders it
        // by id. No special content-block part type exists anymore.
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

            // Join the row + stub and hand BOTH to the renderer. The canonical
            // reconciliation (args/result/events/timestamps) lives in
            // `persistedToolEntry` so the persisted entry is byte-identical to
            // the live one — the selector's only job here is the join.
            segments.push({
              type: "db_tool",
              callId,
              record: toolCallRecord ?? null,
              stubName: tc.name ?? null,
              stubArguments:
                tc.arguments &&
                typeof tc.arguments === "object" &&
                !Array.isArray(tc.arguments)
                  ? tc.arguments
                  : null,
            } satisfies ContentSegmentDbTool);
            break;
          }
          case "media": {
            // Emit a canonical `render_block` segment so the renderer can
            // dispatch through BlockRenderer (and, for images, the
            // UnifiedImageBlockRenderer + useUnifiedImageUrl pipeline that
            // re-mints expired signed URLs from the persisted file metadata).
            //
            // Previously this branch encoded media as `![label](url)`
            // markdown text. That bypassed the canonical pipeline and
            // embedded whatever URL was stored at persistence time — for
            // matrx-origin images that fell back to a short-lived signed
            // URL, the markdown image would 404 within an hour. The lossy
            // path also dropped fileId / parentFileId / visibility / etc.,
            // so the image action bar lost its rich features (copy
            // public link, share popover, "view original", etc.) entirely
            // when the surrounding message also had tool calls (the only
            // path that routes through this selector).
            const segment = mediaPartToSegment(
              part as
                | ImageMediaPart
                | AudioMediaPart
                | VideoMediaPart
                | DocumentMediaPart
                | YouTubeMediaPart,
            );
            if (segment) segments.push(segment);
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
