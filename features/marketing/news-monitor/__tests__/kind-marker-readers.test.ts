import { hasContentFields, readFailedStages, reportIsReadable } from "../run-document";

describe("news monitor kind-marker readers", () => {
  it("counts content whether or not an older record carries a marker", () => {
    expect(hasContentFields({ __kind: "news_story" })).toBe(false);
    expect(hasContentFields({ __kind: "news_story", title: "Story" })).toBe(true);
    expect(hasContentFields({ title: "Story" })).toBe(true);
  });

  it("finds a report with either a marker-bearing or markerless one-field story", () => {
    expect(
      reportIsReadable({ sections: { pitch_ready: [{ __kind: "news_story" }] } }),
    ).toBe(false);
    expect(
      reportIsReadable({ sections: { pitch_ready: [{ __kind: "news_story", title: "Story" }] } }),
    ).toBe(true);
    expect(reportIsReadable({ sections: { pitch_ready: [{ title: "Story" }] } })).toBe(true);
  });

  it("retains future stages and empty failure details while omitting only the marker", () => {
    expect(
      readFailedStages({ __kind: "news_failed_stages", collect: "timeout", future_stage: "" }),
    ).toEqual([{ stage: "collect", reason: "timeout" }, { stage: "future_stage", reason: "" }]);
  });
});
