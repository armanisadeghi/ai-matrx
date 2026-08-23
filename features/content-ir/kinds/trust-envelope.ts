/**
 * `trust_envelope` (+ child `citation`) — the COMPILED MIRROR of two kinds
 * that are already registered in `content_ir.kind_definition` (python-owned,
 * active, system org). This module registers NO new shape: it makes the two
 * existing registry slugs resolvable to the compiled converters so any
 * ts-owned kind can REFERENCE them (`{type:"object", kind:"trust_envelope"}`)
 * instead of inlining a second copy of the grounding shape.
 *
 * WHY A COMPILED MIRROR IS NEEDED. Both rows carry a complete
 * `emitted_json_schema` but a NULL `data[]` (the unflattened-object-contract
 * case documented in docs/SHAPE_SYSTEM.md), so `schema-source-kind-tables`
 * supplies no parser `KindSchema` for them. Without a compiled floor,
 * `kindSchemaToJsonSchema` cannot resolve a `$ref` to them and emits a
 * permissive stub — the exact dangling-ref failure mode that makes
 * `shape:reemit-discriminator` refuse a row (study_pack_set /
 * `flashcard_set_beta`). The field lists below are transcribed from the LIVE
 * rows (verified 2026-08-22) — they are a mirror, never a second definition.
 * The DB row stays the authority; if the two ever disagree, fix this file.
 *
 * TYPE PARITY is with `features/education/trust/types.ts` (`TrustEnvelope` /
 * `SourceCitation`), which is the canonical TypeScript contract. The durable
 * pointer fields that type carries (`fileId` / `documentId` / `url` / `page`)
 * are deliberately ABSENT here: they are populated by the persisting surface
 * from ids the agent does not have, so they are never part of the wire shape
 * an agent emits. Do not add them to the kind.
 *
 * Nested-only children: neither kind renders on its own — a trust envelope is
 * always read through its parent's component (`CardTrustFooter`,
 * `ConfidenceBadge`, `SourceCitations` in `features/education/trust/`), so
 * neither declares a `legacyBlockType`, bridge, or markdown facet.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

/** The eight source classes a citation can point at (mirrors CitationSourceKind). */
const CITATION_SOURCE_KINDS = [
  "document",
  "chunk",
  "section",
  "file",
  "url",
  "scope",
  "transcript",
  "web",
];

export const citationKindSchema: KindSchema = {
  kind: "citation",
  fields: {
    sourceId: {
      type: "string",
      required: true,
      description: "Stable identifier of the cited source.",
    },
    sourceKind: {
      type: "enum",
      values: CITATION_SOURCE_KINDS,
      required: true,
      description: "What kind of source this citation points at.",
    },
    locator: {
      type: "string",
      nullable: true,
      description: "Position within the source (page, timestamp, heading).",
    },
    excerpt: {
      type: "string",
      nullable: true,
      description: "Short verbatim quote supporting the claim.",
    },
    title: {
      type: "string",
      nullable: true,
      description: "Human-readable source title.",
    },
  },
};

export const trustEnvelopeKindSchema: KindSchema = {
  kind: "trust_envelope",
  fields: {
    confidence: {
      type: "enum",
      values: ["grounded", "inferred", "not_in_material"],
      required: true,
      description:
        "How well the claim is supported by the provided material.",
    },
    groundedIn: {
      type: "string",
      nullable: true,
      description:
        "Human-readable description of the material the answer is grounded in.",
    },
    citations: {
      type: "array",
      itemKinds: ["citation"],
      description: "Supporting citations.",
    },
  },
};

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const TRUST_ENVELOPE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "trust_envelope",
    schemaSource: "system",
    tier: "eager",
    schema: trustEnvelopeKindSchema,
  },
  {
    kind: "citation",
    schemaSource: "system",
    tier: "eager",
    schema: citationKindSchema,
  },
];
