"use client";

/**
 * "Attach to chat ▸" for the canvas pane's standard entries
 * (`CanvasOutputPorts.attachOptions`, canvas ≥ 0.10) — the attach lane (L3).
 *
 * An HTML page attaches to the chat it came from as a screenshot (captured NOW by
 * the server engine at this pane's width and the viewer's theme), its code, or its
 * visible text — the one path, `attachRenderedArtifact` from `@ai-matrx/chat`.
 */

import type { CanvasMenuItem, CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { attachRenderedArtifact } from "@ai-matrx/chat/agents/components/inputs/resources/useAttachRenderedArtifact";
import { availableRenderedArtifactRepresentations } from "@ai-matrx/chat/agents/utils/renderedArtifactContext";
import { contentOf, readArtifactItemData } from "@/features/canvas/host/artifactItem";
import {
  captureRecordOnServer,
  renderedRecordFor,
  viewerColorScheme,
} from "@/features/html-pages/capture/renderedCapture";
import { getStore } from "@/lib/redux/store-singleton";
import { publishedPageInElement } from "./publishedPage";

export function canvasAttachOptions(request: CanvasOutputRequest): readonly CanvasMenuItem[] {
  const data = readArtifactItemData(request.item.data);
  if (!data) return [];
  const content = contentOf(data);
  if (content.type !== "html") return [];
  const conversationId = content.metadata?.conversationId ?? null;
  const record = renderedRecordFor(
    data.savedItemId ?? content.metadata?.canvasItemId ?? null,
    publishedPageInElement(request.element),
  );
  if (!record) {
    return [{ id: "output:attach", label: "Attach to chat — publishing the page…", disabled: true, onSelect: () => undefined }];
  }
  if (!conversationId) {
    return [{ id: "output:attach", label: "Attach to chat — open it from a chat", disabled: true, onSelect: () => undefined }];
  }
  return availableRenderedArtifactRepresentations().map((option) => ({
    id: `output:attach:${option.value}`,
    label: `Attach ${option.label.toLowerCase()} to chat`,
    onSelect: () => {
      const store = getStore();
      if (!store) return;
      void attachRenderedArtifact(store, conversationId, {
        source: {
          kind: "rendered_artifact",
          record_type: record.recordType,
          record_id: record.recordId,
          title: request.title,
        },
        representation: option.value,
        capture: async () => {
          const result = await captureRecordOnServer({
            ...record,
            width: request.element?.clientWidth || 1024,
            colorScheme: viewerColorScheme(),
          });
          return { kind: "stored", fileId: result.fileId, width: result.width, height: result.height };
        },
      });
    },
  }));
}
