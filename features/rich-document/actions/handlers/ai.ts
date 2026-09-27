// features/rich-document/actions/handlers/ai.ts
//
// A text field's own AI powers — Clean up, Help with this, Custom agent — as
// registry actions, so a text field and a rendered document draw from ONE
// action layer. Clean up / Help produce a result the reader reviews and
// APPLIES back into the text, so only a host that can apply supplies
// `callbacks.onRequestTextAgentAction`: ProTextarea (applies into the field)
// and every WRITABLE document (the review-and-apply view). Custom agent opens
// the chosen agent in its own window on any text; when the text is writable
// its answers offer "Apply to source" (the same review).

import { FilePen, MessageCircle, Wand2 } from "lucide-react";
import { registerAction } from "../provider";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { customAgentWindowAction } from "@/features/overlays/openers/customAgentWindow";
import { applyToSourceReviewAction } from "@/features/overlays/openers/applyToSourceReview";
import { buildValueSources } from "@/features/agents/components/custom-agent/custom-agent-plan";
import {
  applyTargetForConversation,
  canApplyBack,
  registerApplyTarget,
} from "../../review/applyTargets";
import {
  chatIds,
  contentForDestination,
  deriveContentTitle,
  requireAuth,
} from "../utils";

registerAction({
  id: "text-cleanup",
  writesSource: true,
  label: "Clean up",
  icon: Wand2,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestTextAgentAction),
  run: (ctx) => ctx.callbacks?.onRequestTextAgentAction?.("cleanup", ctx),
});

registerAction({
  id: "text-help",
  writesSource: true,
  label: "Help with this…",
  icon: MessageCircle,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestTextAgentAction),
  run: (ctx) => ctx.callbacks?.onRequestTextAgentAction?.("help", ctx),
});

registerAction({
  // "Custom agent…": THE agent picker window, then map the agent's inputs to
  // what the menu captured; the agent opens in its own window (one per open,
  // so several can work on the same text). When the text can be saved back,
  // each answer in that window offers "Apply to source".
  //
  // A text FIELD (ProTextarea — a raw source that applies into itself) keeps
  // its in-field panel: that host's whole point is the result landing in the
  // field being typed in.
  id: "text-custom-agent",
  label: "Custom agent…",
  icon: AGENT_ICON,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) =>
    Boolean(ctx.callbacks?.onRequestTextAgentAction) ||
    contentForDestination(ctx).trim().length > 0,
  run: (ctx) => {
    if (ctx.source.type === "raw" && ctx.callbacks?.onRequestTextAgentAction) {
      ctx.callbacks.onRequestTextAgentAction("customAgent", ctx);
      return;
    }
    if (
      !requireAuth(
        ctx,
        "text-custom-agent",
        "Custom agent",
        "Sign in to run any of your agents on this text.",
      )
    )
      return;
    const title = deriveContentTitle(ctx) ?? null;
    const applyTargetId =
      ctx.callbacks?.onRequestTextAgentAction && canApplyBack(ctx)
        ? registerApplyTarget(ctx, title ?? "source")
        : null;
    ctx.dispatch(
      customAgentWindowAction({
        scope: ctx.applicationScope ?? null,
        sources: buildValueSources(ctx.applicationScope, contentForDestination(ctx)),
        sourceTitle: title,
        applyTargetId,
      }),
    );
    ctx.onClose();
  },
});

registerAction({
  // An answer in an agent window launched by "Custom agent…" from text that
  // can be saved: review it against that text and apply (the one review —
  // diff, splice, save through the source's adapter).
  id: "apply-to-source",
  label: "Apply to source",
  icon: FilePen,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 3,
  visible: (ctx) =>
    ctx.extensions?.type === "chat-message" &&
    ctx.extensions.role === "assistant" &&
    applyTargetForConversation(chatIds(ctx).conversationId) !== null,
  run: (ctx) => {
    const target = applyTargetForConversation(chatIds(ctx).conversationId);
    if (!target) return;
    ctx.dispatch(
      applyToSourceReviewAction({
        applyTargetId: target.id,
        proposal: contentForDestination(ctx),
      }),
    );
    ctx.onClose();
  },
});
