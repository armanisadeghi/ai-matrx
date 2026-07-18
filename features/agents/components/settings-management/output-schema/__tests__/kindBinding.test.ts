/**
 * kindBinding tests — picker eligibility filtering + written-schema fidelity.
 *
 * Fidelity is proven against the LIVE flashcard_set registry rows (fixture
 * pulled from content_ir.kind_definition / kind_edge): the envelope the
 * binder writes must carry flashcard_set's canonical emitted block schema
 * byte-for-byte in canonical (sorted-keys) JSON — the exact form aidream's
 * `schema_fingerprint` hashes, so every agent bound to the kind fingerprints
 * identically to the platform's published contract.
 */

import { reconstructKindRegistry } from "@/features/content-ir/registry/schema-source-kind-tables";
import {
  buildKindCatalog,
  catalogResolver,
  type KindCatalogEntry,
} from "@/features/content-ir/registry/kind-catalog";
import {
  buildKindFingerprintIndex,
  buildKindOutputSchema,
  canonicalJson,
  canonicalSchemaFingerprint,
  isKindBindable,
  listBindableKinds,
  matchKindForSchema,
  schemaPayloadOf,
} from "../kindBinding";
import {
  LIVE_DEFS,
  LIVE_EDGES,
  LIVE_EMITTED_BLOCK_SCHEMA,
} from "./fixtures/flashcard-set-live";

function liveCatalog(): {
  entries: KindCatalogEntry[];
  resolve: ReturnType<typeof catalogResolver>;
} {
  const { entries } = reconstructKindRegistry(LIVE_DEFS, LIVE_EDGES);
  const catalog = buildKindCatalog([], entries);
  return { entries: catalog, resolve: catalogResolver(catalog) };
}

function entry(overrides: Partial<KindCatalogEntry>): KindCatalogEntry {
  return {
    kind: "sample_kind",
    label: "Sample Kind",
    source: "content_ir",
    tier: null,
    dbRowId: "row-1",
    isActive: true,
    family: null,
    facets: {
      legacyBlockType: null,
      artifactCanvasType: null,
      hasToMarkdown: false,
      hasToLegacyServerData: false,
      hasComponent: false,
      persistStructured: false,
    },
    fields: { title: { type: "string", required: true } },
    referencedKinds: [],
    referencedBy: [],
    ...overrides,
  };
}

describe("isKindBindable / listBindableKinds", () => {
  it("includes ACTIVE display kinds with fields", () => {
    expect(isKindBindable(entry({}))).toBe(true);
  });

  it("excludes inactive display kinds (dual-gate verdict)", () => {
    expect(isKindBindable(entry({ isActive: false }))).toBe(false);
    expect(isKindBindable(entry({ isActive: null }))).toBe(false);
  });

  it("includes compiled-only system kinds without a DB row", () => {
    expect(
      isKindBindable(
        entry({ dbRowId: null, isActive: null, source: "system" }),
      ),
    ).toBe(true);
  });

  it("includes agent_io contract kinds regardless of display gating", () => {
    expect(isKindBindable(entry({ family: "agent_io", isActive: true }))).toBe(
      true,
    );
  });

  it("excludes tool_io / action_io / workflow_io machine contracts even when active", () => {
    for (const family of ["tool_io", "action_io", "workflow_io"]) {
      expect(isKindBindable(entry({ family, isActive: true }))).toBe(false);
    }
  });

  it("excludes schema-less scalar/passthrough kinds", () => {
    expect(isKindBindable(entry({ fields: {} }))).toBe(false);
  });

  it("listBindableKinds keeps only bindable entries", () => {
    const kinds = listBindableKinds([
      entry({ kind: "keep_active" }),
      entry({ kind: "drop_tool", family: "tool_io" }),
      entry({ kind: "drop_inactive", isActive: false }),
      entry({ kind: "keep_agent_io", family: "agent_io" }),
    ]).map((e) => e.kind);
    expect(kinds).toEqual(["keep_active", "keep_agent_io"]);
  });
});

describe("written-schema fidelity — flashcard_set (live fixture)", () => {
  it("writes flashcard_set's canonical emitted block schema byte-for-byte (canonical JSON)", () => {
    const { resolve } = liveCatalog();
    const built = buildKindOutputSchema("flashcard_set", resolve);
    expect(built).not.toBeNull();
    expect(built!.unresolved).toEqual([]);

    // Byte-equality in canonical (sorted-keys) form — the exact bytes
    // aidream's schema_fingerprint canonicalization hashes.
    expect(canonicalJson(built!.outputSchema.schema)).toBe(
      canonicalJson(LIVE_EMITTED_BLOCK_SCHEMA),
    );
    expect(canonicalSchemaFingerprint(built!.outputSchema.schema)).toBe(
      canonicalSchemaFingerprint(LIVE_EMITTED_BLOCK_SCHEMA),
    );
  });

  it("writes the education-agent envelope mechanism: {name, strict, schema}", () => {
    const { resolve } = liveCatalog();
    const built = buildKindOutputSchema("flashcard_set", resolve)!;
    expect(Object.keys(built.outputSchema)).toEqual([
      "name",
      "strict",
      "schema",
    ]);
    expect(built.outputSchema.name).toBe("flashcard_set");
    expect(built.outputSchema.strict).toBe(true);
  });

  it("is deterministic — two builds serialize to identical bytes", () => {
    const { resolve } = liveCatalog();
    const a = buildKindOutputSchema("flashcard_set", resolve)!;
    const b = buildKindOutputSchema("flashcard_set", resolve)!;
    expect(JSON.stringify(a.outputSchema)).toBe(JSON.stringify(b.outputSchema));
  });

  it("returns null for an unknown kind", () => {
    const { resolve } = liveCatalog();
    expect(buildKindOutputSchema("no_such_kind", resolve)).toBeNull();
  });
});

describe("matches-kind fingerprinting", () => {
  it("recognizes the bound envelope, including after key reordering (jsonb round trip)", () => {
    const { entries, resolve } = liveCatalog();
    const index = buildKindFingerprintIndex(entries, resolve);
    const built = buildKindOutputSchema("flashcard_set", resolve)!;

    const parsed = built.outputSchema as unknown as Record<string, unknown>;
    expect(matchKindForSchema(parsed, index)).toBe("flashcard_set");

    // Deep key-reorder clone (jsonb sorts keys) must still match.
    const reordered = JSON.parse(
      canonicalJson(parsed),
    ) as Record<string, unknown>;
    expect(matchKindForSchema(reordered, index)).toBe("flashcard_set");
  });

  it("reports drift: a hand-edited schema no longer matches", () => {
    const { entries, resolve } = liveCatalog();
    const index = buildKindFingerprintIndex(entries, resolve);
    const built = buildKindOutputSchema("flashcard_set", resolve)!;
    const edited = JSON.parse(
      JSON.stringify(built.outputSchema),
    ) as Record<string, unknown>;
    (edited.schema as Record<string, unknown>).required = ["__kind", "cards"];
    expect(matchKindForSchema(edited, index)).toBeNull();
  });

  it("ignores empty buffers", () => {
    expect(matchKindForSchema(null, new Map())).toBeNull();
    expect(matchKindForSchema({}, new Map())).toBeNull();
  });

  it("schemaPayloadOf unwraps the envelope like agent_output_contract does", () => {
    const inner = { type: "object" };
    expect(schemaPayloadOf({ name: "x", schema: inner })).toBe(inner);
    const bare = { type: "object", properties: {} };
    expect(schemaPayloadOf(bare)).toBe(bare);
  });
});
