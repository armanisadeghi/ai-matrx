// lib/integrity/types.ts
//
// Generic data-integrity framework — shared types.
//
// The framework is registry-driven so integrity auditing is NOT a one-time
// script: every check is a declarative definition, run on demand from the
// admin UI (`/administration/data-integrity`) and from CI/cron via
// `scripts/check-data-integrity.ts`. Adding a new invariant = adding one entry
// to `checks.ts` — both surfaces pick it up automatically.
//
// Two check kinds:
//   - "sql"   — a single SQL statement run through the `execute_admin_query`
//               RPC. Scale-safe: each query carries a `count(*) over()` window
//               column (aliased `_total`) and a LIMIT, so we get the true
//               finding count plus a bounded sample in one round-trip.
//   - "probe" — selects candidate file rows (SQL) then probes each file's bytes
//               over HTTP (S3 liveness). Opt-in and bounded; requires an auth
//               token, otherwise the check reports `skipped`.

export type IntegritySeverity = "error" | "warning" | "info";

/** One offending row. Shape is per-check (whatever the SQL selected). */
export type IntegrityFinding = Record<string, unknown>;

interface IntegrityCheckBase {
  /** Stable id (kebab-case). Used by the API, CLI, and as the React key. */
  id: string;
  title: string;
  /** What the check looks for and why it matters. */
  description: string;
  /** Grouping bucket for the UI, e.g. "Files", "PDF / Documents". */
  category: string;
  severity: IntegritySeverity;
  /** Human guidance on how to fix findings (shown in UI + CLI). */
  remediation?: string;
}

export interface SqlIntegrityCheck extends IntegrityCheckBase {
  kind: "sql";
  /**
   * SQL returning offending rows. MUST include `count(*) over() as _total` and
   * a `LIMIT` so the sample stays bounded. Zero rows = no findings.
   */
  sql: string;
}

export interface ProbeIntegrityCheck extends IntegrityCheckBase {
  kind: "probe";
  /**
   * SQL selecting probe candidates. Each row MUST include an `id` column (the
   * file id) and SHOULD include `file_name`. Keep a `LIMIT` — probing is HTTP,
   * one request per row.
   */
  candidateSql: string;
  /** HTTP statuses that count as a finding (dead/broken source). */
  failureStatuses: number[];
}

export type IntegrityCheckDef = SqlIntegrityCheck | ProbeIntegrityCheck;

export interface IntegrityCheckResult {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: IntegritySeverity;
  remediation?: string;
  /** Total offending rows (full count from the window, not just the sample). */
  count: number;
  /** Bounded sample of offending rows (already limited by the SQL). */
  sample: IntegrityFinding[];
  /** True when the check completed and found zero issues. */
  ok: boolean;
  /** Set when the check could not run (SQL/probe error). */
  error?: string;
  /** Set when an opt-in check was intentionally not run (e.g. probe, no token). */
  skipped?: boolean;
  durationMs: number;
}

export interface IntegrityReport {
  generatedAt: string;
  results: IntegrityCheckResult[];
  totals: {
    checks: number;
    /** Checks that found ≥1 issue. */
    withFindings: number;
    failed: number;
    skipped: number;
    /** Sum of finding counts across checks of each severity. */
    errorFindings: number;
    warningFindings: number;
    infoFindings: number;
  };
}

/** Runs a SQL statement and returns the offending rows. */
export type SqlRunner = (sql: string) => Promise<IntegrityFinding[]>;

/** Probes a single file's bytes. `status` is null on network failure/timeout. */
export type FileProbe = (
  fileId: string,
) => Promise<{ status: number | null; ms: number; error?: string }>;

export interface IntegrityRunContext {
  sql: SqlRunner;
  /** When absent, probe-kind checks are reported as skipped. */
  probe?: FileProbe;
}
