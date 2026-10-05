/**
 * buildWidgetActionApprovalChange — the ONE place that turns a delegated
 * widget_* call into the `ApprovalChange` the inline approval card renders.
 *
 * Pure (no redux, no React) so the guard can run the real builder. Every
 * widget_* tool writes into what the person is looking at, so every one of
 * them is reviewable here — the same card `apply_surface_write` shows.
 */

import type { ApprovalChange } from "../../../ui-first-tools/ui/approval-types";
import type { WidgetActionName } from "../../../types/widget-handle.types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function buildWidgetActionApprovalChange(input: {
  toolName: WidgetActionName;
  args: Record<string, unknown>;
  actorLabel?: string;
  currentText?: string | null;
}): ApprovalChange {
  const { toolName, args, currentText } = input;
  const actor = input.actorLabel?.trim();
  const who = actor || "The agent";
  const base = {
    entity: "text",
    title: "Change to this text",
    description: `${who} wants to change the text you are working on. Nothing changes unless you approve.`,
    ...(actor ? { actor } : {}),
  };

  switch (toolName) {
    case "widget_text_replace":
      return {
        ...base,
        verb: "update",
        fields: [
          {
            label: "Text",
            ...(typeof currentText === "string" ? { before: currentText } : {}),
            after: str(args.text),
            block: true,
          },
        ],
      };
    case "widget_text_patch":
      return {
        ...base,
        verb: "update",
        fields: [
          {
            label: "Text",
            before: str(args.search_text),
            after: str(args.replacement_text),
            block: true,
          },
        ],
      };
    case "widget_text_insert_before":
    case "widget_text_insert_after":
    case "widget_text_prepend":
    case "widget_text_append":
      return {
        ...base,
        verb: "append",
        fields: [{ label: "Text to add", after: str(args.text), block: true }],
      };
    case "widget_update_field":
      return {
        ...base,
        verb: "update",
        title: str(args.field) || base.title,
        fields: [],
        proposedValue: { value: args.value },
      };
    default:
      return {
        ...base,
        verb: toolName === "widget_update_record" ? "update" : "add",
        fields: [],
        proposedValue: { value: args },
      };
  }
}
