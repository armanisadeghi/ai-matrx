// features/rich-document/actions/handlers/fullscreen-editor.ts
//
// "Open in full-screen editor" — surfaces the existing FullscreenMarkdownEditor
// overlay from any source. Read-only by default; write-back depends on
// the source adapter's edit capability.

import { Maximize2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";
import { registerAction } from "../provider";
import { chatExtensions, chatWriteBackBlocked } from "../utils";
import { updateMessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { getErrorMessage, serializeError } from "../utils";
import { acknowledgedPreparedSource, prepareContentEdit, savePreparedContentEdit } from "./preparedEdit";

registerAction({
  id: "open-fullscreen-editor",
  label: "Open in full-screen editor",
  icon: Maximize2,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 10,
  // It is the full-screen EDITOR: a read-only source (an error card, a loaded
  // copy) has nothing to edit, so the action is absent there (ALC-15, R1) —
  // declared as a source writer, the one rule every read-only surface honors.
  writesSource: true,
  run: async (ctx) => {
    // A CHAT ANSWER opens THE ONE editor, expanded, in its own spot (RC-B5):
    // the same instance and save path as the pencil — never this old editor,
    // whose display-text seed silently dropped inline reasoning and rewrote
    // blank-line runs on save (verify-RC-B5 F1, row fcf00f0a).
    const ext = chatExtensions(ctx);
    if (ext?.role === "assistant" && ctx.source.type === "chat-message" && ext.editTarget && !ext.editTarget.isStructuredRaw) {
      const conversationId = ctx.source.conversationId;
      const loaded =
        !!conversationId &&
        !!ctx.getState().messages.byConversationId[conversationId]?.byId?.[ext.editTarget.messageId];
      if (conversationId && loaded) {
        ctx.dispatch(
          updateMessageRecord({
            conversationId,
            messageId: ext.editTarget.messageId,
            patch: { _editingInPlace: "expanded" },
          }),
        );
        ctx.onClose();
        return;
      }
    }
    // Chat structured payloads and user turns stay read-only here: a user turn
    // saves through its own three-outcome editor (edit-and-resubmit). A chat
    // answer this store never loaded opens read-only too — nothing here writes
    // a chat message.
    const canSave =
      Boolean(ctx.sourceAdapter.edit) &&
      ctx.source.type !== "chat-message" &&
      !chatWriteBackBlocked(ctx) &&
      !ctx.source.readOnly;
    const prepared = canSave ? await prepareContentEdit(ctx) : { source: ctx.source, content: ctx.content };
    let preparedSource = prepared.source;
    // What the editor opened on — a display projection for chat — so the
    // adapter splices only the changed span into the stored text.
    let openedOn = prepared.content;

    // Source-agnostic save → route through the callback registry, never an
    // onSave function in Redux data (the controller drops it). Only register a
    // group when the source can actually save; otherwise the editor is
    // read-only and needs no save channel.
    const callbackGroupId = canSave
      ? createFullScreenEditorCallbackGroup({
          onSave: async (newContent: string) => {
            try {
              preparedSource = await savePreparedContentEdit({
                ctx,
                source: preparedSource,
                newContent,
                previousContent: openedOn,
              });
              openedOn = newContent;
              toast.success("Saved");
            } catch (err) {
              preparedSource = acknowledgedPreparedSource(preparedSource, err, newContent) ?? preparedSource;
              console.error(
                "[open-fullscreen-editor] save failed",
                JSON.stringify(serializeError(err), null, 2),
              );
              toast.error(getErrorMessage(err, "Failed to save"));
              throw err;
            }
          },
        }).callbackGroupId
      : null;

    ctx.dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: ctx.instanceKey("fullscreen-editor"),
        data: {
          content: prepared.content,
          mode: "free",
          callbackGroupId,
          messageId:
            preparedSource.type === "chat-message"
              ? preparedSource.messageId
              : undefined,
          noteId:
            preparedSource.type === "note" ? preparedSource.noteId : undefined,
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
