/**
 * THE COVERAGE BOARD's fold — the pure half of the scoreboard.
 *
 * The defect this pins: the server names only the ORANGE and RED mandates and
 * counts the green ones. A client that "derives" green from the payload's
 * arrays gets it right; a client that treats a missing key as UNKNOWN would
 * render 335 blank badges, and one that treats an unreadable report as an
 * empty board would tell an admin everything is assigned when nothing is
 * known. Both are the failure this feature exists to prevent.
 */

import {
  COVERAGE_META,
  buildCoverageIndex,
  coverageBucketOf,
  type MandateCoverageResponse,
} from "../coverage";

const report = (
  overrides: Partial<MandateCoverageResponse> = {},
): MandateCoverageResponse => ({
  counts: { green: 335, orange: 33, red: 0 },
  orange: [],
  red: [],
  computed_at: "2026-08-28T00:00:00Z",
  ...overrides,
});

describe("buildCoverageIndex", () => {
  it("indexes orange rows with the leader carrying them", () => {
    const index = buildCoverageIndex(
      report({
        orange: [
          {
            mandate_key: "education.quiz_from_lesson",
            leader_key: "education.quiz_generation",
            reason: "falls back to education.quiz_generation",
          },
        ],
      }),
    );
    const entry = index["education.quiz_from_lesson"];
    expect(entry).toEqual({
      bucket: "orange",
      leaderKey: "education.quiz_generation",
      reason: "falls back to education.quiz_generation",
    });
  });

  it("indexes red rows with their reason", () => {
    const index = buildCoverageIndex(
      report({
        counts: { green: 1, orange: 0, red: 1 },
        red: [{ mandate_key: "seo.orphan", reason: "no holder and no fallback" }],
      }),
    );
    expect(index["seo.orphan"]).toEqual({
      bucket: "red",
      reason: "no holder and no fallback",
    });
  });

  it("lets RED win a collision — never downgrades 'cannot run' to 'fallback'", () => {
    const index = buildCoverageIndex(
      report({
        orange: [
          { mandate_key: "x.both", leader_key: "x.leader", reason: "fallback" },
        ],
        red: [{ mandate_key: "x.both", reason: "nothing assigned" }],
      }),
    );
    expect(coverageBucketOf(index, "x.both")).toBe("red");
  });
});

describe("coverageBucketOf", () => {
  it("reads an unnamed mandate as GREEN — the same rule the server counted by", () => {
    const index = buildCoverageIndex(
      report({
        orange: [{ mandate_key: "a.orange", leader_key: "a.lead", reason: "r" }],
        red: [{ mandate_key: "a.red", reason: "r" }],
      }),
    );
    expect(coverageBucketOf(index, "podcast.multihost_script")).toBe("green");
    expect(coverageBucketOf(index, "a.orange")).toBe("orange");
    expect(coverageBucketOf(index, "a.red")).toBe("red");
  });

  it("folds every named row into the buckets the counts claim", () => {
    const live = report({
      counts: { green: 3, orange: 2, red: 1 },
      orange: [
        { mandate_key: "o.one", leader_key: "l.one", reason: "r" },
        { mandate_key: "o.two", leader_key: null, reason: "r" },
      ],
      red: [{ mandate_key: "r.one", reason: "r" }],
    });
    const index = buildCoverageIndex(live);
    const keys = ["g.a", "g.b", "g.c", "o.one", "o.two", "r.one"];
    const tally = { green: 0, orange: 0, red: 0 };
    for (const key of keys) tally[coverageBucketOf(index, key)] += 1;
    expect(tally).toEqual(live.counts);
  });
});

describe("COVERAGE_META", () => {
  it("uses the platform's words and none of the banned ones", () => {
    const copy = Object.values(COVERAGE_META)
      .flatMap((meta) => [meta.label, meta.description])
      .join(" ")
      .toLowerCase();
    for (const banned of [
      "job",
      "place",
      "treatment",
      "species",
      "referenced",
      "discovered",
      "known values",
    ]) {
      expect(copy).not.toContain(banned);
    }
    expect(COVERAGE_META.green.label).toBe("Assigned");
    expect(COVERAGE_META.orange.label).toBe("Running on fallback");
    expect(COVERAGE_META.red.label).toBe("Nothing assigned");
  });
});
