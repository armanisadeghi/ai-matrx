// The bridge between the platform ENTITY REGISTRY (association tokens, the
// vocabulary the universal pickers speak — `note`, `file`, `udt_document`, …)
// and the ENVELOPE REFERENCE system (the `matrx` reference fence + resolver +
// ReferenceChip that already renders + resolves a reference to any entity).
//
// A context value that references an entity is stored as a reference-fence
// STRING (see referenceFence.ts) — the same canonical encoding picklists use —
// NOT the dead `value_reference_id/type` columns. This module is the one place
// that knows which entity tokens are reference-attachable and how a picked
// entity (token + id + label) becomes a fence.
//
// `data_store` is intentionally absent: a RAG data store is not a fence
// reference type; it stays on the dataset-feed path (feed_config.data_store_id).

import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";
import type { ReferenceType } from "@/features/matrx-envelope/envelope";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

// Entity token → envelope reference type. Only tokens whose entity the resolver
// (referenceResolvers.ts) can dereference appear here; that's what makes them
// safe to attach as a context value.
export const TOKEN_TO_REFERENCE_TYPE: Partial<
  Record<EntityTypeToken, ReferenceType>
> = {
  note: "note",
  file: "file",
  udt_document: "document",
  working_document: "document",
  workbook: "workbook",
  dataset: "table",
  agent: "agent",
  task: "task",
  project: "project",
  scope: "scope",
  scope_type: "scope_type",
  context_item: "context_item",
  transcript: "transcript",
  studio_session: "transcript_session",
};

// The tokens a "reference an entity" picker should offer — the keys above, as a
// stable array for the picker's `tokens` prop and for filtering search.
export const REFERENCE_ATTACHABLE_TOKENS = Object.keys(
  TOKEN_TO_REFERENCE_TYPE,
) as EntityTypeToken[];

export function tokenToReferenceType(
  token: string,
): ReferenceType | null {
  return TOKEN_TO_REFERENCE_TYPE[token as EntityTypeToken] ?? null;
}

// Build the canonical reference-fence string for a picked entity, or null when
// the token isn't reference-attachable. Record-type references share the flat
// `{ id, label? }` item shape (RecordRefItem); the resolver re-fetches the live
// value on read, so `label` is only an instant-paint hint.
export function buildEntityReferenceFence(args: {
  token: string;
  id: string;
  label?: string;
}): string | null {
  const type = tokenToReferenceType(args.token);
  if (!type || !args.id) return null;
  const item: { id: string; label?: string } = { id: args.id };
  if (args.label) item.label = args.label;
  return buildReferenceFence({ type, items: [item] });
}
