/**
 * Human-readable approval summaries for War Room write tools.
 *
 * The HITL confirm card shows the user EXACTLY what the agent is about to do
 * before they approve. This maps a validated tool call to a short, specific
 * one-liner + an uppercase header chip. Args are already Zod-validated, so this
 * only formats them.
 *
 * Kept out of the dispatcher so the wording lives in one place and stays in
 * lockstep with the schemas.
 */

import type { WarRoomToolName } from "../tools/names";

interface ApprovalCopy {
  header: string;
  summary: string;
}

const MAX = 120;
function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX ? `${t.slice(0, MAX - 1)}…` : t;
}

export function buildApprovalCopy(
  toolName: WarRoomToolName,
  args: Record<string, unknown>,
): ApprovalCopy {
  switch (toolName) {
    case "war_room_update_task": {
      const parts: string[] = [];
      if (typeof args.title === "string") parts.push(`title → “${args.title}”`);
      if (typeof args.status === "string") parts.push(`status → ${args.status}`);
      if (args.priority === null) parts.push("clear priority");
      else if (typeof args.priority === "string")
        parts.push(`priority → ${args.priority}`);
      if (args.due_date === null) parts.push("clear due date");
      else if (typeof args.due_date === "string")
        parts.push(`due → ${args.due_date}`);
      if ("description" in args) parts.push("update description");
      return {
        header: "TASK",
        summary: clip(
          parts.length
            ? `Update this tile's task: ${parts.join(", ")}?`
            : "Update this tile's task?",
        ),
      };
    }

    case "war_room_add_subtask":
      return {
        header: "SUBTASK",
        summary: clip(
          `Add a subtask “${String(args.title ?? "")}” to this tile's task?`,
        ),
      };

    case "war_room_toggle_subtask": {
      const target =
        args.completed === true
          ? "complete"
          : args.completed === false
            ? "incomplete"
            : "toggle";
      return {
        header: "SUBTASK",
        summary: clip(
          target === "toggle"
            ? "Toggle this subtask's completion?"
            : `Mark this subtask ${target}?`,
        ),
      };
    }

    case "war_room_update_note": {
      const mode = args.mode === "append" ? "Append to" : "Replace";
      const bits: string[] = [];
      if ("content" in args)
        bits.push(`${mode.toLowerCase()} the note content`);
      if (typeof args.label === "string") bits.push(`rename it to “${args.label}”`);
      return {
        header: "NOTE",
        summary: clip(
          bits.length
            ? `Edit this tile's note: ${bits.join(" and ")}?`
            : "Edit this tile's note?",
        ),
      };
    }

    case "war_room_update_tile":
      return {
        header: "TILE",
        summary: clip(`Rename this tile to “${String(args.title ?? "")}”?`),
      };
  }
}
