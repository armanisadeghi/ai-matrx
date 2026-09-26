/**
 * The Entities pane never says "none found" unless extraction ran: 26,404
 * transcript chunks had `ner_extracted_at` NULL (provider key refused) while
 * the pane claimed "No people, places or things were found".
 */
import { displayableLabel, entitiesState } from "@/features/source-studio/sourceStudioModel";

describe("entitiesState", () => {
  it("server state wins, including the failure sentence", () => {
    expect(entitiesState("failed:The provider refused the key.", { total: 5, extracted: 5 })).toEqual({
      kind: "failed",
      sentence: "The provider refused the key.",
    });
    expect(entitiesState("running", null)).toEqual({ kind: "running" });
    expect(entitiesState("not_run", { total: 3, extracted: 3 })).toEqual({ kind: "not_run" });
    expect(entitiesState("failed", null)).toEqual({ kind: "failed", sentence: "the server did not say why" });
  });
  it("without the server state: no chunk extracted means not yet extracted", () => {
    expect(entitiesState(undefined, { total: 26404, extracted: 0 })).toEqual({ kind: "not_run" });
    expect(entitiesState(null, { total: 0, extracted: 0 })).toEqual({ kind: "not_run" });
    expect(entitiesState(null, { total: 10, extracted: 10 })).toEqual({ kind: "done" });
    expect(entitiesState(null, null)).toEqual({ kind: "unknown" });
  });
  it("codes are not names", () => {
    expect(displayableLabel("catalogued_source")).toBeNull();
    expect(displayableLabel("Launch plan")).toBe("Launch plan");
  });
});
