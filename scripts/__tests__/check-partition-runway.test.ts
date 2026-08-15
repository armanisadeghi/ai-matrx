/**
 * Rules for `pnpm check:partition-runway` (scripts/partition-runway/core.ts).
 *
 * The live DB is healthy, so a green run proves only that the check RUNS. What
 * matters is that it FIRES — these cases replay the August 2026 outage (D122)
 * and its neighbours against the classifier.
 */
import {
  checkCronJob,
  checkPartitionedTable,
  classify,
  expectedIntervalHours,
  MIN_RUNWAY_DAYS,
  thresholdFor,
} from "../partition-runway/core";
import type { CronJob, PartitionedTable } from "../partition-runway/core";

/** history.row_versions, exactly as the live snapshot reports it today. */
function healthyRowVersions(overrides: Partial<PartitionedTable> = {}): PartitionedTable {
  return {
    schema: "history",
    table: "row_versions",
    partition_key: "RANGE (occurred_at)",
    key_kind: "time",
    partition_count: 28,
    cadence_days: 28,
    max_upper_bound: "2028-02-01T00:00:00+00:00",
    unbounded_top: false,
    runway_days: 534,
    default_partition: "history.row_versions_default",
    default_rows: 0,
    ...overrides,
  };
}

function cronJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    jobid: 15,
    jobname: "ensure-row-version-partitions",
    schedule: "40 2 * * *",
    active: true,
    last_run: "2026-08-14T02:40:00Z",
    last_status: "succeeded",
    hours_since_last_run: 22,
    ...overrides,
  };
}

describe("partition runway", () => {
  it("passes the real, healthy live state", () => {
    expect(checkPartitionedTable(healthyRowVersions())).toEqual([]);
  });

  it("FIRES on the D122 outage: runway already exhausted", () => {
    // What August 2026 actually looked like: the last partition ended days ago
    // and every versioned write was failing.
    const findings = checkPartitionedTable(
      healthyRowVersions({
        runway_days: -4,
        max_upper_bound: "2026-08-01T00:00:00+00:00",
        partition_count: 20,
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.kind).toBe("runway");
    expect(findings[0]?.message).toContain("RUNWAY EXHAUSTED 4 days ago");
    expect(findings[0]?.subject).toBe("history.row_versions");
  });

  it("FIRES with weeks of warning, before anything breaks", () => {
    const findings = checkPartitionedTable(healthyRowVersions({ runway_days: 45 }));
    expect(findings).toHaveLength(1);
    // 45 days left on a monthly cadence: real, but not yet an outage.
    expect(findings[0]?.severity).toBe("warn");
    expect(findings[0]?.message).toContain("only 45 days");
    expect(findings[0]?.message).toContain("threshold is 60d");
  });

  it("escalates to error once less than one provisioning cycle remains", () => {
    const findings = checkPartitionedTable(healthyRowVersions({ runway_days: 20 }));
    expect(findings[0]?.severity).toBe("error");
  });

  it("does not fire one day above the threshold", () => {
    expect(checkPartitionedTable(healthyRowVersions({ runway_days: MIN_RUNWAY_DAYS })))
      .toEqual([]);
    expect(
      checkPartitionedTable(healthyRowVersions({ runway_days: MIN_RUNWAY_DAYS - 1 })),
    ).toHaveLength(1);
  });

  it("FIRES when the catch-all partition has started receiving rows", () => {
    // The provisioner already failed; the catch-all hid it. Runway looks fine.
    const findings = checkPartitionedTable(healthyRowVersions({ default_rows: 812 }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("default-rows");
    expect(findings[0]?.severity).toBe("error");
    expect(findings[0]?.message).toContain("row_versions_default");
  });

  it("reports both catch-all rows and short runway together", () => {
    const findings = checkPartitionedTable(
      healthyRowVersions({ default_rows: 5, runway_days: 3 }),
    );
    expect(findings.map((f) => f.kind).sort()).toEqual(["default-rows", "runway"]);
  });

  it("FIRES when no upper bound can be read at all", () => {
    const findings = checkPartitionedTable(
      healthyRowVersions({ runway_days: null, max_upper_bound: null }),
    );
    expect(findings[0]?.kind).toBe("runway-unknown");
    expect(findings[0]?.severity).toBe("error");
  });

  it("stays silent for partitions that cannot run out", () => {
    expect(
      checkPartitionedTable(healthyRowVersions({ unbounded_top: true, runway_days: null })),
    ).toEqual([]);
    expect(
      checkPartitionedTable(
        healthyRowVersions({ key_kind: "non-time", runway_days: null, cadence_days: null }),
      ),
    ).toEqual([]);
  });

  describe("thresholds", () => {
    it("uses the 60-day floor for our own monthly table", () => {
      expect(thresholdFor(healthyRowVersions()).days).toBe(MIN_RUNWAY_DAYS);
    });

    it("scales above the floor for a slow cadence", () => {
      // Quarterly partitions: two cycles is 180 days, well past the floor.
      expect(thresholdFor(healthyRowVersions({ cadence_days: 90 })).days).toBe(180);
    });

    it("uses the vendor threshold for Supabase-managed realtime.messages", () => {
      const realtime: PartitionedTable = {
        schema: "realtime",
        table: "messages",
        partition_key: "RANGE (inserted_at)",
        key_kind: "time",
        partition_count: 7,
        cadence_days: 1,
        max_upper_bound: "2026-08-19T00:00:00+00:00",
        unbounded_top: false,
        runway_days: 3,
        default_partition: null,
        default_rows: 0,
      };
      // 3 days on a daily vendor cadence is normal, and must not cry wolf.
      expect(checkPartitionedTable(realtime)).toEqual([]);
      // A dead vendor provisioner still gets caught.
      expect(checkPartitionedTable({ ...realtime, runway_days: 1 })).toHaveLength(1);
    });
  });
});

describe("cron liveness", () => {
  it("passes a healthy daily job", () => {
    expect(checkCronJob(cronJob())).toEqual([]);
  });

  it("FIRES when the provisioning job has stopped running", () => {
    // The 2026-08 shape: job still listed as active, simply not firing.
    const findings = checkCronJob(cronJob({ hours_since_last_run: 120 }));
    expect(findings[0]?.kind).toBe("cron-stalled");
    expect(findings[0]?.severity).toBe("error");
  });

  it("FIRES when the last run failed", () => {
    const findings = checkCronJob(cronJob({ last_status: "failed" }));
    expect(findings[0]?.kind).toBe("cron-failed");
    expect(findings[0]?.severity).toBe("error");
  });

  it("FIRES when the job was disabled", () => {
    const findings = checkCronJob(cronJob({ active: false }));
    expect(findings[0]?.kind).toBe("cron-inactive");
  });

  it("tolerates normal slack (a daily job 22h since its last run)", () => {
    expect(checkCronJob(cronJob({ hours_since_last_run: 22 }))).toEqual([]);
    expect(checkCronJob(cronJob({ hours_since_last_run: 71 }))).toEqual([]);
    expect(checkCronJob(cronJob({ hours_since_last_run: 73 }))).toHaveLength(1);
  });

  it("stays silent on a schedule it cannot parse", () => {
    expect(
      checkCronJob(cronJob({ schedule: "0 3 1-5,15 */2 *", hours_since_last_run: 900 })),
    ).toEqual([]);
  });

  describe("schedule cadence parsing", () => {
    it.each([
      ["30 seconds", 30 / 3600],
      ["*/5 * * * *", 5 / 60],
      ["7 * * * *", 1],
      ["0 3 * * *", 24],
      ["0 3 * * 0", 24 * 7],
      ["40 2 * * *", 24],
    ])("%s", (schedule, hours) => {
      expect(expectedIntervalHours(schedule)).toBeCloseTo(hours, 6);
    });

    it("returns null for shapes it does not confidently understand", () => {
      expect(expectedIntervalHours("0 3 1-5,15 */2 *")).toBeNull();
      expect(expectedIntervalHours("nonsense")).toBeNull();
    });
  });
});

describe("classify", () => {
  it("aggregates partition and cron findings from one snapshot", () => {
    const findings = classify({
      generated_at: "2026-08-15T01:00:00Z",
      partitioned: [healthyRowVersions({ runway_days: -4 })],
      cron_jobs: [cronJob({ hours_since_last_run: 120 })],
    });
    expect(findings.map((f) => f.kind)).toEqual(["runway", "cron-stalled"]);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });

  it("is empty for the live, healthy snapshot shape", () => {
    expect(
      classify({
        generated_at: "2026-08-15T01:00:00Z",
        partitioned: [healthyRowVersions()],
        cron_jobs: [cronJob()],
      }),
    ).toEqual([]);
  });
});
