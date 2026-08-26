/**
 * scripts/hr/hrb012_mock_walk.ts — CT-13's second leg, in verifier-runnable form.
 *
 *   NEXT_PUBLIC_HR_MOCK=1 pnpm hr:mock-walk
 *
 * R-CORE-READINESS CT-13 asks that *"with NEXT_PUBLIC_HR_MOCK=1 a browser walks every one of the
 * 60 operations and gets its happy, empty, error and edge fixture."* This script is that walk
 * executed against the same transport the browser uses — the real `serveFromFixtures` path, driven
 * through the real `hrApiGet`/`hrApiPost` client, resolving CONCRETE urls (with path params filled
 * in) back to their templates exactly as a live call would.
 *
 * It is deliberately NOT a browser screenshot run. A screenshot proves a screen rendered; it does
 * not prove all 60 operations resolve, that every case exists, or that an error fixture actually
 * throws. Those are the properties the client lanes depend on, and they are checkable. The
 * screenshots CT-13 also asks for are Arman's UI walkthrough at the review-queue stage, once L1–L11
 * have surfaces to screenshot — today there is no `features/hr` UI to point a browser at.
 *
 * Exits 0 only when every assertion passes.
 */

import {
  HR_FIXTURES,
  type HrFixture,
} from "../../features/hr/__fixtures__/registry.generated";
import {
  HR_MOCK_ENABLED,
  HR_OPERATION_IDS,
  resolveOperation,
  serveFromFixtures,
} from "../../features/hr/mock/transport";

interface Row {
  group: string;
  name: string;
  ok: boolean;
  detail: string;
}

const results: Row[] = [];
const rec = (group: string, name: string, ok: boolean, detail = "") =>
  results.push({ group, name, ok, detail });

/** Fill `{param}` slots with plausible concrete values, as a real caller would. */
function concreteUrl(template: string): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    if (key === "seam") return "background_check";
    if (key === "provider_key") return "noop_adapter";
    if (key === "org_slug") return "acme";
    return "00000000-0000-4000-8000-000000000041";
  });
}

function main(): number {
  // ---- 0. the flag actually has to be on, or this proves nothing
  rec(
    "0 preconditions",
    "NEXT_PUBLIC_HR_MOCK=1 is set",
    HR_MOCK_ENABLED,
    HR_MOCK_ENABLED
      ? "mock transport active"
      : "NOT SET — the walk would test nothing. Re-run with NEXT_PUBLIC_HR_MOCK=1.",
  );
  if (!HR_MOCK_ENABLED) {
    report();
    return 1;
  }

  rec(
    "0 preconditions",
    "the catalog is 60 operations",
    HR_OPERATION_IDS.length === 60,
    `${HR_OPERATION_IDS.length} operations`,
  );

  // ---- 1. every operation, every case
  const CASES = ["happy", "empty", "error", "edge"] as const;
  let served = 0;
  let mandatoryEdges = 0;

  for (const opId of HR_OPERATION_IDS) {
    const happy = HR_FIXTURES[`${opId}.happy`] as HrFixture | undefined;
    if (!happy) {
      rec("1 operation walk", `${opId} has a happy fixture`, false, "missing");
      continue;
    }
    const { method, path } = happy.__fixture;
    const url = concreteUrl(path);

    // The URL a real caller builds must resolve back to this operation.
    const resolved = resolveOperation(method, url);
    rec(
      "1 operation walk",
      `${opId} — ${method} ${url} resolves`,
      resolved === opId,
      resolved === opId ? path : `resolved to ${resolved ?? "nothing"}`,
    );

    for (const c of CASES) {
      const response = serveFromFixtures(method, url, c);
      const ok =
        response !== null &&
        response.fixture.__fixture.operation_id === opId &&
        response.fixture.__fixture.case === c &&
        response.body !== undefined;
      if (ok) served += 1;
      rec("2 four cases per endpoint", `${opId}.${c}`, ok,
        response ? `HTTP ${response.status}` : "no fixture served");
    }

    // §6.4's `error` case must be a real failure envelope, not a 200 wearing an error name.
    const err = serveFromFixtures(method, url, "error");
    const errBody = err?.body as { error?: string; request_id?: string } | undefined;
    rec(
      "3 error envelope (§1.3)",
      `${opId}.error is a real non-2xx with error + request_id`,
      !!err && err.status >= 400 && !!errBody?.error && !!errBody?.request_id,
      err ? `${err.status} ${errBody?.error ?? "(no code)"}` : "none",
    );

    // §1.3 rule 1 — an HR handler that raises 502 or 504 is a defect even though the platform
    // saves it. No fixture may teach a client that those statuses are normal.
    for (const c of CASES) {
      const r = serveFromFixtures(method, url, c);
      if (r && (r.status === 502 || r.status === 504)) {
        rec("3 error envelope (§1.3)", `${opId}.${c} is not 502/504`, false, `status ${r.status}`);
      }
    }

  }

  // ---- 4. the 17 mandatory §6.4 edge cases, by the property each one asserts
  const mandatory: Array<[string, string, (f: HrFixture) => boolean, string]> = [
    ["hr_calc_overtime", "edge",
      (f) => num(f, "result.hours_regular") === 8 && num(f, "result.hours_overtime") === 4 &&
             num(f, "result.hours_doubletime") === 1,
      "OT-CA-01 — 8 regular + 4 OT@1.5 + 1 DT@2.0"],
    ["hr_calc_overtime", "edge2",
      (f) => num(f, "result.hours_overtime") === 6 &&
             str(f, "result.attributed_pay_period_key") === "apr-1-15" &&
             arr(f, "result.lines").every((l) => !!l.workweek_id),
      "OT-BOUND-01 — 6 OT on the whole workweek, attributed to the period holding its END date, workweek_id on every line"],
    ["hr_calc_predictability_pay", "edge",
      (f) => !has(f, "result.predictability_pay_amount") &&
             arr(f, "flags").some((x) => x.code === "advisory_rule"),
      "advisory Fair Workweek — MONEY FIELD ABSENT (not zero), advisory_rule flag present"],
    ["hr_calc_leave_accrual", "edge",
      (f) => arr(f, "incomplete").some((x) => x.class === "minors-hours"),
      "incomplete[] non-empty for minors-hours"],
    ["hr_calc_i9_deadlines", "edge",
      (f) => str(f, "result.business_day_calendar") === "federal" &&
             at(f, "result.org_holiday_calendar_consulted") === false &&
             at(f, "__pending_verification") === true,
      "I9-FED-03 — federal calendar, org holidays NOT consulted, pending_verification"],
    ["hr_time_recompute", "edge",
      (f) => str(f, "status") === "partial" && arr(f, "result.failed_units").length === 2,
      "job status partial with two failed units"],
    ["hr_accruals_run", "edge",
      (f) => (num(f, "result.clamped_by_statute") ?? 0) > 0,
      "clamped_by_statute > 0"],
    ["hr_schedule_autofill", "edge",
      (f) => arr(f, "result.unfilled").length > 0 &&
             arr(f, "result.conflicts").some(
               (c) => c.severity === "block" && c.reason === "incomplete"),
      "unfilled[] non-empty AND a blocking minors conflict with reason 'incomplete'"],
    ["hr_schedule_autofill", "edge2",
      (f) => {
        const a = arr(f, "result.assignments");
        const sameShift = a.length === 2 && a[0].shift_id === a[1].shift_id;
        const differentBands = a[0]?.relative_cost_band !== a[1]?.relative_cost_band;
        const noMoney = a.every(
          (x) => !("projected_cost" in x) && !("rate" in x) && !("amount" in x) && !("pay_rate" in x));
        return sameShift && differentBands && noMoney;
      },
      "two candidates on one shift, different cost bands, NO money field beside an employment_id"],
    ["hr_exports_payroll_create", "edge",
      (f) => str(f, "error") === "hr_advisory_rule_blocks_money",
      "422 hr_advisory_rule_blocks_money — an export REFUSES, it does not omit"],
    ["hr_exports_payroll_create", "edge2",
      (f) => arr(f, "details.unmapped").length > 0,
      "400 with details.unmapped[]"],
    ["hr_exports_supersede", "edge",
      (f) => str(f, "error") === "hr_export_already_acknowledged",
      "409 hr_export_already_acknowledged"],
    ["esign_envelopes_verify", "edge",
      (f) => at(f, "verified") === false && arr(f, "mismatches").length > 0,
      "200 with verified:false and a mismatch"],
    ["hr_providers_dispatch", "edge",
      (f) => str(f, "error") === "hr_provider_unavailable" && !!at(f, "details.fallback"),
      "424 hr_provider_unavailable with the manual fallback NAMED"],
    ["hr_background_checks_adverse_action_final", "edge",
      (f) => !!str(f, "details.earliest_at"),
      "409 before the statutory deadline, details.earliest_at"],
    ["hr_identity_ssn_reveal", "edge",
      (f) => str(f, "error") === "hr_capability_denied" &&
             str(f, "details.capability") === "ssn.reveal",
      "403 hr_capability_denied NAMING ssn.reveal"],
    ["hr_time_overtime_evaluate", "edge",
      (f) => str(f, "preapproval.state") === "exceeded_without_approval" &&
             (num(f, "hours_worked_to_date") ?? 0) > 40,
      "exceeded_without_approval WITH HOURS INTACT — the flag never withholds pay"],
    ["hr_careers_widget_bootstrap", "edge",
      (f) => f.__fixture.status === 403 && !!str(f, "details.origin"),
      "403 on an Origin outside the embed_key allowlist"],
  ];

  for (const [opId, slot, predicate, description] of mandatory) {
    const f = HR_FIXTURES[`${opId}.${slot}`];
    if (!f) {
      rec("4 mandatory edge cases (§6.4)", `${opId}.${slot}`, false, `MISSING — ${description}`);
      continue;
    }
    mandatoryEdges += 1;
    let ok = false;
    try {
      ok = predicate(f);
    } catch {
      ok = false;
    }
    rec("4 mandatory edge cases (§6.4)", `${opId}.${slot}`, ok, description);
  }

  rec("4 mandatory edge cases (§6.4)", "all 17 §6.4 rows are present (18 files)",
    mandatoryEdges === 18, `${mandatoryEdges}/18 fixture files`);

  // ---- 5. the five rendered from hr.jurisdiction_rule_test
  const renderedCodes = Object.values(HR_FIXTURES)
    .map((f) => f.__fixture.rendered_from)
    .filter((s): s is string => !!s);
  rec("5 rendered from the fixture table (§6.4)",
    "calc edge fixtures come from hr.jurisdiction_rule_test, not hand-typed",
    renderedCodes.length === 5,
    renderedCodes.sort().join(", ") || "none");

  rec("6 totals", "every operation served all four cases",
    served === HR_OPERATION_IDS.length * 4,
    `${served}/${HR_OPERATION_IDS.length * 4} case responses`);

  return report();
}

/**
 * Typed readers over a fixture body.
 *
 * The 60 fixture bodies span 60 different shapes, so there is no single interface to declare and a
 * loose index signature would just be `any` wearing a hat. Instead every assertion reads through a
 * dotted path and narrows at the point of use — which is also what makes each predicate below say
 * exactly which field it is asserting on.
 */
function at(f: HrFixture, path: string): unknown {
  let node: unknown = f.body;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Key PRESENCE, which is a different assertion from "the value is falsy". §6.4's advisory-money
 *  edge turns entirely on a money key being ABSENT rather than zero. */
function has(f: HrFixture, path: string): boolean {
  const parts = path.split(".");
  const leaf = parts.pop() as string;
  const parent = parts.length ? at(f, parts.join(".")) : f.body;
  return !!parent && typeof parent === "object" && leaf in (parent as Record<string, unknown>);
}

function num(f: HrFixture, path: string): number | undefined {
  const v = at(f, path);
  return typeof v === "number" ? v : undefined;
}

function str(f: HrFixture, path: string): string | undefined {
  const v = at(f, path);
  return typeof v === "string" ? v : undefined;
}

function arr(f: HrFixture, path: string): Record<string, unknown>[] {
  const v = at(f, path);
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function report(): number {
  const width = Math.max(...results.map((r) => r.name.length));
  let group = "";
  let red = 0;
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n${group}`);
    }
    if (!r.ok) red += 1;
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`);
  }
  console.log(`\n${results.length} assertions, ${red} RED`);
  console.log(
    `operations walked: ${HR_OPERATION_IDS.length} · fixtures on disk: ${Object.keys(HR_FIXTURES).length}`,
  );
  return red ? 1 : 0;
}

process.exit(main());
