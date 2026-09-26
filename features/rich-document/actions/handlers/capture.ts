// features/rich-document/actions/handlers/capture.ts
//
// Capture actions that used to live ONLY in the chat message menu
// (messageActionRegistry.ts, deleted in RC-B6). Each is source-agnostic: the
// content is whatever the reader sees (`ctx.content`), and chat provenance
// (conversation / message ids, the "{conversation} Message {n}" title) rides
// along when the source is a chat message. Heavy services load inside the
// handler (code-splitting rule 6 — this module is reachable from every
// RichDocument surface).

import {
  BookOpen,
  Boxes,
  FileType,
  GraduationCap,
  Layers,
  LayoutTemplate,
} from "lucide-react";
import { FilesRouteIcon } from "@/components/branding/RouteFaviconIcon";
import { toast } from "@/lib/toast";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  extractFlatText,
  selectMessageById,
  selectOrderedMessageIds,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { messageMayContainKindBlock } from "@/features/content-ir/studio/message-kind-gate";
import { hasConvertibleContent } from "@/features/agents/components/messages-display/message-options/convertibleContent";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { registerAction } from "../registry";
import {
  chatIds,
  contentFileName,
  deriveContentTitle,
  getErrorMessage,
  requireAuth,
  contentForDestination,
} from "../utils";
import type { RichDocumentActionContext } from "../../types";

/**
 * THE ORACLE TAP's question half: for an ASSISTANT message, the user turn it
 * answered. Null for a user message (the message IS the question), for an
 * opening turn, for non-chat sources, and whenever the thread is not loaded.
 */
async function resolveAnsweredQuestion(
  ctx: RichDocumentActionContext,
): Promise<string | null> {
  const { conversationId, messageId } = chatIds(ctx);
  if (!conversationId || !messageId) return null;
  const state = ctx.getState();
  const self = selectMessageById(conversationId, messageId)(state);
  if (!self || self.role === "user") return null;
  const thread = selectOrderedMessageIds(conversationId)(state).map((id) => {
    const record = selectMessageById(conversationId, id)(state);
    const content = record?.content;
    return {
      id,
      role: String(record?.role ?? ""),
      content: typeof content === "string" ? content : extractFlatText(record),
    };
  });
  // The oracle service drags the masterwork store — load it at click time.
  const { precedingQuestion } = await import("@/features/masterwork/oracle/service");
  return precedingQuestion(thread, messageId);
}

registerAction({
  // The Oracle tap (Masterwork Approach #10): an answer worth keeping lands in
  // one of the user's Rulebooks as a DRAFT rule. Same dialog + append path as
  // the thumbs follow-up nudge — ONE implementation (features/masterwork/oracle/).
  id: "add-to-rulebook",
  label: "Add to Rulebook",
  icon: BookOpen,
  iconColor: "text-violet-500 dark:text-violet-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: -20,
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "add-to-rulebook",
        "Add to Rulebook",
        "Sign in to save answers into your Rulebooks.",
      )
    )
      return;
    const { conversationId, messageId } = chatIds(ctx);
    const initialQuestion = await resolveAnsweredQuestion(ctx);
    ctx.dispatch(
      openOverlay({
        overlayId: "addToRulebookDialog",
        data: {
          initialContent: contentForDestination(ctx),
          initialConversationId: conversationId,
          // Provenance: the exact turn the draft came from.
          initialMessageId: messageId,
          // And the QUESTION it answered — the Oracle tap's whole premise.
          initialQuestion,
        },
      }),
    );
    ctx.onClose();
  },
});

registerAction({
  id: "set-context-value",
  label: "Set Context Value",
  icon: Layers,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 20,
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "set-context-value",
        "Set context value",
        "Sign in to save this content into a scope's context item.",
      )
    )
      return;
    ctx.dispatch(
      openOverlay({
        overlayId: "setContextValueWindow",
        data: { initialContent: contentForDestination(ctx) },
      }),
    );
    ctx.onClose();
  },
});

registerAction({
  id: "save-as-message-template",
  label: "Save as Message Template",
  icon: LayoutTemplate,
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 12,
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-as-message-template",
        "Save as Message Template",
        "Sign in to save this content as a reusable message template.",
      )
    )
      return;
    ctx.dispatch(
      openOverlay({
        overlayId: "quickMessageTemplateSaveWindow",
        data: {
          initialContent: contentForDestination(ctx),
          defaultName: deriveContentTitle(ctx),
          defaultRole: "assistant",
        },
      }),
    );
    ctx.onClose();
  },
});

registerAction({
  id: "save-to-files",
  label: "Save to Files",
  icon: FilesRouteIcon,
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 8,
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-to-files",
        "Save as File",
        "Sign in to save this content into your files.",
      )
    )
      return;
    const name = contentFileName(ctx, ctx.source.type === "chat-message" ? "message" : ctx.source.type);
    try {
      const { fileHandler } = await import("@/features/files/handler/handler");
      const file = new File([contentForDestination(ctx)], `${name}.md`, {
        type: "text/markdown",
      });
      const uploaded = await fileHandler.upload(
        { kind: "file", file },
        { folderPath: "Chat Saves" },
      );
      const fileId = uploaded.fileId;
      toast.success("Saved to Files", {
        description: `${name}.md in Chat Saves`,
        action: fileId
          ? {
              label: "Open",
              onClick: () =>
                window.open(`/files/f/${fileId}`, "_blank", "noopener,noreferrer"),
            }
          : undefined,
      });
      ctx.onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save file"));
    }
  },
});

registerAction({
  id: "save-as-pdf",
  label: "Save as PDF Document",
  icon: FileType,
  iconColor: "text-red-500 dark:text-red-400",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 9,
  run: async (ctx) => {
    if (
      !requireAuth(
        ctx,
        "save-as-pdf",
        "Save as PDF Document",
        "Sign in to save this content as a PDF in your files.",
      )
    )
      return;
    ctx.onClose();
    const toastId = toast.loading("Generating PDF…");
    try {
      // The print-grade VECTOR PDF — real text, a few KB (the old raster
      // screenshot path made a 5-row answer 6.4 MB).
      const [{ exportDocument }, { fileHandler }] = await Promise.all([
        import("@ai-matrx/print/document"),
        import("@/features/files/handler/handler"),
      ]);
      const exp = await exportDocument(contentForDestination(ctx), "pdf");
      const blob = new Blob([exp.bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
      const name = contentFileName(ctx, ctx.source.type === "chat-message" ? "message" : ctx.source.type);
      const file = new File([blob], `${name}.pdf`, { type: "application/pdf" });
      const uploaded = await fileHandler.upload(
        { kind: "file", file },
        { folderPath: "Chat Saves" },
      );
      const fileId = uploaded.fileId;
      toast.success("PDF saved to Files", {
        id: toastId,
        description: `${name}.pdf in Chat Saves`,
        action: fileId
          ? {
              label: "Open",
              onClick: () =>
                window.open(`/files/f/${fileId}`, "_blank", "noopener,noreferrer"),
            }
          : undefined,
      });
    } catch (err) {
      toast.error("Failed to create PDF", {
        id: toastId,
        description: getErrorMessage(err, "Unknown error"),
      });
    }
  },
});

registerAction({
  // "Save to my Shapes": persist a registered `__kind` block from this content
  // as a `content_ir.kind_instance` row. Hot-path gate is CHEAP by design (a
  // marker substring check); the heavy extraction lazy-loads on click.
  // Unregistered kinds surface an honest error toast, never a write.
  id: "save-shape-instance",
  label: "Save to my Shapes",
  icon: Boxes,
  iconColor: "text-primary",
  category: "save",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 13,
  requiresAuth: true,
  visible: (ctx) => messageMayContainKindBlock(ctx.content),
  run: async (ctx) => {
    ctx.onClose();
    // THE EXPLICIT ACTIVE ORG, NEVER A PERSONAL SUBSTITUTE — the gate asks
    // instead of guessing; cancelling writes nothing and says nothing.
    let organizationId: string;
    try {
      organizationId = await ensureOrganizationContext({
        organizationId: ctx.organizationId,
      });
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) return;
      toast.error(getErrorMessage(error, "Failed to save to Shapes"));
      return;
    }
    const { conversationId, messageId } = chatIds(ctx);
    const toastId = toast.loading("Saving shape instance…");
    try {
      const { saveKindInstancesFromMessage } = await import(
        "@/features/content-ir/studio/message-kind-instances"
      );
      const { shapeInstancesHref } = await import(
        "@/features/content-ir/studio/constants"
      );
      const saved = await saveKindInstancesFromMessage({
        text: contentForDestination(ctx),
        organizationId,
        // Provenance rides with the save (DD-131 slice 1): HOMED in this
        // conversation with a `produced_by` edge back to this message.
        conversationId,
        messageId,
      });
      const drifted = saved.filter((s) => s.validationStatus !== "passed");
      if (drifted.length > 0) {
        toast.error(
          `Saved ${saved.length} instance${saved.length === 1 ? "" : "s"}, but ${drifted.length} did not pass validation`,
          {
            id: toastId,
            description: drifted
              .map((s) => `${s.label}: ${s.validationStatus}`)
              .join("; "),
          },
        );
        return;
      }
      const first = saved[0];
      const unlinked = saved.filter((entry) => entry.provenanceWarning);
      if (unlinked.length > 0) {
        toast.warning(
          `Saved ${saved.length} instance${saved.length === 1 ? "" : "s"}, but the link back to this message was not written`,
          { id: toastId, description: unlinked[0].provenanceWarning ?? "" },
        );
        return;
      }
      toast.success(
        saved.length === 1
          ? first.title
            ? `Saved "${first.title}" to your Shapes`
            : `Saved a ${first.label} instance`
          : `Saved ${saved.length} instances to your Shapes`,
        {
          id: toastId,
          description: `${first.label} v${first.kindVersion} — validation passed.`,
          action: {
            label: "View in Instances",
            onClick: () =>
              window.open(
                `${shapeInstancesHref(first.kind)}?i=${first.id}`,
                "_blank",
                "noopener,noreferrer",
              ),
          },
        },
      );
    } catch (err) {
      toast.error("Failed to save to Shapes", {
        id: toastId,
        description: getErrorMessage(err, "Unknown error"),
      });
    }
  },
});

registerAction({
  // The ratified click-to-convert pattern: content starts as generic markdown
  // and converts on EXPLICIT click into study artifacts through the ONE
  // convert-source dialog (features/education/convert). The dialog is owned by
  // the host (RichDocument's convert host, or the chat bar) so it survives the
  // menu closing — no host, no row (absent, never dead).
  id: "convert-to-study",
  label: "Convert to flashcards / quiz…",
  icon: GraduationCap,
  iconColor: "text-primary",
  category: "study",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) =>
    Boolean(ctx.callbacks?.onRequestConvert) &&
    hasConvertibleContent(ctx.content),
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "convert-to-study",
        "Convert content",
        "Sign in to convert this content into flashcards, a quiz, and more.",
      )
    )
      return;
    ctx.onClose();
    ctx.callbacks?.onRequestConvert?.();
  },
});

registerAction({
  // The passage becomes the ANSWER side of one card; the host asks for the
  // question (the front is the reader's to write, never guessed) and files it
  // in their "Saved cards" deck.
  id: "save-as-flashcard",
  label: "Save as flashcard",
  icon: GraduationCap,
  iconColor: "text-primary",
  category: "study",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  requiresAuth: true,
  visible: (ctx) =>
    Boolean(ctx.callbacks?.onRequestFlashcard) && ctx.content.trim().length > 0,
  run: (ctx) => {
    ctx.onClose();
    // The answer is what the reader SEES — never the storage envelope.
    ctx.callbacks?.onRequestFlashcard?.(contentForDestination(ctx).trim());
  },
});
