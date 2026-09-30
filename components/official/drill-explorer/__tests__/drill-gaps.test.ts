// DRILL-GAPS — the explorer reads the door's words and formats every unit the contract carries
// (PROGRESS-DRILL-FINISH owner rulings under DRILL-CONVERSIONS (c) and DRILL-WAVE1-FIXES).

import type { DrillDefinition } from "@ai-matrx/records";

import { formatAdminPoints, formatAdminUsd } from "@/components/cost/formatAdminCost";

import { drillDimensionLabelFor, drillDoorLabels, plainWords } from "../dimensionWords";
import { drillUnitAdds, drillUnitFormatter } from "../measureFormat";

type Dim = DrillDefinition["dimensions"][number] & { empty_label?: string };

describe("every unit the contract carries is formatted by the screen", () => {
  it("money goes through the one points / $ switch", () => {
    expect(drillUnitFormatter("usd", "points")(3.57849)).toBe(formatAdminPoints(3.57849));
    expect(drillUnitFormatter("usd", "usd")(3.57849)).toBe(formatAdminUsd(3.57849));
  });
  it("a duration in ms reads as a human duration, never a bare number of milliseconds", () => {
    const ms = drillUnitFormatter("ms", "points");
    expect(ms(850)).toBe("850ms");
    expect(ms(4200)).toBe("4.2s");
    expect(ms(185_000)).toBe("3m 05s");
    expect(ms(7_500_000)).toBe("2h 05m");
  });
  it("a share of 1 reads as a percent, a multiplier with ×, tokens compact, a count whole", () => {
    expect(drillUnitFormatter("share", "points")(0.1234)).toBe("12.3%");
    expect(drillUnitFormatter("times", "points")(5.99475984)).toBe("6.0×");
    expect(drillUnitFormatter("tokens", "points")(12_400_000)).toBe("12M");
    expect(drillUnitFormatter("count", "points")(1204)).toBe("1,204");
    expect(drillUnitFormatter(undefined, "points")(0.000434)).toBe("0.000434");
    expect(drillUnitFormatter("ms", "points")(null)).toBe("—");
  });
  it("a share, a multiplier or a duration never adds up across groups", () => {
    expect(drillUnitAdds("share")).toBe(false);
    expect(drillUnitAdds("times")).toBe(false);
    expect(drillUnitAdds("ms")).toBe(false);
    expect(drillUnitAdds("usd")).toBe(true);
  });
});

describe("a group reads as the definition's and the door's words, never a code or an id", () => {
  const status: Dim = { key: "status", label: "Status", from: "status", kind: "choice", choices: [{ value: "success", label: "Succeeded" }], empty_label: "No status" };
  const workflow: Dim = { key: "workflow", label: "Workflow", from: "workflow_id", kind: "relation", relation: { token: "workflow" }, empty_label: "No workflow" };
  const organization: Dim = { key: "organization", label: "Organization", from: "organization_id", kind: "relation" };

  it("a choice code reads as its declared label; an undeclared code in plain words; the empty group as declared", () => {
    const say = drillDimensionLabelFor(status, { names: undefined })!;
    expect(say("success")).toBe("Succeeded");
    expect(say("save_hook")).toBe("Save hook");
    expect(say(null)).toBe("No status");
    expect(plainWords("scrape_parsed_page")).toBe("Scrape parsed page");
  });
  it("a relation id reads as the door's label; one the door could not name says so", () => {
    const say = drillDimensionLabelFor(workflow, { names: { "w-1": "Weekly digest" } })!;
    expect(say("w-1")).toBe("Weekly digest");
    expect(say("w-2")).toBe("A workflow whose name you cannot read");
    expect(drillDimensionLabelFor(organization, { names: {} })!("o-9")).toBe("An organization whose name you cannot read");
    expect(say("")).toBe("No workflow");
  });
  it("a boolean reads Yes / No; a time is left to the package's period words", () => {
    const say = drillDimensionLabelFor({ key: "enrich_ran", label: "Enrichment ran", from: "enrich_ran", kind: "boolean" }, { names: undefined })!;
    expect([say("true"), say("false")]).toEqual(["Yes", "No"]);
    expect(drillDimensionLabelFor({ key: "at", label: "When", from: "created_at", kind: "time" }, { names: undefined })).toBeUndefined();
  });
  it("the door's labels on an answer become the names of its groups", () => {
    const rows = [
      { groups: { workflow: "w-1", status: "success" }, labels: { workflow: "Weekly digest" } },
      { groups: null, prior_groups: { workflow: "w-3" }, labels: { workflow: "Lead triage" } },
      { groups: {}, labels: {} },
    ];
    expect(drillDoorLabels(rows)).toEqual({ workflow: { "w-1": "Weekly digest", "w-3": "Lead triage" } });
  });
});
