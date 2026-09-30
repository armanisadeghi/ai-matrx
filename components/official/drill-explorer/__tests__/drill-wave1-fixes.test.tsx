/**
 * VERIFY-DRILL-WAVE1 FIXES on the explorer (lane DRILL-WAVE1-FIXES):
 *   F1  the header's name and number never break; the facts wrap as units
 *   F2  a grouping that starts with time asks the door with no Measure sort, so it keeps the LATEST periods
 *   F3  a declared question survives whole: what the address cannot say is carried, asked, said and saved
 *   F4  the records table reads the declared column words and resolves ids through the Dimension they feed
 *   F5  one rounding rule: the coverage line's whole reads exactly as the header's total
 *   F9  the Cost column's unit word is the one its cells print
 * RED on HEAD: the modules below did not exist, explorerQuestionOf dropped list filters, ranges,
 * ad hoc Measures, limits, thresholds and times of day, and recordsOf dropped `labels`.
 *
 * The data: the ai_usage definition (Dimensions person ← user_id, model, origin, at) and a 30-day
 * window whose ledger total is $2,394.24896491 — the walk's own number (47,884,979.3 points).
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { DrillDefinition } from "@ai-matrx/records";

jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: jest.fn() } }));

import { formatAdminPoints } from "@/components/cost/formatAdminCost";
import { POINTS_PER_USD } from "@ai-matrx/kit/format";

import { roundMoneyRow } from "../apportion";
import { DrillExplorerHeadline, costColumnLabel } from "../DrillExplorerHeadline";
import { carriedWords, doorQuestionOf, explorerQuestionParts, splitExplorerQuestion } from "../questionParts";
import { recordsCellName, recordsColumnHeader } from "../recordsColumns";
import { drillQuestionJson } from "../savedViews";
import { explorerQuestionOf, findingQuestion, recordsOf } from "../types";
import { doorSort, explorerWindowLabel, explorerWindowRange } from "../useDrillExplorer";

const DEF = {
  key: "ai_usage",
  dimensions: [
    { key: "person", label: "Person", from: "user_id", kind: "relation" },
    { key: "model", label: "Model", from: "model", kind: "choice" },
    { key: "origin", label: "Origin", from: "origin", kind: "choice" },
    { key: "at", label: "When", from: "bucket", kind: "time" },
  ],
  measures: [{ key: "cost", label: "Cost", op: "sum", of: "cost", unit: "usd", additive: true }],
} as unknown as DrillDefinition;

describe("F3 · a declared question survives whole", () => {
  const RICH = {
    by: ["model"],
    across: "at:day",
    show: ["cost", { op: "sum" as const, of: "tokens_in" }],
    where: { provider: "anthropic", person: null, origin: ["chat", "api"], tokens_in: { from: 1000, to: 50000 }, cached: true },
    window: { key: "at", from: "2026-09-28T14:00Z", to: "2026-09-28T18:30Z" },
    compare: { against: "range" as const, from: "2026-09-21T14:00Z", to: "2026-09-21T18:30Z" },
    sort: { key: "cost", direction: "desc" as const },
    limit: 10,
    having: [{ measure: "cost", op: ">=" as const, share_of_total: 5 }],
  };

  it("round-trips: every field the door accepts comes back exactly", () => {
    expect(doorQuestionOf(explorerQuestionOf(RICH))).toEqual(RICH);
    expect(doorQuestionOf(explorerQuestionOf({ by: ["person"], show: ["cost"], window: { preset: "30d" }, compare: "same_period_last_year" }))).toEqual({
      by: ["person"],
      show: ["cost"],
      window: { preset: "30d" },
      compare: "same_period_last_year",
    });
  });

  it("the address keeps what it can say; the rest is carried, never dropped", () => {
    const { question, door } = splitExplorerQuestion(explorerQuestionParts(RICH));
    expect(question).toEqual({
      by: ["model"],
      across: "at:day",
      show: ["cost"],
      where: [
        { dim: "provider", value: "anthropic" },
        { dim: "person", value: null },
      ],
      window: "2026-09-28T14:00Z..2026-09-28T18:30Z",
      sort: { key: "cost", direction: "desc" },
    });
    expect(door).toMatchObject({ where: { origin: ["chat", "api"], tokens_in: { from: 1000, to: 50000 }, cached: true }, limit: 10, having: RICH.having });
  });

  it("a window with a time of day stays that window (the published reader would have made it all time)", () => {
    expect(explorerWindowRange("2026-09-28T14:00Z..2026-09-28T18:30Z")).toEqual({ from: "2026-09-28T14:00Z", to: "2026-09-28T18:30Z" });
    expect(explorerWindowLabel("2026-09-28T14:00Z..2026-09-28T18:30Z", () => "package words")).toBe("Sep 28, 2026 14:00 – 18:30 UTC");
    expect(explorerWindowLabel("30d", () => "Last 30 days")).toBe("Last 30 days");
  });

  it("says what still narrows the answer, and names what this screen cannot draw", () => {
    const { door } = splitExplorerQuestion(explorerQuestionParts(RICH));
    const words = carriedWords(door, (key) => ({ origin: "Origin", tokens_in: "Tokens in", cached: "Cached", cost: "Cost" })[key] ?? key);
    expect(words.kept).toBe(
      "This view also narrows the answer: Origin is chat or api; Tokens in from 1000 to before 50000; Cached true; only groups whose Cost is at least 5% of the window's total; at most 10 groups per level before the rest.",
    );
    expect(words.leftOut).toBe(
      "Left out here, because this screen cannot draw it: the total of Tokens in (a Measure made for this view); the comparison with from 2026-09-21T14:00Z to before 2026-09-21T18:30Z.",
    );
    expect(carriedWords(null, (k) => k)).toEqual({ kept: null, leftOut: null });
  });

  it("a saved copy keeps what the view carries", () => {
    const json = drillQuestionJson(explorerQuestionOf(RICH)) as Record<string, unknown>;
    expect(json.door).toMatchObject({ limit: 10, where: { origin: ["chat", "api"] } });
  });

  it("a finding's row drills into one group: its rule stays behind, its other filters come along", () => {
    const f = { key: "hogs", label: "Heavy users", question: { by: ["person"], show: ["cost"], where: { origin: ["chat"] }, limit: 5, having: RICH.having } };
    const q = findingQuestion(f, { by: [], show: [], where: [], window: "7d" });
    expect(q.door).toEqual({ where: { origin: ["chat"] } });
    expect(q.window).toBe("7d");
  });
});

describe("F2 · time-first groupings ask the door for the latest periods", () => {
  const time = new Set(["at"]);
  it("sends no Measure sort for a grouping that starts with time, unless the person chose one", () => {
    expect(doorSort(["at:day"], null, "cost", time)).toEqual({});
    expect(doorSort(["model", "at:day"], null, "cost", time)).toEqual({ sort: { key: "cost", direction: "desc" } });
    expect(doorSort(["at:day"], { key: "cost", direction: "asc" }, "cost", time)).toEqual({ sort: { key: "cost", direction: "asc" } });
  });
});

describe("F4 · the records table's words", () => {
  const records = recordsOf({
    ...DEF,
    records: { fact: "ai_usage_executions", columns: ["created_at", "user_id", "model", "request_tokens"], labels: { model: "Request's top model", request_tokens: "Request tokens (on its first call)" } },
  } as unknown as DrillDefinition)!;

  it("reads the declared labels, then the Dimension a column feeds, then plain words", () => {
    expect(records.labels).toEqual({ model: "Request's top model", request_tokens: "Request tokens (on its first call)" });
    expect(recordsColumnHeader(DEF, records, "model")).toBe("Request's top model");
    expect(recordsColumnHeader(DEF, records, "request_tokens")).toBe("Request tokens (on its first call)");
    expect(recordsColumnHeader(DEF, records, "user_id")).toBe("Person");
    expect(recordsColumnHeader(DEF, records, "created_at")).toBe("Created at");
  });

  it("an id reads its name through the Dimension whose column it is", () => {
    const names = { person: { "0b7a5f6e-0000-4000-8000-000000000042": "Maya Castillo (test)" } };
    expect(recordsCellName(DEF, names, "user_id", "0b7a5f6e-0000-4000-8000-000000000042")).toBe("Maya Castillo (test)");
    expect(recordsCellName(DEF, names, "model", "claude-sonnet-5")).toBeNull();
  });
});

describe("F5 · one rounding rule", () => {
  it("the coverage line's whole reads exactly as the header's total", () => {
    const usd = 2394.24896491; // 47,884,979.3 points
    const toUnits = (v: number) => v * POINTS_PER_USD;
    const fromUnits = (u: number) => u / POINTS_PER_USD;
    const header = formatAdminPoints(fromUnits(Math.round(toUnits(usd)))); // how apportionAnswers rounds the total
    const whole = roundMoneyRow({ groups: {}, measures: { cost: usd, requests: 6247 }, row_count: 6247 }, ["cost"], toUnits, fromUnits);
    expect(header).toBe("47,884,979 points");
    expect(formatAdminPoints(whole.measures.cost)).toBe(header);
    expect(whole.measures.requests).toBe(6247);
  });
});

describe("F1 · the header's headline", () => {
  it("the name and the number never break and sit together; each fact wraps whole", () => {
    const html = renderToStaticMarkup(
      <DrillExplorerHeadline title="AI usage" total="47,884,979 points" facts={[{ key: "w", content: "Last 30 days" }, { key: "r", content: "6,247 requests" }]} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const h1 = doc.querySelector("h1")!;
    const total = doc.querySelector("[data-drill-explorer-total]")!;
    expect(h1.className).toMatch(/\bwhitespace-nowrap\b/);
    expect(total.className).toMatch(/\bwhitespace-nowrap\b/);
    expect(h1.parentElement).toBe(total.parentElement);
    expect(h1.parentElement!.className).toMatch(/\bshrink-0\b/);
    const facts = [...doc.querySelectorAll("[data-drill-explorer-facts] > li")];
    expect(facts.map((li) => li.textContent)).toEqual(["Last 30 days", "· 6,247 requests"]);
    for (const li of facts) expect(li.className).toMatch(/\bwhitespace-nowrap\b/);
  });
});

describe("F9 · the Cost column says the unit its cells print", () => {
  it("points over points, dollars over dollars", () => {
    const cellWord = formatAdminPoints(1.5).split(" ").at(-1)!; // "points"
    expect(costColumnLabel("Cost", "points")).toBe(`Cost (${cellWord})`);
    expect(costColumnLabel("Cost", "usd")).toBe("Cost ($)");
  });
});
