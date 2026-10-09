"use client";

/**
 * "Attach to chat" for EVERY artifact type (rendered-output standard P2 WP4,
 * guarantee 3) — one table of representations per artifact type and ONE
 * attach function, used by the canvas pane's "Attach to chat ▸" entry and by
 * each artifact block inside a message.
 *
 * Representations (`@ai-matrx/chat` renderedArtifactContext.ts):
 *   - `code`       — the content: code / diagram source / markdown, or the
 *                    kind's data as JSON (labelled per type),
 *   - `text`       — a readable plain-text form, only where the content is
 *                    structured data (a code block's text IS its code),
 *   - `screenshot` — captured at ATTACH time: DOM capture for "dom" types,
 *                    honestly unavailable for frame types whose capture is not
 *                    built yet (artifact-output.ts).
 * A saved artifact (canvas_items id) attaches by reference; an unsaved message
 * block attaches inline. Neither ever becomes user_input.
 */

import type { CanvasContentType } from "@/features/canvas/canvasContent";
import type { RenderedArtifactRepresentation } from "@ai-matrx/chat/agents/types/instance.types";
import {
  readableText,
  type RenderedArtifactRepresentationOption,
  type RenderedArtifactSource,
} from "@ai-matrx/chat/agents/utils/renderedArtifactContext";
import {
  attachRenderedArtifact,
  type RenderedCaptureResult,
} from "@ai-matrx/chat/agents/components/inputs/resources/useAttachRenderedArtifact";
import type { AttachStore } from "@ai-matrx/chat/agents/components/inputs/resources/attach-resource";
import { isMaterializedArtifactId } from "@ai-matrx/rich-content/utils/lifted/artifactId";
import { artifactOutputDef } from "@/features/canvas/artifact-types/artifact-output";

/** What an artifact's content representation is called, by what it holds. */
type ContentForm = "code" | "source" | "data" | "link";

interface ArtifactAttachDef {
  /** The content representation's form (its label). */
  readonly content: ContentForm;
  /** The default representation — what an agent most needs from this type. */
  readonly default: RenderedArtifactRepresentation;
}

const CODE: ArtifactAttachDef = { content: "code", default: "code" };
const SOURCE: ArtifactAttachDef = { content: "source", default: "code" };
const DATA: ArtifactAttachDef = { content: "data", default: "code" };

/**
 * One entry per artifact type (exhaustive: a new type without one is a type
 * error). HTML attaches through its own page path (attachOptions.ts) and is
 * listed for completeness.
 */
export const ARTIFACT_ATTACH: Record<CanvasContentType, ArtifactAttachDef> = {
  html: { content: "code", default: "screenshot" },
  code: CODE,
  code_preview: CODE,
  react: CODE,
  svg: SOURCE,
  mermaid: SOURCE,
  image: { content: "link", default: "screenshot" },
  iframe: { content: "link", default: "code" },
  map: DATA,
  sandbox: DATA,
  cloud_browser: DATA,
  udt_document: DATA,
  diagram: DATA,
  chart: DATA,
  quiz: DATA,
  presentation: DATA,
  comparison: DATA,
  timeline: DATA,
  research: DATA,
  troubleshooting: DATA,
  "decision-tree": DATA,
  flashcards: DATA,
  recipe: DATA,
  resources: DATA,
  code_edit_error: DATA,
  progress: DATA,
  math_problem: DATA,
  stats: DATA,
  diff: SOURCE,
  questionnaire: DATA,
  table: DATA,
  transcript: DATA,
  structured_info: DATA,
  tree: DATA,
  tasks: DATA,
  topical_map: DATA,
  kind_value: DATA,
};

const CONTENT_OPTION: Record<ContentForm, { label: string; hint: string }> = {
  code: { label: "Code", hint: "The full code" },
  source: { label: "Source", hint: "The source it is drawn from" },
  data: { label: "Data", hint: "The exact data, as JSON" },
  link: { label: "Link", hint: "Where it comes from" },
};

function parsed(data: unknown): unknown {
  if (typeof data !== "string") return data;
  const trimmed = data.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return data;
  try {
    return JSON.parse(trimmed);
  } catch {
    return data;
  }
}

/** The artifact's body as the model reads it: text as itself, structured data as JSON. */
export function artifactBody(data: unknown): { code: string; text: string | null } {
  const value = parsed(data);
  if (typeof value === "string") return { code: value, text: null };
  if (value === null || value === undefined) return { code: "", text: null };
  if (typeof value !== "object") return { code: String(value), text: null };
  return { code: JSON.stringify(value, null, 2), text: readableText(value) };
}

function isArtifactType(type: string): type is CanvasContentType {
  return Object.prototype.hasOwnProperty.call(ARTIFACT_ATTACH, type);
}

/** The representations this artifact offers, default first. */
export function artifactAttachOptions(
  type: string,
  data: unknown,
  /** The host can capture this tab (the canvas's resolved capture — kind, then port). */
  frameCapture = false,
): RenderedArtifactRepresentationOption[] {
  const def = isArtifactType(type) ? ARTIFACT_ATTACH[type] : DATA;
  const body = artifactBody(data);
  const structured = body.text !== null;
  const content = structured && def.content === "source" ? CONTENT_OPTION.data : CONTENT_OPTION[def.content];
  const options: RenderedArtifactRepresentationOption[] = [{ value: "code", ...content }];
  if (structured) options.push({ value: "text", label: "Text", hint: "The data as readable text" });
  const output = isArtifactType(type) ? artifactOutputDef(type) : { surface: "dom" as const };
  // A frame body (iframe, map, sandbox…) is never DOM-captured — a DOM copy of a frame is blank.
  const notYet = typeof output.capture === "string" ? output.capture : "not available here";
  options.push(
    frameCapture || output.surface === "dom"
      ? { value: "screenshot", label: "Screenshot", hint: "As you see it" }
      : { value: "screenshot", label: "Screenshot", hint: "As you see it", unavailable: `Screenshot ${notYet}` },
  );
  const preferred = options.find((o) => o.value === def.default && !o.unavailable);
  return preferred ? [preferred, ...options.filter((o) => o !== preferred)] : options;
}

/** The default representation of this artifact (the one-click attach). */
export function defaultArtifactRepresentation(
  type: string,
  data: unknown,
  frameCapture = false,
): RenderedArtifactRepresentation {
  return artifactAttachOptions(type, data, frameCapture)[0].value;
}

export interface AttachArtifactInput {
  store: AttachStore;
  conversationId: string | null;
  type: string;
  title: string;
  data: unknown;
  /** The saved canvas_items id, when the artifact is materialized. */
  canvasItemId?: string | null;
  /** A stable key for an unsaved block (message id + block index). */
  blockKey: string;
  representation: RenderedArtifactRepresentation;
  /** The element the artifact is drawn in — what a DOM screenshot captures. */
  element: () => HTMLElement | null;
  /** The host's own image capture (the canvas capture port) — wins over DOM capture. */
  captureImage?: () => Promise<Blob>;
}

/** DOM capture of the drawn artifact, as a PNG file for the upload funnel. */
async function captureElement(
  element: HTMLElement | null,
  title: string,
  captureImage?: () => Promise<Blob>,
): Promise<RenderedCaptureResult> {
  let blob: Blob;
  if (captureImage) {
    blob = await captureImage();
  } else {
    if (!element) throw new Error("the artifact is not on screen");
    const { elementToImage } = await import("@ai-matrx/alchemy/operate/capture");
    blob = await elementToImage(element, { safeColors: true });
  }
  const name = `${title.replace(/[^\w\s.-]+/g, "").trim().slice(0, 60) || "artifact"} screenshot.png`;
  return { kind: "file", file: new File([blob], name, { type: "image/png" }) };
}

/** Attach one artifact to a chat in one representation — the ONE path for canvas and message blocks. */
export async function attachArtifactToChat(input: AttachArtifactInput): Promise<boolean> {
  const options = artifactAttachOptions(input.type, input.data, Boolean(input.captureImage));
  const saved = input.canvasItemId && isMaterializedArtifactId(input.canvasItemId) ? input.canvasItemId.trim() : null;
  const source: RenderedArtifactSource = saved
    ? {
        kind: "rendered_artifact",
        record_type: "canvas_item",
        record_id: saved,
        title: input.title,
        artifact_type: input.type,
        options,
      }
    : {
        kind: "rendered_artifact",
        record_type: "inline",
        record_id: input.blockKey,
        title: input.title,
        artifact_type: input.type,
        options,
        body: artifactBody(input.data),
      };
  const screenshot = options.find((o) => o.value === "screenshot");
  return attachRenderedArtifact(input.store, input.conversationId, {
    source,
    representation: input.representation,
    capture: screenshot && !screenshot.unavailable ? () => captureElement(input.element(), input.title, input.captureImage) : undefined,
  });
}
