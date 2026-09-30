// features/flashcards/data/deckSourceSet.ts
//
// THE SOURCES A DECK WAS MADE FROM, EXACTLY AS THE PERSON CHOSE THEM.
//
// V2-F #2 (verify-2, 2026-09-28): a deck made from "Pages 65–68" of a PDF
// reopened in "Add more cards" holding the WHOLE 363k-character PDF, and the
// top-up made an off-topic card. The lineage edges (`recordSourceLineage`)
// name WHICH Sources a deck came from — the anchor file or record — but not
// the parts, the version (clean / raw) or the size limit the person picked,
// and they cannot: one anchor file can stand for several differently-narrowed
// pointers, and the edge's identity is the pair, not the choice.
//
// So the deck's generation record carries it: `fc_set.metadata.source_set` is
// the frozen v1 `SourceSet` (`@ai-matrx/agents/sources`) the deck — or its
// latest top-up — was generated from, and `metadata.source_names` is how each
// Source was named on its card (the file name, not a document's own title;
// its real kind). Written through the canonical guarded merge
// (`fcService.mergeSetMetadata`, which keeps every other key), read back by
// "Add more cards", which puts each Source in the input WITH its parts, form
// and limit. A deck written before this has no `source_set`; the top-up falls
// back to its lineage edges and says so.

import {
  createSourceRef,
  type SourceRef,
  type SourceSet,
} from "@ai-matrx/agents/sources";
import type { JsonObject } from "@ai-matrx/data/db";
import { sourceKey, type SourceDraft, type SourceKindId } from "@ai-matrx/agents/sources/runtime";
import { fcService } from "./fcService";

/** How one Source was shown on its card when the deck was made. */
export interface DeckSourceName {
  label: string;
  kind: SourceKindId;
  sourceKind?: string;
}

export const DECK_SOURCE_SET_KEY = "source_set";
export const DECK_SOURCE_NAMES_KEY = "source_names";

const KIND_BY_TYPE: Record<string, SourceKindId> = {
  file: "files",
  cld_file: "files",
  processed_document: "your_sources",
  note: "notes",
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isSourceRef(v: unknown): v is SourceRef {
  return isObject(v) && typeof v.resource_type === "string" && typeof v.resource_id === "string";
}

/** The metadata patch that records what a deck was made from. */
export function deckSourceSetPatch(
  sourceSet: SourceSet,
  names: Record<string, DeckSourceName>,
): JsonObject {
  return {
    [DECK_SOURCE_SET_KEY]: JSON.parse(JSON.stringify(sourceSet)) as JsonObject,
    [DECK_SOURCE_NAMES_KEY]: JSON.parse(JSON.stringify(names)) as JsonObject,
  };
}

/**
 * The deck's saved Sources as ready input drafts — each pointer exactly as it
 * was chosen (parts, form, limit). Null when the deck carries none.
 */
export function deckDraftsFromMetadata(metadata: unknown): SourceDraft[] | null {
  if (!isObject(metadata)) return null;
  const set = metadata[DECK_SOURCE_SET_KEY];
  if (!isObject(set) || !Array.isArray(set.sources)) return null;
  const names = isObject(metadata[DECK_SOURCE_NAMES_KEY])
    ? (metadata[DECK_SOURCE_NAMES_KEY] as Record<string, unknown>)
    : {};
  const drafts: SourceDraft[] = [];
  for (const raw of set.sources) {
    if (!isSourceRef(raw)) continue;
    const { resource_type, resource_id, ...choices } = raw;
    const ref = createSourceRef(resource_type, resource_id, choices);
    const name = names[sourceKey(ref)];
    const named = isObject(name) ? (name as Partial<DeckSourceName>) : {};
    const kind: SourceKindId =
      (typeof named.kind === "string" ? named.kind : undefined) ??
      KIND_BY_TYPE[resource_type] ??
      "records";
    drafts.push({
      kind,
      label:
        (typeof named.label === "string" && named.label.trim()) ||
        "Material this deck was made from",
      ref,
      ...(typeof named.sourceKind === "string" ? { sourceKind: named.sourceKind } : {}),
      ...(resource_type === "file" || resource_type === "cld_file" ? { fileId: resource_id } : {}),
      ...(resource_type === "processed_document" ? { processedDocumentId: resource_id } : {}),
    });
  }
  return drafts.length ? drafts : null;
}

/** Record on the deck what it (or its latest top-up) was made from. Loud on failure, never fatal. */
export async function saveDeckSourceSet(
  setId: string,
  sourceSet: SourceSet,
  names: Record<string, DeckSourceName>,
): Promise<string | null> {
  const patch = deckSourceSetPatch(sourceSet, names);
  const res = await fcService.mergeSetMetadata(setId, (current) => ({ ...current, ...patch }));
  if (res.error) {
    console.error("[flashcards/deckSourceSet] could not record the deck's Sources:", res.error);
    return res.error;
  }
  return null;
}

/** The deck's saved Sources, read from the deck itself. Null when none were recorded. */
export async function readDeckSourceDrafts(setId: string): Promise<SourceDraft[] | null> {
  const res = await fcService.getSet(setId);
  if (res.error || !res.data) return null;
  return deckDraftsFromMetadata(res.data.metadata);
}

/** How each picked card was named — the record `saveDeckSourceSet` keeps. */
export function sourceNamesOf(
  cards: ReadonlyArray<{ draft: SourceDraft }>,
): Record<string, DeckSourceName> {
  const names: Record<string, DeckSourceName> = {};
  for (const { draft } of cards) {
    if (!draft.ref) continue;
    names[sourceKey(draft.ref)] = {
      label: draft.label,
      kind: draft.kind,
      ...(draft.sourceKind ? { sourceKind: draft.sourceKind } : {}),
    };
  }
  return names;
}

/**
 * What "Add more cards" starts with: the deck's saved Sources exactly as
 * chosen when there are any; otherwise (a deck made before they were recorded)
 * its lineage origins, whole — and the caller says so.
 */
export function topUpSeed(
  saved: SourceDraft[] | null,
  fromLineage: SourceDraft[],
): { drafts: SourceDraft[]; wholeSourcesOnly: boolean } {
  if (saved?.length) return { drafts: saved, wholeSourcesOnly: false };
  return { drafts: fromLineage, wholeSourcesOnly: fromLineage.length > 0 };
}
