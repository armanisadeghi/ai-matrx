// features/rich-document/actions/handlers/ai.ts
//
// A text field's own AI powers — Clean up, Help with this, Custom agent — as
// registry actions, so a text field and a rendered document draw from ONE
// action layer. Running one produces a result the reader reviews and APPLIES
// back into the text (apply / compare / discard), so only a host that can
// apply supplies `callbacks.onRequestTextAgentAction`: ProTextarea (applies
// into the field) and every WRITABLE document (RichDocument's host opens the
// review-and-apply view — diff, Apply splices only the changed blocks through
// the source's save adapter, Discard writes nothing). Elsewhere: absent.

import { MessageCircle, Wand2 } from "lucide-react";
import { registerAction } from "../registry";
import { AGENT_ICON } from "@/components/icons/domain-icons";

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
  id: "text-custom-agent",
  writesSource: true,
  label: "Custom agent…",
  icon: AGENT_ICON,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestTextAgentAction),
  run: (ctx) => ctx.callbacks?.onRequestTextAgentAction?.("customAgent", ctx),
});
