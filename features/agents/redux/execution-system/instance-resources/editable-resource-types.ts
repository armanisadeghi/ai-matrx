/**
 * Editable-capable resource types — single source of truth.
 *
 * Only reference resources that the backend re-fetches each turn AND can write
 * back to support the `editable` flag. When `editable: true` is sent, the agent
 * is permitted to modify the underlying record (note body, task fields, etc.).
 * Files, media, raw text, and editor XML pills are never editable.
 *
 * The wire contract (see `selectResourcePayloads`): read-only omits the
 * `editable` key entirely (backend default); editable sends `editable: true`.
 */

import type { ResourceBlockType } from "@/features/agents/types/instance.types";

const EDITABLE_CAPABLE_BLOCK_TYPES: ReadonlySet<ResourceBlockType> = new Set([
  "input_notes",
  "input_task",
  "input_table",
  "input_list",
  "input_data",
  "input_webpage",
  // Matrx entities whose underlying record the agent can write back to.
  // Pure references (input_agent, input_agent_app) are intentionally NOT here.
  "input_project",
  "input_transcript",
  "input_transcript_session",
  "input_workbook",
  "input_document",
]);

/** True when a resource block type supports the agent-editable toggle. */
export function isEditableCapableBlockType(
  blockType: ResourceBlockType,
): boolean {
  return EDITABLE_CAPABLE_BLOCK_TYPES.has(blockType);
}
