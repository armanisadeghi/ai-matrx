/**
 * Pure classification core for `pnpm check:partition-runway`.
 *
 * Kept free of network, filesystem and clock access so the rules can be tested
 * against hypothetical snapshots — including the exact August 2026 outage
 * (D122) this check exists to have caught. See ./FEATURE.md.
 */

/** One RANGE-partitioned parent, as reported by public.partition_runway_snapshot(). */
export interface PartitionedTable {
  schema: string;
  table: string;
  partition_key: string;
  key_kind: "time" | "non-time";
  partition_count: number;
  /** Narrowest observed partition width in days — the provisioning cadence. */
  cadence_days: number | null;
  max_upper_bound: string | null;
  unbounded_top: boolean;
  /** Whole days between now() and the highest upper bound. Negative = already expired. */
  runway_days: number | null;
  default_partition: string | null;
  /** Rows found in the catch-all partition, probed with LIMIT 1000. */
  default_rows: number;
}

export interface CronJob {
  jobid: number;
  jobname: string | null;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
  hours_since_last_run: number | null;
}

export interface RunwaySnapshot {
  generated_at: string;
  partitioned: PartitionedTable[];
  cron_jobs: CronJob[];
}

export type Severity = "error" | "warn";

export interface Finding {
  severity: Severity;
  /** Stable machine key, e.g. "runway" / "default-rows" / "cron-failed". */
  kind: string;
  /** What ran out (schema.table or the cron job name). */
  subject: string;
  message: string;
  /** The one thing to do about it. */
  fix: string;
}

/**
 * THE FLOOR — a partitioned table must keep at least this many days of runway.
 *
 * WHY 60. history.row_versions provisions MONTHLY. A floor below one month
 * would let the alarm and the outage arrive in the same week, which is not an
 * alarm. 60 days is two full monthly cycles: the provisioner can miss a run
 * entirely, we still get told with a month of slack, and a human can act on a
 * weekday without an incident. Raising it costs nothing (the fixed provisioner
 * keeps an 18-month runway); lowering it below ~35 makes the check decorative.
 *
 * A CAPS constant, deliberately not an env var — a threshold is not a value
 * that differs per environment, and a forgotten dashboard toggle is exactly the
 * failure mode this whole check exists to prevent (CLAUDE.md § An env var is a
 * VALUE, never a TOGGLE).
 */
export const MIN_RUNWAY_DAYS = 60;

/**
 * Tables whose partitions WE do not provision. The floor above is written for
 * our own monthly cadence; a vendor rolling its own daily window is not a
 * defect and must not cry wolf every single day. These still get a threshold —
 * they just get one in their own units, so a genuinely dead vendor provisioner
 * is still caught.
 */
export const FOREIGN_PARTITION_OWNERS: Record<
  string,
  { owner: string; minRunwayDays: number }
> = {
  "realtime.messages": {
    owner: "Supabase Realtime (vendor-managed)",
    // Daily cadence, rolling ~3-day window maintained by Supabase's own
    // service. Two days of runway means their provisioner missed a day.
    minRunwayDays: 2,
  },
};

/** The runway threshold for one table, and why it has that value. */
export function thresholdFor(t: PartitionedTable): {
  days: number;
  reason: string;
} {
  const key = `${t.schema}.${t.table}`;
  const foreign = FOREIGN_PARTITION_OWNERS[key];
  if (foreign) {
    return {
      days: foreign.minRunwayDays,
      reason: `${foreign.owner}, cadence ${fmtCadence(t.cadence_days)}`,
    };
  }
  // Two provisioning cycles, never below the floor.
  const cycles = t.cadence_days ? Math.ceil(t.cadence_days * 2) : 0;
  if (cycles > MIN_RUNWAY_DAYS) {
    return { days: cycles, reason: `2 cycles of a ${fmtCadence(t.cadence_days)} cadence` };
  }
  return { days: MIN_RUNWAY_DAYS, reason: `floor of ${MIN_RUNWAY_DAYS}d` };
}

function fmtCadence(days: number | null): string {
  if (days === null) return "unknown";
  if (days >= 28 && days <= 31) return "monthly";
  if (days === 7) return "weekly";
  if (days === 1) return "daily";
  return `${Number(days.toFixed(2))}d`;
}

/** Classify one partitioned table. */
export function checkPartitionedTable(t: PartitionedTable): Finding[] {
  const subject = `${t.schema}.${t.table}`;
  const found: Finding[] = [];

  // A row in the catch-all means the provisioner ALREADY failed and the
  // catch-all quietly absorbed writes that belong in a real partition. That is
  // a caught outage — report it even when the runway now looks healthy.
  if (t.default_partition && t.default_rows > 0) {
    found.push({
      severity: "error",
      kind: "default-rows",
      subject,
      message:
        `catch-all partition ${t.default_partition} holds rows ` +
        `(${t.default_rows >= 1000 ? "1000+" : t.default_rows}). Rows only land there when no ` +
        `real partition covered their key — the provisioner failed at some point.`,
      fix:
        `Find the uncovered range (select min/max of the partition key in ` +
        `${t.default_partition}), create the missing partitions, move the rows in, ` +
        `and confirm the provisioning cron job ran on every day in that window.`,
    });
  }

  if (t.unbounded_top) {
    return found; // A top partition open to MAXVALUE cannot run out.
  }
  if (t.key_kind === "non-time") {
    return found; // Runway is not a number of days for a non-time key.
  }

  if (t.runway_days === null) {
    found.push({
      severity: "error",
      kind: "runway-unknown",
      subject,
      message:
        `RANGE-partitioned on ${t.partition_key} but no upper bound could be read ` +
        `from any of its ${t.partition_count} partitions — runway is unknown, which ` +
        `is indistinguishable from zero.`,
      fix: `Inspect the partition bounds by hand and make sure a future-dated partition exists.`,
    });
    return found;
  }

  const { days: threshold, reason } = thresholdFor(t);
  if (t.runway_days >= threshold) return found;

  // Past the end, or inside the final cycle: writes are failing or about to.
  const cadence = t.cadence_days ?? 0;
  const imminent = t.runway_days <= 0 || t.runway_days <= cadence;
  found.push({
    severity: imminent ? "error" : "warn",
    kind: "runway",
    subject,
    message:
      t.runway_days < 0
        ? `RUNWAY EXHAUSTED ${Math.abs(t.runway_days)} days ago — last partition ended ` +
          `${t.max_upper_bound}. Every write whose ${t.partition_key} falls past that ` +
          `bound is FAILING right now.`
        : `only ${t.runway_days} days of partition runway left (ends ${t.max_upper_bound}); ` +
          `threshold is ${threshold}d — ${reason}.`,
    fix:
      `Provision partitions past the threshold now, then verify the job that ` +
      `creates them is active and succeeding. For history.row_versions that is ` +
      `cron job "ensure-row-version-partitions" ` +
      `(migrations/history_row_versions_partition_autoprovision.sql).`,
  });
  return found;
}

/**
 * Expected hours between runs for the cron spellings actually in use here.
 * Returns null when the schedule is one we do not confidently understand —
 * silence beats a wrong overdue alarm.
 */
export function expectedIntervalHours(schedule: string): number | null {
  const s = schedule.trim();

  const secs = s.match(/^(\d+)\s*seconds?$/i);
  if (secs) return Number(secs[1]) / 3600;

  const parts = s.split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];

  const everyN = min.match(/^\*\/(\d+)$/);
  if (everyN && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return Number(everyN[1]) / 60;
  }
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return 1; // hourly
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*") {
    if (dow === "*") return 24; // daily
    if (/^\d+$/.test(dow)) return 24 * 7; // weekly
    return null;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === "*" && dow === "*") {
    return 24 * 31; // monthly
  }
  return null;
}

/**
 * Classify one cron job. Time-bounded DDL is only as alive as the job that
 * extends it — the four-day outage was a provisioning job that stopped.
 */
export function checkCronJob(j: CronJob): Finding[] {
  const subject = j.jobname ?? `job ${j.jobid}`;
  const found: Finding[] = [];

  if (!j.active) {
    found.push({
      severity: "warn",
      kind: "cron-inactive",
      subject,
      message: `pg_cron job is INACTIVE (schedule "${j.schedule}") — it will never run again.`,
      fix: `Re-enable it (update cron.job set active = true) or delete it if it is genuinely retired.`,
    });
    return found;
  }

  if (j.last_status && j.last_status !== "succeeded") {
    found.push({
      severity: "error",
      kind: "cron-failed",
      subject,
      message: `last pg_cron run ended "${j.last_status}" (at ${j.last_run ?? "unknown"}).`,
      fix: `Read the failure: select * from cron.job_run_details where jobid = ${j.jobid} order by start_time desc limit 5;`,
    });
  }

  const expected = expectedIntervalHours(j.schedule);
  if (expected !== null && j.hours_since_last_run !== null) {
    // Three missed intervals (and at least an hour) before calling it stalled —
    // enough slack for a restart or a retained-history gap.
    const limit = Math.max(expected * 3, 1);
    if (j.hours_since_last_run > limit) {
      found.push({
        severity: "error",
        kind: "cron-stalled",
        subject,
        message:
          `active job has not run for ${j.hours_since_last_run}h, but its schedule ` +
          `"${j.schedule}" expects a run every ~${expected}h.`,
        fix: `Check whether pg_cron is running and whether this job is erroring: select * from cron.job_run_details where jobid = ${j.jobid} order by start_time desc limit 5;`,
      });
    }
  }

  if (j.active && j.last_run === null) {
    found.push({
      severity: "warn",
      kind: "cron-never-ran",
      subject,
      message: `active job has no run history at all (schedule "${j.schedule}").`,
      fix: `Confirm it has run since it was created; cron.job_run_details is pruned, so this can also mean "not recently".`,
    });
  }

  return found;
}

/** Classify a whole snapshot. */
export function classify(snapshot: RunwaySnapshot): Finding[] {
  return [
    ...snapshot.partitioned.flatMap(checkPartitionedTable),
    ...snapshot.cron_jobs.flatMap(checkCronJob),
  ];
}
