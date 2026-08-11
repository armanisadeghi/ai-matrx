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
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
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

    const [part] = parseMessageContent([value]);
    return { kind: "message_part", part, sourceIndex };
  });
}

export function messagePartsFromPersistedContent(
  content: unknown,
): MessagePart[] {
  return parsePersistedMessageContent(content).flatMap((entry) =>
    entry.kind === "message_part" ? [entry.part] : [],
  );
}
