/**
 * THE ONE total mapping from the resource picker's `Resource` union to the
 * Source payload's pointer (`SourceRef`, `@ai-matrx/agents/sources`).
 *
 * - A stored record maps directly to a `SourceRef` whose `resource_type` is the
 *   server's resource token (aidream `services/references/resources.py` +
 *   `services/agent_data/registry.py`; files use "file", as
 *   `parse_resource_reference` and the instance-resources selector do).
 * - Anything that is not yet a durable record the person owns — a webpage,
 *   a YouTube link, an image or file URL, pasted/dictated text, an audio
 *   capture, a file known only by its content or URL — returns `needsIntake`
 *   naming the `door` it lands through (contract amendment A3, the Source
 *   Convergence door): it lands as a `processed_document` and is then sent as
 *   `{resource_type: "processed_document"}`. Nothing is ever sent as a blob.
 * - Two stored kinds cannot be expressed as ONE pointer under contract v1 and
 *   also return `needsIntake`, saying so in `reason`: a table SLICE (schema,
 *   column, row or cell bookmark) and a live context value (scope × item);
 *   their `door` is null — there is nothing to land.
 *
 * `MAPPERS` is keyed by every `Resource["type"]` — the compiler refuses a
 * missing key, and `resourceToSourceRef.test.ts` reads the union from source
 * and fails when a variant has no mapper.
 */

import { createSourceRef, type SourceRef } from "@ai-matrx/agents/sources";
import type { Resource } from "@/features/agents/resources/types";

export type ResourceKind = Resource["type"];
type ResourceData<K extends ResourceKind> = Extract<Resource, { type: K }>["data"];

/**
 * Where new material lands (A3) before it can be referenced as a
 * `processed_document`:
 * - `sources_land` — POST /sources/land (pasted or dictated text);
 * - `scraper` — the scraper routes, which land at their result boundary (web pages and URLs);
 * - `transcription` — transcription, which lands on finalize (YouTube, audio);
 * - `file_upload` — the file adapters (bytes not stored yet).
 */
export type IntakeDoor = "sources_land" | "scraper" | "transcription" | "file_upload";

/** A Resource that must become a durable record (intake) before it can be a Source. */
export interface NeedsIntakeOf<K extends ResourceKind> {
  needsIntake: true;
  kind: K;
  payload: ResourceData<K>;
  /** The landing door the UI routes this through; null = not new material, cannot land. */
  door: IntakeDoor | null;
  /** Why this Resource is not a pointer yet — shown to the person, never swallowed. */
  reason: string;
}

/** Discriminated by `kind`, so narrowing on it types `payload`. */
export type NeedsIntake = { [K in ResourceKind]: NeedsIntakeOf<K> }[ResourceKind];

export type ResourceSourceOutcome = SourceRef | NeedsIntake;

const INLINE_REASON = "Not stored yet — it becomes one of your sources first.";

function intake<K extends ResourceKind>(
  kind: K,
  payload: ResourceData<K>,
  door: IntakeDoor | null,
  reason: string = INLINE_REASON,
): NeedsIntakeOf<K> {
  return { needsIntake: true, kind, payload, door, reason };
}

type Mappers = {
  [K in ResourceKind]: (data: ResourceData<K>) => ResourceSourceOutcome;
};

const MAPPERS: Mappers = {
  note: (data) => createSourceRef("note", data.id),
  task: (data) => createSourceRef("task", data.id),
  project: (data) => createSourceRef("project", data.id),
  // `fileId` is the canonical cld_files id every upload/storage picker emits;
  // a file known only by content or URL is not stored yet.
  file: (data) =>
    data.fileId ? createSourceRef("file", data.fileId) : intake("file", data, "file_upload"),
  table: (data) =>
    data.type === "full_table"
      ? createSourceRef("dataset", data.table_id)
      : intake(
          "table",
          data,
          null,
          "Only a whole table can be a source for now — pick the full table.",
        ),
  webpage: (data) => intake("webpage", data, "scraper"),
  youtube: (data) => intake("youtube", data, "transcription"),
  image_url: (data) => intake("image_url", data, "scraper"),
  file_url: (data) => intake("file_url", data, "scraper"),
  audio: (data) => intake("audio", data, "transcription"),
  text: (data) => intake("text", data, "sources_land"),
  agent: (data) => createSourceRef("agent", data.id),
  agent_app: (data) => createSourceRef("app", data.id),
  transcript: (data) => createSourceRef("transcript", data.id),
  transcript_session: (data) => createSourceRef("studio_session", data.id),
  workbook: (data) => createSourceRef("workbook", data.id),
  document: (data) => createSourceRef("udt_document", data.id),
  context_value: (data) =>
    intake(
      "context_value",
      data,
      null,
      "A live context value is not a source yet — attach it through the chat context instead.",
    ),
};

/** Every Resource kind this mapping covers (the exhaustiveness test compares it to the union). */
export const MAPPED_RESOURCE_KINDS = Object.keys(MAPPERS) as ResourceKind[];

export function resourceToSourceRef(resource: Resource): ResourceSourceOutcome {
  const mapper = MAPPERS[resource.type] as (
    data: Resource["data"],
  ) => ResourceSourceOutcome;
  return mapper(resource.data);
}

export function isNeedsIntake(
  outcome: ResourceSourceOutcome,
): outcome is NeedsIntake {
  return "needsIntake" in outcome && outcome.needsIntake === true;
}
