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
import { isMaterializedArtifactId } from "@ai-matrx/rich-content/utils/lifted/artifactId";
import {
  type RenderedRecord,
  captureRecordOnServer,
  renderedRecordFor,
  viewerColorScheme,
} from "@/features/html-pages/capture/renderedCapture";
import { getStore } from "@/lib/redux/store-singleton";
import { toast } from "@/lib/toast";
import { publishedPageInElement, resolvePrintablePageUrl } from "./publishedPage";

/**
 * The canvas HTML item's page, by the SAME lookup print uses (`publishedPage.ts`
 * `resolvePrintablePageUrl`: the canvas item's publication link for the version the
 * tab shows — the chain's latest), else the mounted frame. Needs nothing mounted.
 */
export function canvasHtmlItem(
  request: CanvasOutputRequest,
): {
  resolveRecord: () => Promise<RenderedRecord | null>;
  /** The canvas item itself when saved — what code/text attach by. */
  itemRecord: RenderedRecord | null;
  conversationId: string | null;
  saved: boolean;
} | null {
  const data = readArtifactItemData(request.item.data);
  if (!data) return null;
  const content = contentOf(data);
  if (content.type !== "html") return null;
  const itemId = data.savedItemId ?? content.metadata?.canvasItemId ?? null;
  const mounted = publishedPageInElement(request.element);
  return {
    conversationId: content.metadata?.conversationId ?? null,
    itemRecord: itemId && isMaterializedArtifactId(itemId) ? { recordType: "canvas_item", recordId: itemId } : null,
    saved: Boolean(itemId && isMaterializedArtifactId(itemId)) || Boolean(mounted),
    resolveRecord: async () => {
      const pageUrl = await resolvePrintablePageUrl({ canvasItemId: itemId, version: "latest", pageUrl: mounted });
      return renderedRecordFor(null, pageUrl);
    },
  };
}

export function canvasAttachOptions(request: CanvasOutputRequest): readonly CanvasMenuItem[] {
  const item = canvasHtmlItem(request);
  if (!item) return [];
  const { conversationId } = item;
  if (!item.saved) {
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
      void (async () => {
      const pageRecord = await item.resolveRecord();
      // Code/text attach the canvas item itself (its version chain); the
      // screenshot captures the page published for the version shown.
      const record = option.value === "screenshot" ? pageRecord : (item.itemRecord ?? pageRecord);
      if (!record || (option.value === "screenshot" && !pageRecord)) {
        toast.error("This page is not published yet.");
        return;
      }
      await attachRenderedArtifact(store, conversationId, {
        source: {
          kind: "rendered_artifact",
          record_type: record.recordType,
          record_id: record.recordId,
          title: request.title,
        },
        representation: option.value,
        capture: async () => {
          const result = await captureRecordOnServer({
            ...(pageRecord ?? record),
            width: request.element?.clientWidth || 1024,
            colorScheme: viewerColorScheme(),
          });
          return { kind: "stored", fileId: result.fileId, width: result.width, height: result.height };
        },
      });
      })();
    },
  }));
}
