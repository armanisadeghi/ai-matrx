// features/rich-document/actions/handlers/ai.ts
//
// A text field's own AI powers — Clean up, Help with this, Custom agent — as
// registry actions, so a text field and a rendered document draw from ONE
// action layer. Running one produces a result the reader reviews and APPLIES
// back into the text (apply / compare / discard), so only a host that can
// apply — ProTextarea — supplies `callbacks.onRequestTextAgentAction`;
// everywhere else these rows are absent, never dead.

import { BrainCircuit, MessageCircle, Wand2 } from "lucide-react";
import { registerAction } from "../registry";

registerAction({
  id: "text-cleanup",
  label: "Clean up",
  icon: Wand2,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestTextAgentAction),
  run: (ctx) => ctx.callbacks?.onRequestTextAgentAction?.("cleanup"),
});

registerAction({
  id: "text-help",
  label: "Help with this…",
  icon: MessageCircle,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 1,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestTextAgentAction),
  run: (ctx) => ctx.callbacks?.onRequestTextAgentAction?.("help"),
});

registerAction({
  id: "text-custom-agent",
  label: "Custom agent…",
  icon: BrainCircuit,
  iconColor: "text-primary",
  category: "ai",
  supportedSources: "*",
  renderSlot: "overflow",
  order: 2,
  visible: (ctx) => Boolean(ctx.callbacks?.onRequestTextAgentAction),
  run: (ctx) => ctx.callbacks?.onRequestTextAgentAction?.("customAgent"),
});
