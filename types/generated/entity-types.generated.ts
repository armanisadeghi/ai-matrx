// ─────────────────────────────────────────────────────────────────────────
// RE-EXPORT — the entity-type vocabulary now SHIPS IN `@ai-matrx/associations`
// (W5 swap, 2026-08-29). This file exists so the 57 existing import sites
// keep working; it carries NO data of its own.
//
// Source of truth: `platform.entity_types` (Supabase project brsgrqvjdzwihsvnfqkf),
// generated INSIDE the package (`aidream/apps/shared/associations`,
// `pnpm gen:entity-types` there) and released as a PATCH per the package's
// release contract. This repo consumes it at `latest` (THE LATEST LAW).
//
// Registry changed? Regenerate the PACKAGE and patch-release, then
// `pnpm up @ai-matrx/associations`. NEVER hand-edit, NEVER widen a callsite
// to a raw string to dodge a token that isn't in the installed vocabulary.
// Drift gate: `pnpm check:entity-types` diffs the INSTALLED package
// vocabulary against the live DB.
// ─────────────────────────────────────────────────────────────────────────

export {
  ENTITY_TYPE_METADATA,
  ENTITY_TYPE_TOKENS,
  SCHEMA_DISPLAY,
  REFERENCE_CATEGORY_DISPLAY,
  isEntityTypeToken,
} from "@ai-matrx/associations";
export type {
  EntityTypeMeta,
  EntityTypeToken,
  ReferencePickableEntityToken,
  ComponentEntityToken,
  ScopeableEntityToken,
  ListedEntityToken,
  ModuleEntityToken,
} from "@ai-matrx/associations";
