import {
  budgetTone,
  isLargeTwin,
  judgedValue,
  measuresLine,
  subjectFields,
  watchReason,
  sampleAgeTone,
  sparklinePoints,
  stateCounts,
  stateHistory,
  summarizeWatches,
  type PerfSample,
  type PerfWatch,
} from "./model";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const HOUR = 3_600_000;

function watch(over: Partial<PerfWatch> = {}): PerfWatch {
  return {
    id: "w1",
    slug: "door:custom.data_home",
    label: "Data home",
    owner: "data",
    source_feature: "data",
    is_active: true,
    live_every_seconds: 600,
    perf_kind: "door",
    perf_subject: null,
    budget_ms: 100,
    budget_stat: "p95",
    perf_state: "ok",
    perf_state_since: null,
    perf_baseline_ms: 40,
    perf_baseline_pinned: false,
    perf_last_alert_at: null,
    metadata: {},
    ...over,
  };
}

function sample(over: Partial<PerfSample> = {}): PerfSample {
  return {
    id: "s1",
    check_id: "w1",
    measured_at: new Date(NOW - HOUR).toISOString(),
    source: "probe",
    n: 5,
    p50_ms: 20,
    p95_ms: 150,
    max_ms: 200,
    mean_ms: 30,
    calls: null,
    errors: 0,
    bytes: null,
    release_sha: null,
    state_after: "ok",
    note: null,
    metadata: {},
    ...over,
  };
}

describe("judgedValue", () => {
  it("reads the column the budget binds", () => {
    expect(judgedValue(sample(), "p95")).toBe(150);
    expect(judgedValue(sample(), "p50")).toBe(20);
    expect(judgedValue(sample(), "mean")).toBe(30);
  });
  it("is null for a stat the sample does not carry", () => {
    expect(judgedValue(sample(), "p75")).toBeNull();
    expect(judgedValue(sample({ p95_ms: null }), "p95")).toBeNull();
  });
});

describe("budgetTone", () => {
  it("is over only when the judged number exceeds the budget", () => {
    expect(budgetTone(150, 100)).toBe("over");
    expect(budgetTone(100, 100)).toBe("ok");
    expect(budgetTone(null, 100)).toBe("none");
    expect(budgetTone(50, null)).toBe("none");
  });
});

describe("sampleAgeTone", () => {
  it("is stale past three times the cadence", () => {
    expect(sampleAgeTone(29 * 60_000, 600)).toBe("fresh");
    expect(sampleAgeTone(31 * 60_000, 600)).toBe("stale");
  });
  it("is unknown without an age or cadence", () => {
    expect(sampleAgeTone(null, 600)).toBe("none");
    expect(sampleAgeTone(1000, null)).toBe("none");
  });
});

describe("summarizeWatches", () => {
  it("uses the newest sample, binds the budget stat and keeps a 7-day spark oldest first", () => {
    const rows = summarizeWatches(
      [watch()],
      [
        sample({ id: "a", measured_at: new Date(NOW - 2 * HOUR).toISOString(), p95_ms: 90 }),
        sample({ id: "b", measured_at: new Date(NOW - HOUR).toISOString(), p95_ms: 150 }),
        sample({ id: "old", measured_at: new Date(NOW - 8 * 24 * HOUR).toISOString(), p95_ms: 5 }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].latest?.id).toBe("b");
    expect(rows[0].judged).toBe(150);
    expect(rows[0].tone).toBe("over");
    expect(rows[0].spark).toEqual([90, 150]);
    expect(rows[0].ageMs).toBe(HOUR);
  });
  it("has no latest and no tone for a watch never sampled", () => {
    const [row] = summarizeWatches([watch()], [], NOW);
    expect(row.latest).toBeNull();
    expect(row.judged).toBeNull();
    expect(row.tone).toBe("none");
    expect(row.age).toBe("none");
  });
});

describe("stateCounts", () => {
  it("counts per state and treats a missing state as learning", () => {
    expect(stateCounts([watch(), watch({ perf_state: "over_budget" }), watch({ perf_state: null })])).toEqual({
      ok: 1,
      over_budget: 1,
      learning: 1,
    });
  });
});

describe("stateHistory", () => {
  it("lists only transitions, newest first", () => {
    const at = (h: number) => new Date(NOW - h * HOUR).toISOString();
    const h = stateHistory([
      sample({ id: "1", measured_at: at(5), state_after: "learning" }),
      sample({ id: "2", measured_at: at(4), state_after: "learning" }),
      sample({ id: "3", measured_at: at(3), state_after: "ok" }),
      sample({ id: "4", measured_at: at(2), state_after: "ok" }),
      sample({ id: "5", measured_at: at(1), state_after: "over_budget" }),
    ]);
    expect(h.map((t) => t.state)).toEqual(["over_budget", "ok", "learning"]);
  });
});

describe("sparklinePoints", () => {
  it("maps values into the box, low at the bottom, and is empty under two points", () => {
    expect(sparklinePoints([1], 100, 20)).toBe("");
    const pts = sparklinePoints([0, 10], 100, 20).split(" ");
    expect(pts[0]).toBe("0,20");
    expect(pts[1]).toBe("100,0");
  });
});

describe("subjectFields (wave 2: readable subject, never raw JSON)", () => {
  it("names function, table with records, organization, seat and the remaining args of a large door twin", () => {
    const f = subjectFields(
      watch({
        slug: "door:custom.read_records_page:sorted_search@large",
        perf_subject: {
          schema: "custom",
          function: "read_records_page",
          table_records: 25000,
          args: {
            p_organization_id: "344cfaa8-2b0c-4971-854a-9694614816f2",
            p_table_id: "a312f617-a388-41f4-b1ed-37a844827684",
            p_limit: 50,
            p_search: "retainer",
            p_sort: [{ field: "work_date", direction: "asc" }],
          },
        },
        metadata: { perf_subject_names: { table_name: "Time Entries", organization_name: "Holloway Creative" } },
      }),
    );
    expect(f).toEqual([
      { label: "Function", value: "custom.read_records_page" },
      { label: "Table", value: "Time Entries · 25,000 records", token: "record", id: "a312f617-a388-41f4-b1ed-37a844827684" },
      { label: "Organization", value: "Holloway Creative", token: "organization", id: "344cfaa8-2b0c-4971-854a-9694614816f2" },
      { label: "Seat", value: "admin@admin.com" },
      { label: "Args", value: 'limit=50, search=retainer, sort=[{"field":"work_date","direction":"asc"}]' },
    ]);
  });

  it("reads drill_rows' table from p_source and counts id arrays", () => {
    const f = subjectFields(
      watch({
        perf_subject: {
          schema: "custom",
          function: "relation_words_with_icons_many",
          args: { p_source: { kind: "table", id: "7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd" }, p_record_ids: ["15a1b961-39ea-48c0-96fb-73f258b2f9aa", "2ccbb0b3-9749-404b-b474-55590fa6e2ca"] },
        },
      }),
    );
    // No name recorded yet: the short id still opens the table.
    expect(f).toContainEqual({ label: "Table", value: "7ea2340a", token: "record", id: "7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd" });
    expect(f).toContainEqual({ label: "Args", value: "record_ids=2 ids" });
  });

  it("says a statement watch measures every real caller", () => {
    const w = watch({ perf_kind: "statement", perf_subject: { schema: "custom", function: "data_home", match: '"custom"."data_home"(' } });
    expect(subjectFields(w)).toEqual([
      { label: "Function", value: "custom.data_home" },
      { label: "Callers", value: "All real callers" },
      { label: "Matches", value: '"custom"."data_home"(' },
    ]);
    expect(measuresLine(w)).toBe("Mean, all real callers");
  });

  it("names the watch's own seat (member twins), not always the admin seat", () => {
    const f = subjectFields(watch({ perf_subject: { schema: "custom", function: "views", seat_email: "hugo.waelchi.cfd403@fixtures.aimatrx.com", args: {} } }));
    expect(f).toContainEqual({ label: "Seat", value: "hugo.waelchi.cfd403@fixtures.aimatrx.com" });
  });

  it("is empty for a missing subject", () => {
    expect(subjectFields(watch({ perf_subject: null }))).toEqual([]);
  });
});

describe("watchReason / isLargeTwin", () => {
  it("reads the judge's reason from metadata", () => {
    expect(watchReason(watch({ metadata: { perf_last_reason: "learning: 1 of 3 samples" } }))).toBe("learning: 1 of 3 samples");
    expect(watchReason(watch({ metadata: {} }))).toBeNull();
  });
  it("knows a large twin by its slug", () => {
    expect(isLargeTwin(watch({ slug: "door:custom.views@large" }))).toBe(true);
    expect(isLargeTwin(watch())).toBe(false);
  });
});

describe("judgedValue p75 (vitals)", () => {
  it("reads p75 from the sample's metadata", () => {
    const sample = { id: "s", check_id: "c", measured_at: "2026-10-08T23:00:00Z", source: "vital", n: 40, p50_ms: 1000, p95_ms: 9000,
      max_ms: 9000, mean_ms: 2000, calls: null, errors: 0, bytes: null, release_sha: null, state_after: "ok", note: null,
      metadata: { p75_ms: 3100 } } as PerfSample;
    expect(judgedValue(sample, "p75")).toBe(3100);
    expect(judgedValue({ ...sample, metadata: {} }, "p75")).toBeNull();
  });
});
