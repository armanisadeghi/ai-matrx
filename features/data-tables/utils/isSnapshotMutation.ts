/**
 * isSnapshotMutation — the autosave dirty-filter for the Univer editors.
 *
 * D97: `onCommandExecuted` fires for EVERY command — including viewport
 * scrolls and selection moves — so an unfiltered listener marked the doc
 * dirty on mere scrolling and wrote a new snapshot row (version history +
 * collab broadcast) 2.5s later. Only CommandType.MUTATION changes the data
 * that a snapshot persists (Univer's own docs: OPERATION = "not saved to
 * snapshot, such as modifying scroll position"). We therefore accept ONLY
 * mutations, and additionally deny-list any mutation whose id marks it as
 * scroll / selection / viewport bookkeeping, belt-and-braces.
 */
import { CommandType, type ICommandInfo } from "@univerjs/core";

/** Non-content command ids that must never mark the document dirty. */
const NON_CONTENT_ID_PATTERN =
  /(scroll|selection|set-selections|viewport|zoom|hover|cursor|focus|activate)/i;

export function isSnapshotMutation(command: ICommandInfo): boolean {
  if (command.type !== CommandType.MUTATION) return false;
  if (NON_CONTENT_ID_PATTERN.test(command.id)) return false;
  return true;
}
