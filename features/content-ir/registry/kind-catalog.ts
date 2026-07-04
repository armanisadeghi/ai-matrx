/**
 * Kind catalog — READ-ONLY helpers over the registry + flexible_data for
 * browse/inspect surfaces (the /administration/kind-registry admin page).
 * Merges the live registry definitions (compiled system kinds + any
 * runtime-registered facets) with the flexible_data Block Schemas rows and
 * computes the reference graph (uses / used-by) across the whole catalog.
 *
 * Pure computation lives in `buildKindCatalog` (jest-testable, no network);
 * `listAllKinds` is the async assembler.
 */

import type { FieldSchema, KindSchema } from "../core/kind-schema.types";
import { formatBlockLabel } from "../core/schema-structure";
import { collectReferencedKinds } from "../convert/kind-to-json-schema";
import {
  BLOCK_SCHEMAS_CATEGORY_ID,
  listBlockSchemas,
  type BlockSchemaEntry,
} from "./schema-source-flexible-data";
// ORDER MATTERS: kind-registry must load BEFORE system-kinds here. The
// system-kinds module chain (kinds/* bridges → region-envelope-memo) imports
// kind-registry, whose module-scope `new KindRegistry(SYSTEM_KIND_DEFINITIONS)`
// crashes if system-kinds is the mid-initialization entry of the cycle.
import { kindRegistry } from "./kind-registry";
import { SYSTEM_KIND_DEFINITIONS } from "./system-kinds";
import type { KindDefinition, KindTier } from "./kind-registry.types";

export type KindCatalogSource = "system" | "flexible_data" | "both";

export type KindCatalogFacets = {
  /** Facade → BlockComponentRegistry type string (legacy bridge). */
  legacyBlockType: string | null;
  /** Facade → artifact-type-registry canvasType. */
  artifactCanvasType: string | null;
  hasToMarkdown: boolean;
  hasToLegacyServerData: boolean;
  hasComponent: boolean;
  persistStructured: boolean;
};

export type KindCatalogEntry = {
  kind: string;
  label: string;
  source: KindCatalogSource;
  /** Registry loading tier; null when the kind is a DB row the registry has not loaded. */
  tier: KindTier | null;
  /** flexible_data row id when a Block Schemas row exists for this slug. */
  flexibleDataId: string | null;
  facets: KindCatalogFacets;
  fields: Record<string, FieldSchema>;
  /** Kinds this kind references (object refs + array itemKinds, transitive through inline_objects — one level). */
  referencedKinds: string[];
  /** Reverse index computed across the catalog: kinds whose fields reference this one. */
  referencedBy: string[];
};

const COMPILED_SLUGS: ReadonlySet<string> = new Set(
  SYSTEM_KIND_DEFINITIONS.map((def) => def.kind),
);

function facetsOf(def: KindDefinition): KindCatalogFacets {
  return {
    legacyBlockType: def.legacyBlockType ?? null,
    artifactCanvasType: def.artifact?.canvasType ?? null,
    hasToMarkdown: typeof def.toMarkdown === "function",
    hasToLegacyServerData: typeof def.toLegacyServerData === "function",
    hasComponent: def.component != null,
    persistStructured: def.persistence?.persistStructured === true,
  };
}

function emptyFacets(): KindCatalogFacets {
  return {
    legacyBlockType: null,
    artifactCanvasType: null,
    hasToMarkdown: false,
    hasToLegacyServerData: false,
    hasComponent: false,
    persistStructured: false,
  };
}

/**
 * Pure merge: registry definitions + flexible_data Block Schemas rows →
 * sorted catalog with the uses / used-by reference graph. DB fields override
 * compiled fields (same precedence as the registry's warm load); compiled
 * facets always survive.
 */
export function buildKindCatalog(
  defs: KindDefinition[],
  dbEntries: BlockSchemaEntry[],
  compiledSlugs: ReadonlySet<string> = COMPILED_SLUGS,
): KindCatalogEntry[] {
  const byKind = new Map<string, KindCatalogEntry>();

  for (const def of defs) {
    byKind.set(def.kind, {
      kind: def.kind,
      label: formatBlockLabel(def.kind),
      source: compiledSlugs.has(def.kind) ? "system" : "flexible_data",
      tier: def.tier,
      flexibleDataId: null,
      facets: facetsOf(def),
      fields: def.schema?.fields ?? {},
      referencedKinds: [],
      referencedBy: [],
    });
  }

  for (const entry of dbEntries) {
    const existing = byKind.get(entry.slug);
    if (existing) {
      existing.source = compiledSlugs.has(entry.slug)
        ? "both"
        : "flexible_data";
      existing.label = entry.label;
      existing.flexibleDataId = entry.id;
      // DB rows are the schema source of truth (registry warm precedence).
      existing.fields = entry.fields;
    } else {
      byKind.set(entry.slug, {
        kind: entry.slug,
        label: entry.label,
        source: "flexible_data",
        tier: null,
        flexibleDataId: entry.id,
        facets: emptyFacets(),
        fields: entry.fields,
        referencedKinds: [],
        referencedBy: [],
      });
    }
  }

  const entries = [...byKind.values()].sort((a, b) =>
    a.kind.localeCompare(b.kind),
  );

  const referencedBy = new Map<string, string[]>();
  for (const entry of entries) {
    entry.referencedKinds = collectReferencedKinds(entry.fields);
    for (const child of entry.referencedKinds) {
      const parents = referencedBy.get(child) ?? [];
      parents.push(entry.kind);
      referencedBy.set(child, parents);
    }
  }
  for (const entry of entries) {
    entry.referencedBy = referencedBy.get(entry.kind) ?? [];
  }

  return entries;
}

/**
 * Every kind the platform knows: live registry definitions merged with the
 * flexible_data Block Schemas rows. One list fetch; throws FlexibleDataError
 * when the DB is unreachable (callers may fall back to listCompiledKinds).
 */
export async function listAllKinds(): Promise<KindCatalogEntry[]> {
  const { entries } = await listBlockSchemas(BLOCK_SCHEMAS_CATEGORY_ID);
  return buildKindCatalog(kindRegistry.listDefinitions(), entries);
}

/** Offline / DB-failure fallback — registry definitions only, no network. */
export function listCompiledKinds(): KindCatalogEntry[] {
  return buildKindCatalog(kindRegistry.listDefinitions(), []);
}

/**
 * Schema resolver over a catalog snapshot — feed to kindSchemaToJsonSchema
 * so child kinds resolve into $defs from the same data the UI displays.
 */
export function catalogResolver(
  entries: KindCatalogEntry[],
): (kind: string) => KindSchema | undefined {
  const byKind = new Map(entries.map((entry) => [entry.kind, entry]));
  return (kind) => {
    const entry = byKind.get(kind);
    return entry ? { kind: entry.kind, fields: entry.fields } : undefined;
  };
}
