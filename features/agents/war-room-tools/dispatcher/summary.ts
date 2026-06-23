/**
 * buildApprovalChange — map a validated War Room tool call to the structured
 * {@link ApprovalChange} the HITL <ApprovalCard> renders.
 *
 * The card shows the user EXACTLY what the agent is about to do before they
 * approve. Instead of a pre-baked English sentence (the old `buildApprovalCopy`,
 * which forced the card to repeat itself), this emits the operation, the target,
 * and the field-level diffs — so an add shows new values and an update shows
 * before → after, each stated once.
 *
 * It reads the CURRENT entity from the same slices the handlers write to, so the
 * "before" side of every diff is the live value. Args are already Zod-validated.
 *
 * Kept out of the dispatcher so the wording + diff shaping live in one place and
 * stay in lockstep with the schemas.
 */

import type { RootState } from "@/lib/redux/store";
import type {
  ApprovalChange,
  ApprovalFieldDiff,
} from "@/features/agents/ui-first-tools/ui/approval-types";
import type { WarRoomToolName } from "../tools/names";
import {
  selectActiveNoteId,
  selectTileById,
} from "@/features/war-room/redux/selectors";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectNoteById } from "@/features/notes/redux/selectors";

interface BuildCtx {
  tileId: string;
  getState: () => RootState;
}

/** Cap block-field (description / note body) diffs so the card stays compact. */
const BLOCK_MAX = 600;
function clipBlock(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.replace(/\r\n/g, "\n");
  return t.length > BLOCK_MAX ? `${t.slice(0, BLOCK_MAX - 1)}…` : t;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function buildApprovalChange(
  toolName: WarRoomToolName,
  args: Record<string, unknown>,
  ctx: BuildCtx,
): ApprovalChange {
  const state = ctx.getState();
  const tile = selectTileById(ctx.tileId)(state);

  switch (toolName) {
    case "war_room_update_task": {
      const taskId = tile?.task_id ?? null;
      const task = taskId ? selectTaskById(state, taskId) : null;
      const fields: ApprovalFieldDiff[] = [];
      if (str(args.title) !== undefined)
        fields.push({ label: "Title", before: task?.title ?? null, after: str(args.title)! });
      if (str(args.status) !== undefined)
        fields.push({ label: "Status", before: task?.status ?? null, after: str(args.status)! });
      if ("priority" in args)
        fields.push({
          label: "Priority",
          before: task?.priority ?? null,
          after: (args.priority as string | null) ?? null,
        });
      if ("due_date" in args)
        fields.push({
          label: "Due date",
          before: task?.due_date ?? null,
          after: (args.due_date as string | null) ?? null,
        });
      if ("description" in args)
        fields.push({
          label: "Description",
          before: clipBlock(task?.description ?? null),
          after: clipBlock((args.description as string | null) ?? null),
          block: true,
        });
      return {
        verb: "update",
        entity: "task",
        title: task?.title ?? null,
        fields,
        autoApprove: { scope: "task", noun: "task changes" },
      };
    }

    case "war_room_add_subtask": {
      const fields: ApprovalFieldDiff[] = [];
      const description = str(args.description);
      if (description && description.trim())
        fields.push({ label: "Notes", after: clipBlock(description), block: true });
      return {
        verb: "add",
        entity: "subtask",
        title: str(args.title) ?? "",
        fields,
        autoApprove: { scope: "task", noun: "task changes" },
      };
    }

    case "war_room_toggle_subtask": {
      const subId = str(args.subtask_id);
      const sub = subId ? selectTaskById(state, subId) : null;
      const target = args.completed; // boolean | undefined
      const willComplete =
        target === true ||
        (target === undefined && sub?.status !== "completed");
      return {
        verb: willComplete ? "complete" : "reopen",
        entity: "subtask",
        title: sub?.title ?? null,
        fields: [
          {
            label: "Status",
            before: sub?.status ?? null,
            after: willComplete ? "completed" : "incomplete",
          },
        ],
        autoApprove: { scope: "task", noun: "task changes" },
      };
    }

    case "war_room_update_note": {
      const noteId =
        selectActiveNoteId(ctx.tileId)(state) ?? tile?.note_id ?? null;
      const note = noteId ? selectNoteById(noteId)(state) : null;
      const append = args.mode === "append";
      const fields: ApprovalFieldDiff[] = [];
      if (str(args.label) !== undefined)
        fields.push({ label: "Title", before: note?.label ?? null, after: str(args.label)! });
      const content = str(args.content);
      if (content !== undefined) {
        if (append) {
          fields.push({ label: "Appends", after: clipBlock(content), block: true });
        } else {
          fields.push({
            label: "Content",
            before: clipBlock(note?.content ?? null),
            after: clipBlock(content),
            block: true,
          });
        }
      }
      return {
        verb: append ? "append" : "update",
        entity: "note",
        title: note?.label ?? null,
        fields,
        autoApprove: { scope: "note", noun: "note edits" },
      };
    }

    case "war_room_update_tile":
      return {
        verb: "rename",
        entity: "tile",
        title: tile?.title ?? null,
        fields: [
          {
            label: "Name",
            before: tile?.title ?? null,
            after: str(args.title) ?? "",
          },
        ],
        autoApprove: { scope: "tile", noun: "tile renames" },
      };
  }
}
