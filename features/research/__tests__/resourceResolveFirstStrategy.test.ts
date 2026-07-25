/**
 * `strategy: "first"` — the resolver's own behaviour, with bodies mocked.
 *
 * "The report" means the assembled document if one exists, ELSE the current
 * topic report — never both. Four live topics have BOTH rows, so a resolver
 * that concatenated them would hand every publishing output (podcast, blog,
 * slides, SEO) the same research twice in one variable. The planner test in
 * resourceResolve.test.ts proves both kinds are planned; this proves only one
 * survives into the variable, and that the loser is reported as `superseded`
 * rather than counted as truncation.
 *
 * The Supabase client is mocked because `resolveBundle` is the one place that
 * reads bodies — the whole point of the design. Mocking it here is what makes
 * the decision logic testable at all.
 */

const rows: Record<string, { id: string; content: string; result: string; title: string }> = {
  "doc-1": {
    id: "doc-1",
    content: "ASSEMBLED DOCUMENT BODY",
    result: "",
    title: "Doc",
  },
  "synth-topic-1": {
    id: "synth-topic-1",
    content: "",
    result: "TOPIC REPORT BODY",
    title: "Report",
  },
};

jest.mock("@/utils/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  let requested: string[] = [];
  const chain = () => jest.fn(() => builder);
  builder.select = chain();
  builder.schema = chain();
  builder.from = chain();
  builder.in = jest.fn((_col: string, ids: string[]) => {
    requested = ids;
    return builder;
  });
  builder.returns = jest.fn(() =>
    Promise.resolve({
      data: requested.map((id) => rows[id]).filter(Boolean),
      error: null,
    }),
  );
  return {
    supabase: {
      schema: () => builder,
    },
  };
});

import { parseManifest } from "../resources/manifest";
import { resolveBundle } from "../resources/resolve";
import type { ContextBundle, ManifestItemRaw } from "../resources/types";

const TOPIC = "11111111-1111-1111-1111-111111111111";

function manifestWithBoth() {
  const items: ManifestItemRaw[] = [
    {
      k: "document.report",
      id: "doc-1",
      p: null,
      l: "Assembled document",
      s: null,
      c: 23,
      st: "success",
      t: "2026-07-10T00:00:00Z",
      f: { current: true, version: 2 },
    },
    {
      k: "synthesis.topic",
      id: "synth-topic-1",
      p: null,
      l: "Topic report",
      s: null,
      c: 17,
      st: "success",
      t: "2026-07-09T00:00:00Z",
      f: { current: true, version: 1 },
    },
  ];
  return parseManifest(
    {
      topic_id: TOPIC,
      generated_at: "2026-07-25T00:00:00Z",
      topic: { id: TOPIC, name: "T", description: null, tone_profile: null },
      keywords: [],
      tags: [],
      tag_sources: [],
      edges: [],
      kinds: [
        { kind: "document.report", item_count: 1, chars: 23 },
        { kind: "synthesis.topic", item_count: 1, chars: 17 },
      ],
      items,
    },
    TOPIC,
  );
}

const REPORT_ONLY: ContextBundle = {
  id: "b",
  entityType: "research_topic",
  entityId: TOPIC,
  name: "Report only",
  description: null,
  slug: "research-report-only",
  selectors: [
    {
      kind: "document.report",
      mode: "filtered",
      filter: { currentOnly: true },
      order: "recent",
      limit: { maxItems: 1 },
    },
    {
      kind: "synthesis.topic",
      mode: "filtered",
      filter: { currentOnly: true, successOnly: true },
      order: "recent",
      limit: { maxItems: 1 },
    },
  ],
  bindings: [
    {
      variable: "research_report",
      kinds: ["document.report", "synthesis.topic"],
      strategy: "first",
    },
  ],
  budget: null,
  agentId: null,
  isSystem: true,
  organizationId: null,
  createdBy: null,
  createdAt: "2026-07-25T00:00:00Z",
  updatedAt: "2026-07-25T00:00:00Z",
};

describe("resolveBundle with strategy 'first'", () => {
  it("sends the document ONLY — never the document plus the report", async () => {
    const { variables, report } = await resolveBundle(
      manifestWithBoth(),
      REPORT_ONLY,
    );
    expect(variables.research_report).toBe("ASSEMBLED DOCUMENT BODY");
    expect(variables.research_report).not.toContain("TOPIC REPORT BODY");
    expect(Object.keys(variables)).toEqual(["research_report"]);

    const synth = report.perKind.find((k) => k.kind === "synthesis.topic");
    expect(synth?.included).toBe(0);
    expect(synth?.dropped.superseded).toBe(1);
  });

  it("does not call that a truncation — nothing was lost", async () => {
    const { report } = await resolveBundle(manifestWithBoth(), REPORT_ONLY);
    expect(report.truncated).toBe(false);
    expect(report.exceedsBudget).toBe(false);
    expect(report.notes).toEqual([]);
  });

  it("falls through to the report when there is no document", async () => {
    const m = manifestWithBoth();
    m.itemsByKind.delete("document.report");
    const { variables, report } = await resolveBundle(m, REPORT_ONLY);
    expect(variables.research_report).toBe("TOPIC REPORT BODY");
    const doc = report.perKind.find((k) => k.kind === "document.report");
    expect(doc?.included).toBe(0);
  });
});
