/**
 * Stored message parts → composer attachment chips.
 *
 * A saved request (an agent test case, a sample) keeps its attachments as the
 * `MessagePart`s it was sent with. Writing those straight into
 * `instanceUserInput.messageParts` sends them, but no composer renders that
 * field — the engineer saw a test case "load" with its files missing. This is
 * the inverse of `buildResourcePayload`: each part becomes the same
 * `ManagedResource` a person attaching that thing would create (blockType,
 * source, options, label), so it shows as a chip, can be removed like one, and
 * sends through `selectResourcePayloads` like one.
 *
 * IDENTICAL SEND: the resource is rebuilt through `buildResourcePayload` and
 * compared with the part's own request shape (`messagePartToUserInputPart`).
 * Where the composer's source shape cannot say everything the part said
 * (extra media fields, snapshot refs, …) the exact part rides as the
 * resource's `finalPayload`, so the request is byte-for-byte the stored one.
 *
 * A part with no attachment form (input_context, input_remarks, assistant-side
 * parts) is returned in `unattached` — the caller keeps it on the request and
 * must say so on screen. Nothing is dropped silently.
 */

import type { MessagePart } from "@ai-matrx/agents/generated/stream-events";
import type {
  ManagedResource,
  ResourceBlockType,
  ResourceOptions,
} from "../../../types/instance.types";
import type { UserInputPart } from "../../../types/request.types";
import { generateResourceId } from "../utils/ids";
import {
  buildResourcePayload,
  messagePartToUserInputPart,
} from "./instance-resources.selectors";

const ID_LIST_FIELDS = {
  input_notes: "note_ids",
  input_task: "task_ids",
  input_agent: "agent_ids",
  input_project: "project_ids",
  input_agent_app: "agent_app_ids",
  input_transcript: "transcript_ids",
  input_transcript_session: "transcript_session_ids",
  input_workbook: "workbook_ids",
  input_document: "document_ids",
} as const satisfies Partial<Record<ResourceBlockType, string>>;

type IdListType = keyof typeof ID_LIST_FIELDS;

const TEMPLATES = new Set(["full", "compact", "minimal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdListType(type: string): type is IdListType {
  return Object.prototype.hasOwnProperty.call(ID_LIST_FIELDS, type);
}

/** The composer's flags, read back from a part's wire controls. */
function optionsFromPart(part: Record<string, unknown>): ResourceOptions {
  const template = part.template;
  return {
    keepFresh: part.keep_fresh === true,
    editable: part.editable === true,
    convertToText: part.convert_to_text !== false,
    optionalContext: part.optional_context === true,
    ...(typeof template === "string" && TEMPLATES.has(template)
      ? { template: template as ResourceOptions["template"] }
      : {}),
  };
}

function displayTitle(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const title = metadata.display_title;
  return typeof title === "string" && title ? title : null;
}

interface ResourceShape {
  blockType: ResourceBlockType;
  source: unknown;
  /** False when the source cannot be rebuilt by `buildResourcePayload`. */
  buildable: boolean;
}

/** blockType + source a person attaching this thing would have produced. */
function resourceShapeOf(part: MessagePart): ResourceShape | null {
  const raw = part as unknown as Record<string, unknown>;
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined;
  if (part.type === "media") {
    if (part.kind === "youtube") {
      return { blockType: "youtube_video", source: part.url, buildable: true };
    }
    const locator = part.file_id
      ? { file_id: part.file_id }
      : part.url
        ? { url: part.url }
        : null;
    if (!locator) return null;
    return {
      blockType: part.kind,
      source: {
        ...locator,
        ...(part.mime_type ? { mime_type: part.mime_type } : {}),
        ...(metadata ? { metadata } : {}),
      },
      buildable: true,
    };
  }
  if (part.type === "input_webpage") {
    return { blockType: "input_webpage", source: [...part.urls], buildable: true };
  }
  if (part.type === "input_table" || part.type === "input_list") {
    return {
      blockType: part.type,
      source: { bookmarks: [...part.bookmarks], ...(metadata ? { metadata } : {}) },
      buildable: true,
    };
  }
  if (part.type === "input_data") {
    return {
      blockType: "input_data",
      source: { refs: [...part.refs], ...(metadata ? { metadata } : {}) },
      buildable: true,
    };
  }
  if (isIdListType(part.type)) {
    const entries = raw[ID_LIST_FIELDS[part.type]];
    if (!Array.isArray(entries) || entries.length === 0) return null;
    // A snapshot ref has no id: the composer's id-list source cannot carry
    // it, so the exact part has to ride as the payload.
    const plainIds = entries.every(
      (entry) =>
        typeof entry === "string" ||
        (isRecord(entry) && typeof entry.id === "string"),
    );
    return { blockType: part.type, source: [...entries], buildable: plainIds };
  }
  return null;
}

/** Key-order-independent JSON, absent and `undefined` keys alike. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export interface MessagePartResources {
  /** Ready chips, in the parts' order. */
  resources: ManagedResource[];
  /** Parts with no attachment form — still to be sent, and shown as such. */
  unattached: MessagePart[];
}

/** Turn stored attachment parts into composer resources (see file header). */
export function messagePartsToResources(
  parts: readonly MessagePart[],
): MessagePartResources {
  const resources: ManagedResource[] = [];
  const unattached: MessagePart[] = [];
  for (const part of parts) {
    const shape = part.type === "text" ? null : resourceShapeOf(part);
    if (!shape) {
      unattached.push(part);
      continue;
    }
    let exact: UserInputPart;
    try {
      exact = messagePartToUserInputPart(part);
    } catch {
      unattached.push(part);
      continue;
    }
    const raw = part as unknown as Record<string, unknown>;
    const resource: ManagedResource = {
      resourceId: generateResourceId(),
      blockType: shape.blockType,
      source: shape.source,
      preview: displayTitle(raw.metadata),
      status: "ready",
      errorMessage: null,
      userEdited: false,
      editedContent: null,
      options: optionsFromPart(raw),
      finalPayload: null,
      sortOrder: resources.length,
    };
    let rebuilt: UserInputPart | null = null;
    if (shape.buildable) {
      try {
        rebuilt = buildResourcePayload(resource);
      } catch {
        rebuilt = null; // the source cannot rebuild it — the exact part rides
      }
    }
    if (!rebuilt || canonical(rebuilt) !== canonical(exact)) {
      resource.finalPayload = exact;
    }
    resources.push(resource);
  }
  return { resources, unattached };
}
