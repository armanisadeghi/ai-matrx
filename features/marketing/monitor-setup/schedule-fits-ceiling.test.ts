/**
 * Defect 2 (2026-10-05): the preselected "7am and 2pm (recommended)" projected
 * about 1,005,738 points a month against a 500,000 ceiling. What a new monitor
 * starts on — and what is marked recommended — now fits the ceiling.
 * Defect 1: a name-only opportunity monitor saves as a draft and says so.
 */
import {
  fittingSchedule,
  opportunityDraftSentence,
  projectSchedules,
  type ScheduleOption,
} from "./model";

const PRESETS: ScheduleOption[] = [
  { id: "off", label: "No schedule", runsPerMonth: 0, recommended: false },
  { id: "daily_7am", label: "7am daily", runsPerMonth: 30, recommended: false },
  { id: "twice_daily", label: "7am and 2pm", runsPerMonth: 60, recommended: true },
  { id: "hourly", label: "Hourly", runsPerMonth: 720, recommended: false },
];

describe("fittingSchedule", () => {
  it("keeps the knob's choice when it fits the ceiling", () => {
    const projections = projectSchedules(PRESETS, 5_000, 500_000);
    expect(fittingSchedule("twice_daily", PRESETS, projections)).toBe("twice_daily");
  });

  it("moves to the busiest choice that fits when the knob's choice is over the ceiling", () => {
    // 60 runs × 10,000 = 600,000 a month vs a 500,000 ceiling; 30 runs fit.
    const projections = projectSchedules(PRESETS, 10_000, 500_000);
    expect(fittingSchedule("twice_daily", PRESETS, projections)).toBe("daily_7am");
  });

  it("falls back to No schedule when no scheduled choice fits", () => {
    // The tester's numbers: 60 runs ≈ 1,005,738 a month (≈16,762 a run), so even daily is over.
    const projections = projectSchedules(PRESETS, 16_762.3, 500_000);
    expect(fittingSchedule("twice_daily", PRESETS, projections)).toBe("off");
  });

  it("keeps the knob's choice when there is no cost to project", () => {
    expect(fittingSchedule("twice_daily", PRESETS, [])).toBe("twice_daily");
  });
});

describe("opportunityDraftSentence", () => {
  it("says a name-only opportunity monitor saved as a draft", () => {
    expect(
      opportunityDraftSentence({ lenses: ["opportunity"], topics: [], search_terms: [], feed_ids: [], feed_urls: [] }),
    ).toMatch(/^Saved as a draft/);
  });
  it("says nothing once it watches something, or without the lens", () => {
    expect(opportunityDraftSentence({ lenses: ["opportunity"], topics: ["x"] })).toBeNull();
    expect(opportunityDraftSentence({ lenses: ["coverage"], topics: [] })).toBeNull();
  });
});
