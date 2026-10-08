/**
 * THE COST AND MODEL COLUMNS of the admin mandate list (Arman, 2026-10-08:
 * "points and actual dollar amounts for a given period … the current model …
 * filter by one or more models").
 *
 * Spend is ONE question of the usage ledger's own definition (`ai_usage`, by
 * feature, platform lane) — a mandate run is tagged `mandate:<key>`. The model
 * is read by the list's database door (`models`, default Holder first). What
 * the browser owns is: the question it asks, reading the answer back into
 * per-key dollars, the period the address names, and the Model cell's split.
 * Real mandate keys and models from the platform.
 */
import type { DrillAnswer } from "@ai-matrx/records";
import {
  DEFAULT_SPEND_PERIOD,
  mandateSpendFromAnswer,
  modelCellOf,
  parseSpendPeriod,
  spendQuestion,
} from "../spend";
import { spendFactsOf, spendOfKey, spendTotalOf } from "../service";

const row = (
  kind: "group" | "other" | "total",
  feature: string | null,
  cost: number | string | null,
) =>
  ({
    kind,
    groups: feature === null ? null : { feature },
    measures: { cost },
    row_count: 1,
  }) as unknown as DrillAnswer["rows"][number];

describe("the spend question", () => {
  const now = new Date("2026-10-08T19:42:10.000Z");

  it("asks the usage ledger by feature, across the whole platform, every group in one page", () => {
    const q = spendQuestion("30d", now);
    expect(q.by).toEqual(["feature"]);
    expect(q.show).toEqual(["cost"]);
    expect(q.lane).toBe("platform");
    // The door folds groups past its cap into Other; the page ceiling is 1000.
    expect(q.limit).toBe(1000);
    expect(q.where).toEqual({});
  });

  it("covers the chosen period on whole hours, ending now (the rollup counts hours)", () => {
    const q = spendQuestion("7d", now);
    expect(q.window?.key).toBe("at");
    expect(q.window?.from).toBe("2026-10-01T19:00:00.000Z");
    expect(q.window?.to).toBe(now.toISOString());
  });
});

describe("reading the answer back", () => {
  it("keeps only mandate runs, keyed by the mandate key, in dollars", () => {
    const spend = mandateSpendFromAnswer({
      rows: [
        row("total", null, 1600),
        row("group", "chat", 1065.01),
        row("group", "mandate:seo.ai_visibility_evidence_icp", "259.48817730"),
        row("group", "mandate:news.coarse_relevance", 109.92),
        row("group", "conversation", 412.07),
      ],
    });
    expect(spend.byKey).toEqual({
      "seo.ai_visibility_evidence_icp": 259.4881773,
      "news.coarse_relevance": 109.92,
    });
    expect(spend.folded).toBe(false);
  });

  it("says when groups were folded into Other — a mandate there would read as zero", () => {
    const spend = mandateSpendFromAnswer({
      rows: [row("group", "mandate:applets.build", 16), row("other", null, 12)],
    });
    expect(spend.folded).toBe(true);
    expect(spend.byKey).toEqual({ "applets.build": 16 });
  });

  it("never invents a figure from an unreadable cost", () => {
    const spend = mandateSpendFromAnswer({
      rows: [row("group", "mandate:masterwork.conductor", null), row("group", "mandate:", 4)],
    });
    expect(spend.byKey).toEqual({});
  });
});

describe("the period in the address", () => {
  it("defaults to the last 30 days", () => {
    expect(DEFAULT_SPEND_PERIOD).toBe("30d");
    expect(parseSpendPeriod(null)).toBe("30d");
  });

  it("accepts every preset and refuses anything else", () => {
    expect(parseSpendPeriod("7d")).toBe("7d");
    expect(parseSpendPeriod("today")).toBe("today");
    expect(parseSpendPeriod("90d")).toBe("90d");
    expect(parseSpendPeriod("all-time")).toBe("30d");
  });
});

describe("the Model cell", () => {
  it("is unknown when the database did not carry models", () => {
    expect(modelCellOf(undefined)).toBeNull();
    expect(modelCellOf([])).toBeNull();
  });

  it("shows the default Holder's model, the bindings' others behind it", () => {
    expect(modelCellOf(["Gemini 3.8 Flash", "Claude Opus 5.5", "Workflow"])).toEqual({
      primary: "Gemini 3.8 Flash",
      others: ["Claude Opus 5.5", "Workflow"],
    });
    expect(modelCellOf(["Workflow"])).toEqual({ primary: "Workflow", others: [] });
  });
});

describe("what the list sends and reads back", () => {
  it("sends the spend only once it has been read", () => {
    expect(spendFactsOf(null)).toEqual({});
    expect(spendFactsOf({ "applets.build": 16 })).toEqual({ spend: { "applets.build": 16 } });
  });

  it("reads a mandate the ledger never tagged as nothing spent — unless groups were folded", () => {
    const byKey = { "applets.build": 16 };
    expect(spendOfKey({ byKey, folded: false }, "applets.build")).toBe(16);
    expect(spendOfKey({ byKey, folded: false }, "podcast.script")).toBe(0);
    expect(spendOfKey({ byKey, folded: true }, "podcast.script")).toBeNull();
    expect(spendOfKey({ byKey: null, folded: false }, "applets.build")).toBeNull();
  });

  it("reads the database's total as a number, or nothing", () => {
    expect(spendTotalOf("1050.30087948")).toBeCloseTo(1050.30087948);
    expect(spendTotalOf(67.99)).toBe(67.99);
    expect(spendTotalOf(undefined)).toBeNull();
    expect(spendTotalOf(null)).toBeNull();
  });
});
