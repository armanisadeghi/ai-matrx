// features/rich-document/actions/handlers/share.ts
//
// Publishing actions that used to live only in the chat message menu
// (messageActionRegistry.ts, deleted in RC-B6). Source-agnostic: they publish
// what the reader sees; chat provenance rides along when the source is a chat
// message (the per-message idempotency key on the public page).

import { FileText, Globe } from "lucide-react";
import { toast } from "@/lib/toast";
import { registerAction } from "../registry";
import {
  chatIds,
  deriveContentTitle,
  getErrorMessage,
  requireAuth,
  contentForDestination,
} from "../utils";

registerAction({
  id: "share-webpage",
  label: "Share as webpage",
  icon: Globe,
  iconColor: "text-teal-500 dark:text-teal-400",
  category: "share",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "share-webpage",
        "Share as webpage",
        "Sign in to publish this content as a public webpage.",
      )
    )
      return;
    ctx.onClose();
    const toastId = toast.loading("Publishing webpage…");
    try {
      const { shareMessageAsWebpage } = await import(
        "@/features/agents/components/messages-display/message-options/shareMessageAsWebpage"
      );
      const { conversationId, messageId } = chatIds(ctx);
      const { url } = await shareMessageAsWebpage({
        content: contentForDestination(ctx),
        title: deriveContentTitle(ctx) ?? "Shared AI response",
        messageId,
        conversationId,
      });
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        /* clipboard can be blocked; the toast still links the page */
      }
      toast.success(
        copied ? "Public link copied to clipboard" : "Webpage published",
        {
          id: toastId,
          description: url,
          action: {
            label: "Open",
            onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
          },
        },
      );
    } catch (err) {
      toast.error("Failed to publish webpage", {
        id: toastId,
        description: getErrorMessage(err, "Unknown error"),
      });
    }
  },
});

registerAction({
  /**
   * A REAL Google Doc, not a clipboard payload. Same one path every other
   * surface uses — `features/google-workspace/export/sendToGoogle.ts` — so the
   * registry owns no Google code of its own.
   */
  id: "send-google-doc",
  label: "Send to Google Doc",
  icon: FileText,
  iconColor: "text-blue-500 dark:text-blue-400",
  category: "share",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  run: async (ctx) => {
    try {
      const [{ sendContentToGoogleDoc }, { announceProposedGoogleWrite, isProposedGoogleWrite }] =
        await Promise.all([
          import("@/features/google-workspace/export/sendToGoogle"),
          import("@/features/google-workspace/export/proposedWrite"),
        ]);
      const result = await sendContentToGoogleDoc(
        contentForDestination(ctx),
        deriveContentTitle(ctx) ?? "AI Matrx message",
      );
      if (!result.ok && result.reason === "failed") {
        toast.error("Could not create the Google Doc", {
          description: result.message,
        });
        return;
      }
      // NOTHING WAS WRITTEN, and it is not a failure: the organization reviews
      // this kind of change first, so the server filed it in the approval
      // queue. ONE module owns those words for every call site (F-99).
      if (isProposedGoogleWrite(result)) {
        announceProposedGoogleWrite(result);
        return;
      }
      if (!result.ok) {
        toast.info("Connect Google to send this to a Doc", {
          description:
            "Takes about ten seconds, and only for files you choose or that we create.",
          action: {
            label: "Connect",
            onClick: () => window.open(result.settingsHref, "_blank", "noopener"),
          },
        });
        return;
      }
      toast.success(`Created "${result.name}" in your Google Drive`, {
        action: result.openUrl
          ? {
              label: "Open",
              onClick: () =>
                window.open(result.openUrl as string, "_blank", "noopener"),
            }
          : undefined,
      });
      ctx.onClose();
    } catch (err) {
      toast.error("Could not create the Google Doc", {
        description: getErrorMessage(err, "Unknown error"),
      });
    }
  },
});
