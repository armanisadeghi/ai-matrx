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

import { Edit, History, GitBranch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { openOverlay, closeOverlay } from "@/lib/redux/slices/overlaySlice";
import { registerAction } from "../registry";
import { getErrorMessage, serializeError } from "../utils";

registerAction({
  id: "edit",
  label: "Edit content",
  icon: Edit,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "edit",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => Boolean(ctx.sourceAdapter.edit),
  run: (ctx) => {
    const instanceId = ctx.instanceKey("edit-content");
    ctx.dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId,
        data: {
          content: ctx.content,
          mode: "free",
          // Chat-message convention: passing IDs in data so the overlay
          // can show metadata if it wants. The actual edit dispatch goes
          // through the source adapter — not through any onSave closure
          // in data (which would violate the "no functions in Redux"
          // doctrine).
          messageId:
            ctx.source.type === "chat-message"
              ? ctx.source.messageId
              : undefined,
          conversationId:
            ctx.source.type === "chat-message"
              ? ctx.source.conversationId
              : undefined,
          noteId:
            ctx.source.type === "note" ? ctx.source.noteId : undefined,
          // The overlay controller dispatches the save by looking up the
          // source adapter and calling its `edit` — wired into the
          // controller during Phase 2. Until that wiring lands, we pass
          // an onSave callback as a transitional measure.
          onSave: async (newContent: string) => {
            try {
              await ctx.sourceAdapter.edit?.({
                newContent,
                source: ctx.source,
                dispatch: ctx.dispatch,
              });
              toast.success("Changes saved");
            } catch (err) {
               
              console.error(
                "[edit] save failed",
                JSON.stringify(serializeError(err), null, 2),
              );
              toast.error(getErrorMessage(err, "Failed to save changes"));
            }
            ctx.dispatch(
              closeOverlay({ overlayId: "fullScreenEditor", instanceId }),
            );
          },
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
  visible: (ctx) => {
    if (ctx.extensions?.type !== "chat-message") return false;
    if (ctx.extensions.contentHistoryCount === 0) return false;
    return true;
  },
  run: (ctx) => {
    // Dialog is host-owned (AssistantActionBar/UserActionBar). The chat
    // surface passes an `onRequestEditHistory` callback in via the
    // host's prop wiring; we just call it.
    // For Phase 1, ferry via callbacks — Phase 4 wires this into the
    // chat ActionBar variant directly.
    const hostCb = (ctx.callbacks as Record<string, unknown> | undefined)
      ?.onRequestEditHistory;
    if (typeof hostCb === "function") {
      (hostCb as () => void)();
    }
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
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
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
    ctx.callbacks?.onRequestDelete?.();
  },
});
