/**
 * THE COST AND MODEL COLUMNS of the admin mandate list (Arman, 2026-10-08:
 * "points and actual dollar amounts for a given period … the current model …
 * filter by one or more models").
 *
 * The cost is the cost of the mandate's runs, from the runs read
 * (admin-list-runs.test.ts — one definition of a mandate's runs). The model
 * is read by the list's database door (`models`, default Holder first). What
 * this file covers: the period the address names, the Model cell's split, and
 * what the list sends and reads back.
 * Real mandate keys and models from the platform.
 */
import {
  DEFAULT_SPEND_PERIOD,
  modelCellOf,
  parseSpendPeriod,
} from "../spend";
import { FIELDS } from "../fields";
import type { MandateAdminRow } from "../types";
import { spendFactsOf, spendOfKey, spendTotalOf } from "../service";

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

  it("reads a mandate with no runs as nothing spent — unless the costs were unknown", () => {
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

describe("a workflow Holder in the Model column", () => {
  // organization.referral_letter_drafter (a workflow default Holder) lives in an
  // organization, so the platform list has none — the support lookup shows it.
  const asRow = (models: string[] | null) => ({ models }) as unknown as MandateAdminRow;

  it("is a filterable Model value, so the filter offers Workflow whenever one exists", () => {
    expect(FIELDS.model.values(asRow(["Workflow"]))).toEqual(["Workflow"]);
    expect(FIELDS.model.values(asRow(["Gemini 3.8 Flash", "Workflow"]))).toContain("Workflow");
  });

  it("matches on a binding's workflow while sorting by the default Holder's model", () => {
    expect(FIELDS.model.sort(asRow(["Claude Opus 5.5", "Workflow"]))).toBe("claude opus 5.5");
    expect(FIELDS.model.values(asRow(null))).toEqual([]);
  });
});
