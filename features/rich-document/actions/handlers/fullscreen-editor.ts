// features/rich-document/actions/handlers/fullscreen-editor.ts
//
// "Open in full-screen editor" — surfaces the existing FullscreenMarkdownEditor
// overlay from any source. Read-only by default; write-back depends on
// the source adapter's edit capability.

import { Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";
import { registerAction } from "../registry";
import { getErrorMessage, serializeError } from "../utils";

registerAction({
  id: "open-fullscreen-editor",
  label: "Open in full-screen editor",
  icon: Maximize2,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 10,
  run: (ctx) => {
    const canSave = Boolean(ctx.sourceAdapter.edit);

    // Source-agnostic save → route through the callback registry, never an
    // onSave function in Redux data (the controller drops it). Only register a
    // group when the source can actually save; otherwise the editor is
    // read-only and needs no save channel.
    const callbackGroupId = canSave
      ? createFullScreenEditorCallbackGroup({
          onSave: async (newContent: string) => {
            try {
              await ctx.sourceAdapter.edit?.({
                newContent,
                source: ctx.source,
                dispatch: ctx.dispatch,
              });
              toast.success("Saved");
            } catch (err) {
              console.error(
                "[open-fullscreen-editor] save failed",
                JSON.stringify(serializeError(err), null, 2),
              );
              toast.error(getErrorMessage(err, "Failed to save"));
            }
          },
        }).callbackGroupId
      : null;

    ctx.dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: ctx.instanceKey("fullscreen-editor"),
        data: {
          content: ctx.content,
          mode: "free",
          callbackGroupId,
          messageId:
            ctx.source.type === "chat-message"
              ? ctx.source.messageId
              : undefined,
          noteId:
            ctx.source.type === "note" ? ctx.source.noteId : undefined,
          tabs: [
            "write",
            "matrx_split",
            "markdown",
            "wysiwyg",
            "preview",
            "analysis",
          ],
          initialTab: "preview",
          analysisData: ctx.metadata as
            | Record<string, unknown>
            | undefined,
          title: "Full-screen Editor",
          showSaveButton: canSave,
          showCopyButton: true,
        },
      }),
    );
  },
});
