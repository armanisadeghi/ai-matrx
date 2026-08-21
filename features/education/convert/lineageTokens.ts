// features/education/convert/lineageTokens.ts
//
// The entity tokens the converter's source-lineage edges can name. Every pair
// (artifact token → anchor token) must exist in `platform.association_types`, or
// `assoc_add` refuses the edge with 23514 and the artifact ships with no
// traceable origin. Registered live by
// `migrations/edu_converter_lineage_association_pairs.sql`.
//
// Adding a generator that produces a NEW artifact token means adding it here AND
// registering its pairs in a migration — `__tests__/lineage-tokens.test.ts`
// fails the moment a generator names a token this list does not cover, which is
// exactly the drift that broke the notes / quiz / practice-test lanes.

/** Tokens the converter can CREATE (the edge source). */
export const CONVERT_ARTIFACT_TOKENS = [
  "fc_set",
  "study_media",
  "note",
  "assessment",
] as const;

/** Tokens a converted artifact can point BACK at (the edge target). */
export const CONVERT_ANCHOR_TOKENS = [
  "file",
  ...CONVERT_ARTIFACT_TOKENS,
] as const;

export type ConvertArtifactToken = (typeof CONVERT_ARTIFACT_TOKENS)[number];
