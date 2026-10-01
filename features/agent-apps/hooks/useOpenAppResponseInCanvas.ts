"use client";

/**
 * "Open in canvas" for an agent app's answer — ONE door for every shell
 * (kind-never-raw S5). A kind answer opens AS ITS KIND: bound to a real
 * `canvas_items` row through `useOpenArtifactInCanvas` when the answer's
 * message is persisted, else as that kind's canvas type over its value (a
 * guest run has no row to bind). A kind with no canvas type opens as its
 * readable markdown; a kindless answer keeps the HTML canvas.
 */

import { useAppStore } from "@/lib/redux/hooks";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { selectLatestAssistantMessageId } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { responseCanvasTarget } from "../utils/response-canvas-target";

export function useOpenAppResponseInCanvas() {
  const store = useAppStore();
  const { open: openCanvas } = useCanvas();
  const { openArtifact } = useOpenArtifactInCanvas();

  return async (
    response: string,
    title: string,
    conversationId: string | null | undefined,
  ): Promise<void> => {
    const target = responseCanvasTarget(response, title);
    const metadata = { title, sourceMessageId: conversationId ?? undefined };
    if (target.mode === "kind") {
      const messageId = conversationId
        ? selectLatestAssistantMessageId(conversationId)(store.getState())
        : undefined;
      if (messageId) {
        await openArtifact({
          canvasType: target.canvasType,
          title: target.title,
          content: target.content,
          messageId,
          conversationId: conversationId ?? null,
        });
        return;
      }
      openCanvas({
        type: target.canvasType,
        data: target.structured,
        metadata: { ...metadata, title: target.title },
      });
      return;
    }
    if (target.mode === "markdown") {
      const { markdownToHtml } = await import("@ai-matrx/print/markdown");
      openCanvas({ type: "html", data: { html: markdownToHtml(target.markdown) }, metadata });
      return;
    }
    openCanvas({ type: "html", data: { html: target.html }, metadata });
  };
}
