// features/rich-document/actions/handlers/annotations.ts
//
// "Notes & comments" — the ⋯ toggle for the Notes & comments dock a saved
// record carries (annotations/RecordAnnotations). Present only where the
// record renders here with something to show (or its dock is open); the dock
// never opens empty from here.

import { MessageSquareText } from "lucide-react";
import { registerAction } from "../provider";
import { annotationRecordOf, recordKeyOf } from "../../annotations/record-of-source";
import { dockStateFor, subscribeDocks, toggleDockFor } from "../../annotations/record-annotations-store";
import type { RichDocumentActionContext } from "../../types";

function dockOf(ctx: RichDocumentActionContext) {
  const record = annotationRecordOf(ctx.source);
  if (!record) return null;
  const key = recordKeyOf(record);
  const state = dockStateFor(key);
  return state ? { key, ...state } : null;
}

registerAction({
  id: "notes-and-comments",
  label: (ctx) => {
    const dock = dockOf(ctx);
    if (dock?.open) return "Hide notes & comments";
    return dock ? `Notes & comments (${dock.count})` : "Notes & comments";
  },
  icon: MessageSquareText,
  iconColor: "text-amber-600 dark:text-amber-400",
  category: "share",
  supportedSources: ["note", "chat-message", "working-document"],
  renderSlot: "overflow",
  order: 5,
  visible: (ctx) => {
    const dock = dockOf(ctx);
    return !!dock && (dock.open || dock.count > 0);
  },
  active: (ctx) => !!dockOf(ctx)?.open,
  subscribe: (onChange) => subscribeDocks(onChange),
  run: (ctx) => {
    const dock = dockOf(ctx);
    if (dock) toggleDockFor(dock.key);
  },
});
