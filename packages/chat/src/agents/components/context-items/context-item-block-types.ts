/**
 * Every block type the context-item registry (./registry.tsx) has a def for —
 * the PURE membership half of the registry, importable without its React
 * bodies. `registry.tsx` asserts at load that its defs cover exactly this
 * list, so the two can never drift; `isAttachmentMessagePart` reads it.
 */
export const CONTEXT_ITEM_BLOCK_TYPES = [
  "image",
  "image_output",
  "audio",
  "audio_output",
  "video",
  "video_output",
  "document",
  "file_output",
  "youtube_video",
  "input_notes",
  "input_task",
  "working_document",
  "input_document",
  "processed_document",
  "ctx_org",
  "ctx_scope",
  "ctx_project",
  "ctx_task",
  "input_webpage",
  "input_data",
  "input_table",
  "input_list",
  "input_project",
  "input_agent",
  "input_agent_app",
  "input_transcript",
  "input_transcript_session",
  "input_workbook",
  "input_context",
  "text",
  "editor_error",
  "editor_code_snippet",
] as const;

export type ContextItemBlockType = (typeof CONTEXT_ITEM_BLOCK_TYPES)[number];

const MEMBERS: ReadonlySet<string> = new Set(CONTEXT_ITEM_BLOCK_TYPES);

/**
 * True when a block type has a REGISTERED context-item def. This is the one
 * rule for "is this persisted part an attachment chip": the registry decides,
 * never a hand-kept list of the types that are NOT attachments (that closed
 * list turned every new part kind — speech_script, any future kind — into a
 * chip reading "Attachment", and kept decision_questions out of the bubble).
 */
export function hasContextItemDef(blockType: string): boolean {
  return MEMBERS.has(blockType);
}
