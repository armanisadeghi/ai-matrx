// features/rich-document/actions/handlers/write-back.ts
//
// Replace / Insert below — put an AI answer back into the text it was launched
// on. Present only on an assistant answer whose run was launched from an
// editable surface's right-click menu (its widget handle carries a
// `selection` write-back — context-menu-v3/utils/selection-write-back.ts), so
// it appears in every display mode's action bar (inline card, modal, panel…)
// and nowhere else.

import { ArrowDownToLine, Replace } from "lucide-react";
import { toast } from "@/lib/toast";
import { selectWidgetHandleIdFor } from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { getSelectionWriteBack } from "@ai-matrx/chat/agents/utils/launch-widget-handles";
import type { SelectionWriteBack } from "@ai-matrx/chat/agents/types/widget-handle.types";
import { registerAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { contentForDestination } from "../utils";
import type { RichDocumentActionContext } from "@ai-matrx/rich-content/rich-document/types";

function writeBackFor(ctx: RichDocumentActionContext): SelectionWriteBack | null {
  if (ctx.source.type !== "chat-message") return null;
  if (ctx.extensions?.type !== "chat-message" || ctx.extensions.role !== "assistant") {
    return null;
  }
  const state = ctx.getState();
  // Hosts with no execution system mounted have no handle to read.
  if (!state.instanceUIState) return null;
  const handleId = selectWidgetHandleIdFor(state, ctx.source.conversationId);
  return getSelectionWriteBack(handleId);
}

function apply(
  ctx: RichDocumentActionContext,
  verb: "replace" | "insertBelow",
  done: string,
): void {
  const writeBack = writeBackFor(ctx);
  const text = contentForDestination(ctx).trim();
  if (!writeBack || !text) return;
  let ok = false;
  try {
    ok = writeBack[verb](text);
  } catch (err) {
    console.error(`[write-back] ${verb} failed`, err);
  }
  if (ok) toast.success(done);
  else toast.error("Original text changed — copy instead");
}

registerAction({
  id: "replace-selection",
  label: "Replace",
  icon: Replace,
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "primary",
  order: 0,
  visible: (ctx) => writeBackFor(ctx) !== null,
  run: (ctx) => apply(ctx, "replace", "Replaced"),
});

registerAction({
  id: "insert-below",
  label: "Insert below",
  icon: ArrowDownToLine,
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "primary",
  order: 1,
  visible: (ctx) => writeBackFor(ctx) !== null,
  run: (ctx) => apply(ctx, "insertBelow", "Inserted"),
});
