// features/rich-document/actions/handlers/send-to-agent.ts
//
// "Send to another agent…" — use this content as the input to ANY agent. Opens
// the `sendToAgentDialog` overlay: the canonical agent picker, then the picked
// agent's own variables and context slots beside "Important context" (the
// default) and "Your message"; the agent then opens in a floating window with
// the content in place and nothing sent. Every source, so a note or a
// document can be handed on exactly like a chat answer.

import { Forward } from "lucide-react";
import { selectConversationScopeIds } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { sendToAgentDialogAction } from "@/features/overlays/openers/sendToAgentDialog";
import { registerAction } from "../provider";
import {
  chatIds,
  contentForDestination,
  deriveContentTitle,
  requireAuth,
} from "../utils";

registerAction({
  id: "send-to-agent",
  label: "Send to another agent…",
  icon: Forward,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 10,
  visible: (ctx) => ctx.content.trim().length > 0,
  run: (ctx) => {
    if (
      !requireAuth(
        ctx,
        "send-to-agent",
        "Send to another agent",
        "Sign in to hand this content to any of your agents.",
      )
    )
      return;
    const { conversationId } = chatIds(ctx);
    const organizationId = conversationId
      ? selectConversationScopeIds(conversationId)(ctx.getState()).organizationId
      : null;
    ctx.dispatch(
      sendToAgentDialogAction({
        initialContent: contentForDestination(ctx),
        initialSourceTitle: deriveContentTitle(ctx) ?? null,
        initialOrganizationId: organizationId,
      }),
    );
    ctx.onClose();
  },
});
