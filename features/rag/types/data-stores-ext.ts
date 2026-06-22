/**
 * Enum-ish constants for the data-stores UI. Kept separate from
 * `types.ts` (which carries the canonical row shape) so additions here
 * don't churn that file's git blame.
 */

export const DATA_STORE_KINDS = [
  "general",
  "case",
  "project",
  "reference",
  "inbox",
  // Shared Knowledge Resources: a system-owned, read-only library store
  // (Matrx Library org) published to tenants by audience.
  "library",
] as const;

export type DataStoreKind = (typeof DATA_STORE_KINDS)[number];

export const SOURCE_KINDS = [
  "cld_file",
  "processed_document",
  "library_doc",
  "note",
  "code_file",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];
