// The comparison ranks rating gaps largest first, computed in code.
// Red before: without a ranking the rows come out in template order and the biggest disagreement is buried.
import { averageRatings, rankRatingDeltas } from "../deltas";
import { emptyAnswers, parseTemplate } from "../types";

const template = parseTemplate({
  name: "Default",
  rating_scale: { points: [{ value: 1, key: "unsatisfactory", label: "Unsatisfactory" }] },
  sections: [
    {
      key: "ratings",
      title: "Ratings",
      questions: [
        { key: "performance", type: "rating", label: "Performance", items: [{ key: "work_quality", label: "Work quality" }, { key: "productivity", label: "Productivity" }, { key: "initiative", label: "Initiative" }] },
        { key: "attendance", type: "rating", label: "Attendance", items: [{ key: "punctuality", label: "Punctuality" }] },
      ],
    },
  ],
});

const answers = (ratings: Record<string, number>) => ({ ...emptyAnswers(), ratings });

describe("rankRatingDeltas", () => {
  it("puts the largest gap first, either direction, and keeps template order on ties", () => {
    const self = answers({ "performance.work_quality": 4, "performance.productivity": 5, "performance.initiative": 3, "attendance.punctuality": 4 });
    const manager = answers({ "performance.work_quality": 3, "performance.productivity": 2, "performance.initiative": 4, "attendance.punctuality": 4 });
    const ranked = rankRatingDeltas(template, self, manager);
    expect(ranked.map((d) => d.key)).toEqual(["performance.productivity", "performance.work_quality", "performance.initiative", "attendance.punctuality"]);
    expect(ranked[0]).toMatchObject({ self: 5, manager: 2, gap: -3, size: 3 });
    // work_quality (-1) and initiative (+1) tie: template order wins
    expect(ranked[1]!.gap).toBe(-1);
    expect(ranked[2]!.gap).toBe(1);
  });

  it("skips an item only one side rated, rather than inventing a gap", () => {
    const ranked = rankRatingDeltas(template, answers({ "performance.work_quality": 4 }), answers({ "performance.work_quality": 2, "attendance.punctuality": 5 }));
    expect(ranked.map((d) => d.key)).toEqual(["performance.work_quality"]);
  });

  it("averages both sides over the items both rated", () => {
    const ranked = rankRatingDeltas(template, answers({ "performance.work_quality": 4, "attendance.punctuality": 2 }), answers({ "performance.work_quality": 2, "attendance.punctuality": 4 }));
    expect(averageRatings(ranked)).toEqual({ self: 3, manager: 3 });
    expect(averageRatings([])).toEqual({ self: null, manager: null });
  });
});
