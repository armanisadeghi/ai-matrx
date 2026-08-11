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
  /** The catalog entry for a slug — `buildKindOutputSchema` binds entries, not slugs. */
  entryFor: (kind: string) => KindCatalogEntry | undefined;
} {
  const { entries } = reconstructKindRegistry(LIVE_DEFS, LIVE_EDGES);
  const catalog = buildKindCatalog([], entries);
  return {
    entries: catalog,
    resolve: catalogResolver(catalog),
    entryFor: (kind) => catalog.find((e) => e.kind === kind),
  };
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
    emittedJsonSchema: null,
    isContractArtifact: false,
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

  it("excludes compiled-only system kinds explicitly marked inactive", () => {
    expect(
      isKindBindable(
        entry({ dbRowId: null, isActive: false, source: "system" }),
      ),
    ).toBe(false);
  });

  it("excludes rowless non-system kinds even without an inactive verdict", () => {
    expect(
      isKindBindable(
        entry({ dbRowId: null, isActive: null, source: "content_ir" }),
      ),
    ).toBe(false);
  });

  it("includes ACTIVE agent_io contract kinds", () => {
    expect(isKindBindable(entry({ family: "agent_io", isActive: true }))).toBe(
      true,
    );
  });

  it("excludes agent_io contract kinds whose row is inactive (same is_active gate)", () => {
    expect(isKindBindable(entry({ family: "agent_io", isActive: false }))).toBe(
      false,
    );
    expect(isKindBindable(entry({ family: "agent_io", isActive: null }))).toBe(
      false,
    );
  });

  it("excludes tool_io / action_io / workflow_io machine contracts even when active", () => {
    for (const family of ["tool_io", "action_io", "workflow_io"]) {
      expect(isKindBindable(entry({ family, isActive: true }))).toBe(false);
    }
  });

  it("excludes schema-less scalar/passthrough kinds (no fields AND no stored schema)", () => {
    expect(isKindBindable(entry({ fields: {} }))).toBe(false);
    // An empty object is not a contract either.
    expect(
      isKindBindable(entry({ fields: {}, emittedJsonSchema: {} })),
    ).toBe(false);
    // Nor is a non-object value in the column.
    expect(
      isKindBindable(entry({ fields: {}, emittedJsonSchema: "nope" })),
    ).toBe(false);
  });

  // FOUND_DEFECTS D156: 140 active python-owned kinds carry a complete
  // `emitted_json_schema` and a NULL `data[]`, so `fields` is `{}`. Reading
  // only `fields` refused every one of them from the picker.
  it("includes python-owned kinds that have no fields but DO have a stored emitted_json_schema", () => {
    expect(
      isKindBindable(
        entry({
          fields: {},
          emittedJsonSchema: {
            type: "object",
            properties: { ideas: { type: "array", items: { type: "object" } } },
            required: ["ideas"],
          },
        }),
      ),
    ).toBe(true);
  });

  it("excludes machine-minted contract-artifact rows even though they now build", () => {
    // 665 of 838 active kinds are per-agent/tool I/O snapshots. They stayed out
    // of the picker only as a side effect of the old fields check; reading
    // `emitted_json_schema` makes them buildable, so the exclusion is explicit.
    expect(
      isKindBindable(
        entry({
          fields: {},
          family: "agent_io",
          isContractArtifact: true,
          emittedJsonSchema: { type: "object", properties: {} , required: [] },
        }),
      ),
    ).toBe(false);
    // A hand-authored agent_io row is NOT an artifact and stays bindable.
    expect(
      isKindBindable(entry({ family: "agent_io", isContractArtifact: false })),
    ).toBe(true);
  });

  it("a stored schema does NOT bypass the is_active gate or the excluded families", () => {
    const stored = { type: "object", properties: { a: { type: "string" } } };
    expect(
      isKindBindable(
        entry({ fields: {}, emittedJsonSchema: stored, isActive: false }),
      ),
    ).toBe(false);
    expect(
      isKindBindable(
        entry({ fields: {}, emittedJsonSchema: stored, family: "tool_io" }),
      ),
    ).toBe(false);
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
    const { resolve, entryFor } = liveCatalog();
    const built = buildKindOutputSchema(entryFor("flashcard_set")!, resolve);
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
    const { resolve, entryFor } = liveCatalog();
    const built = buildKindOutputSchema(entryFor("flashcard_set")!, resolve)!;
    expect(Object.keys(built.outputSchema)).toEqual([
      "name",
      "strict",
      "schema",
    ]);
    expect(built.outputSchema.name).toBe("flashcard_set");
    expect(built.outputSchema.strict).toBe(true);
  });

  it("is deterministic — two builds serialize to identical bytes", () => {
    const { resolve, entryFor } = liveCatalog();
    const a = buildKindOutputSchema(entryFor("flashcard_set")!, resolve)!;
    const b = buildKindOutputSchema(entryFor("flashcard_set")!, resolve)!;
    expect(JSON.stringify(a.outputSchema)).toBe(JSON.stringify(b.outputSchema));
  });

  it("returns null for an entry with neither fields nor a stored schema", () => {
    const { resolve } = liveCatalog();
    expect(
      buildKindOutputSchema(
        entry({ kind: "no_such_kind", fields: {}, emittedJsonSchema: null }),
        resolve,
      ),
    ).toBeNull();
  });

  // FOUND_DEFECTS D156 — the second source. Carried VERBATIM: converting the
  // stored schema to fields and re-exporting would flatten exactly the nesting
  // these kinds are made of.
  it("binds a fieldless python-owned kind to its STORED emitted_json_schema, byte-for-byte", () => {
    const { resolve } = liveCatalog();
    const stored = {
      type: "object",
      additionalProperties: false,
      required: ["ideas"],
      properties: {
        concept_summary: { type: "string" },
        ideas: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "hook"],
            properties: {
              title: { type: "string" },
              hook: { type: "string" },
              key_points: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    };
    const built = buildKindOutputSchema(
      entry({ kind: "topic_ideas", fields: {}, emittedJsonSchema: stored }),
      resolve,
    );
    expect(built).not.toBeNull();
    expect(built!.unresolved).toEqual([]);
    expect(Object.keys(built!.outputSchema)).toEqual([
      "name",
      "strict",
      "schema",
    ]);
    expect(built!.outputSchema.name).toBe("topic_ideas");
    expect(built!.outputSchema.strict).toBe(true);
    // VERBATIM — the nested `ideas` item object survives intact, and no
    // `__kind` discriminator is injected (the caller stamps the kind).
    expect(JSON.stringify(built!.outputSchema.schema)).toBe(
      JSON.stringify(stored),
    );
  });
});

describe("matches-kind fingerprinting", () => {
  it("recognizes the bound envelope, including after key reordering (jsonb round trip)", () => {
    const { entries, resolve, entryFor } = liveCatalog();
    const index = buildKindFingerprintIndex(entries, resolve);
    const built = buildKindOutputSchema(entryFor("flashcard_set")!, resolve)!;

    const parsed = built.outputSchema as unknown as Record<string, unknown>;
    expect(matchKindForSchema(parsed, index)).toBe("flashcard_set");

    // Deep key-reorder clone (jsonb sorts keys) must still match.
    const reordered = JSON.parse(
      canonicalJson(parsed),
    ) as Record<string, unknown>;
    expect(matchKindForSchema(reordered, index)).toBe("flashcard_set");
  });

  it("reports drift: a hand-edited schema no longer matches", () => {
    const { entries, resolve, entryFor } = liveCatalog();
    const index = buildKindFingerprintIndex(entries, resolve);
    const built = buildKindOutputSchema(entryFor("flashcard_set")!, resolve)!;
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
