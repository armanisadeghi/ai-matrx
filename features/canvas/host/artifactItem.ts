/**
 * Artifact items on the canvas — the bridge from the app's CanvasContent shape
 * to an `@ai-matrx/canvas` item.
 *
 * Every artifact content type is its own canvas KIND (kind id === content
 * type), so the tab icon, label and "comes back after reload" rule are per
 * type. The item's data is the whole CanvasContent, made JSON-safe.
 *
 * IDENTITY — the same thing never opens twice. The key is, in order:
 *   1. the persisted artifact id (canvas_items.id),
 *   2. the producing task, 3. the producing message,
 *   4. a stable hash of the content itself.
 * Before this, an open with none of 1–3 always created a duplicate.
 */

import type { CanvasJson, CanvasOpenInput } from "@ai-matrx/canvas";
import { findNonJson } from "@ai-matrx/canvas";
import { titleToString } from "@/features/canvas/canvasContent";
import type { ArtifactDebugTrace, CanvasContent } from "@/features/canvas/canvasContent";
import { readArtifactPointerId } from "@/features/canvas/artifact-types/artifactId";

export type ArtifactView = "preview" | "source";

/** What an artifact tab stores in the canvas state. */
export interface ArtifactItemData {
  readonly content: CanvasJson;
  /** canvas_items.id once saved to the cloud. */
  readonly savedItemId: string | null;
  readonly view: ArtifactView;
  /** Admin-only trace of the last save/ensure. */
  readonly artifactDebug?: CanvasJson | undefined;
  readonly [key: string]: CanvasJson | undefined;
}

export function readArtifactItemData(data: CanvasJson): ArtifactItemData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as { readonly [key: string]: CanvasJson | undefined };
  const content = record.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  return {
    content,
    savedItemId: typeof record.savedItemId === "string" ? record.savedItemId : null,
    view: record.view === "source" ? "source" : "preview",
    ...(record.artifactDebug !== undefined ? { artifactDebug: record.artifactDebug } : {}),
  };
}

export function contentOf(data: ArtifactItemData): CanvasContent {
  return data.content as unknown as CanvasContent;
}

/** FNV-1a over the JSON text — stable, cheap, collision-safe enough for tab identity. */
function stableHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function artifactKey(content: CanvasContent, savedItemId?: string | null): string {
  const meta = content.metadata;
  const artifactId = readArtifactPointerId(content.data) ?? meta?.canvasItemId ?? savedItemId ?? null;
  if (artifactId) return `artifact:${artifactId}`;
  if (meta?.sourceTaskId) return `task:${meta.sourceTaskId}`;
  if (meta?.sourceMessageId) return `message:${meta.sourceMessageId}`;
  return `content:${stableHash(JSON.stringify([content.type, content.data ?? null]))}`;
}

/**
 * Makes CanvasContent storable: a ReactNode title/subtitle becomes its text.
 * Anything else that is not JSON (a callback, a Date) is REFUSED by the canvas
 * controller and announced — never silently dropped.
 */
export function toStorableContent(content: CanvasContent): CanvasJson {
  const metadata = content.metadata
    ? {
        ...content.metadata,
        title: titleToString(content.metadata.title) || undefined,
        subtitle: titleToString(content.metadata.subtitle) || undefined,
      }
    : undefined;
  return { ...content, ...(metadata ? { metadata } : {}) } as unknown as CanvasJson;
}

export interface ArtifactOpenOptions {
  readonly savedItemId?: string | null;
  readonly artifactDebug?: ArtifactDebugTrace | null;
  /** Add the tab without revealing the canvas or stealing focus. */
  readonly quiet?: boolean;
  readonly target?: CanvasOpenInput["target"];
}

export function artifactOpenInput(content: CanvasContent, options: ArtifactOpenOptions = {}): CanvasOpenInput {
  const savedItemId = options.savedItemId ?? content.metadata?.canvasItemId ?? null;
  const data: ArtifactItemData = {
    content: toStorableContent(content),
    savedItemId,
    view: "preview",
    ...(options.artifactDebug ? { artifactDebug: options.artifactDebug as unknown as CanvasJson } : {}),
  };
  const title = titleToString(content.metadata?.title) || null;
  return {
    kind: content.type,
    key: artifactKey(content, savedItemId),
    title,
    data,
    ...(options.target ? { target: options.target } : {}),
    ...(options.quiet ? { reveal: false, activate: false } : {}),
  };
}

/** The first non-JSON path in a content's data, for a precise refusal. */
export function nonJsonPathIn(content: CanvasContent): string | null {
  return findNonJson(toStorableContent(content));
}
