/**
 * timeline kind — schema, examples, bridge, and XML-surface convergence.
 *
 * Three legs, per the Shape System activation law:
 *   (a) both kind_example payloads (mirrored byte-for-byte from the applied
 *       content_ir.kind_example rows) pass the REAL structural gate
 *       (validateStructuralLeg) against the emitted_json_schema produced by
 *       the REAL converter (kindSchemaToJsonSchema, strict) — the same
 *       artifacts the migration stored;
 *   (b) the legacy bridge derives serverData the REAL component contract
 *       accepts: TimelineArtifact hands serverData straight to TimelineBlock,
 *       whose TimelineData shape (and handleDataImport guard) is asserted
 *       here, with the parser's own defaults (TBD date, title-as-description,
 *       synthesized `${period}-${index}` ids);
 *   (c) the `timeline_legacy_text` strategy converts a REAL sample of
 *       today's `<timeline>` wire format (parseTimelineMarkdown's grammar)
 *       into a schema-passing canonical value whose bridged serverData is
 *       IDENTICAL to what the component's own parser produces — the keystone
 *       parity at unit level.
 */

import { parseTimelineMarkdown } from "@/components/mardown-display/blocks/timeline/parseTimelineMarkdown";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import { envelopeFromCompleteValue } from "../core/normalize";
import type { KindSchema } from "../core/kind-schema.types";
import {
  runKindDualGate,
  validateStructuralLeg,
} from "../registry/kind-dual-gate";
import {
  kindSchemaToStorage,
  storageToKindSchema,
} from "../registry/kind-storage-transform";
import {
  TIMELINE_KIND_DEFINITIONS,
  TIMELINE_KIND_SCHEMAS,
  timelineKindSchema,
  timelinePeriodKindSchema,
  timelineEventKindSchema,
  timelineServerDataFromEnvelope,
  timelineMarkdownFromValue,
} from "../kinds/timeline";
import { timelineLegacyTextToKindValue } from "../surfaces/timeline-legacy-text";

const resolve = (kind: string): KindSchema | undefined =>
  TIMELINE_KIND_SCHEMAS.find((schema) => schema.kind === kind);

/** The exact emitted_json_schema the migration materialized (strict, no __kind). */
const emitted = kindSchemaToJsonSchema("timeline", resolve, {
  strict: true,
  injectKind: false,
});
if (!emitted) throw new Error("converter declined the timeline kind");
const EMITTED_JSON_SCHEMA = emitted.schema;

// ---------------------------------------------------------------------------
// Fixtures — byte-for-byte mirrors of the applied kind_example rows
// (migrations/kind_timeline_full.sql).
// ---------------------------------------------------------------------------

const RICH_EXAMPLE: Record<string, unknown> = {
  __kind: "timeline",
  title: "Product Launch Plan",
  description:
    "Milestones from kickoff to general availability across planning, engineering, and marketing.",
  periods: [
    {
      __kind: "timeline_period",
      period: "Phase 1: Foundation (Q1 2026)",
      events: [
        {
          __kind: "timeline_event",
          id: "q1-kickoff",
          title: "Project kickoff",
          date: "Jan 12, 2026",
          description: "Align teams on scope, staffing, and success metrics.",
          status: "completed",
          category: "Planning",
        },
        {
          __kind: "timeline_event",
          id: "q1-freeze",
          title: "MVP feature freeze",
          date: "Mar 2, 2026",
          description:
            "Lock the launch feature set and open the stabilization branch.",
          status: "completed",
          category: "Engineering",
        },
      ],
    },
    {
      __kind: "timeline_period",
      period: "Phase 2: Hardening (Q2 2026)",
      events: [
        {
          __kind: "timeline_event",
          id: "q2-beta",
          title: "Private beta",
          date: "Apr 15, 2026",
          description: "Invite 50 design partners and triage feedback weekly.",
          status: "in-progress",
          category: "Engineering",
        },
        {
          __kind: "timeline_event",
          id: "q2-campaign",
          title: "Launch campaign assets",
          date: "May 30, 2026",
          description:
            "Finalize the site refresh, demo video, and analyst briefings.",
          status: "pending",
          category: "Marketing",
        },
      ],
    },
    {
      __kind: "timeline_period",
      period: "Phase 3: Launch (Q3 2026)",
      events: [
        {
          __kind: "timeline_event",
          id: "q3-ga",
          title: "General availability",
          date: "Jul 8, 2026",
          description:
            "Public release with pricing live and support runbooks staffed.",
          status: "pending",
          category: "Launch",
        },
      ],
    },
  ],
};

const SIMPLE_EXAMPLE: Record<string, unknown> = {
  __kind: "timeline",
  title: "Website Redesign Roadmap",
  periods: [
    {
      __kind: "timeline_period",
      period: "Phase 1: Discovery",
      events: [
        {
          __kind: "timeline_event",
          title: "Stakeholder interviews",
          date: "Week 1",
        },
        {
          __kind: "timeline_event",
          title: "Competitive audit",
          date: "Week 2",
        },
      ],
    },
    {
      __kind: "timeline_period",
      period: "Phase 2: Build",
      events: [
        {
          __kind: "timeline_event",
          title: "New design system",
          date: "Weeks 3-6",
        },
      ],
    },
  ],
};

/** A REAL sample of today's `<timeline>` wire format (the parser's grammar). */
const SAMPLE_XML = [
  "<timeline>",
  "### Product Launch Timeline",
  "A phased plan from kickoff to GA.",
  "",
  "**Phase 1: Foundation (Weeks 1-4)**",
  "- **Project kickoff** (Week 1) [Planning] completed",
  "  Align on scope and success metrics.",
  "- **Architecture spike** (Week 2) [Engineering] in progress",
  "  Prototype the streaming pipeline.",
  "",
  "**Phase 2: Build**",
  "- Feature complete (Week 8)",
  "- Beta release (Week 10) [Release]",
  "</timeline>",
].join("\n");

// The component's TimelineData contract (mirrors TimelineBlock.tsx).
interface ComponentTimelineEvent {
  id: string;
  title: string;
  date: string;
  description: string;
  status?: "completed" | "in-progress" | "pending";
  category?: string;
}
interface ComponentTimelineData {
  title: string;
  description?: string;
  periods: Array<{ period: string; events: ComponentTimelineEvent[] }>;
}

/**
 * The component's own acceptance shape: the exact runtime guard
 * TimelineBlock.handleDataImport applies, deepened to every field its render
 * path reads (event.id keying, title/date/description strings, the status
 * switch, the category chip/filter).
 */
function assertComponentAcceptsServerData(
  serverData: Record<string, unknown> | undefined,
): asserts serverData is Record<string, unknown> & ComponentTimelineData {
  expect(serverData).toBeDefined();
  if (!serverData) throw new Error("unreachable");

  // handleDataImport's literal guard.
  expect(typeof serverData.title).toBe("string");
  expect(Array.isArray(serverData.periods)).toBe(true);

  for (const period of serverData.periods as Array<Record<string, unknown>>) {
    expect(typeof period.period).toBe("string");
    expect(Array.isArray(period.events)).toBe(true);
    for (const event of period.events as Array<Record<string, unknown>>) {
      expect(typeof event.id).toBe("string");
      expect(typeof event.title).toBe("string");
      expect((event.title as string).length).toBeGreaterThan(0);
      expect(typeof event.date).toBe("string");
      expect(typeof event.description).toBe("string");
      if (event.status !== undefined) {
        expect(["completed", "in-progress", "pending"]).toContain(
          event.status,
        );
      }
      if (event.category !== undefined) {
        expect(typeof event.category).toBe("string");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// (a) Examples pass the structural gate against the converter-emitted schema
// ---------------------------------------------------------------------------

describe("timeline kind — structural gate (the applied kind_example rows)", () => {
  it("the canonical (rich) example passes validateStructuralLeg", () => {
    expect(validateStructuralLeg(RICH_EXAMPLE, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("the simple example passes validateStructuralLeg", () => {
    expect(validateStructuralLeg(SIMPLE_EXAMPLE, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("the FULL dual gate (structural + render) passes on the canonical example", () => {
    const [rootDefinition] = TIMELINE_KIND_DEFINITIONS;
    const result = runKindDualGate({
      kind: "timeline",
      sample: RICH_EXAMPLE,
      emittedJsonSchema: EMITTED_JSON_SCHEMA,
      definition: rootDefinition,
    });
    expect(result.structural).toEqual({ ok: true });
    expect(result.render).toEqual({ ok: true });
    expect(result.isActive).toBe(true);
  });

  it("storage rows round-trip losslessly (data[] + edges ⇄ KindSchema)", () => {
    for (const schema of [
      timelineKindSchema,
      timelinePeriodKindSchema,
      timelineEventKindSchema,
    ]) {
      expect(
        storageToKindSchema(schema.kind, kindSchemaToStorage(schema)),
      ).toEqual(schema);
    }
  });
});

// ---------------------------------------------------------------------------
// (b) The bridge derives serverData the REAL component accepts
// ---------------------------------------------------------------------------

describe("timeline kind — legacy bridge (toLegacyServerData)", () => {
  it("rich example → the exact TimelineData shape TimelineBlock consumes", () => {
    const serverData = timelineServerDataFromEnvelope(
      envelopeFromCompleteValue(RICH_EXAMPLE, "timeline"),
    );
    assertComponentAcceptsServerData(serverData);

    // Every authored field carries through untouched (no __kind keys).
    expect(serverData).toEqual({
      title: "Product Launch Plan",
      description:
        "Milestones from kickoff to general availability across planning, engineering, and marketing.",
      periods: (RICH_EXAMPLE.periods as Array<Record<string, unknown>>).map(
        (period) => ({
          period: period.period,
          events: (period.events as Array<Record<string, unknown>>).map(
            ({ __kind: _drop, ...event }) => event,
          ),
        }),
      ),
    });
  });

  it("simple example → the parser's own defaults fill date/description/id", () => {
    const serverData = timelineServerDataFromEnvelope(
      envelopeFromCompleteValue(SIMPLE_EXAMPLE, "timeline"),
    );
    assertComponentAcceptsServerData(serverData);

    const periods = serverData.periods;
    // Synthesized ids follow the parser's exact `${period}-${index}` scheme.
    expect(periods[0].events[0].id).toBe("Phase 1: Discovery-0");
    expect(periods[0].events[1].id).toBe("Phase 1: Discovery-1");
    expect(periods[1].events[0].id).toBe("Phase 2: Build-0");
    // Missing description defaults to the title (parser behavior).
    expect(periods[0].events[0].description).toBe("Stakeholder interviews");
    // Authored dates carry through.
    expect(periods[0].events[0].date).toBe("Week 1");
  });

  it("complete-only law: a streaming envelope is declined", () => {
    const complete = envelopeFromCompleteValue(RICH_EXAMPLE, "timeline");
    const streaming = {
      ...complete,
      root: { ...complete.root, status: "streaming" as const },
    };
    expect(timelineServerDataFromEnvelope(streaming)).toBeUndefined();
  });

  it("declines payloads the component cannot render (no periods with events)", () => {
    const empty = envelopeFromCompleteValue(
      { __kind: "timeline", title: "Empty", periods: [] },
      "timeline",
    );
    expect(timelineServerDataFromEnvelope(empty)).toBeUndefined();

    const eventless = envelopeFromCompleteValue(
      {
        __kind: "timeline",
        title: "Stubs",
        periods: [
          { __kind: "timeline_period", period: "Phase 1", events: [] },
        ],
      },
      "timeline",
    );
    expect(timelineServerDataFromEnvelope(eventless)).toBeUndefined();
  });

  it("toMarkdown renders headings/bullets, never a JSON dump", () => {
    const markdown = timelineMarkdownFromValue(RICH_EXAMPLE);
    expect(markdown).toContain("# Product Launch Plan");
    expect(markdown).toContain("## Phase 1: Foundation (Q1 2026)");
    expect(markdown).toContain(
      "- **Project kickoff** (Jan 12, 2026) [Planning] — completed",
    );
    expect(markdown).not.toContain("__kind");
  });
});

// ---------------------------------------------------------------------------
// (c) The XML strategy converges today's wire format to the canonical kind
// ---------------------------------------------------------------------------

describe("timeline kind — timeline_legacy_text strategy (<timeline> wire format)", () => {
  it("converts the real wire sample into a schema-passing canonical value", () => {
    const value = timelineLegacyTextToKindValue(SAMPLE_XML);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    expect(value.__kind).toBe("timeline");
    expect(value.title).toBe("Product Launch Timeline");
    expect(value.description).toBe("A phased plan from kickoff to GA.");

    const periods = value.periods as Array<Record<string, unknown>>;
    expect(periods).toHaveLength(2);
    expect(periods[0].__kind).toBe("timeline_period");
    const firstEvents = periods[0].events as Array<Record<string, unknown>>;
    expect(firstEvents[0]).toMatchObject({
      __kind: "timeline_event",
      title: "Project kickoff",
      date: "Week 1",
      category: "Planning",
      status: "completed",
      description: "Align on scope and success metrics.",
    });
    // The parser normalizes the spaced "in progress" spelling.
    expect(firstEvents[1].status).toBe("in-progress");

    // The converged value passes the SAME structural gate a __kind JSON
    // arrival must pass.
    expect(validateStructuralLeg(value, EMITTED_JSON_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("keystone parity: XML → kind → bridge equals the component's own parser output", () => {
    const value = timelineLegacyTextToKindValue(SAMPLE_XML);
    expect(value).not.toBeNull();
    if (!value) throw new Error("unreachable");

    const bridged = timelineServerDataFromEnvelope(
      envelopeFromCompleteValue(value, "timeline"),
    );
    assertComponentAcceptsServerData(bridged);

    // parseTimelineMarkdown IS the component's parser — identical payloads
    // from both surfaces (toEqual ignores its `undefined`-valued keys).
    expect(bridged).toEqual(parseTimelineMarkdown(SAMPLE_XML));
  });

  it("accepts both host framings (tags with attributes vs inner-only)", () => {
    const inner = SAMPLE_XML.replace(/^<timeline>\n/, "").replace(
      /\n<\/timeline>$/,
      "",
    );
    const withAttrs = `<timeline data-source="agent">\n${inner}\n</timeline>`;
    expect(timelineLegacyTextToKindValue(withAttrs)).toEqual(
      timelineLegacyTextToKindValue(inner),
    );
  });

  it("returns null (loud legacy fallback) for a region with no periods", () => {
    expect(
      timelineLegacyTextToKindValue(
        "<timeline>\nJust prose, no headers or bullets at all.\n</timeline>",
      ),
    ).toBeNull();
  });
});
