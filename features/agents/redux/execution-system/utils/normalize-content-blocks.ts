import { v4 as uuidv4 } from "uuid";
import type {
  RenderBlockPayload,
  MessagePart,
  ImageMediaPart,
  AudioMediaPart,
  VideoMediaPart,
  DocumentMediaPart,
  YouTubeMediaPart,
} from "@/types/python-generated/stream-events";
import { fromCxMediaPart } from "@/features/files/blocks/image/adapters/from-cx-media-part";

/**
 * Normalizes `cx_message.content[]` items into the canonical `RenderBlockPayload`
 * shape consumed by the renderer pipeline.
 *
 * Input  — `MessagePart[]`, the python-generated discriminated union that
 *          authoritatively describes every shape that can live in
 *          `cx_message.content`. Use `parseMessageContent(record.content)` at
 *          the selector boundary to get a value of this type.
 * Output — `RenderBlockPayload[]`, the python-generated stream-protocol shape
 *          consumed by `BlockRenderer` (and the `serverProcessedBlocks` slot
 *          on `EnhancedChatMarkdown`).
 *
 * Every `MessagePart` variant is handled explicitly. The `never` exhaustiveness
 * check inside `normalizeSingle` triggers a compile-time error if Python adds
 * a new variant we haven't mapped here, and the same is true for media `kind`
 * inside `normalizeMedia`.
 *
 * Call this at the Redux boundary — in thunks, reducers, or selectors — so
 * every consumer downstream sees a single shape.
 */
export function normalizeContentBlocks(
  rawBlocks: MessagePart[],
): RenderBlockPayload[] {
  return rawBlocks.map((block, i) => normalizeSingle(block, i));
}

function newId(prefix: string): string {
  return `${prefix}_${uuidv4()}`;
}

function normalizeSingle(raw: MessagePart, index: number): RenderBlockPayload {
  // Legacy interactive blocks (quiz, …) persisted by useMessageBlockPersistence
  // carry `_matrxBlockType` + `_matrxState` and were written into
  // cx_message.content as a NON-python part (e.g. `{type:"quiz", _matrxState,
  // _matrxBlockType:"quiz"}`). They aren't MessagePart variants, so the typed
  // switch below dumps them to `unknown_data_event` ("This data type is not yet
  // registered" — the every-reload bug). Recognize + reconstruct them first.
  const persisted = reconstructPersistedBlock(
    raw as unknown as Record<string, unknown>,
    index,
  );
  if (persisted) return persisted;

  switch (raw.type) {
    case "text":
      return {
        blockId: raw.id ?? newId("db_text"),
        blockIndex: index,
        type: "text",
        status: "complete",
        content: raw.text ?? null,
        data: null,
        metadata: raw.metadata,
      };

    case "thinking":
      // BlockRenderer reads the displayable body from `block.content`. The
      // `text` field on ThinkingPart carries that body — move it across.
      return {
        blockId: raw.id ?? newId("db_thinking"),
        blockIndex: index,
        type: "thinking",
        status: "complete",
        content: raw.text ?? "",
        data: {
          provider: raw.provider ?? null,
          signature: raw.signature ?? null,
          signature_encoding: raw.signature_encoding ?? null,
          summary: raw.summary ?? [],
        },
        metadata: raw.metadata,
      };

    case "tool_call":
      return {
        blockId: newId("db_tool_call"),
        blockIndex: index,
        type: "tool_call",
        status: "complete",
        content: null,
        data: {
          call_id: raw.call_id ?? null,
          name: raw.name ?? null,
          arguments: raw.arguments ?? {},
        },
        metadata: raw.metadata,
      };

    case "tool_result":
      return {
        blockId: newId("db_tool_result"),
        blockIndex: index,
        type: "tool_result",
        status: "complete",
        content: null,
        data: {
          call_id: raw.call_id ?? null,
          tool_use_id: raw.tool_use_id ?? null,
          name: raw.name ?? null,
          is_error: raw.is_error ?? false,
          output_chars: raw.output_chars ?? null,
          output_preview: raw.output_preview ?? null,
        },
        metadata: raw.metadata,
      };

    case "media":
      return normalizeMedia(raw, index);

    case "code_exec":
      return {
        blockId: newId("db_code_exec"),
        blockIndex: index,
        type: "code_exec",
        status: "complete",
        content: raw.code ?? null,
        data: { language: raw.language ?? null },
        metadata: raw.metadata,
      };

    case "code_result":
      return {
        blockId: newId("db_code_result"),
        blockIndex: index,
        type: "code_result",
        status: "complete",
        content: raw.output ?? null,
        data: { outcome: raw.outcome ?? null },
        metadata: raw.metadata,
      };

    case "web_search":
      return {
        blockId: raw.id ?? newId("db_web_search"),
        blockIndex: index,
        type: "web_search",
        status: "complete",
        content: null,
        data: { id: raw.id ?? null, status: raw.status ?? null },
        metadata: raw.metadata,
      };

    case "input_webpage":
      return {
        blockId: newId("input_webpage"),
        blockIndex: index,
        type: "input_webpage",
        status: "complete",
        content: null,
        data: {
          urls: raw.urls ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case "input_notes":
      return {
        blockId: newId("input_notes"),
        blockIndex: index,
        type: "input_notes",
        status: "complete",
        content: null,
        data: {
          note_ids: raw.note_ids ?? null,
          template: raw.template ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case "input_task":
      return {
        blockId: newId("input_task"),
        blockIndex: index,
        type: "input_task",
        status: "complete",
        content: null,
        data: {
          task_ids: raw.task_ids ?? null,
          template: raw.template ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case "input_table":
      return {
        blockId: newId("input_table"),
        blockIndex: index,
        type: "input_table",
        status: "complete",
        content: null,
        data: {
          bookmarks: raw.bookmarks ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case "input_list":
      return {
        blockId: newId("input_list"),
        blockIndex: index,
        type: "input_list",
        status: "complete",
        content: null,
        data: {
          bookmarks: raw.bookmarks ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case "input_data":
      return {
        blockId: newId("input_data"),
        blockIndex: index,
        type: "input_data",
        status: "complete",
        content: null,
        data: {
          refs: raw.refs ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case "input_context":
      return {
        blockId: newId("input_context"),
        blockIndex: index,
        type: "input_context",
        status: "complete",
        content: null,
        data: {
          context_id: raw.context_id ?? null,
          context_name: raw.context_name ?? null,
          context_data: raw.context_data ?? null,
          convert_to_text: raw.convert_to_text ?? null,
          optional_context: raw.optional_context ?? null,
          keep_fresh: raw.keep_fresh ?? null,
          editable: raw.editable ?? null,
        },
        metadata: raw.metadata,
      };

    case undefined:
      // Pydantic emits parts without a `type` field when a union default
      // collapses; shouldn't normally happen but is shape-legal in
      // MessagePart. Preserve everything for inspection.
      return makeUnknown(raw, index, "missing_type");

    default: {
      // Compile-time exhaustiveness — any new MessagePart variant in Python
      // surfaces here as a TS error until a case is added above.
      const _exhaustive: never = raw;
      void _exhaustive;
      return makeUnknown(raw as MessagePart, index, "unhandled_type");
    }
  }
}

type AnyMediaPart =
  | ImageMediaPart
  | AudioMediaPart
  | VideoMediaPart
  | DocumentMediaPart
  | YouTubeMediaPart;

function normalizeMedia(raw: AnyMediaPart, index: number): RenderBlockPayload {
  switch (raw.kind) {
    case "image": {
      // Images flow through the canonical UnifiedImageBlock shape — adapters
      // lift fileId, cdn_url, signed_url, visibility, thumbnails, etc. back
      // out of `metadata` where assembleMessageParts deposited them. The
      // payload at `data` is a fully-populated UnifiedImageBlock — the
      // renderer and action bar never need to consult `metadata` again.
      // See features/files/blocks/image/UNIFIED_IMAGE_BLOCK.md.
      const unified = fromCxMediaPart(raw);
      return {
        blockId: newId("db_image_output"),
        blockIndex: index,
        type: "image_output",
        status: "complete",
        content: null,
        data: unified as unknown as Record<string, unknown>,
        metadata: raw.metadata,
      };
    }

    case "audio":
      // Matches `AudioOutputData` (url + mime_type), with transcription
      // preserved alongside.
      return {
        blockId: newId("db_audio_output"),
        blockIndex: index,
        type: "audio_output",
        status: "complete",
        content: null,
        data: {
          type: "audio_output",
          url: raw.url ?? null,
          file_uri: raw.file_uri ?? null,
          mime_type: raw.mime_type ?? null,
          transcription_result: raw.transcription_result ?? null,
        },
        metadata: raw.metadata,
      };

    case "video":
      // Matches `VideoOutputData` (url + mime_type).
      return {
        blockId: newId("db_video_output"),
        blockIndex: index,
        type: "video_output",
        status: "complete",
        content: null,
        data: {
          type: "video_output",
          url: raw.url ?? null,
          file_uri: raw.file_uri ?? null,
          mime_type: raw.mime_type ?? null,
        },
        metadata: raw.metadata,
      };

    case "document":
      // No canonical "*_output" type for documents — fall back to the
      // documented `unknown_data_event` shape rather than inventing one.
      return makeUnknown(raw, index, "media_document");

    case "youtube":
      // Same reasoning as `document`: no canonical render type for YouTube
      // embeds in the python-generated set today.
      return makeUnknown(raw, index, "media_youtube");

    case undefined:
      return makeUnknown(raw, index, "media_missing_kind");

    default: {
      const _exhaustive: never = raw;
      void _exhaustive;
      return makeUnknown(raw as AnyMediaPart, index, "media_unhandled_kind");
    }
  }
}

/**
 * Reconstruct a legacy persisted interactive block (quiz, …) into its render
 * block instead of `unknown_data_event`. These parts carry `_matrxBlockType` +
 * `_matrxState` (stamped by useMessageBlockPersistence) and are NOT python
 * MessagePart types. Returns null for everything else (real parts are untouched).
 */
function reconstructPersistedBlock(
  rb: Record<string, unknown>,
  index: number,
): RenderBlockPayload | null {
  const blockType =
    typeof rb._matrxBlockType === "string" ? rb._matrxBlockType : undefined;
  if (!blockType || rb._matrxState === undefined) return null;

  // The quiz definition lives in _matrxState.quizState.originalQuestions —
  // rebuild the `{ quiz_title, questions }` shape the quiz renderer parses, and
  // carry _matrxState so the user's progress restores.
  let data: Record<string, unknown> = rb;
  if (blockType === "quiz") {
    const qs = (rb._matrxState as { quizState?: Record<string, unknown> } | undefined)
      ?.quizState;
    const questions = (qs?.originalQuestions as unknown[]) ?? [];
    data = {
      quiz_title: (qs?.title as string) ?? "Quiz",
      questions,
      _matrxState: rb._matrxState,
    };
  }

  return {
    blockId:
      typeof rb._matrxBlockId === "string" ? rb._matrxBlockId : newId("db_persisted"),
    blockIndex: index,
    type: blockType,
    status: "complete",
    content: null,
    data,
    metadata: rb.metadata as Record<string, unknown> | undefined,
  };
}

function makeUnknown(
  raw: MessagePart,
  index: number,
  reason: string,
): RenderBlockPayload {
  return {
    blockId: newId("db_unknown"),
    blockIndex: index,
    type: "unknown_data_event",
    status: "complete",
    content: null,
    data: {
      ...(raw as Record<string, unknown>),
      _dataType:
        typeof (raw as { type?: unknown }).type === "string"
          ? (raw as { type: string }).type
          : reason,
    },
    metadata: raw.metadata,
  };
}
