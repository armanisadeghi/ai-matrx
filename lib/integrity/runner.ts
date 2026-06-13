// lib/integrity/runner.ts
//
// Executes integrity checks against a context (a SQL runner + optional file
// probe) and assembles a report. Used by both the admin API route and the CLI
// script so the two surfaces can never drift.

import { INTEGRITY_CHECKS } from "./checks";
import type {
  IntegrityCheckDef,
  IntegrityCheckResult,
  IntegrityFinding,
  IntegrityReport,
  IntegrityRunContext,
} from "./types";

const TOTAL_COL = "_total";

function readTotal(rows: IntegrityFinding[]): number {
  if (rows.length === 0) return 0;
  const raw = rows[0][TOTAL_COL];
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : rows.length;
}

function stripTotal(rows: IntegrityFinding[]): IntegrityFinding[] {
  return rows.map(({ [TOTAL_COL]: _omit, ...rest }) => rest);
}

/** Light limit so a slow/locked backend can't make the whole run hang. */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`probe timeout after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runSqlCheck(
  def: Extract<IntegrityCheckDef, { kind: "sql" }>,
  ctx: IntegrityRunContext,
): Promise<IntegrityCheckResult> {
  const start = Date.now();
  try {
    const rows = await ctx.sql(def.sql);
    const count = readTotal(rows);
    return {
      ...metaOf(def),
      count,
      sample: stripTotal(rows),
      ok: count === 0,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ...metaOf(def),
      count: 0,
      sample: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

const PROBE_CONCURRENCY = 6;
const PROBE_TIMEOUT_MS = 20000;

async function runProbeCheck(
  def: Extract<IntegrityCheckDef, { kind: "probe" }>,
  ctx: IntegrityRunContext,
): Promise<IntegrityCheckResult> {
  const start = Date.now();
  if (!ctx.probe) {
    return {
      ...metaOf(def),
      count: 0,
      sample: [],
      ok: false,
      skipped: true,
      error: "No auth token available — probe skipped.",
      durationMs: Date.now() - start,
    };
  }

  let candidates: IntegrityFinding[];
  try {
    candidates = await ctx.sql(def.candidateSql);
  } catch (err) {
    return {
      ...metaOf(def),
      count: 0,
      sample: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }

  const findings: IntegrityFinding[] = [];
  const probe = ctx.probe;
  const failure = new Set(def.failureStatuses);

  // Bounded-concurrency worker pool.
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const row = candidates[cursor++];
      const fileId = String(row.id);
      let status: number | null = null;
      let probeError: string | undefined;
      try {
        const res = await withTimeout(probe(fileId), PROBE_TIMEOUT_MS);
        status = res.status;
        probeError = res.error;
      } catch (err) {
        probeError = err instanceof Error ? err.message : String(err);
      }
      const isDead = status !== null && failure.has(status);
      const isUnreachable = status === null;
      if (isDead || isUnreachable) {
        findings.push({
          id: fileId,
          file_name: row.file_name ?? null,
          owner_id: row.owner_id ?? null,
          status: status ?? "unreachable",
          ...(probeError ? { error: probeError } : {}),
        });
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PROBE_CONCURRENCY, candidates.length || 1) },
      () => worker(),
    ),
  );

  return {
    ...metaOf(def),
    count: findings.length,
    sample: findings,
    ok: findings.length === 0,
    durationMs: Date.now() - start,
  };
}

function metaOf(def: IntegrityCheckDef) {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    category: def.category,
    severity: def.severity,
    remediation: def.remediation,
  };
}

export function listChecks(): IntegrityCheckDef[] {
  return INTEGRITY_CHECKS;
}

export async function runIntegrityChecks(
  ctx: IntegrityRunContext,
  options: { checkIds?: string[]; includeProbe?: boolean } = {},
): Promise<IntegrityReport> {
  const { checkIds, includeProbe = false } = options;

  const selected = INTEGRITY_CHECKS.filter((c) => {
    if (checkIds && !checkIds.includes(c.id)) return false;
    if (c.kind === "probe" && !includeProbe && !checkIds?.includes(c.id)) {
      return false;
    }
    return true;
  });

  const results: IntegrityCheckResult[] = [];
  for (const def of selected) {
    results.push(
      def.kind === "sql"
        ? await runSqlCheck(def, ctx)
        : await runProbeCheck(def, ctx),
    );
  }

  const totals = {
    checks: results.length,
    withFindings: results.filter((r) => r.count > 0).length,
    failed: results.filter((r) => r.error && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    errorFindings: results
      .filter((r) => r.severity === "error")
      .reduce((s, r) => s + r.count, 0),
    warningFindings: results
      .filter((r) => r.severity === "warning")
      .reduce((s, r) => s + r.count, 0),
    infoFindings: results
      .filter((r) => r.severity === "info")
      .reduce((s, r) => s + r.count, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    results,
    totals,
  };
}
