/**
 * structured_info kind — fleet package proof.
 *
 * 1. Structural leg: the migration's kind_example payloads pass
 *    `validateStructuralLeg` (the REAL activation ajv config) against the
 *    converter-emitted schema — the exact schema seeded into
 *    content_ir.kind_definition by migrations/kind_structured_info_full.sql.
 * 2. Storage round-trip: kindSchemaToStorage → storageToKindSchema
 *    reproduces the authored schemas (the migration's data[]/kind_edge rows
 *    are that exact write direction).
 * 3. Bridge: the envelope bridge produces serverData the REAL component
 *    contract accepts — StructuredPlanBlock consumes a markdown `content`
 *    string whose only machine-read structure is StructuredPlanViewer's stat
 *    parser (bold runs = sections, `^\s*\*` lines = bullets); the projection
 *    must feed those exact counters.
 * 4. Surface strategy: `structured_info_legacy_text` converts a REAL fence
 *    body (the canonical example from the live `structured-info-blocks`
 *    fence skill) to the canonical value, tolerates both host framings,
 *    declines structureless bodies, and is stable through the markdown
 *    projection (fence → value → markdown → same value).
 */

import { runKindDualGate, validateStructuralLeg } from "../registry/kind-dual-gate";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { envelopeFromCompleteValue } from "../core/normalize";
import type { KindSchema } from "../core/kind-schema.types";
import {
  STRUCTURED_INFO_ITEM_SCHEMA,
  STRUCTURED_INFO_SCHEMA,
  STRUCTURED_INFO_SECTION_SCHEMA,
  structuredInfoMarkdownFromValue,
  structuredInfoServerDataFromEnvelope,
} from "../kinds/structured-info";
import { structuredInfoLegacyTextToKindValue } from "../surfaces/structured-info-legacy-text";

const SCHEMAS: Record<string, KindSchema> = {
  structured_info: STRUCTURED_INFO_SCHEMA,
  structured_info_section: STRUCTURED_INFO_SECTION_SCHEMA,
  structured_info_item: STRUCTURED_INFO_ITEM_SCHEMA,
};
const resolve = (kind: string): KindSchema | undefined => SCHEMAS[kind];

/** Converter-emitted schema — regenerated here with the EXACT options the
 * migration used (strict, no __kind injection: the stored flashcard_set
 * precedent), so the test validates against what the DB row holds. */
const EMITTED = kindSchemaToJsonSchema("structured_info", resolve, {
  strict: true,
  injectKind: false,
});

// ── The migration's kind_example payloads (verbatim) ────────────────────────

const CANONICAL_EXAMPLE: Record<string, unknown> = {
  __kind: "structured_info",
  title: "Project Atlas Migration — Status Brief",
  description:
    "Point-in-time summary of the billing migration off the legacy monolith.",
  sections: [
    {
      __kind: "structured_info_section",
      heading: "Goal",
      items: [
        {
          __kind: "structured_info_item",
          text: "Move billing off the legacy monolith by Q3.",
        },
        {
          __kind: "structured_info_item",
          text: "Zero customer-visible downtime.",
        },
      ],
    },
    {
      __kind: "structured_info_section",
      heading: "Owners",
      items: [
        { __kind: "structured_info_item", label: "Backend", text: "Priya" },
        { __kind: "structured_info_item", label: "Frontend", text: "Marco" },
        { __kind: "structured_info_item", label: "QA", text: "Dana" },
      ],
    },
    {
      __kind: "structured_info_section",
      heading: "Open risks",
      body: "Both risks are tracked in the RAID log.",
      items: [
        {
          __kind: "structured_info_item",
          text: "Data backfill window is tight.",
        },
        {
          __kind: "structured_info_item",
          text: "Third-party webhook contract is unversioned.",
        },
      ],
    },
  ],
};

const SIMPLE_EXAMPLE: Record<string, unknown> = {
  __kind: "structured_info",
  title: "Team Sync — Decisions and Actions",
  sections: [
    {
      __kind: "structured_info_section",
      heading: "Decisions",
      items: [
        {
          __kind: "structured_info_item",
          text: "Ship the beta behind a feature flag.",
        },
      ],
    },
    {
      __kind: "structured_info_section",
      heading: "Action items",
      items: [
        {
          __kind: "structured_info_item",
          label: "Owner",
          text: "Sam drafts the rollout checklist by Friday.",
        },
      ],
    },
  ],
};

// ── The real fence body (canonical example from the LIVE
//    `structured-info-blocks` skill row — skill.definition, verbatim) ───────

const REAL_FENCE_BODY = [
  "**Project: Atlas Migration**",
  "",
  "**Goal**",
  "* Move billing off the legacy monolith by Q3.",
  "* Zero customer-visible downtime.",
  "",
  "**Owners**",
  "* Backend: Priya",
  "* Frontend: Marco",
  "* QA: Dana",
  "",
  "**Open risks**",
  "* Data backfill window is tight.",
  "* Third-party webhook contract is unversioned.",
].join("\n");

// StructuredPlanViewer's EXACT stat counters (StructuredPlanViewer.tsx —
// sections from bold runs, bullets from asterisk-led lines).
const countSections = (content: string): number =>
  (content.match(/\*\*[^*]+\*\*/g) || []).length;
const countBullets = (content: string): number =>
  (content.match(/^\s*\*/gm) || []).length;

describe("structured_info kind — structural leg (migration payloads)", () => {
  it("converter emits a resolvable strict schema (no unresolved refs)", () => {
    expect(EMITTED).not.toBeNull();
    expect(EMITTED?.unresolved).toEqual([]);
    const schema = EMITTED?.schema as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    // No __kind injection — the stored emitted_json_schema is SOURCE-shaped.
    expect(
      (schema.properties as Record<string, unknown>).__kind,
    ).toBeUndefined();
    expect(Object.keys(schema.$defs as object).sort()).toEqual([
      "structured_info_item",
      "structured_info_section",
    ]);
  });

  it("canonical example passes the REAL activation validator", () => {
    const result = validateStructuralLeg(CANONICAL_EXAMPLE, EMITTED?.schema);
    expect(result.detail).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it("simple example passes the REAL activation validator", () => {
    const result = validateStructuralLeg(SIMPLE_EXAMPLE, EMITTED?.schema);
    expect(result.detail).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it("a section without heading fails (schema is really strict)", () => {
    const bad = {
      __kind: "structured_info",
      title: "x",
      sections: [{ __kind: "structured_info_section", items: [] }],
    };
    expect(validateStructuralLeg(bad, EMITTED?.schema).ok).toBe(false);
  });

  it("storage transform round-trips all three schemas (data[]/kind_edge leg)", () => {
    for (const [kind, schema] of Object.entries(SCHEMAS)) {
      const storage = kindSchemaToStorage(schema);
      expect(storageToKindSchema(kind, storage)).toEqual(schema);
    }
    // The exact edge rows the migration inserts.
    expect(kindSchemaToStorage(STRUCTURED_INFO_SCHEMA).edges).toEqual([
      {
        fieldPath: "sections",
        childKind: "structured_info_section",
        position: 0,
      },
    ]);
    expect(kindSchemaToStorage(STRUCTURED_INFO_SECTION_SCHEMA).edges).toEqual([
      { fieldPath: "items", childKind: "structured_info_item", position: 0 },
    ]);
  });
});

describe("structured_info bridge — serverData the real component accepts", () => {
  it("complete envelope → { content } feeding the component's stat parser", () => {
    const envelope = envelopeFromCompleteValue(
      CANONICAL_EXAMPLE,
      "structured_info",
    );
    const serverData = structuredInfoServerDataFromEnvelope(envelope);
    expect(serverData).toBeDefined();
    const content = serverData?.content;
    expect(typeof content).toBe("string");

    const markdown = content as string;
    // The REAL parser (StructuredPlanViewer counters) sees the structure:
    // bold runs ≥ title + 3 section headings. Its naive bullet counter
    // (`^\s*\*`) also matches whole-line bold headings — exactly as it does
    // for hand-authored fences — so: 7 items + 4 heading lines = 11.
    expect(countSections(markdown)).toBeGreaterThanOrEqual(4);
    expect(countBullets(markdown)).toBe(11);
    expect(markdown).toContain("**Project Atlas Migration — Status Brief**");
    expect(markdown).toContain("**Owners**");
    expect(markdown).toContain("* **Backend:** Priya");
    expect(markdown).toContain("Both risks are tracked in the RAID log.");
  });

  it("dual gate passes end-to-end with the migration's canonical sample", () => {
    const result = runKindDualGate({
      kind: "structured_info",
      sample: CANONICAL_EXAMPLE,
      emittedJsonSchema: EMITTED?.schema,
      definition: {
        legacyBlockType: "structured_info",
        toLegacyServerData: structuredInfoServerDataFromEnvelope,
      },
    });
    expect(result.structural.ok).toBe(true);
    expect(result.render.ok).toBe(true);
    expect(result.isActive).toBe(true);
  });

  it("declines streaming (incomplete) envelopes — complete-only bridge", () => {
    const envelope = envelopeFromCompleteValue(
      CANONICAL_EXAMPLE,
      "structured_info",
    );
    const streaming = {
      ...envelope,
      root: { ...envelope.root, status: "streaming" as const },
    };
    expect(structuredInfoServerDataFromEnvelope(streaming)).toBeUndefined();
  });

  it("unknown keys never vanish from the projection", () => {
    const value = {
      ...CANONICAL_EXAMPLE,
      confidence: "high",
    } as Record<string, unknown>;
    const markdown = structuredInfoMarkdownFromValue(value);
    expect(markdown).toContain("**Additional details**");
    expect(markdown).toContain("confidence:");
    expect(markdown).toContain("high");
  });
});

describe("structured_info_legacy_text strategy — real fence body converges", () => {
  it("converts the live fence-skill sample to the canonical value", () => {
    const value = structuredInfoLegacyTextToKindValue(REAL_FENCE_BODY);
    expect(value).not.toBeNull();
    expect(value?.__kind).toBe("structured_info");
    expect(value?.title).toBe("Project: Atlas Migration");

    const sections = value?.sections as Array<Record<string, unknown>>;
    expect(sections.map((s) => s.heading)).toEqual([
      "Goal",
      "Owners",
      "Open risks",
    ]);

    const owners = sections[1].items as Array<Record<string, unknown>>;
    expect(owners).toEqual([
      { __kind: "structured_info_item", label: "Backend", text: "Priya" },
      { __kind: "structured_info_item", label: "Frontend", text: "Marco" },
      { __kind: "structured_info_item", label: "QA", text: "Dana" },
    ]);

    const goal = sections[0].items as Array<Record<string, unknown>>;
    expect(goal.map((i) => i.text)).toEqual([
      "Move billing off the legacy monolith by Q3.",
      "Zero customer-visible downtime.",
    ]);

    // The converged value passes the same activation validator.
    expect(validateStructuralLeg(value, EMITTED?.schema).ok).toBe(true);
  });

  it("accepts BOTH host framings (fence-framed and inner-only)", () => {
    const framed = "```structured_info\n" + REAL_FENCE_BODY + "\n```";
    expect(structuredInfoLegacyTextToKindValue(framed)).toEqual(
      structuredInfoLegacyTextToKindValue(REAL_FENCE_BODY),
    );
  });

  it("declines a structureless body (no bold headings) — legacy untouched", () => {
    expect(
      structuredInfoLegacyTextToKindValue(
        "Just a paragraph of prose.\nAnd another line without structure.",
      ),
    ).toBeNull();
    expect(structuredInfoLegacyTextToKindValue("   \n  ")).toBeNull();
  });

  it("is stable through the markdown projection (fence → value → markdown → same value)", () => {
    const first = structuredInfoLegacyTextToKindValue(REAL_FENCE_BODY);
    expect(first).not.toBeNull();
    const projected = structuredInfoMarkdownFromValue(
      first as Record<string, unknown>,
    );
    const second = structuredInfoLegacyTextToKindValue(projected);
    expect(second).toEqual(first);
  });

  it("keeps intro paragraphs as description (zero loss)", () => {
    const body = [
      "**Release Notes**",
      "",
      "Everything shipped in the 4.2 cycle.",
      "",
      "**Fixed**",
      "* Login redirect loop on Safari.",
    ].join("\n");
    const value = structuredInfoLegacyTextToKindValue(body);
    expect(value?.title).toBe("Release Notes");
    expect(value?.description).toBe("Everything shipped in the 4.2 cycle.");
    const sections = value?.sections as Array<Record<string, unknown>>;
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("Fixed");
  });
});
