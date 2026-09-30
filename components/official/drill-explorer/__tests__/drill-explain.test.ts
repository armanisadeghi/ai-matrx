/**
 * "EXPLAIN THIS" (lane DRILL-EXPLAIN): the question on screen and its answer become ONE typed
 * payload for the Alchemy session — the trail, the grouping, the window, the Measures, the
 * comparison, every group as the table draws it (same order, same words, same printed values) with
 * the group limit's "Other" rest, the total, the coverage and when it was counted.
 *
 * The data: a platform admin looking at 30 days of AI usage for one person, grouped by provider,
 * compared with the previous 30 days — the question the usage page's walk asks.
 *
 * Break it names: dropping the trail, the Other row, the comparison or the coverage; printing raw
 * ids instead of names; reordering the groups away from the table's order; offering the control
 * before the answer is on screen.
 */
import {
  drillRequestKey,
  type MatrxDrillAnswers,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import { DRILL_EXPLAIN_KIND, drillExplainPayload, drillQuestionSentence, type DrillExplainInput } from "../explainPayload";

const PERSON = "4cf62e4e-9de0-4a4a-8a2a-6d1f6a1b2c3d";
const credits = (usd: number | null) => (usd === null ? "—" : `${Math.round(usd * 1000).toLocaleString("en-US")} credits`);

const dimensions: MatrxDrillDimension[] = [
  { key: "person", label: "Person", kind: "relation", labelFor: (v) => (v === PERSON ? "admin@admin.com" : v ?? "None") },
  { key: "provider", label: "Provider", kind: "choice", labelFor: (v) => ({ anthropic: "Anthropic", openai: "OpenAI", google: "Google" })[v ?? ""] ?? v ?? "None" },
  { key: "at", label: "When", kind: "time" },
];
const measures: MatrxDrillMeasure[] = [
  { key: "cost", label: "Cost (credits)", additive: true, format: credits, lowerIsBetter: true },
  { key: "requests", label: "Requests", additive: true },
];

const question: MatrxDrillQuestion = {
  by: ["provider"],
  show: ["cost", "requests"],
  where: [{ dim: "person", value: PERSON }],
  window: "30d",
  compare: "previous_period",
  sort: { key: "cost", direction: "desc" },
};

// The door's answers: 3 providers shown of 4 (the fourth is folded into the total, so "Other" is the rest).
const answers: MatrxDrillAnswers = {
  [drillRequestKey([])]: [{ groups: {}, measures: { cost: 27.71, requests: 3120 }, prior_measures: { cost: 20.5, requests: 2600 }, row_count: 3120 }],
  [drillRequestKey(["provider"])]: [
    { groups: { provider: "openai" }, measures: { cost: 6.2, requests: 900 }, prior_measures: { cost: 7, requests: 950 }, row_count: 900 },
    { groups: { provider: "anthropic" }, measures: { cost: 18.4, requests: 1700 }, prior_measures: { cost: 11.5, requests: 1200 }, row_count: 1700 },
    { groups: { provider: "google" }, measures: { cost: 2.61, requests: 400 }, prior_measures: { cost: 1.5, requests: 380 }, row_count: 400 },
  ],
};

const input: DrillExplainInput = {
  title: "Usage",
  location: "Administration › Usage",
  definitionKey: "ai_usage",
  rootLabel: "All usage",
  dimensions,
  measures,
  measureUnits: { cost: "usd", requests: undefined },
  question,
  answers,
  whole: { groups: {}, measures: { cost: 47.87, requests: 6244 }, row_count: 6244 },
  headlineKey: "cost",
  moneyUnit: "credits",
  range: { from: "2026-08-31T12:00:00.000Z", to: "2026-09-30T12:00:00.000Z" },
  asOf: "2026-09-30T11:45:00.000Z",
  says: ["Counted from the hourly summary."],
  address: "http://drillexplain.localhost:3001/administration/usage?by=provider&f.person=4cf62e4e",
  rowNoun: "request",
  emptyLabel: "None",
};

describe("drillExplainPayload", () => {
  it("is absent until the answer is on screen", () => {
    expect(drillExplainPayload({ ...input, answers: {} })).toBeNull();
    expect(drillExplainPayload({ ...input, answers: { [drillRequestKey([])]: answers[drillRequestKey([])] } })).toBeNull();
  });

  it("carries the question: trail by name, grouping, window, Measures with units, comparison, sort", () => {
    const got = drillExplainPayload(input)!;
    const q = got.value.question as Record<string, unknown>;
    expect(q.trail).toEqual([{ dimension: "Person", value: "admin@admin.com" }]);
    expect(q.group_by).toEqual(["Provider"]);
    expect(q.window).toEqual({ label: "Last 30 days", from: input.range!.from, to: input.range!.to });
    expect((q.measures as Array<Record<string, unknown>>).map((m) => [m.label, String(m.unit).split(" ")[0]])).toEqual([
      ["Cost (credits)", "credits"],
      ["Requests", "count"],
    ]);
    expect(q.compare).toBe("the previous period of the same length");
    expect(q.sort).toEqual({ by: "Cost (credits)", direction: "largest first" });
    expect(JSON.stringify(got.value)).not.toContain(PERSON.slice(0, 8) + "-");
  });

  it("carries the answer as the table draws it: order, names, printed values, change, Other, total, coverage, as_of", () => {
    const got = drillExplainPayload(input)!;
    const a = got.value.answer as Record<string, any>;
    expect(a.groups.map((g: Record<string, unknown>) => g.Provider ?? g.group)).toEqual(["Anthropic", "OpenAI", "Google", "Other"]);
    const anthropic = a.groups[0];
    expect(anthropic.value).toBe("anthropic");
    expect(anthropic.requests).toBe(1700);
    expect(anthropic.measures["Cost (credits)"]).toEqual({ shown: "18,400 credits", value: 18.4, before: 11.5, before_shown: "11,500 credits", change_pct: 60 });
    const other = a.groups[3];
    expect(other.requests).toBe(120);
    expect(other.measures["Cost (credits)"].value).toBeCloseTo(0.5, 6);
    expect(a.total.measures["Cost (credits)"].shown).toBe("27,710 credits");
    expect(a.coverage).toEqual({ measure: "Cost (credits)", slice: "27,710 credits", whole: "47,870 credits", share_pct: 57.9 });
    expect(a.counted_through).toBe(input.asOf);
    expect(a.money_shown_in).toBe("credits");
    expect(a.notes).toEqual(["Counted from the hourly summary."]);
    expect(got.value.address).toBe(input.address);
  });

  it("names itself for the AI envelope, never as a content_ir __kind", () => {
    const got = drillExplainPayload(input)!;
    expect(got.envelope.kind).toBe(DRILL_EXPLAIN_KIND);
    expect(got.envelope.location).toBe("AI Matrx — Administration › Usage");
    expect(got.envelope.summary).toBe(`${drillQuestionSentence(input)} Total Cost (credits): 27,710 credits.`);
    expect(got.envelope.context).toEqual({ address: input.address });
    expect(JSON.stringify(got.value)).not.toContain("__kind");
    expect(got.label).toBe("Usage — Cost (credits), Requests by Provider, for Person admin@admin.com, last 30 days, compared with the previous period of the same length");
  });

  it("nests a second level under its parent, with the parent's own Other", () => {
    const two: DrillExplainInput = {
      ...input,
      question: { ...question, by: ["provider", "person"], where: [], compare: null },
      answers: {
        ...answers,
        [drillRequestKey(["provider", "person"])]: [
          { groups: { provider: "anthropic", person: PERSON }, measures: { cost: 10, requests: 1000 }, row_count: 1000 },
        ],
      },
    };
    const a = drillExplainPayload(two)!.value.answer as Record<string, any>;
    const anthropic = a.groups.find((g: Record<string, unknown>) => g.Provider === "Anthropic");
    expect(anthropic.groups[0].Person).toBe("admin@admin.com");
    expect(anthropic.groups[1].group).toBe("Other");
    expect(anthropic.groups[1].requests).toBe(700);
    expect(a.coverage).toBeNull();
  });
});
