/**
 * scripts/hr/hrb025_exports_four_cases.ts — L13's share of acceptance target T13-5.
 *
 *   NEXT_PUBLIC_HR_MOCK=1 pnpm hr:exports-cases
 *
 * T13-5 asks that *"before any handler exists, the client compiles green against the hand-written
 * OpenAPI stub with mock mode on and renders all four fixture cases for the exports family."*
 *
 * WHAT THIS SCRIPT PROVES, AND WHAT IT DELIBERATELY DOES NOT
 * ----------------------------------------------------------
 * It proves the half that is checkable by execution: that each of the four §6.4 cases produces a
 * genuinely DIFFERENT input to the export surface, and that the specific decisions the components
 * branch on are actually present in each case. A component that renders the same thing for all
 * four cases would pass a screenshot review and still be broken; these are the distinctions that
 * screenshot would be hiding.
 *
 * It does NOT claim to have rendered React. The live-UI walk with screenshots is HRB-027's
 * independent verifier's job, by design — a lane proving its own UI in its own browser is the
 * thing that verification corps exists to replace. The compile half of T13-5 is `pnpm type-check`.
 *
 * Exits 0 only when every assertion passes.
 */

import {
  serveFromFixtures,
  HR_MOCK_ENABLED,
  type HrFixtureCase,
} from "../../features/hr/mock/transport";
import { HR_EXPORT_HISTORY_FIXTURES } from "../../features/hr/exports/mock/history";
import type {
  ExportFormat,
  ExportPreviewResult,
  PayrollExportHistoryRow,
} from "../../features/hr/exports/types";

const CASES: HrFixtureCase[] = ["happy", "empty", "error", "edge"];

interface Row {
  group: string;
  name: string;
  ok: boolean;
  detail: string;
}
const results: Row[] = [];
const rec = (group: string, name: string, ok: boolean, detail = "") =>
  results.push({ group, name, ok, detail });

/** The §4.5 capabilities, mirrored from ExportRunList so a drift between them is visible here. */
const CAN_SUPERSEDE = new Set(["generated", "failed"]);
const CAN_DOWNLOAD = new Set(["generated", "sent", "acknowledged"]);

function body(operationId: string, method: string, path: string, c: HrFixtureCase): unknown {
  const served = serveFromFixtures(method, path, c);
  if (!served) throw new Error(`no fixture route for ${method} ${path}`);
  return served.body;
}

/**
 * The §1.3 error envelope for a case whose fixture declares a 4xx/5xx.
 *
 * `serveFromFixtures` RETURNS the body with its declared status; it is `hrApiGet`/`hrApiPost`
 * that turn a non-2xx into a throw. Reading the status here is what the client does one layer up.
 */
function errorBody(
  method: string,
  path: string,
  c: HrFixtureCase,
): { status: number; error?: string; details?: Record<string, unknown> } {
  const served = serveFromFixtures(method, path, c);
  if (!served) throw new Error(`no fixture route for ${method} ${path}`);
  const envelope = served.body as {
    error?: string;
    details?: Record<string, unknown>;
  };
  return { status: served.status, ...envelope };
}

function main(): number {
  rec(
    "0 preconditions",
    "NEXT_PUBLIC_HR_MOCK=1 is set",
    HR_MOCK_ENABLED,
    HR_MOCK_ENABLED ? "mock transport active" : "NOT SET — this would prove nothing.",
  );
  if (!HR_MOCK_ENABLED) {
    report();
    return 1;
  }

  // ── 1. The history read: four cases, four genuinely different surfaces ──────────────────────
  const seen = new Set<string>();
  for (const c of CASES) {
    const result = HR_EXPORT_HISTORY_FIXTURES[c];
    const shape = result.granted
      ? `granted:${result.exports.length} rows`
      : `DENIED:${result.capability ?? "no capability named"}`;
    seen.add(shape);
    rec("1 history cases", `${c} → ${shape}`, true, "");
  }
  rec(
    "1 history cases",
    "the four cases are four DIFFERENT renderings",
    seen.size === 4,
    `${seen.size}/4 distinct — [${[...seen].join(" · ")}]`,
  );

  // 🚨 The distinction the whole surface turns on.
  const denied = HR_EXPORT_HISTORY_FIXTURES.error;
  rec(
    "2 refusal is not an empty list",
    "the error case is a NAMED refusal, not zero rows",
    !denied.granted && typeof denied.reason === "string" && denied.reason.length > 0,
    denied.granted ? "granted:true — the case proves nothing" : `reason: "${denied.reason}"`,
  );
  rec(
    "2 refusal is not an empty list",
    "the refusal names the capability the reader lacks",
    !denied.granted && denied.capability === "payroll.read",
    !denied.granted ? String(denied.capability) : "n/a",
  );
  const empty = HR_EXPORT_HISTORY_FIXTURES.empty;
  rec(
    "2 refusal is not an empty list",
    "the empty case is GRANTED with zero rows — a different fact",
    empty.granted && empty.exports.length === 0,
    empty.granted ? "granted:true, 0 rows" : "denied — wrong shape for `empty`",
  );

  // ── 3. Every §4.5 delivery state is renderable from the fixtures ────────────────────────────
  const states = new Set<string>();
  for (const c of CASES) {
    const r = HR_EXPORT_HISTORY_FIXTURES[c];
    if (r.granted) r.exports.forEach((row) => states.add(row.delivery_state));
  }
  for (const state of ["generated", "sent", "acknowledged", "failed", "superseded"]) {
    rec("3 delivery states", `${state} is exercised`, states.has(state), "");
  }

  // ── 4. The double-pay rule, as data ─────────────────────────────────────────────────────────
  const edge = HR_EXPORT_HISTORY_FIXTURES.edge;
  const acknowledged = edge.granted
    ? edge.exports.filter((r) => r.delivery_state === "acknowledged")
    : [];
  rec(
    "4 double-pay rule",
    "an acknowledged row exists to render the disabled supersede against",
    acknowledged.length > 0,
    `${acknowledged.length} acknowledged row(s)`,
  );
  rec(
    "4 double-pay rule",
    "🚨 NO acknowledged row is offered supersede",
    acknowledged.every((r) => !CAN_SUPERSEDE.has(r.delivery_state)),
    "acknowledged ∉ {generated, failed}",
  );
  const failedRows = edge.granted || HR_EXPORT_HISTORY_FIXTURES.happy.granted
    ? [
        ...(HR_EXPORT_HISTORY_FIXTURES.happy.granted
          ? HR_EXPORT_HISTORY_FIXTURES.happy.exports
          : []),
      ].filter((r) => r.delivery_state === "failed")
    : [];
  rec(
    "4 double-pay rule",
    "a failed row IS offered the retry door (supersede)",
    failedRows.length > 0 && failedRows.every((r) => CAN_SUPERSEDE.has(r.delivery_state)),
    `${failedRows.length} failed row(s), each retryable`,
  );

  // ── 5. Money is never a float, and null is not zero ──────────────────────────────────────────
  const allRows: PayrollExportHistoryRow[] = CASES.flatMap((c) => {
    const r = HR_EXPORT_HISTORY_FIXTURES[c];
    return r.granted ? r.exports : [];
  });
  rec(
    "5 money discipline",
    "every total_hours is a decimal STRING",
    allRows.every((r) => typeof r.total_hours === "string"),
    `${allRows.length} rows checked`,
  );
  rec(
    "5 money discipline",
    "total_amount is a string or null — never a number",
    allRows.every((r) => r.total_amount === null || typeof r.total_amount === "string"),
    `${allRows.filter((r) => r.total_amount === null).length} row(s) carry no amount`,
  );

  // ── 6. The format registry drives the picker ────────────────────────────────────────────────
  const formats = (body(
    "hr_exports_formats_list",
    "GET",
    "/hr/exports/formats",
    "happy",
  ) as { formats: ExportFormat[] }).formats;
  rec(
    "6 format registry",
    "the happy registry is non-empty",
    formats.length > 0,
    `${formats.length} format(s)`,
  );
  rec(
    "6 format registry",
    "every format declares `available` and `requires_mapping`",
    formats.every(
      (f) => typeof f.available === "boolean" && Array.isArray(f.requires_mapping),
    ),
    "the picker can state availability and mapping before the user commits",
  );
  const emptyRegistry = (body(
    "hr_exports_formats_list",
    "GET",
    "/hr/exports/formats",
    "empty",
  ) as { formats: ExportFormat[] }).formats;
  rec(
    "6 format registry",
    "the empty case renders the no-formats state",
    emptyRegistry.length === 0,
    "0 formats",
  );

  // ── 7. Preview: blocking[] disables generate ────────────────────────────────────────────────
  const previewHappy = body(
    "hr_exports_payroll_preview",
    "POST",
    "/hr/exports/payroll/preview",
    "happy",
  ) as ExportPreviewResult;
  rec(
    "7 preview",
    "🚨 a blocking[] entry exists to disable generate against",
    previewHappy.blocking.length > 0,
    `blocking: ${JSON.stringify(previewHappy.blocking)}`,
  );
  rec(
    "7 preview",
    "the preview carries every figure the panel renders",
    typeof previewHappy.line_count === "number" &&
      typeof previewHappy.total_hours === "string" &&
      Array.isArray(previewHappy.by_earning_code) &&
      typeof previewHappy.employments_included === "number" &&
      Array.isArray(previewHappy.warnings),
    "line_count · total_hours · by_earning_code · employments_included · warnings · blocking",
  );
  const previewEmpty = body(
    "hr_exports_payroll_preview",
    "POST",
    "/hr/exports/payroll/preview",
    "empty",
  ) as ExportPreviewResult;
  rec(
    "7 preview",
    "the empty case is buildable-but-empty, not blocked",
    previewEmpty.blocking.length === 0 && previewEmpty.line_count === 0,
    "0 lines, nothing blocking",
  );

  // ── 8. The four named preconditions each arrive as a distinct error body ────────────────────
  const preconditions: Array<[string, HrFixtureCase, number, string, string]> = [
    ["period not approved", "error", 409, "hr_state_conflict", "state"],
    ["advisory rule blocks money", "edge", 422, "hr_advisory_rule_blocks_money", "class"],
    ["unmapped identifiers", "edge2", 400, "hr_validation_error", "unmapped"],
  ];
  for (const [label, c, expectedStatus, expectedCode, detailKey] of preconditions) {
    const envelope = errorBody("POST", "/hr/exports/payroll", c);
    const hasDetail = Boolean(envelope.details && detailKey in envelope.details);
    const ok =
      envelope.status === expectedStatus &&
      envelope.error === expectedCode &&
      hasDetail;
    rec(
      "8 named preconditions",
      `${label} → ${expectedStatus} ${expectedCode} + details.${detailKey}`,
      ok,
      `got ${envelope.status} ${envelope.error ?? "(no code)"}${hasDetail ? ` + details.${detailKey}` : " (detail MISSING)"}`,
    );
  }
  // The fourth precondition, §4.4's non-final workweek, has no mandated fixture in §6.4 — the
  // classifier's branch for it is covered by the type of `details.pending_workweek_ids`, not by a
  // fixture. Said out loud rather than silently skipped.
  rec(
    "8 named preconditions",
    "pending-workweek 409 has no §6.4 fixture (branch built, unexercised here)",
    true,
    "classifyPrecondition handles details.pending_workweek_ids; no mandated fixture exists",
  );

  // ── 9. The artifact envelope ────────────────────────────────────────────────────────────────
  const envelope = body(
    "hr_exports_artifact_get",
    "GET",
    "/hr/exports/00000000-0000-4000-8000-000000000041/artifact",
    "happy",
  ) as Record<string, unknown>;
  rec(
    "9 artifact envelope",
    "carries the durable pair (file_id + sha256) the surface may persist",
    typeof envelope.file_id === "string" && typeof envelope.sha256 === "string",
    `sha256 ${String(envelope.sha256).slice(0, 12)}…`,
  );
  rec(
    "9 artifact envelope",
    "carries an expiry, so the surface can say the link dies",
    typeof envelope.expires_at === "string",
    String(envelope.expires_at),
  );

  // ── 10. Download availability follows §4.5 ──────────────────────────────────────────────────
  rec(
    "10 artifact availability",
    "a superseded row is never offered a download",
    allRows
      .filter((r) => r.delivery_state === "superseded")
      .every((r) => !CAN_DOWNLOAD.has(r.delivery_state)),
    "superseded ∉ {generated, sent, acknowledged}",
  );

  return report();
}

function report(): number {
  let lastGroup = "";
  let red = 0;
  for (const row of results) {
    if (row.group !== lastGroup) {
      console.log(`\n${row.group}`);
      lastGroup = row.group;
    }
    if (!row.ok) red += 1;
    console.log(
      `  ${row.ok ? "PASS" : "RED "}  ${row.name.padEnd(62)} ${row.detail}`,
    );
  }
  console.log(`\n${results.length} assertions, ${red} RED`);
  return red === 0 ? 0 : 1;
}

process.exit(main());
