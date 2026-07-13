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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`probe timeout after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
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

// Strip ANSI escape sequences so CLI gate output renders cleanly in the UI.
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const SCRIPT_OUTPUT_TAIL_LINES = 40;

async function runScriptCheck(
  def: Extract<IntegrityCheckDef, { kind: "script" }>,
  ctx: IntegrityRunContext,
): Promise<IntegrityCheckResult> {
  const start = Date.now();
  if (!ctx.script) {
    return {
      ...metaOf(def),
      count: 0,
      sample: [],
      ok: false,
      skipped: true,
      error:
        "No script runner in this environment (serverless) — run " +
        `\`pnpm ${def.script}\` locally instead.`,
      durationMs: Date.now() - start,
    };
  }

  try {
    const { exitCode, output, error } = await ctx.script(def);
    const failed = exitCode !== 0;
    const tail = output
      .replace(ANSI_RE, "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .slice(-SCRIPT_OUTPUT_TAIL_LINES);
    return {
      ...metaOf(def),
      count: failed ? 1 : 0,
      sample: failed
        ? [
            { exit_code: exitCode ?? "killed/spawn-failure" },
            ...tail.map((line) => ({ output: line })),
          ]
        : [],
      ok: !failed,
      ...(error ? { error } : {}),
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

/**
 * Placeholder result for a script check that was not explicitly selected.
 * Script gates are STRICTLY on-demand (some take minutes) — "run all" surfaces
 * them as skipped rows so the UI shows a run button, but never executes them.
 */
function stubScriptResult(
  def: Extract<IntegrityCheckDef, { kind: "script" }>,
): IntegrityCheckResult {
  return {
    ...metaOf(def),
    count: 0,
    sample: [],
    ok: false,
    skipped: true,
    error: `On-demand gate (~${def.expectedDurationSec}s) — run it explicitly.`,
    durationMs: 0,
  };
}

function metaOf(def: IntegrityCheckDef) {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    category: def.category,
    severity: def.severity,
    kind: def.kind,
    remediation: def.remediation,
  };
}

export function listChecks(): IntegrityCheckDef[] {
  return INTEGRITY_CHECKS;
}

export async function runIntegrityChecks(
  ctx: IntegrityRunContext,
  options: {
    checkIds?: string[];
    includeProbe?: boolean;
    /**
     * When true (the admin UI), script gates not explicitly selected appear
     * as skipped placeholder rows (so the UI offers their run button). When
     * false (the CLI, which has the pnpm scripts natively), unselected script
     * gates are omitted entirely.
     */
    stubScripts?: boolean;
  } = {},
): Promise<IntegrityReport> {
  const { checkIds, includeProbe = false, stubScripts = false } = options;

  const explicitlySelected = (id: string) => checkIds?.includes(id) ?? false;

  const selected = INTEGRITY_CHECKS.filter((c) => {
    if (checkIds && !checkIds.includes(c.id)) {
      return false;
    }
    if (c.kind === "probe" && !includeProbe && !explicitlySelected(c.id)) {
      return false;
    }
    // Script gates never run implicitly — without explicit selection they are
    // either stubbed (UI) or dropped (CLI).
    if (c.kind === "script" && !explicitlySelected(c.id) && !stubScripts) {
      return false;
    }
    return true;
  });

  const results: IntegrityCheckResult[] = [];
  for (const def of selected) {
    if (def.kind === "sql") {
      results.push(await runSqlCheck(def, ctx));
    } else if (def.kind === "probe") {
      results.push(await runProbeCheck(def, ctx));
    } else if (explicitlySelected(def.id)) {
      results.push(await runScriptCheck(def, ctx));
    } else {
      results.push(stubScriptResult(def));
    }
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
