// features/rich-document/actions/handlers/feedback.ts
//
// Thumbs feedback. Today these are visual-only inline buttons on the chat
// AssistantActionBar (state is local, no Redux). Until we have a real
// feedback persistence layer that handles all source types, we surface
// thumbs as primary-slot actions that invoke the host's callbacks. Chat
// keeps its local-only state; other surfaces can opt in by supplying
// callbacks (no-op by default).

import { ThumbsUp, ThumbsDown } from "lucide-react";
import { registerAction } from "../registry";

registerAction({
  id: "thumbs-up",
  label: "Helpful",
  icon: ThumbsUp,
  iconColor: "text-green-600 dark:text-green-400",
  category: "feedback",
  // For now thumbs only show on chat — extending later requires per-source
  // feedback storage (no infra today for prompts / notes / artifacts).
  supportedSources: ["chat-message"],
  renderSlot: "primary",
  order: 0,
  visible: (ctx) => Boolean(ctx.callbacks?.onThumbsUp),
  run: (ctx) => ctx.callbacks?.onThumbsUp?.(),
});

registerAction({
  id: "thumbs-down",
  label: "Not helpful",
  icon: ThumbsDown,
  iconColor: "text-red-500 dark:text-red-400",
  category: "feedback",
  supportedSources: ["chat-message"],
  renderSlot: "primary",
  order: 1,
  visible: (ctx) => Boolean(ctx.callbacks?.onThumbsDown),
  run: (ctx) => ctx.callbacks?.onThumbsDown?.(),
});
