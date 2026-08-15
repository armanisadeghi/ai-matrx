// features/rich-document/actions/handlers/feedback.ts
//
// Thumbs feedback. These write the ONE destination — `platform.output_feedback`
// (see lib/output-feedback/FEATURE.md) — via the subject resolved from the
// action's ContentSource. Before 2026-08-15 they invoked host callbacks that
// nothing ever supplied, so the actions never rendered and the signal was lost.
//
// A source with no canonical subject (raw text, an unsaved scratchpad) still
// has nothing to attach feedback to, so the actions stay hidden there — a
// thumb that writes nowhere is worse than no thumb.

import { ThumbsUp, ThumbsDown } from "lucide-react";
import { registerAction } from "../registry";
import { toast } from "@/lib/toast";
import { outputFeedbackSubjectForSource } from "../../outputFeedbackSubject";
import type { RichDocumentActionContext } from "../../types";
import type { OutputFeedbackVerdict } from "@/lib/output-feedback/types";

async function recordVerdict(
  ctx: RichDocumentActionContext,
  verdict: OutputFeedbackVerdict,
): Promise<void> {
  const subject = outputFeedbackSubjectForSource(ctx.source);
  if (!subject) return;
  try {
    const { saveOutputFeedback } = await import("@/lib/output-feedback/service");
    await saveOutputFeedback({
      ...subject,
      verdict,
      surfaceName: ctx.surfaceKey,
      originalContent: ctx.content || null,
      requestId:
        ctx.source.type === "chat-message"
          ? (ctx.source.streamRequestId ?? null)
          : null,
    });
    toast.success(
      verdict === "positive" ? "Marked as helpful" : "Marked as not helpful",
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[rich-document] feedback write failed", error);
    toast.error("Failed to save feedback");
  }
}

registerAction({
  id: "thumbs-up",
  label: "Helpful",
  icon: ThumbsUp,
  iconColor: "text-green-600 dark:text-green-400",
  category: "feedback",
  supportedSources: ["chat-message", "note", "artifact", "working-document"],
  renderSlot: "primary",
  order: 0,
  visible: (ctx) => Boolean(outputFeedbackSubjectForSource(ctx.source)),
  run: (ctx) => recordVerdict(ctx, "positive"),
});

registerAction({
  id: "thumbs-down",
  label: "Not helpful",
  icon: ThumbsDown,
  iconColor: "text-red-500 dark:text-red-400",
  category: "feedback",
  supportedSources: ["chat-message", "note", "artifact", "working-document"],
  renderSlot: "primary",
  order: 1,
  visible: (ctx) => Boolean(outputFeedbackSubjectForSource(ctx.source)),
  run: (ctx) => recordVerdict(ctx, "negative"),
});
