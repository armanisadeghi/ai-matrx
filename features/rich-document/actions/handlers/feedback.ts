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
import { registerAction } from "../provider";
import { toast } from "@/lib/toast";
import { outputFeedbackSubjectForSource } from "../../outputFeedbackSubject";
import type { RichDocumentActionContext } from "../../types";
import type { OutputFeedbackVerdict } from "@/lib/output-feedback/types";
import {
  peekOutputFeedback,
  subscribeOutputFeedback,
} from "@/lib/output-feedback/store";
import { loadOutputFeedback } from "@/lib/output-feedback/batchLoader";

async function toggleVerdict(
  ctx: RichDocumentActionContext,
  verdict: OutputFeedbackVerdict,
): Promise<void> {
  const subject = outputFeedbackSubjectForSource(ctx.source);
  if (!subject) return;
  try {
    const { toggleOutputFeedbackVerdict } = await import(
      "@/lib/output-feedback/verdict"
    );
    // THE one toggle: clicking the active verdict retracts it, optimistic
    // with rollback — identical to every other thumb in the app.
    await toggleOutputFeedbackVerdict(subject, verdict, {
      surfaceName: ctx.surfaceKey,
      originalContent: ctx.content || null,
      requestId:
        ctx.source.type === "chat-message"
          ? (ctx.source.streamRequestId ?? null)
          : null,
    });
  } catch (error) {
    console.error("[rich-document] feedback write failed", error);
    toast.error("Failed to save feedback");
  }
}

/** The verdict in force for this content (the ONE output-feedback store). */
/**
 * Thumbs rate an OUTPUT (an answer, an artifact, an agent-written document) —
 * never words the person wrote themselves (RC-B6 round 2: Helpful / Not
 * helpful on your own note, your own chat message).
 */
export function isRateableOutput(ctx: RichDocumentActionContext): boolean {
  if (!outputFeedbackSubjectForSource(ctx.source)) return false;
  const ext = ctx.extensions as { type?: string; role?: string; isOwner?: boolean } | undefined;
  if (ctx.source.type === "chat-message") return ext?.role === "assistant";
  if (ctx.source.type === "note") return ext?.isOwner === false;
  return true;
}

function currentVerdict(ctx: RichDocumentActionContext): OutputFeedbackVerdict | null {
  const subject = outputFeedbackSubjectForSource(ctx.source);
  return subject ? (peekOutputFeedback(subject)?.verdict ?? null) : null;
}

/** Re-render on store changes, and hydrate this subject's verdict once. */
function subscribeVerdict(
  onChange: () => void,
  ctx: RichDocumentActionContext,
): () => void {
  const subject = outputFeedbackSubjectForSource(ctx.source);
  if (subject) loadOutputFeedback(subject.subjectType, subject.subjectId);
  return subscribeOutputFeedback(onChange);
}

registerAction({
  id: "thumbs-up",
  label: (ctx) => (currentVerdict(ctx) === "positive" ? "Helpful (undo)" : "Helpful"),
  icon: ThumbsUp,
  iconColor: "text-green-600 dark:text-green-400",
  category: "feedback",
  supportedSources: ["chat-message", "note", "artifact", "working-document"],
  renderSlot: "primary",
  order: 0,
  visible: isRateableOutput,
  active: (ctx) => currentVerdict(ctx) === "positive",
  subscribe: subscribeVerdict,
  run: (ctx) => toggleVerdict(ctx, "positive"),
});

registerAction({
  id: "thumbs-down",
  label: (ctx) =>
    currentVerdict(ctx) === "negative" ? "Not helpful (undo)" : "Not helpful",
  icon: ThumbsDown,
  iconColor: "text-red-500 dark:text-red-400",
  category: "feedback",
  supportedSources: ["chat-message", "note", "artifact", "working-document"],
  renderSlot: "primary",
  order: 1,
  visible: isRateableOutput,
  active: (ctx) => currentVerdict(ctx) === "negative",
  subscribe: subscribeVerdict,
  run: (ctx) => toggleVerdict(ctx, "negative"),
});
