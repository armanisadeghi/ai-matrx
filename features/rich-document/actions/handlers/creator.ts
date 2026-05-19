// features/rich-document/actions/handlers/creator.ts
//
// Creator-only actions — analytics and debugging tools visible only to the
// agent owner. Chat-only because the underlying overlays operate on a
// conversationId + streamRequestId.

import { BarChart3, Activity } from "lucide-react";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { registerAction } from "../registry";

registerAction({
  id: "analyze-response",
  label: "Analyze response",
  icon: BarChart3,
  iconColor: "text-emerald-500 dark:text-emerald-400",
  category: "creator",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 0,
  visible: (ctx) => ctx.isCreator,
  run: (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId, messageId } = ctx.source;
    const streamRequestId =
      ctx.extensions?.type === "chat-message"
        ? ctx.extensions.streamRequestId
        : null;

    ctx.dispatch(
      openOverlay({
        overlayId: "messageAnalysisWindow",
        data: {
          conversationId,
          requestId: streamRequestId ?? null,
          messageId,
        },
      }),
    );
  },
});

registerAction({
  id: "debug-stream",
  label: "Debug stream",
  icon: Activity,
  iconColor: "text-blue-500 dark:text-blue-400",
  category: "creator",
  supportedSources: ["chat-message"],
  renderSlot: "overflow",
  order: 1,
  visible: (ctx) => ctx.isCreator,
  run: (ctx) => {
    if (ctx.source.type !== "chat-message") return;
    const { conversationId } = ctx.source;
    const streamRequestId =
      ctx.extensions?.type === "chat-message"
        ? ctx.extensions.streamRequestId
        : null;

    ctx.dispatch(
      openOverlay({
        overlayId: "streamDebug",
        data: {
          conversationId,
          requestIdOverride: streamRequestId ?? undefined,
        },
      }),
    );
  },
});
