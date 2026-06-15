// features/rich-document/actions/handlers/export.ts
//
// HTML preview, HTML page copy, email-to-me. All source-agnostic.
// The html-preview action's "save" path routes through ctx.sourceAdapter.edit
// so it works on any source that supports editing.

import { Eye, Globe, Mail } from "lucide-react";
import { toast } from "sonner";
import { openOverlay, closeOverlay } from "@/lib/redux/slices/overlaySlice";
import { createFullScreenEditorCallbackGroup } from "@/features/overlays/callbacks/fullScreenEditor";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { loadWordPressCSS } from "@/features/html-pages/css/wordpress-styles";
import { registerAction } from "../registry";
import { getErrorMessage, serializeError } from "../utils";

registerAction({
  id: "html-preview",
  label: "HTML preview",
  icon: Eye,
  iconColor: "text-indigo-500 dark:text-indigo-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  run: (ctx) => {
    const instanceId = ctx.instanceKey("html-preview");
    const canSave = Boolean(ctx.sourceAdapter.edit);

    // Save is source-agnostic via the source adapter (chat → editMessage,
    // note → NotesAPI.update, …). Route it through the callback registry so
    // it reaches the caller — htmlPreview is now callback-aware. A function
    // can't survive Redux; only the `callbackGroupId` string travels.
    const callbackGroupId = canSave
      ? createFullScreenEditorCallbackGroup({
          onSave: async (newContent: string) => {
            try {
              await ctx.sourceAdapter.edit?.({
                newContent,
                source: ctx.source,
                dispatch: ctx.dispatch,
              });
            } catch (err) {
              console.error(
                "[html-preview] save failed",
                serializeError(err),
              );
              toast.error(getErrorMessage(err, "Failed to save"));
            }
            ctx.dispatch(
              closeOverlay({ overlayId: "htmlPreview", instanceId }),
            );
          },
        }).callbackGroupId
      : null;

    ctx.dispatch(
      openOverlay({
        overlayId: "htmlPreview",
        instanceId,
        data: {
          content: ctx.content,
          messageId:
            ctx.source.type === "chat-message"
              ? ctx.source.messageId
              : undefined,
          conversationId:
            ctx.source.type === "chat-message"
              ? ctx.source.conversationId
              : undefined,
          callbackGroupId,
          title: "HTML Preview & Publishing",
          description:
            "Edit markdown, preview HTML, and publish your content",
          showSaveButton: canSave,
          isAgentSystem: ctx.source.type === "chat-message",
        },
      }),
    );
  },
});

registerAction({
  id: "copy-html-page",
  label: "Copy HTML page",
  icon: Globe,
  iconColor: "text-orange-500 dark:text-orange-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  run: async (ctx) => {
    try {
      await copyToClipboard(ctx.content, {
        isMarkdown: true,
        formatForWordPress: true,
        showHtmlPreview: true,
        onShowHtmlPreview: async (filteredHtml) => {
          const cssContent = await loadWordPressCSS();
          const html = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Content</title><style>${cssContent}</style></head><body>${filteredHtml}</body></html>`;
          await copyToClipboard(html, {
            onSuccess: () => {},
            onError: () => {},
          });
        },
        onSuccess: () => toast.success("HTML page copied"),
        onError: (error) =>
          toast.error(getErrorMessage(error, "Failed to copy HTML")),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to copy HTML"));
    }
  },
});

registerAction({
  id: "email-to-me",
  label: "Email to me",
  icon: Mail,
  iconColor: "text-sky-500 dark:text-sky-400",
  category: "export",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  run: async (ctx) => {
    // Anonymous path — open the email-dialog overlay so the user can supply
    // an address. Auth'd path posts straight to /api/chat/email-response
    // using the signed-in user's email server-side.
    if (!ctx.isAuthenticated) {
      ctx.dispatch(
        openOverlay({
          overlayId: "emailDialog",
          data: {
            content: ctx.content,
            metadata: ctx.metadata ?? null,
          },
        }),
      );
      return;
    }
    try {
      const response = await fetch("/api/chat/email-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: ctx.content,
          metadata: {
            ...ctx.metadata,
            timestamp: new Date().toLocaleString(),
          },
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.msg || "Failed to send email");
      toast.success("Email sent!");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to send email"));
    }
  },
});
