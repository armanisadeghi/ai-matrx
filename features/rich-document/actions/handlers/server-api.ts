// features/rich-document/actions/handlers/server-api.ts
//
// Admin-only test surface for the Python-backed conversation endpoints.
// Lives next to the legacy Supabase-RPC actions so an admin can A/B them
// on real messages. Chat-only by definition — every action operates on
// a cx_conversation + cx_message pair.
//
// See messageActionRegistry.ts lines 1198–1486 for the original wiring.

import {
  GitFork,
  EyeOff,
  Trash2,
  ListFilter,
  Scissors,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { openOverlay, closeOverlay } from "@/lib/redux/slices/overlaySlice";
import { registerAction } from "../registry";
import { getErrorMessage } from "../utils";

/**
 * Reads compaction-anchor info from the chat message metadata. Only the
 * "restore compaction" action needs this — the rest operate by message id.
 */
function getCompactionAnchor(
  metadata: Record<string, unknown> | null,
): { compactionGroupId?: string } | null {
  if (!metadata) return null;
  const groupId =
    typeof metadata.compaction_group_id === "string"
      ? metadata.compaction_group_id
      : null;
  const isSummary =
    metadata.compaction_summary === true ||
    metadata.is_compaction_summary === true ||
    typeof metadata.compaction_archive === "object";
  if (!groupId && !isSummary) return null;
  return { compactionGroupId: groupId ?? undefined };
}

registerAction({
  id: "server-api-admin-fork-at",
  label: "Fork at this message (server)",
  icon: GitFork,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => ctx.isAdmin,
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { forkConversationServer } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk"
      );
      const result = await ctx
        .dispatch(
          forkConversationServer({
            conversationId,
            selector: { fromMessageId: messageId, exclusive: false },
          }),
        )
        .unwrap();
      if (ctx.surfaceKey && result?.conversationId) {
        const { promptForkOutcome } = await import(
          "@/features/agents/components/messages-display/message-options/promptForkOutcome"
        );
        await promptForkOutcome({
          dispatch: ctx.dispatch,
          surfaceKey: ctx.surfaceKey,
          newConversationId: result.conversationId,
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Server fork failed"));
    }
  },
});

registerAction({
  id: "server-api-admin-fork-before",
  label: "Fork BEFORE this message (server)",
  icon: GitFork,
  iconColor: "text-violet-400 dark:text-violet-300",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 1,
  visible: (ctx) => ctx.isAdmin,
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { forkConversationServer } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk"
      );
      const result = await ctx
        .dispatch(
          forkConversationServer({
            conversationId,
            selector: { fromMessageId: messageId, exclusive: true },
          }),
        )
        .unwrap();
      if (ctx.surfaceKey && result?.conversationId) {
        const { promptForkOutcome } = await import(
          "@/features/agents/components/messages-display/message-options/promptForkOutcome"
        );
        await promptForkOutcome({
          dispatch: ctx.dispatch,
          surfaceKey: ctx.surfaceKey,
          newConversationId: result.conversationId,
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Server fork (exclusive) failed"));
    }
  },
});

registerAction({
  id: "server-api-admin-hide-from-model",
  label: "Hide this from model (server)",
  icon: EyeOff,
  iconColor: "text-amber-500 dark:text-amber-400",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) => ctx.isAdmin,
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { hideMessages } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/hide-messages.thunk"
      );
      await ctx
        .dispatch(
          hideMessages({
            conversationId,
            selector: { message_ids: [messageId], inclusive: true },
          }),
        )
        .unwrap();
      toast.success("Hidden from model");
    } catch (err) {
      toast.error(getErrorMessage(err, "Hide failed"));
    }
  },
});

registerAction({
  id: "server-api-admin-delete-this",
  label: "Delete this message (server)",
  icon: Trash2,
  iconColor: "text-red-500 dark:text-red-400",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 3,
  visible: (ctx) => ctx.isAdmin,
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { confirm } = await import(
        "@/components/dialogs/confirm/confirmDialogOpener"
      );
      const ok = await confirm({
        title: "Delete this message?",
        description:
          "Hard delete via the new server endpoint. Tool pairs cascade automatically. Reload follows.",
        variant: "destructive",
        confirmLabel: "Delete",
      });
      if (!ok) return;
      const { batchDeleteMessages } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/batch-delete-messages.thunk"
      );
      await ctx
        .dispatch(
          batchDeleteMessages({
            conversationId,
            selector: { message_ids: [messageId], inclusive: true },
          }),
        )
        .unwrap();
      toast.success("Message deleted (server)");
    } catch (err) {
      toast.error(getErrorMessage(err, "Server delete failed"));
    }
  },
});

registerAction({
  id: "server-api-admin-delete-from-here",
  label: "Delete this + everything after (server)",
  icon: Trash2,
  iconColor: "text-red-600 dark:text-red-500",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 4,
  visible: (ctx) => ctx.isAdmin,
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { confirm } = await import(
        "@/components/dialogs/confirm/confirmDialogOpener"
      );
      const ok = await confirm({
        title: "Truncate conversation from here?",
        description:
          "Hard deletes this message and every message that comes after it. Cannot be undone.",
        variant: "destructive",
        confirmLabel: "Delete forward",
      });
      if (!ok) return;
      const { batchDeleteMessages } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/batch-delete-messages.thunk"
      );
      await ctx
        .dispatch(
          batchDeleteMessages({
            conversationId,
            selector: { from_message_id: messageId, inclusive: true },
          }),
        )
        .unwrap();
      toast.success("Truncated from here (server)");
    } catch (err) {
      toast.error(getErrorMessage(err, "Server truncate failed"));
    }
  },
});

registerAction({
  id: "server-api-admin-delete-dryrun",
  label: "Dry-run: delete this + after (server)",
  icon: ListFilter,
  iconColor: "text-slate-500 dark:text-slate-400",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 5,
  visible: (ctx) => ctx.isAdmin,
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    try {
      const { batchDeleteMessages } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/batch-delete-messages.thunk"
      );
      const result = await ctx
        .dispatch(
          batchDeleteMessages({
            conversationId,
            selector: { from_message_id: messageId, inclusive: true },
            dryRun: true,
          }),
        )
        .unwrap();
      const directIds = result.deleted_ids ?? [];
      const cascadedIds = result.cascaded_ids ?? [];
      const allIds = [...directIds, ...cascadedIds];
      const cascadeNote =
        cascadedIds.length > 0
          ? ` (incl. ${cascadedIds.length} cascaded tool row${cascadedIds.length === 1 ? "" : "s"})`
          : "";
      toast.info(
        `Would delete ${allIds.length} message${allIds.length === 1 ? "" : "s"}${cascadeNote}`,
        {
          description:
            allIds.length > 0
              ? `IDs: ${allIds.slice(0, 5).join(", ")}${allIds.length > 5 ? ` (+${allIds.length - 5} more)` : ""}`
              : "Empty selector resolved to no rows.",
        },
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Dry-run failed"));
    }
  },
});

registerAction({
  id: "server-api-admin-replace-with-summary",
  label: "Replace this with a summary… (server)",
  icon: Scissors,
  iconColor: "text-blue-500 dark:text-blue-400",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 6,
  visible: (ctx) => ctx.isAdmin,
  run: (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    const instanceId = ctx.instanceKey("srv-replace");
    ctx.dispatch(
      openOverlay({
        overlayId: "fullScreenEditor",
        instanceId,
        data: {
          content: "",
          mode: "free",
          messageId,
          onSave: async (newContent: string) => {
            const trimmed = newContent.trim();
            if (!trimmed) {
              toast.error("Summary text required");
              return;
            }
            try {
              const { replaceMessages } = await import(
                "@/features/agents/redux/execution-system/message-crud/server/replace-messages.thunk"
              );
              await ctx
                .dispatch(
                  replaceMessages({
                    conversationId,
                    selector: {
                      message_ids: [messageId],
                      inclusive: true,
                    },
                    summaryContent: [{ type: "text", text: trimmed }],
                  }),
                )
                .unwrap();
              toast.success("Replaced with summary (server)");
            } catch (err) {
              toast.error(
                getErrorMessage(err, "Replace-with-summary failed"),
              );
            } finally {
              ctx.dispatch(
                closeOverlay({
                  overlayId: "fullScreenEditor",
                  instanceId,
                }),
              );
            }
          },
          tabs: ["write", "matrx_split", "markdown", "preview"],
          initialTab: "write",
          title: "Summary content",
          showSaveButton: true,
          showCopyButton: false,
        },
      }),
    );
  },
});

registerAction({
  id: "server-api-admin-restore-compaction",
  label: "Restore compaction (server)",
  icon: Undo2,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "admin",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 7,
  visible: (ctx) => {
    if (!ctx.isAdmin) return false;
    // Only meaningful when this row IS a compaction summary.
    return getCompactionAnchor(ctx.metadata) !== null;
  },
  run: async (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    const anchor = getCompactionAnchor(ctx.metadata);
    if (!anchor) return;
    try {
      const { restoreCompaction } = await import(
        "@/features/agents/redux/execution-system/message-crud/server/restore-compaction.thunk"
      );
      await ctx
        .dispatch(
          restoreCompaction({
            conversationId,
            compactionGroupId: anchor.compactionGroupId,
            summaryMessageId: anchor.compactionGroupId ? undefined : messageId,
            deleteSummary: true,
          }),
        )
        .unwrap();
      toast.success("Compaction restored");
    } catch (err) {
      toast.error(getErrorMessage(err, "Restore failed"));
    }
  },
});
