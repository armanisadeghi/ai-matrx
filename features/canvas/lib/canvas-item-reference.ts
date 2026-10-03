/**
 * What record a canvas item SHOWS — the reference an agent reads and edits it by.
 *
 * Before this the canvas told agents an item's session id, type and title, and
 * an agent asked about an open HTML page answered that it had "no read path"
 * (owner report 2026-10-03): the label stood in for the data. An item now
 * travels as a `resource_ref` to its record, labeled with the name the person
 * sees; the server resolves the reference so `context` reads the body.
 *
 *   - a published HTML page (`iframe` showing `/p/<id>`) → `html_page`
 *   - a saved canvas artifact (`canvas_items` row)       → `canvas_item`
 *   - a session-only item with no record                 → none
 *
 * PURE — no React, no store.
 */

import {
  createResourceReference,
  type AgentResourceReference,
} from "@ai-matrx/chat/agents/agent-context/resource-reference";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import { readArtifactPointerId } from "@/features/canvas/artifact-types/artifactId";
import { htmlPageIdFromUrl } from "@/features/cms/utils/pageUrls";

export type CanvasItemRecordType = "html_page" | "canvas_item";

export interface CanvasItemRecord {
  resourceType: CanvasItemRecordType;
  id: string;
}

/** A labeled reference — the label is what the person calls it, never identity. */
export type CanvasItemReference = AgentResourceReference & { label?: string };

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * The record behind an item, or null while it has none. A page wins over a
 * saved canvas row: an `iframe` item saved to the library still SHOWS the page,
 * and the page is what an edit must change.
 */
export function canvasItemRecord(
  content: CanvasContent,
  savedItemId?: string | null,
): CanvasItemRecord | null {
  const pageId =
    nonEmpty(content.metadata?.htmlPageId) ??
    (content.type === "iframe" ? (htmlPageIdFromUrl(content.data) ?? undefined) : undefined);
  if (pageId) return { resourceType: "html_page", id: pageId };

  const canvasId =
    nonEmpty(savedItemId) ??
    nonEmpty(content.metadata?.canvasItemId) ??
    readArtifactPointerId(content.data);
  if (canvasId) return { resourceType: "canvas_item", id: canvasId };
  return null;
}

export function canvasItemReference(
  record: CanvasItemRecord,
  label: string,
): CanvasItemReference {
  const reference = createResourceReference(record.resourceType, record.id);
  return label ? { ...reference, label } : reference;
}
