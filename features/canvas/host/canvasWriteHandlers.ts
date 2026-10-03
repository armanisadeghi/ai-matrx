"use client";

/**
 * The write half of the `matrx-user/canvas` surface: `canvas_item_content`.
 *
 * The open item is a REFERENCE (`canvas-item-reference.ts`), so the page holds
 * no body to diff or patch against. This handler reads the record live
 * (`readCurrent`), writes through the record's OWN save path, and refreshes the
 * tab so the person sees what landed:
 *
 *   - `html_page`   → `HTMLPageService.updatePage` (the html page editor's Save;
 *                     republishes at `/p/<id>`), then the iframe reloads.
 *   - `canvas_item` → `canvasArtifactService.saveUserVersion` (a new version in
 *                     the artifact's chain), then the tab points at it.
 *
 * Built per call (the `getWriteHandlers` contract), reading the canvas store at
 * call time — the tab that is open when the write APPLIES is the one changed,
 * and a tab closed meanwhile refuses rather than writing somewhere unseen.
 *
 * ANY OPEN ITEM, BY ITS REFERENCE (2026-10-03). The write names its record
 * (`SurfaceWriteContext.item` — the `resource_ref` the agent read it by), and
 * the handler finds the open tab showing that record, whichever tab has focus.
 * Before this, focusing a non-item tab (Agent context) made every open item
 * read as "no item is open" and edits were refused. Without an address the
 * focused item is used, else the only open record; several open records and
 * none named is refused with their references, never guessed.
 */

import type { CanvasController, CanvasItemId, CanvasJson } from "@ai-matrx/canvas";
import type {
  SurfaceWriteAddress,
  SurfaceWriteContext,
  SurfaceWriteHandlerEntry,
  SurfaceWriteHandlers,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { titleToString, type CanvasContent } from "@/features/canvas/canvasContent";
import {
  canvasItemRecord,
  type CanvasItemRecord,
} from "@/features/canvas/lib/canvas-item-reference";
import { readArtifactPointerId } from "@/features/canvas/artifact-types/artifactId";
import { htmlPageUrl } from "@/features/cms/utils/pageUrls";
import { artifactKey, contentOf, readArtifactItemData, type ArtifactItemData } from "./artifactItem";

export const CANVAS_ITEM_CONTENT_TARGET = "canvas_item_content";

/** A saved canvas artifact row, as much of it as an edit needs. */
export interface CanvasArtifactVersion {
  id: string;
  type: string;
  title: string | null;
  content: unknown;
  version: number;
}

/** The two save paths, injectable so the routing is testable without a network. */
export interface CanvasRecordServices {
  readHtmlPage(pageId: string): Promise<string>;
  saveHtmlPage(pageId: string, html: string): Promise<void>;
  /** The newest version in the chain of `canvasId`. */
  readCanvasItem(canvasId: string): Promise<CanvasArtifactVersion | null>;
  saveCanvasItemVersion(input: {
    canvasId: string;
    title: string;
    content: string | Record<string, unknown>;
    type: string;
    metadata: Record<string, unknown>;
  }): Promise<CanvasArtifactVersion | null>;
}

interface OpenItem {
  itemId: CanvasItemId;
  data: ArtifactItemData;
  content: CanvasContent;
  record: CanvasItemRecord;
}

interface CandidateItem {
  itemId: CanvasItemId;
  data: ArtifactItemData;
  content: CanvasContent;
  record: CanvasItemRecord | null;
}

function candidate(itemId: CanvasItemId, raw: CanvasJson): CandidateItem | null {
  const data = readArtifactItemData(raw);
  if (!data) return null;
  const content = contentOf(data);
  return { itemId, data, content, record: canvasItemRecord(content, data.savedItemId) };
}

function describeRecord(record: CanvasItemRecord, content: CanvasContent): string {
  const title = titleToString(content.metadata?.title);
  return `${title ? `"${title}" ` : ""}{ resource_type: "${record.resourceType}", resource_id: "${record.id}" }`;
}

const NOTHING_CHANGED = "Nothing was changed.";

/**
 * The open item a write changes: the one showing the addressed record, or —
 * with no address — the focused item, else the only open record.
 */
function openItem(canvas: CanvasController, address?: SurfaceWriteAddress): OpenItem {
  const state = canvas.getState();
  const all = Object.values(state.items ?? {})
    .map((item) => (item ? candidate(item.id, item.data) : null))
    .filter((item): item is CandidateItem => item !== null);
  const records = all.filter(
    (item): item is CandidateItem & { record: CanvasItemRecord } => item.record !== null,
  );

  if (address) {
    const match = records.find(
      (item) =>
        item.record.resourceType === address.resourceType &&
        item.record.id === address.resourceId,
    );
    if (match) return match;
    const open = records.map((item) => describeRecord(item.record, item.content));
    throw new Error(
      `No open canvas item shows ${address.resourceType} ${address.resourceId}. ` +
        (open.length
          ? `The open records are: ${open.join("; ")}. `
          : "No stored record is open on the canvas. ") +
        NOTHING_CHANGED,
    );
  }

  const pane = state.isOpen ? state.panes[state.focusedPaneId] : undefined;
  const focusedRaw = pane?.activeItemId ? state.items[pane.activeItemId] : undefined;
  const focused = focusedRaw ? candidate(focusedRaw.id, focusedRaw.data) : null;
  if (focused?.record) return { ...focused, record: focused.record };
  if (focused && !focused.record) {
    throw new Error(
      `The open canvas item has not been saved, so there is no stored record to change. ${NOTHING_CHANGED}`,
    );
  }
  if (records.length === 1) return records[0];
  if (records.length === 0) {
    throw new Error(
      all.length
        ? `No open canvas item has been saved, so there is no stored record to change. ${NOTHING_CHANGED}`
        : `No item is open on the canvas. ${NOTHING_CHANGED}`,
    );
  }
  throw new Error(
    `Several canvas items are open and none is in focus — name the one to change with \`item\`: ` +
      `${records.map((item) => describeRecord(item.record, item.content)).join("; ")}. ${NOTHING_CHANGED}`,
  );
}

/** A canvas row's body as the text an edit replaces (mirrors the server resolver). */
export function canvasBodyText(content: unknown): string {
  const data =
    content && typeof content === "object" && !Array.isArray(content) && "data" in content
      ? (content as { data: unknown }).data
      : content;
  if (data === null || data === undefined) return "";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

/** A whole HTML page must stay a whole document — a fragment would replace the page. */
export function assertCompleteHtmlDocument(html: string): void {
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error(
      "An HTML page must stay a complete document (<!doctype html>, <html>, <head>, <body>). Send a str_replace edit, or the whole document. Nothing was changed.",
    );
  }
}

/** The tab data after the page was republished: same page, a URL that forces a reload. */
export function republishedPageData(
  data: ArtifactItemData,
  pageId: string,
  revision: number,
): ArtifactItemData {
  const content = contentOf(data);
  return {
    ...data,
    content: {
      ...content,
      data: `${htmlPageUrl(pageId)}?v=${revision}`,
      metadata: { ...(content.metadata ?? {}), htmlPageId: pageId },
    } as unknown as CanvasJson,
  };
}

/** The tab data after a new canvas version was saved: the tab now IS that version. */
export function newVersionData(
  data: ArtifactItemData,
  saved: CanvasArtifactVersion,
  body: string | Record<string, unknown>,
): ArtifactItemData {
  const content = contentOf(data);
  const pointer = readArtifactPointerId(content.data);
  return {
    ...data,
    savedItemId: saved.id,
    content: {
      ...content,
      data: pointer ? { ...(content.data as object), artifactId: saved.id } : body,
      metadata: {
        ...(content.metadata ?? {}),
        canvasItemId: saved.id,
        artifactVersion: saved.version,
      },
    } as unknown as CanvasJson,
  };
}

export function canvasItemContentHandler(
  canvas: CanvasController,
  services: CanvasRecordServices,
): SurfaceWriteHandlerEntry {
  return {
    async validate(value, context?: SurfaceWriteContext) {
      const { record } = openItem(canvas, context?.item);
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("Send the new content as text. Nothing was changed.");
      }
      if (record.resourceType === "html_page") assertCompleteHtmlDocument(value);
    },

    async readCurrent(context?: SurfaceWriteContext) {
      const { record } = openItem(canvas, context?.item);
      if (record.resourceType === "html_page") return services.readHtmlPage(record.id);
      const row = await services.readCanvasItem(record.id);
      if (!row) throw new Error("This canvas item could not be read. Reopen it and try again.");
      return canvasBodyText(row.content);
    },

    async apply(value, context?: SurfaceWriteContext) {
      const text = String(value);
      const { itemId, data, content, record } = openItem(canvas, context?.item);
      const title = titleToString(content.metadata?.title);

      if (record.resourceType === "html_page") {
        assertCompleteHtmlDocument(text);
        await services.saveHtmlPage(record.id, text);
        canvas.update(itemId, {
          data: republishedPageData(data, record.id, Date.now()) as unknown as CanvasJson,
        });
        return {
          summary: `Republished ${title ? `"${title}"` : "the page"} — the canvas shows the new version.`,
          data: { resource_type: "html_page", resource_id: record.id },
        };
      }

      const latest = await services.readCanvasItem(record.id);
      if (!latest) throw new Error("This canvas item could not be read. Nothing was changed.");
      const priorData =
        latest.content && typeof latest.content === "object" && "data" in (latest.content as object)
          ? (latest.content as { data: unknown }).data
          : latest.content;
      let body: string | Record<string, unknown> = text;
      if (priorData && typeof priorData === "object") {
        try {
          body = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new Error(
            "This canvas item holds structured data, so its new content must be valid JSON. Nothing was changed.",
          );
        }
      }
      const priorMetadata =
        latest.content && typeof latest.content === "object" && "metadata" in (latest.content as object)
          ? ((latest.content as { metadata?: Record<string, unknown> }).metadata ?? {})
          : {};
      const saved = await services.saveCanvasItemVersion({
        canvasId: latest.id,
        title: latest.title ?? title,
        content: body,
        type: latest.type,
        metadata: priorMetadata,
      });
      if (!saved) throw new Error("Saving the new version failed. Nothing was changed.");
      const next = newVersionData(data, saved, body);
      canvas.update(itemId, { data: next as unknown as CanvasJson });
      canvas.rekey(itemId, artifactKey(contentOf(next), saved.id));
      return {
        summary: `Saved version ${saved.version} of ${title ? `"${title}"` : "the item"} — the canvas shows it.`,
        data: { resource_type: "canvas_item", resource_id: saved.id, version: saved.version },
      };
    },
  };
}

/** The real save paths: the html page API route and the canvas version RPC. */
export const canvasRecordServices: CanvasRecordServices = {
  async readHtmlPage(pageId) {
    const { HTMLPageService } = await import("@/features/html-pages/services/htmlPageService");
    const page = (await HTMLPageService.getPage(pageId)) as { html_content?: unknown };
    return typeof page?.html_content === "string" ? page.html_content : "";
  },
  async saveHtmlPage(pageId, html) {
    const { HTMLPageService } = await import("@/features/html-pages/services/htmlPageService");
    await HTMLPageService.updatePage(pageId, html, undefined, undefined, undefined);
  },
  async readCanvasItem(canvasId) {
    const { canvasArtifactService } = await import("@/features/canvas/services/canvasArtifactService");
    const chain = await canvasArtifactService.readVersionHistory(canvasId);
    if (!chain.length) return canvasArtifactService.getById(canvasId);
    return chain.reduce((a, b) => ((b.version ?? 1) > (a.version ?? 1) ? b : a));
  },
  async saveCanvasItemVersion(input) {
    const { canvasArtifactService } = await import("@/features/canvas/services/canvasArtifactService");
    return canvasArtifactService.saveUserVersion(input);
  },
};

/** `getWriteHandlers` for the canvas column's `SurfaceRuntimeProvider`. */
export function canvasWriteHandlers(
  canvas: CanvasController,
  services: CanvasRecordServices = canvasRecordServices,
): SurfaceWriteHandlers {
  return { [CANVAS_ITEM_CONTENT_TARGET]: canvasItemContentHandler(canvas, services) };
}
