// features/rich-document/actions/handlers/edit.ts
//
// Edit / fork / delete actions.
//
// `edit` is source-agnostic via ctx.sourceAdapter.edit — chat dispatches
// editMessage, note dispatches NotesAPI.update, etc. The doctrine fix here
// (vs. the legacy registry): the onSave closure is constructed at click
// time and only the data shape goes through Redux, never the function. We
// pass `mode: "free"` to the fullScreenEditor and let the host wire its
// own save path via the source adapter — there's no `onSave` in the data
// payload.
//
// edit-history / fork-at-message / delete-message stay chat-only because
// they touch cx_message.content_history / forkConversation / the host's
// destructive-vs-fork dialog respectively. Generalizing them to notes /
// prompts requires new infrastructure that doesn't exist yet (note version
// browser, prompt-result branching) — out of scope for Phase 1.

import { Edit, History, GitBranch, Trash2, Send } from "lucide-react";
import { toast } from "@/lib/toast";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";
import { registerAction } from "../registry";
import {
  chatExtensions,
  getErrorMessage,
  isChatUserMessage,
  serializeError,
} from "../utils";
import { openAssistantMessageEditor } from "@/features/agents/components/messages-display/message-options/openAssistantMessageEditor";
import { acknowledgedPreparedSource, prepareContentEdit, savePreparedContentEdit } from "./preparedEdit";

registerAction({
  id: "edit",
  label: (ctx) =>
    chatExtensions(ctx)?.editTarget?.isStructuredRaw
      ? "View raw content"
      : "Edit content",
  icon: Edit,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => {
    if (!ctx.sourceAdapter.edit) return false;
    const ext = chatExtensions(ctx);
    if (!ext) return true;
    // A user turn edits through its three-outcome editor (edit-and-resubmit);
    // an assistant turn needs a text-bearing row to save to.
    return ext.role === "assistant" && Boolean(ext.editTarget?.messageId);
  },
  run: async (ctx) => {
    // CHAT ASSISTANT MESSAGE — the SAME opener the bar's pencil uses
    // (`mode: "assistant-message"`, same instance id, same save contract:
    // the OverlayController self-handles via `editMessage`). Grouped turns
    // edit their text-bearing row; structured payloads open read-only.
    const ext = chatExtensions(ctx);
    if (ext && ctx.source.type === "chat-message") {
      const target = ext.editTarget;
      if (!target) return;
      openAssistantMessageEditor(ctx.dispatch, {
        content: target.content,
        conversationId: ctx.source.conversationId,
        messageId: target.messageId,
        metadata: ctx.metadata,
        structuredRaw: target.isStructuredRaw,
      });
      ctx.onClose();
      return;
    }
    // Save is source-agnostic via `ctx.sourceAdapter.edit` (chat → editMessage,
    // note → NotesAPI.update, …), so the bridge's editMessage self-handle is
    // NOT the right path. Route onSave through the callback registry — a
    // function can never travel through Redux (the controller drops it, which
    // silently broke note/prompt saves). The group auto-disposes on save.
    const prepared = await prepareContentEdit(ctx);
    let preparedSource = prepared.source;
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onSave: async (newContent: string) => {
        try {
          preparedSource = await savePreparedContentEdit({
            ctx,
            source: preparedSource,
            newContent,
          });
          toast.success("Changes saved");
        } catch (err) {
          preparedSource = acknowledgedPreparedSource(preparedSource, err, newContent) ?? preparedSource;
          console.error(
            "[edit] save failed",
            JSON.stringify(serializeError(err), null, 2),
          );
          toast.error(getErrorMessage(err, "Failed to save changes"));
          throw err;
        }
      },
    });
    ctx.dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: ctx.instanceKey("edit-content"),
        data: {
          content: prepared.content,
          mode: "free",
          callbackGroupId,
          // IDs passed for metadata display only; the save goes through the
          // source adapter via the callback above, not the self-handle.
          messageId:
            preparedSource.type === "chat-message"
              ? preparedSource.messageId
              : undefined,
          noteId:
            preparedSource.type === "note" ? preparedSource.noteId : undefined,
          tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
          initialTab: "matrx_split",
          analysisData: ctx.metadata as
            | Record<string, unknown>
            | undefined,
          title: undefined,
          showSaveButton: true,
          showCopyButton: true,
        },
      }),
    );
  },
});

registerAction({
  id: "edit-history",
  label: (ctx) => {
    const ext =
      ctx.extensions?.type === "chat-message" ? ctx.extensions : null;
    return ext && ext.contentHistoryCount > 0
      ? `Edit history (${ext.contentHistoryCount})`
      : "Edit history";
  },
  icon: History,
  iconColor: "text-amber-500 dark:text-amber-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 1,
  visible: (ctx) =>
    ctx.extensions?.type === "chat-message" &&
    ctx.extensions.contentHistoryCount > 0 &&
    Boolean(ctx.callbacks?.onRequestEditHistory),
  run: (ctx) => {
    // The dialog is host-owned (the chat bar) so it survives the menu closing.
    ctx.callbacks?.onRequestEditHistory?.();
    ctx.onClose();
  },
});

registerAction({
  id: "fork-at-message",
  label: "Fork at this message",
  icon: GitBranch,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 2,
  // An assistant turn ends the exchange, so its branch is complete. A user
  // turn forking here would dead-end on an unanswered question — it gets
  // fork-and-regenerate instead.
  visible: (ctx) => !isChatUserMessage(ctx),
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    // Close the menu first: the fork RPC's post-fork dialog shares its layer.
    ctx.onClose();
    const { messageId, conversationId } = ctx.source;
    if (!conversationId || !messageId) return;

    try {
      const { forkConversation } = await import(
        "@/features/agents/redux/execution-system/message-crud/fork-conversation.thunk"
      );
      // Position-aware fork: read position from state at fire-time so we
      // capture the message itself. Imported from the chat module because
      // the position concept is chat-specific.
      const positionThunk = async (
        _: unknown,
        getState: () => unknown,
      ): Promise<{ conversationId: string }> => {
        const state = getState() as {
          messages: {
            byConversationId: Record<
              string,
              { byId?: Record<string, { position?: number }> }
            >;
          };
        };
        const entry = state.messages?.byConversationId?.[conversationId];
        const msg = entry?.byId?.[messageId];
        const position = msg?.position ?? 0;
        return (await ctx.dispatch(
          forkConversation({
            conversationId,
            atPosition: position,
          }),
        ).unwrap()) as { conversationId: string };
      };

      const result = await ctx.dispatch(
        positionThunk as unknown as ReturnType<typeof forkConversation>,
      );
      const newConvId = (result as { conversationId?: string })
        ?.conversationId;

      if (ctx.surfaceKey && newConvId) {
        const { promptForkOutcome } = await import(
          "@/features/agents/components/messages-display/message-options/promptForkOutcome"
        );
        await promptForkOutcome({
          dispatch: ctx.dispatch,
          surfaceKey: ctx.surfaceKey,
          newConversationId: newConvId,
        });
      }
    } catch (err) {
       
      console.error("[fork-at-message] failed", err);
      toast.error(getErrorMessage(err, "Failed to fork conversation"));
    }
  },
});

registerAction({
  id: "delete-message",
  label: "Delete message",
  icon: Trash2,
  iconColor: "text-red-500 dark:text-red-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 3,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestDelete),
  run: (ctx) => {
    ctx.onClose();
    ctx.callbacks?.onRequestDelete?.();
  },
});

/**
 * USER MESSAGES — edit the prompt and choose an outcome from the editor footer
 * (Save only / Save & resubmit / Fork & resubmit). The SAME three-outcome
 * editor as the inline UserActionBar pencil — one shared definition
 * (`USER_EDIT_ACTIONS` + `routeUserEditAction`). `onAction` rides the callback
 * group (a function can't travel through overlay data).
 */
registerAction({
  id: "edit-and-resubmit",
  label: (ctx) =>
    chatExtensions(ctx)?.contentIsStructuredRaw
      ? "View raw content"
      : "Edit & resubmit",
  icon: Send,
  iconColor: "text-cyan-500 dark:text-cyan-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => isChatUserMessage(ctx),
  run: async (ctx) => {
    ctx.onClose();
    if (ctx.source.type !== "chat-message") return;
    const ext = chatExtensions(ctx);
    const { conversationId, messageId } = ctx.source;
    const content = ext?.messageContent ?? ctx.content;
    if (ext?.contentIsStructuredRaw) {
      // Structured payload: faithful read-only raw view — the text editor
      // would save the JSON string back as a text block.
      const { openStructuredRawViewer } = await import(
        "@/features/agents/components/messages-display/message-options/openAssistantMessageEditor"
      );
      openStructuredRawViewer(ctx.dispatch, {
        content,
        messageId,
        metadata: ctx.metadata,
      });
      return;
    }
    const { USER_EDIT_ACTIONS, routeUserEditAction } = await import(
      "@/features/agents/components/messages-display/message-options/userEditActions"
    );
    const surfaceKey = ctx.surfaceKey;
    const { callbackGroupId } = createFullScreenEditorCallbackGroup({
      onAction: (actionId, newContent) =>
        routeUserEditAction(ctx.dispatch, {
          actionId,
          conversationId,
          messageId,
          newContent,
          surfaceKey,
        }),
    });
    ctx.dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId: `user-edit-${messageId}`,
        data: {
          content,
          mode: "free",
          conversationId,
          messageId,
          callbackGroupId,
          primaryActions: USER_EDIT_ACTIONS,
          tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
          initialTab: "matrx_split",
          analysisData: ctx.metadata ?? undefined,
          showCopyButton: true,
        },
      }),
    );
  },
});

/**
 * USER MESSAGES — fork at this question and REGENERATE its answer on the
 * branch (no edit). The shared `forkAndResubmitFromMessage` thunk means the
 * branch never dead-ends on an unanswered question.
 */
registerAction({
  id: "fork-and-regenerate",
  label: "Fork & regenerate from here",
  icon: GitBranch,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "edit",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) => isChatUserMessage(ctx),
  run: async (ctx) => {
    ctx.onClose();
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { forkAndResubmitFromMessage } = await import(
        "@/features/agents/redux/execution-system/message-crud/fork-and-resubmit-from-message.thunk"
      );
      await ctx
        .dispatch(
          forkAndResubmitFromMessage({
            conversationId,
            messageId,
            surfaceKey: ctx.surfaceKey,
          }),
        )
        .unwrap();
    } catch (err) {
      console.error("[fork-and-regenerate] failed", err);
      toast.error(getErrorMessage(err, "Failed to fork conversation"));
    }
  },
});
