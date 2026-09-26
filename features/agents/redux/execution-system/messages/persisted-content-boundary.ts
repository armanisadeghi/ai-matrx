import { v4 as uuidv4 } from "uuid";
import {
  parseMessageContent,
  type MessagePart,
  type RenderBlockPayload,
} from "@/types/python-generated/stream-events";

export type PersistedContentEntry =
  | { kind: "message_part"; part: MessagePart; sourceIndex: number }
  | {
      kind: "legacy_render_block";
      block: RenderBlockPayload;
      sourceIndex: number;
    }
  | {
      /**
       * A well-formed part whose `type` this build does not know yet — a kind
       * the server started persisting after this client was generated. It is
       * never dropped and never crashes the transcript: every renderer shows
       * it as the honest Unknown Data Event block (`unknownPersistedPartBlock`).
       */
      kind: "unknown_part";
      partType: string;
      raw: Record<string, unknown>;
      sourceIndex: number;
    };

/**
 * Every `MessagePart` discriminator this build was generated with. `satisfies
 * Record<MessagePart["type"], true>` makes it exhaustive at compile time: a
 * regenerated union with a new kind fails type-check here until it is listed.
 * Used ONLY to tell "unknown future kind" (render honestly) from "malformed
 * known kind" (still throws — a broken row must never be disguised).
 */
const KNOWN_MESSAGE_PART_TYPES = {
  text: true,
  thinking: true,
  tool_call: true,
  tool_result: true,
  media: true,
  code_exec: true,
  code_result: true,
  web_search: true,
  input_webpage: true,
  input_notes: true,
  input_task: true,
  input_agent: true,
  input_project: true,
  input_agent_app: true,
  input_transcript: true,
  input_transcript_session: true,
  input_workbook: true,
  input_document: true,
  input_table: true,
  input_list: true,
  input_data: true,
  input_context: true,
  decision_questions: true,
  decision_answers: true,
  speech_script: true,
} as const satisfies Record<MessagePart["type"], true>;

export function isKnownMessagePartType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(KNOWN_MESSAGE_PART_TYPES, type);
}

/** The honest render block for a part kind this build cannot draw. */
export function unknownPersistedPartBlock(
  entry: Extract<PersistedContentEntry, { kind: "unknown_part" }>,
): RenderBlockPayload {
  return {
    blockId: `db_unknown_${entry.sourceIndex}_${entry.partType}`,
    blockIndex: entry.sourceIndex,
    type: "unknown_data_event",
    status: "complete",
    content: null,
    data: { ...entry.raw, _dataType: entry.partType },
    metadata: optionalRecord(entry.raw.metadata),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function persistedPartShape(value: unknown): string {
  if (!isRecord(value)) return `valueType=${typeof value}`;
  const discriminator = typeof value.type === "string" ? value.type : "missing";
  return `type=${discriminator}; keys=[${Object.keys(value).sort().join(",")}]`;
}

function recoverMediaWithInlineBytes(
  value: unknown,
  sourceIndex: number,
): MessagePart | null {
  if (
    !isRecord(value) ||
    value.type !== "media" ||
    (!("base64_data" in value) && !("base64" in value)) ||
    !(
      (typeof value.file_id === "string" && value.file_id.trim().length > 0) ||
      (typeof value.url === "string" && value.url.trim().length > 0)
    )
  ) {
    return null;
  }

  const { base64_data: _base64Data, base64: _base64, ...durablePart } = value;
  let part: MessagePart | undefined;
  try {
    [part] = parseMessageContent([durablePart]);
  } catch {
    return null;
  }
  if (!part) return null;

  console.error(
    "[parsePersistedMessageContent] recovered media with inline bytes",
    {
      sourceIndex,
      kind: typeof value.kind === "string" ? value.kind : "missing",
    },
  );
  return part;
}

/**
 * Runtime-validates the historical interactive-block shape written before
 * cx_message.content became the generated MessagePart union. This is the one
 * migration boundary for those rows; typed MessagePart consumers never probe
 * for legacy keys or weaken the generated contract.
 */
function recoverLegacyRenderBlock(
  value: unknown,
  sourceIndex: number,
): RenderBlockPayload | null {
  if (!isRecord(value)) return null;

  const blockType = value._matrxBlockType;
  const persistedState = value._matrxState;
  if (
    typeof blockType !== "string" ||
    blockType.trim().length === 0 ||
    !isRecord(persistedState)
  ) {
    return null;
  }

  let data: Record<string, unknown> = value;
  if (blockType === "quiz") {
    const quizState = optionalRecord(persistedState.quizState);
    if (!quizState || !Array.isArray(quizState.originalQuestions)) return null;

    data = {
      quiz_title:
        typeof quizState.title === "string" && quizState.title.trim().length > 0
          ? quizState.title
          : "Quiz",
      questions: quizState.originalQuestions,
      _matrxState: persistedState,
    };
  }

  return {
    blockId:
      typeof value._matrxBlockId === "string" &&
      value._matrxBlockId.trim().length > 0
        ? value._matrxBlockId
        : `db_persisted_${uuidv4()}`,
    blockIndex: sourceIndex,
    type: blockType,
    status: "complete",
    content: null,
    data,
    metadata: optionalRecord(value.metadata),
  };
}

/**
 * Parses DB JSON without weakening generated MessagePart validation.
 *
 * Historical interactive blocks are recovered first because they predate the
 * generated union. Every other entry goes through the authoritative generated
 * parser and still throws on malformed/unknown data. Recovery is deliberately
 * loud: seeing this error means a legacy row should eventually be migrated.
 */
export function parsePersistedMessageContent(
  content: unknown,
): PersistedContentEntry[] {
  if (!Array.isArray(content)) return [];

  return content.map((value, sourceIndex) => {
    const legacyBlock = recoverLegacyRenderBlock(value, sourceIndex);
    if (legacyBlock) {
      console.error(
        "[parsePersistedMessageContent] recovered legacy interactive block",
        {
          sourceIndex,
          blockId: legacyBlock.blockId,
          blockType: legacyBlock.type,
        },
      );
      return {
        kind: "legacy_render_block",
        block: legacyBlock,
        sourceIndex,
      };
    }

    const recoveredMedia = recoverMediaWithInlineBytes(value, sourceIndex);
    if (recoveredMedia) {
      return { kind: "message_part", part: recoveredMedia, sourceIndex };
    }

    if (
      isRecord(value) &&
      typeof value.type === "string" &&
      value.type.trim().length > 0 &&
      !isKnownMessagePartType(value.type) &&
      // A legacy interactive block that failed recovery is MALFORMED legacy
      // data, not a new kind — it keeps throwing below.
      !("_matrxBlockType" in value)
    ) {
      // Loud, never silent: a kind the server persists that this build does
      // not know. It still renders (as the Unknown Data Event block).
      console.error(
        "[parsePersistedMessageContent] unknown message part kind — rendering the honest fallback",
        { sourceIndex, shape: persistedPartShape(value) },
      );
      return {
        kind: "unknown_part",
        partType: value.type,
        raw: value,
        sourceIndex,
      };
    }

    try {
      const [part] = parseMessageContent([value]);
      if (!part)
        throw new TypeError("generated parser returned no message part");
      return { kind: "message_part", part, sourceIndex };
    } catch (cause) {
      throw new TypeError(
        `Invalid chat.message.content[${sourceIndex}]: ${persistedPartShape(value)}; part does not match the generated MessagePart contract`,
        { cause },
      );
    }
  });
}

export function messagePartsFromPersistedContent(
  content: unknown,
): MessagePart[] {
  return parsePersistedMessageContent(content).flatMap((entry) =>
    entry.kind === "message_part" ? [entry.part] : [],
  );
}
