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
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { chatRouteSurfaceKey } from "@ai-matrx/chat/agents/components/chat/begin-fresh-chat";
import { getStore } from "@/lib/redux/store-singleton";
import { toast } from "@/lib/toast";
import { publishedPageInElement, resolvePrintablePageUrl } from "./publishedPage";
import { artifactAttachOptions, attachArtifactToChat } from "./artifactAttach";

interface FocusState {
  conversationFocus?: { bySurface?: Record<string, { input?: string | null } | undefined> };
}

/** The conversation a chat route is focused on right now (the one chat surface that has one), or null. */
export function focusedChatConversationId(state: FocusState): string | null {
  const prefix = chatRouteSurfaceKey("");
  const found = new Set<string>();
  for (const [key, entry] of Object.entries(state.conversationFocus?.bySurface ?? {})) {
    if (key.startsWith(prefix) && entry?.input) found.add(entry.input);
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * The chat an attach goes to: the one the canvas item was made in (its own
 * metadata, else `canvas_items.conversation_id`), else the chat the person is
 * looking at. Null only when there is truly no chat.
 */
export async function resolveAttachConversationId(input: {
  metadataConversationId: string | null;
  canvasItemId: string | null;
  focused: string | null;
  lookupItem?: (id: string) => Promise<{ conversation_id: string | null } | null>;
}): Promise<string | null> {
  if (input.metadataConversationId) return input.metadataConversationId;
  if (input.canvasItemId) {
    const lookup = input.lookupItem ?? ((id: string) => canvasArtifactService.getById(id));
    try {
      const row = await lookup(input.canvasItemId);
      if (row?.conversation_id) return row.conversation_id;
    } catch (error) {
      console.error("[canvas] the item's conversation could not be read", error);
    }
  }
  return input.focused;
}

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

/**
 * Every other artifact type (rendered-output P2 WP4): its own representations
 * (artifactAttach.ts), the screenshot through the same capture port the pane's
 * "Copy image" uses. A saved item attaches by reference, an unsaved one inline.
 */
function canvasArtifactAttachOptions(
  request: CanvasOutputRequest,
  capture: (() => Promise<Blob>) | null,
): readonly CanvasMenuItem[] {
  const data = readArtifactItemData(request.item.data);
  if (!data) return [];
  const content = contentOf(data);
  const itemId = data.savedItemId ?? content.metadata?.canvasItemId ?? null;
  // Screenshot is offered exactly when the pane can capture this tab (as Copy image is).
  const frameCapture = capture !== null;
  const store = getStore();
  const focused = store ? focusedChatConversationId(store.getState() as unknown as FocusState) : null;
  return artifactAttachOptions(content.type, content.data, frameCapture).map((option) => ({
    id: `output:attach:${option.value}`,
    label: option.unavailable ?? `Attach ${option.label.toLowerCase()} to chat`,
    disabled: Boolean(option.unavailable),
    onSelect: () => {
      const live = getStore();
      if (!live) return;
      void (async () => {
        const conversationId = await resolveAttachConversationId({
          metadataConversationId: content.metadata?.conversationId ?? null,
          canvasItemId: itemId && isMaterializedArtifactId(itemId) ? itemId : null,
          focused,
        });
        if (!conversationId) {
          toast.error("There is no chat to attach to. Open a chat first.");
          return;
        }
        await attachArtifactToChat({
          store: live,
          conversationId,
          type: content.type,
          title: request.title,
          data: content.data,
          canvasItemId: itemId,
          blockKey: `canvas_${request.item.id}`,
          representation: option.value,
          element: () => request.element ?? null,
          captureImage: capture ?? undefined,
        });
      })();
    },
  }));
}

export function canvasAttachOptions(
  request: CanvasOutputRequest,
  capture: (() => Promise<Blob>) | null = null,
): readonly CanvasMenuItem[] {
  const item = canvasHtmlItem(request);
  if (!item) return canvasArtifactAttachOptions(request, capture);
  if (!item.saved) {
    return [{ id: "output:attach", label: "Attach to chat — publishing the page…", disabled: true, onSelect: () => undefined }];
  }
  const focused = (() => {
    const store = getStore();
    return store ? focusedChatConversationId(store.getState() as unknown as FocusState) : null;
  })();
  return availableRenderedArtifactRepresentations().map((option) => ({
    id: `output:attach:${option.value}`,
    label: `Attach ${option.label.toLowerCase()} to chat`,
    onSelect: () => {
      const store = getStore();
      if (!store) return;
      void (async () => {
      const conversationId = await resolveAttachConversationId({
        metadataConversationId: item.conversationId,
        canvasItemId: item.itemRecord?.recordId ?? null,
        focused,
      });
      if (!conversationId) {
        toast.error("There is no chat to attach to. Open a chat first.");
        return;
      }
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
