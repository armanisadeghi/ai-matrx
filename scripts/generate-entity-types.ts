/**
 * generate-entity-types.ts
 *
 * Pulls the live `platform.entity_types` registry (the SINGLE source of truth
 * for every first-class entity token in the app) and rewrites the generated
 * TypeScript vocabulary at `types/generated/entity-types.generated.ts`.
 *
 * Why this exists: 216+ entity tokens are FK-validated in the DB
 * (`platform.associations.source_type/target_type → platform.entity_types.token`)
 * but the app used to mirror only ~19 of them in a HAND-MAINTAINED union. Agents
 * (and humans) then guessed tokens, producing FK violations and silent
 * dangling edges. The DB is the source of truth; this generator makes the
 * full, exact token set type-safe in TS so a bad token is a COMPILE error.
 *
 * Workflow:
 *   1. Edit `platform.entity_types` (add/retire a token) via a migration.
 *   2. Run: pnpm gen:entity-types
 *   3. Commit the migration + the regenerated .generated.ts.
 *   `pnpm check:entity-types` screams in CI if the file drifts from the DB.
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY (sb_secret_*) — read-only access to the registry.
 *     — or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if the table is anon-readable.
 *
 * API keys: ONLY sb_publishable_* / sb_secret_*. The legacy JWT-based
 * SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY are DEPRECATED
 * and BANNED — do not reintroduce them (ESLint will block it).
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export const GENERATED_REL = "types/generated/entity-types.generated.ts";
const OUT_PATH = join(__dirname, "..", "types", "generated", "entity-types.generated.ts");

/** One row of `platform.entity_types` (the columns this generator consumes). */
export interface EntityTypeSourceRow {
  token: string;
  schema_name: string;
  table_name: string;
  label: string;
  base_tier: number;
  is_component: boolean;
  is_module: boolean;
  is_listed: boolean;
  default_scopeable: boolean;
  category: string | null;
  reference_pickable: boolean;
  title_column: string | null;
  content_role: string | null;
  reference_category: string | null;
}

export function loadSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchEntityTypes(): Promise<EntityTypeSourceRow[]> {
  const supabase = loadSupabase();
  if (!supabase) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY / " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }
  // The client has no direct grant on `platform.*`; read the registry through
  // the public SECURITY-DEFINER RPC (migrations/entity_types_list_rpc.sql).
  const { data, error } = await supabase.rpc("entity_types_list");
  if (error) {
    throw new Error(`Failed to read entity_types_list(): ${error.message}`);
  }
  const rows = (data ?? []) as EntityTypeSourceRow[];
  if (rows.length === 0) {
    throw new Error("platform.entity_types returned no active rows — aborting.");
  }
  // Deterministic order regardless of PG collation quirks.
  return [...rows].sort((a, b) => a.token.localeCompare(b.token, "en"));
}

/** One row of `platform.reference_categories` (admin-defined chooser buckets). */
export interface ReferenceCategorySourceRow {
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export async function fetchReferenceCategories(): Promise<ReferenceCategorySourceRow[]> {
  const supabase = loadSupabase();
  if (!supabase) throw new Error("Missing Supabase env (see fetchEntityTypes).");
  const { data, error } = await supabase.rpc("reference_categories_list");
  if (error) {
    throw new Error(`Failed to read reference_categories_list(): ${error.message}`);
  }
  const rows = (data ?? []) as ReferenceCategorySourceRow[];
  return [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug, "en"),
  );
}

/** One row of `platform.schemas` (pretty names for tier-1 schema buckets). */
export interface SchemaSourceRow {
  schema_name: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
}

export async function fetchSchemas(): Promise<SchemaSourceRow[]> {
  const supabase = loadSupabase();
  if (!supabase) throw new Error("Missing Supabase env (see fetchEntityTypes).");
  const { data, error } = await supabase.rpc("entity_schemas_list");
  if (error) {
    throw new Error(`Failed to read entity_schemas_list(): ${error.message}`);
  }
  const rows = (data ?? []) as SchemaSourceRow[];
  if (rows.length === 0) {
    throw new Error("platform.schemas returned no rows — aborting.");
  }
  return [...rows].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.schema_name.localeCompare(b.schema_name, "en"),
  );
}

const TS_STR = (s: string): string => JSON.stringify(s);

/** A union literal block (`| "a"\n  | "b"`) or `never` for an empty set. */
function unionLiteral(tokens: string[]): string {
  if (tokens.length === 0) return "  never;";
  return tokens.map((t) => `  | ${TS_STR(t)}`).join("\n") + ";";
}

/**
 * PURE transform: registry rows → the generated TS source string. Kept pure
 * (no DB, no fs) so `check:entity-types` can re-render and diff offline-style.
 */
export function renderGeneratedSource(
  rows: EntityTypeSourceRow[],
  schemas: SchemaSourceRow[] = [],
  referenceCategories: ReferenceCategorySourceRow[] = [],
): string {
  const tokens = rows.map((r) => r.token);
  const component = rows.filter((r) => r.is_component).map((r) => r.token);
  const scopeable = rows.filter((r) => r.default_scopeable).map((r) => r.token);
  const listed = rows.filter((r) => r.is_listed).map((r) => r.token);
  const modules = rows.filter((r) => r.is_module).map((r) => r.token);
  const referencePickable = rows
    .filter((r) => r.reference_pickable)
    .map((r) => r.token);

  const metaEntries = rows
    .map((r) => {
      const fields = [
        `token: ${TS_STR(r.token)}`,
        `schema: ${TS_STR(r.schema_name)}`,
        `table: ${TS_STR(r.table_name)}`,
        `label: ${TS_STR(r.label)}`,
        `baseTier: ${r.base_tier}`,
        `isComponent: ${r.is_component}`,
        `isModule: ${r.is_module}`,
        `isListed: ${r.is_listed}`,
        `scopeable: ${r.default_scopeable}`,
        `category: ${r.category === null ? "null" : TS_STR(r.category)}`,
        `referencePickable: ${r.reference_pickable}`,
        `titleColumn: ${r.title_column === null ? "null" : TS_STR(r.title_column)}`,
        `contentRole: ${r.content_role === null ? "null" : TS_STR(r.content_role)}`,
        `referenceCategory: ${r.reference_category === null ? "null" : TS_STR(r.reference_category)}`,
      ].join(", ");
      return `  ${TS_STR(r.token)}: { ${fields} },`;
    })
    .join("\n");

  const tokenArray = tokens.map((t) => `  ${TS_STR(t)},`).join("\n");

  const categoryEntries = referenceCategories
    .map(
      (c) =>
        `  ${TS_STR(c.slug)}: { label: ${TS_STR(c.label)}, sortOrder: ${c.sort_order}, isActive: ${c.is_active} },`,
    )
    .join("\n");

  const schemaEntries = schemas
    .map(
      (s) =>
        `  ${TS_STR(s.schema_name)}: { label: ${TS_STR(s.display_name)}, sortOrder: ${s.sort_order}, isActive: ${s.is_active} },`,
    )
    .join("\n");

  return `// ─────────────────────────────────────────────────────────────────────────
// AUTOGENERATED — DO NOT EDIT BY HAND.
//
// Source of truth: \`platform.entity_types\` (Supabase project txzxabzwovsujtloxrus).
// Regenerate:      pnpm gen:entity-types
// Verify drift:    pnpm check:entity-types
//
// ${tokens.length} active entity tokens. A token here is FK-valid for
// \`platform.associations.source_type\` / \`target_type\` and any other column
// referencing \`platform.entity_types.token\`. Add/retire tokens in the DB via a
// migration, then regenerate — NEVER hand-edit this file (the next generate
// overwrites it) and NEVER widen a callsite to a raw string to dodge a token
// that isn't here yet.
// ─────────────────────────────────────────────────────────────────────────

/** Metadata mirrored from one \`platform.entity_types\` row. */
export interface EntityTypeMeta {
  readonly token: EntityTypeToken;
  /** Postgres schema the backing table lives in. */
  readonly schema: string;
  /** Backing table name. */
  readonly table: string;
  /** Human label from the registry. */
  readonly label: string;
  readonly baseTier: number;
  /** A child/detail row (not a standalone first-class entity). */
  readonly isComponent: boolean;
  readonly isModule: boolean;
  readonly isListed: boolean;
  /** Whether the registry marks this type scopeable by default. */
  readonly scopeable: boolean;
  readonly category: string | null;
  /** Offered as an allowed type for reference context items. */
  readonly referencePickable: boolean;
  /** Human title column for generic candidate pickers (null = not generically listable). */
  readonly titleColumn: string | null;
  /** Knowledge-model bucket: utility | source | destination | hybrid | container. */
  readonly contentRole: string | null;
  /** Admin-assigned chooser bucket (platform.reference_categories.slug); null = bucket by schema. */
  readonly referenceCategory: string | null;
}

/**
 * EVERY registered entity token (the FK-valid set). Use this for any
 * \`source_type\` / \`target_type\` argument so an invalid token is a COMPILE error.
 */
export type EntityTypeToken =
${unionLiteral(tokens)}

/** Tokens flagged \`reference_pickable\` — offered in reference "Allowed types" choosers. */
export type ReferencePickableEntityToken =
${unionLiteral(referencePickable)}

/** Tokens flagged \`is_component\` — child/detail rows, not standalone entities. */
export type ComponentEntityToken =
${unionLiteral(component)}

/** Tokens flagged \`default_scopeable\` — can carry scope tags by default. */
export type ScopeableEntityToken =
${unionLiteral(scopeable)}

/** Tokens flagged \`is_listed\` — surfaced in list/nav UIs. */
export type ListedEntityToken =
${unionLiteral(listed)}

/** Tokens flagged \`is_module\`. */
export type ModuleEntityToken =
${unionLiteral(modules)}

/** Full registry metadata, keyed by token. */
export const ENTITY_TYPE_METADATA = {
${metaEntries}
} as const satisfies Record<EntityTypeToken, EntityTypeMeta>;

/** Every token, sorted — the iteration/validation source. */
export const ENTITY_TYPE_TOKENS: readonly EntityTypeToken[] = [
${tokenArray}
];

/**
 * Pretty display metadata for DB schemas, mirrored from \`platform.schemas\`
 * (admin-writable via \`admin_upsert_schema\`). Tier-1 buckets for reference
 * type choosers and admin surfaces.
 */
export const SCHEMA_DISPLAY: Record<
  string,
  { readonly label: string; readonly sortOrder: number; readonly isActive: boolean }
> = {
${schemaEntries}
};

/**
 * Admin-defined reference chooser buckets, mirrored from
 * \`platform.reference_categories\` (\`admin_upsert_reference_category\`).
 * An entity type's \`referenceCategory\` points here; unassigned types
 * bucket by schema via \`SCHEMA_DISPLAY\`.
 */
export const REFERENCE_CATEGORY_DISPLAY: Record<
  string,
  { readonly label: string; readonly sortOrder: number; readonly isActive: boolean }
> = {
${categoryEntries}
};

const ENTITY_TYPE_TOKEN_SET: ReadonlySet<string> = new Set(ENTITY_TYPE_TOKENS);

/** Runtime guard: is \`value\` a registered entity token? Narrows to the union. */
export function isEntityTypeToken(value: unknown): value is EntityTypeToken {
  return typeof value === "string" && ENTITY_TYPE_TOKEN_SET.has(value);
}
`;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const rows = await fetchEntityTypes();
  const schemas = await fetchSchemas();
  const referenceCategories = await fetchReferenceCategories();
  const source = renderGeneratedSource(rows, schemas, referenceCategories);

  if (check) {
    const { readFileSync, existsSync } = await import("node:fs");
    if (!existsSync(OUT_PATH)) {
      console.error(`\n  ✗ ${GENERATED_REL} is missing. Run: pnpm gen:entity-types\n`);
      process.exit(1);
    }
    const current = readFileSync(OUT_PATH, "utf8");
    if (current !== source) {
      console.error(
        `\n  ✗ ${GENERATED_REL} is OUT OF SYNC with platform.entity_types ` +
          `(${rows.length} live tokens).\n    Run: pnpm gen:entity-types, then commit.\n`,
      );
      process.exit(1);
    }
    console.log(`  ✓ ${GENERATED_REL} matches the live registry (${rows.length} tokens).`);
    return;
  }

  writeFileSync(OUT_PATH, source, "utf8");
  console.log(`  ✓ Wrote ${rows.length} entity tokens to ${GENERATED_REL}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
