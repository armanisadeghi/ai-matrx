/**
 * resource_collection kind family — the fleet-standard three-leg proof:
 *
 *   1. STRUCTURAL — the exact kind_example payloads shipped by
 *      migrations/kind_resource_collection_full.sql pass the REAL dual-gate
 *      structural leg (ajv Draft 2020-12, __kind-stripped) against the REAL
 *      converter-emitted schema (kindSchemaToJsonSchema over the schemas in
 *      kinds/resource-collection.ts — never a stored copy), and the storage
 *      transform emits the exact data[]/edges the migration wrote.
 *   2. RENDER — the legacy bridge derives serverData that the REAL parser
 *      module's own validator (validateResourceCollection) accepts, with the
 *      component's tolerances (id synthesis, description fallback, type
 *      default) and zero data loss.
 *   3. SURFACE — the `resources_legacy_text` strategy converges a REAL
 *      `<resources>` wire sample (the grammar the live render-block-resources
 *      skill teaches) to the canonical kind value, identically for both host
 *      framings, and declines prose loudly-by-null.
 */

import { validateResourceCollection } from "@/components/mardown-display/blocks/resources/parseResourcesMarkdown";
import { KIND_KEY } from "../core/kind-schema.types";
import { envelopeFromCompleteValue } from "../core/normalize";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { kindSchemaToStorage } from "../registry/kind-storage-transform";
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import {
  RESOURCE_COLLECTION_KIND_SCHEMAS,
  RESOURCE_COLLECTION_KIND_DEFINITIONS,
  resourcesServerDataFromEnvelope,
  resourcesMarkdownFromValue,
} from "../kinds/resource-collection";
import { resourcesLegacyTextToKindValue } from "../surfaces/resources-legacy-text";

const resolve = (kind: string) => RESOURCE_COLLECTION_KIND_SCHEMAS[kind];

/** The exact example payloads the migration seeded into kind_example. */
const CANONICAL_COLLECTION: Record<string, unknown> = {
  __kind: "resource_collection",
  title: "TypeScript Learning Path",
  description:
    "Everything you need to go from JavaScript to confident TypeScript.",
  categories: [
    {
      __kind: "resource_category",
      name: "Official Documentation",
      resources: [
        {
          __kind: "resource_item",
          title: "TypeScript Handbook",
          url: "https://www.typescriptlang.org/docs/",
          description: "The canonical reference, from basics to advanced types.",
          type: "documentation",
          difficulty: "beginner",
          rating: 5,
        },
        {
          __kind: "resource_item",
          title: "TypeScript Playground",
          url: "https://www.typescriptlang.org/play",
          description: "Experiment with types directly in the browser.",
          type: "tool",
          difficulty: "beginner",
          rating: 5,
        },
      ],
    },
    {
      __kind: "resource_category",
      name: "Practice",
      description: "Hands-on exercises to cement the concepts.",
      resources: [
        {
          __kind: "resource_item",
          title: "Type Challenges",
          url: "https://github.com/type-challenges/type-challenges",
          description: "Solve real type-level puzzles of increasing difficulty.",
          type: "tutorial",
          duration: "20 hours",
          difficulty: "advanced",
          rating: 5,
          tags: ["free", "community"],
        },
      ],
    },
  ],
};

const FULL_COLLECTION: Record<string, unknown> = {
  __kind: "resource_collection",
  title: "Machine Learning Starter Kit",
  description: "A guided path from zero to training your first model.",
  categories: [
    {
      __kind: "resource_category",
      id: "category-1",
      name: "Foundations",
      description: "Core concepts before any code.",
      resources: [
        {
          __kind: "resource_item",
          id: "resource-1",
          title: "StatQuest: Machine Learning",
          url: "https://www.youtube.com/playlist?list=PLblh5JKOoLUICTaGLRoHQDuF_7q2GfuJF",
          description: "Short visual explanations of every core ML idea.",
          type: "video",
          duration: "12 hours",
          difficulty: "beginner",
          rating: 5,
          tags: ["free", "video-course"],
          isFavorite: true,
          isCompleted: false,
        },
        {
          __kind: "resource_item",
          id: "resource-2",
          title: "An Introduction to Statistical Learning",
          url: "https://www.statlearning.com/",
          description: "The classic free textbook with R and Python labs.",
          type: "book",
          duration: "40 hours",
          difficulty: "intermediate",
          rating: 4,
          tags: ["free", "textbook"],
          isFavorite: false,
          isCompleted: true,
        },
      ],
    },
    {
      __kind: "resource_category",
      id: "category-2",
      name: "Hands-on",
      resources: [
        {
          __kind: "resource_item",
          id: "resource-3",
          title: "Kaggle Learn",
          url: "https://www.kaggle.com/learn",
          description: "Bite-size interactive courses with instant feedback.",
          type: "course",
          duration: "4 hours",
          difficulty: "beginner",
          rating: 4,
          tags: ["free", "interactive"],
        },
        {
          __kind: "resource_item",
          id: "resource-4",
          title: "scikit-learn User Guide",
          url: "https://scikit-learn.org/stable/user_guide.html",
          description: "The reference for the library you will actually use.",
          type: "documentation",
          difficulty: "intermediate",
          rating: 5,
        },
      ],
    },
  ],
};

const CANONICAL_CATEGORY: Record<string, unknown> = {
  __kind: "resource_category",
  id: "category-1",
  name: "Official Documentation",
  description: "Primary references straight from the source.",
  resources: [
    {
      __kind: "resource_item",
      id: "resource-1",
      title: "React Documentation",
      url: "https://react.dev/",
      description: "The modern React docs with interactive examples.",
      type: "documentation",
      difficulty: "beginner",
      rating: 5,
    },
  ],
};

const CANONICAL_ITEM: Record<string, unknown> = {
  __kind: "resource_item",
  id: "resource-1",
  title: "Rust in 100 Minutes",
  url: "https://www.youtube.com/watch?v=example",
  description: "A fast visual introduction to the whole language.",
  type: "video",
  duration: "100 min",
  difficulty: "beginner",
  rating: 5,
  tags: ["free"],
  isFavorite: false,
  isCompleted: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("resource_collection — structural leg (migration examples vs emitted schema)", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["resource_collection", CANONICAL_COLLECTION],
    ["resource_collection", FULL_COLLECTION],
    ["resource_category", CANONICAL_CATEGORY],
    ["resource_item", CANONICAL_ITEM],
  ];

  it.each(cases)("%s example passes ajv over the emitted schema", (kind, sample) => {
    const exported = kindSchemaToJsonSchema(kind, resolve, {
      strict: true,
      injectKind: false,
    });
    expect(exported).not.toBeNull();
    expect(exported?.unresolved).toEqual([]);

    const leg = validateStructuralLeg(sample, exported?.schema);
    expect(leg).toEqual({ ok: true });
  });

  it("rejects a schema-invalid payload (url missing) — the gate has teeth", () => {
    const exported = kindSchemaToJsonSchema("resource_item", resolve, {
      strict: true,
      injectKind: false,
    });
    const leg = validateStructuralLeg(
      { __kind: "resource_item", title: "No URL" },
      exported?.schema,
    );
    expect(leg.ok).toBe(false);
  });

  it("storage transform emits the exact data[]/edges the migration wrote", () => {
    const collection = kindSchemaToStorage(
      RESOURCE_COLLECTION_KIND_SCHEMAS.resource_collection,
    );
    expect(collection.data.map((f) => f.name)).toEqual([
      "title",
      "description",
      "categories",
    ]);
    expect(collection.edges).toEqual([
      { fieldPath: "categories", childKind: "resource_category", position: 0 },
    ]);

    const category = kindSchemaToStorage(
      RESOURCE_COLLECTION_KIND_SCHEMAS.resource_category,
    );
    expect(category.edges).toEqual([
      { fieldPath: "resources", childKind: "resource_item", position: 0 },
    ]);

    const item = kindSchemaToStorage(
      RESOURCE_COLLECTION_KIND_SCHEMAS.resource_item,
    );
    expect(item.edges).toEqual([]);
    expect(item.data.map((f) => f.name)).toEqual([
      "id",
      "title",
      "url",
      "description",
      "type",
      "duration",
      "difficulty",
      "rating",
      "tags",
      "isFavorite",
      "isCompleted",
    ]);
  });

  it("the compiled definitions expose the bridge + facades for registration", () => {
    const root = RESOURCE_COLLECTION_KIND_DEFINITIONS.find(
      (definition) => definition.kind === "resource_collection",
    );
    expect(root?.legacyBlockType).toBe("resources");
    expect(root?.artifact?.canvasType).toBe("resources");
    expect(root?.toLegacyServerData).toBe(resourcesServerDataFromEnvelope);
    expect(
      RESOURCE_COLLECTION_KIND_DEFINITIONS.map((definition) => definition.kind),
    ).toEqual(["resource_collection", "resource_category", "resource_item"]);
  });
});

describe("resource_collection — render leg (bridge serverData accepted by the real parser module)", () => {
  it.each([
    ["canonical", CANONICAL_COLLECTION],
    ["full", FULL_COLLECTION],
  ])("%s example bridges to serverData validateResourceCollection accepts", (_label, sample) => {
    const envelope = envelopeFromCompleteValue(sample, "resource_collection");
    const serverData = resourcesServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");

    // The REAL validator from the component's own parser module.
    expect(
      validateResourceCollection(
        serverData as unknown as Parameters<typeof validateResourceCollection>[0],
      ),
    ).toBe(true);

    // No __kind leaks into the component payload.
    expect(JSON.stringify(serverData)).not.toContain(KIND_KEY);
  });

  it("synthesizes ids, defaults type, and falls description back to title", () => {
    const envelope = envelopeFromCompleteValue(
      {
        __kind: "resource_collection",
        title: "Minimal",
        categories: [
          {
            __kind: "resource_category",
            name: "Links",
            resources: [
              {
                __kind: "resource_item",
                title: "Example",
                url: "https://example.com",
              },
            ],
          },
        ],
      },
      "resource_collection",
    );
    const serverData = resourcesServerDataFromEnvelope(envelope);
    const categories = serverData?.categories;
    if (!Array.isArray(categories) || !isRecord(categories[0])) {
      throw new Error("bridge produced no categories");
    }
    expect(categories[0].id).toBe("category-1");
    const resources = categories[0].resources;
    if (!Array.isArray(resources) || !isRecord(resources[0])) {
      throw new Error("bridge produced no resources");
    }
    expect(resources[0]).toMatchObject({
      id: "resource-1",
      title: "Example",
      url: "https://example.com",
      description: "Example",
      type: "other",
    });
  });

  it("zero data loss: unknown keys ride along at every level", () => {
    const envelope = envelopeFromCompleteValue(
      {
        __kind: "resource_collection",
        title: "Extras",
        audience: "engineers",
        categories: [
          {
            __kind: "resource_category",
            name: "Links",
            curator: "Ada",
            resources: [
              {
                __kind: "resource_item",
                title: "Example",
                url: "https://example.com",
                publisher: "Example Press",
              },
            ],
          },
        ],
      },
      "resource_collection",
    );
    const serverData = resourcesServerDataFromEnvelope(envelope);
    expect(serverData?.audience).toBe("engineers");
    const categories = serverData?.categories;
    if (!Array.isArray(categories) || !isRecord(categories[0])) {
      throw new Error("bridge produced no categories");
    }
    expect(categories[0].curator).toBe("Ada");
    const resources = categories[0].resources;
    if (!Array.isArray(resources) || !isRecord(resources[0])) {
      throw new Error("bridge produced no resources");
    }
    expect(resources[0].publisher).toBe("Example Press");
  });

  it("declines incomplete envelopes and unrenderable payloads", () => {
    // Complete-only law: a streaming envelope never reaches the component.
    const streaming = {
      ...envelopeFromCompleteValue(CANONICAL_COLLECTION, "resource_collection"),
    };
    const streamingEnvelope = {
      ...streaming,
      root: { ...streaming.root, status: "streaming" as const },
    };
    expect(resourcesServerDataFromEnvelope(streamingEnvelope)).toBeUndefined();

    // Missing title / empty categories → decline (raw view takes over).
    expect(
      resourcesServerDataFromEnvelope(
        envelopeFromCompleteValue(
          { __kind: "resource_collection", categories: [] },
          "resource_collection",
        ),
      ),
    ).toBeUndefined();

    // Items without title+url drop; a category left empty drops; all dropped
    // → the whole bridge declines.
    expect(
      resourcesServerDataFromEnvelope(
        envelopeFromCompleteValue(
          {
            __kind: "resource_collection",
            title: "Broken",
            categories: [
              {
                __kind: "resource_category",
                name: "Links",
                resources: [{ __kind: "resource_item", title: "No URL" }],
              },
            ],
          },
          "resource_collection",
        ),
      ),
    ).toBeUndefined();
  });
});

describe("resource_collection — resources_legacy_text strategy (REAL <resources> wire sample)", () => {
  // The exact grammar the live render-block-resources skill teaches.
  const WIRE_INNER = [
    "### TypeScript Learning Path",
    "Everything you need to go from JavaScript to confident TypeScript.",
    "",
    "**Official Docs**",
    "- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - The canonical reference [documentation] {beginner} *5*",
    "",
    "**Practice**",
    "- [Type Challenges](https://github.com/type-challenges/type-challenges) - Solve real type puzzles (20 hours) [tool] {advanced} *5* #free",
  ].join("\n");

  const WIRE_FRAMED = `<resources>\n${WIRE_INNER}\n</resources>`;

  it("converges the framed (accumulator) sample to the canonical kind value", () => {
    const value = resourcesLegacyTextToKindValue(WIRE_FRAMED);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    expect(value[KIND_KEY]).toBe("resource_collection");
    expect(value.title).toBe("TypeScript Learning Path");
    expect(value.description).toBe(
      "Everything you need to go from JavaScript to confident TypeScript.",
    );

    const categories = value.categories;
    if (!Array.isArray(categories)) throw new Error("no categories");
    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({
      [KIND_KEY]: "resource_category",
      id: "category-1",
      name: "Official Docs",
    });

    const practice = categories[1];
    if (!isRecord(practice) || !Array.isArray(practice.resources)) {
      throw new Error("no practice resources");
    }
    expect(practice.resources[0]).toEqual({
      [KIND_KEY]: "resource_item",
      id: "resource-2",
      title: "Type Challenges",
      url: "https://github.com/type-challenges/type-challenges",
      description: "Solve real type puzzles",
      type: "tool",
      duration: "20 hours",
      difficulty: "advanced",
      rating: 5,
      tags: ["free"],
    });
  });

  it("both host framings (tag-framed and inner-only) yield identical values", () => {
    expect(resourcesLegacyTextToKindValue(WIRE_FRAMED)).toEqual(
      resourcesLegacyTextToKindValue(WIRE_INNER),
    );
  });

  it("the converged value passes the structural leg AND bridges to the real component payload", () => {
    const value = resourcesLegacyTextToKindValue(WIRE_FRAMED);
    if (!value) throw new Error("strategy declined a valid wire sample");

    // THE KEYSTONE: the XML arrival is schema-valid canonical __kind JSON…
    const exported = kindSchemaToJsonSchema("resource_collection", resolve, {
      strict: true,
      injectKind: false,
    });
    expect(validateStructuralLeg(value, exported?.schema)).toEqual({ ok: true });

    // …and routes through the SAME bridge a JSON arrival takes.
    const serverData = resourcesServerDataFromEnvelope(
      envelopeFromCompleteValue(value, "resource_collection"),
    );
    expect(serverData).toBeDefined();
    if (!serverData) throw new Error("unreachable");
    expect(
      validateResourceCollection(
        serverData as unknown as Parameters<typeof validateResourceCollection>[0],
      ),
    ).toBe(true);
  });

  it("declines a region with no resource lines (loud null — legacy rendering stands)", () => {
    expect(
      resourcesLegacyTextToKindValue(
        "<resources>\nJust prose, no links here.\n</resources>",
      ),
    ).toBeNull();
  });
});

describe("resource_collection — toMarkdown facet", () => {
  it("renders the legacy-grammar markdown and loses nothing", () => {
    const markdown = resourcesMarkdownFromValue({
      ...CANONICAL_COLLECTION,
      publisher: "Matrx",
    });
    expect(markdown).toContain("### TypeScript Learning Path");
    expect(markdown).toContain("**Official Documentation**");
    expect(markdown).toContain(
      "- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - The canonical reference, from basics to advanced types. [documentation] {beginner} *5*",
    );
    expect(markdown).toContain("#free #community");
    // Unknown set-level keys surface under Additional details — zero loss.
    expect(markdown).toContain("## Additional details");
    expect(markdown).toContain("**publisher:** Matrx");
    // __kind discriminators are transport metadata — never rendered.
    expect(markdown).not.toContain("__kind");
  });
});
