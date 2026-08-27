#!/usr/bin/env npx tsx
/**
 * features/hr/time/periods/__checks__/non-browser-contracts.ts — L3-76 / acceptance target T-14.
 *
 * 🚨 WHAT THIS PROVES, AND WHY IT IS A REQUIREMENT RATHER THAN A TEST
 * -------------------------------------------------------------------
 * D1 and SPEC-TIME §0 law 6: **clients consume, never reimplement**, and a committed native HR
 * mobile app will call this identical contract set. T-14 asks for every contract to be exercised
 * *at least once from a non-browser client*, proving no behaviour depends on the web shell.
 *
 * So this script runs under plain `tsx` in Node — no DOM, no React, no Next, no rendering — and it
 * drives:
 *
 *   • **The real one-door RPC client**, `callHrTimeRpc` from `features/hr/time/api/rpc.ts`, the
 *     identical module the surfaces import. Not a copy, not a stub, not a re-declared fetch.
 *   • **The real HTTP fixture transport**, `serveFromFixtures`, over the nine frozen export
 *     operations and the overtime evaluator.
 *   • **Every decision function THIS LANE owns**, asserting the LAWS rather than the shapes: approval
 *     is refused with an open timecard and permitted over a disagreement, reopen states it does not
 *     re-pay, and unapproved overtime is never described with a payment word.
 *   • **The cross-tenant guard on the export history door**, asserted against the SQL itself: an
 *     org-A payroll admin must not be able to list org-B's exports, which turns on `hr.capability`
 *     being given the organization rather than being asked ambiently.
 *   • **The export laws AT THE CONTRACT**, since the export components are lane L13's: the 409 that
 *     refuses to supersede an acknowledged file, the 422 that refuses a whole run over an advisory
 *     rule, the 400 that blocks unmapped identifiers before generation, and the `partial` run whose
 *     `failed_units` mean it is not a success.
 *
 * A shape assertion would pass on a UI that renders the right fields with the wrong meaning. These
 * are the meanings.
 *
 * RUN: `NEXT_PUBLIC_HR_MOCK=1 npx tsx features/hr/time/periods/__checks__/non-browser-contracts.ts`
 * (the script loads `.env.local` itself, because `features/hr/time/api/rpc.ts` imports the Supabase
 * browser client at module scope — see the DEBT note at the foot of this file).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load .env.local before anything imports the Supabase client singleton. ──────────────────────
// This headless acceptance script resolves a checkout-local file at runtime. Keep Turbopack from
// tracing the dynamic checkout root into production bundles.
/* turbopackIgnore: true */
const envPath = resolve(__dirname, "../../../../../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}
process.env.NEXT_PUBLIC_HR_MOCK = "1";

async function main(): Promise<void> {
  // Imported AFTER the env is populated, so the module-scope Supabase client can construct.
  const { callHrTimeRpc } = await import("@/features/hr/time/api/rpc");
  const { serveFromFixtures } = await import("@/features/hr/mock/transport");
  const {
    offeredTransitions,
    disputeSentence,
    boundaryWeeksSentence,
    rowProgressSentence,
    REOPEN_NOTICE,
  } = await import("@/features/hr/time/periods/periodStateMachine");
  // 🚨 The export half is lane L13's (HRB-025) and this lane owns no copy of it — the coordinator
  // ruled that seam on 2026-08-26 and `features/hr/time/exports/` was DELETED, not deprecated.
  // What is asserted below is therefore the CONTRACT the mounted components stand on: that the
  // frozen fixture set actually carries each law, so a surface built against it cannot be built
  // against a fiction.
  //
  // L13's components themselves are deliberately NOT imported here. They are `.tsx` and pull in the
  // design system, which has no Node `exports` entry — importing one would drag a rendering stack
  // into a headless proof and defeat the point of it. That is not a gap: T-14 asks whether the
  // CONTRACTS work without the web shell, and a React component is the web shell.
  const { OT_STATE_LABEL, DENIAL_DOES_NOT_WITHHOLD_PAY, NO_DECISION_ESCALATES } = await import(
    "@/features/hr/time/overtime/overtimeVocabulary"
  );

  let checks = 0;
  let failures = 0;

  const ok = (name: string, condition: boolean, detail?: string) => {
    checks += 1;
    if (condition) {
      process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
    } else {
      failures += 1;
      process.stdout.write(`  \x1b[31m✗ ${name}\x1b[0m${detail ? ` — ${detail}` : ""}\n`);
    }
  };

  const section = (title: string) => process.stdout.write(`\n\x1b[1m${title}\x1b[0m\n`);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  section("1. The RPC lane, through the real one-door client, with no browser");
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  const RPC_CASES = ["happy", "empty", "error", "edge"] as const;
  const RPCS = [
    "hr_pay_period_list",
    "hr_pay_period_get",
    "hr_pay_period_transition",
    "hr_time_adjustment_list",
    "hr_time_adjustment_create",
    "hr_overtime_preapproval_list",
    "hr_overtime_preapproval_get",
    "hr_overtime_preapproval_create",
  ] as const;

  for (const rpc of RPCS) {
    for (const mockCase of RPC_CASES) {
      let served = false;
      try {
        await callHrTimeRpc(rpc, {}, { mockCase });
        served = true;
      } catch (err) {
        // An `ok:false` fixture is THROWN by design, so the caller's error path is exercised at the
        // same time as its happy path. A throw here is a pass; a MISSING fixture is not.
        served = !(err instanceof Error && err.message.includes("has no"));
      }
      ok(`${rpc} · ${mockCase}`, served, "no fixture for this case");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  section("2. The HTTP export contract, through the real fixture transport");
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  const HTTP_OPS: Array<[string, string]> = [
    ["GET", "/hr/exports/formats"],
    ["POST", "/hr/exports/payroll/preview"],
    ["POST", "/hr/exports/payroll"],
    ["POST", "/hr/exports/timesheet"],
    ["GET", "/hr/exports/00000000-0000-4000-8000-000000000001"],
    ["GET", "/hr/exports/00000000-0000-4000-8000-000000000001/artifact"],
    ["POST", "/hr/exports/00000000-0000-4000-8000-000000000001/acknowledge"],
    ["POST", "/hr/exports/00000000-0000-4000-8000-000000000001/fail"],
    ["POST", "/hr/exports/00000000-0000-4000-8000-000000000001/supersede"],
    ["POST", "/hr/time/overtime/evaluate"],
  ];

  for (const [method, path] of HTTP_OPS) {
    for (const mockCase of RPC_CASES) {
      const served = serveFromFixtures(method, path, mockCase);
      ok(`${method} ${path} · ${mockCase}`, served !== null, "route not resolved to an operation");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  section("3. THE LAWS — asserted on meaning, not on shape");
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  // ── Law: the CONTRACT refuses to supersede an acknowledged export. ──────────────────────────
  const supersedeEdge = serveFromFixtures(
    "POST",
    "/hr/exports/00000000-0000-4000-8000-000000000001/supersede",
    "edge",
  );
  const supersedeBody = supersedeEdge?.body as { error?: string; details?: Record<string, unknown> };
  ok("supersede has a 409 fixture", supersedeEdge?.status === 409);
  ok(
    "…and it is hr_export_already_acknowledged, the one rule that prevents double payment",
    supersedeBody?.error === "hr_export_already_acknowledged",
  );
  ok(
    "…naming the adjustment path as the only correction after acknowledgement",
    String(supersedeBody?.details?.correction_path ?? "").includes("time_adjustment"),
  );

  // ── Law: an advisory rule refuses the WHOLE RUN — it does not omit a line. ───────────────────
  const advisoryEdge = serveFromFixtures("POST", "/hr/exports/payroll", "edge");
  const advisoryBody = advisoryEdge?.body as { error?: string };
  ok("generate refuses 422 on an advisory money rule", advisoryEdge?.status === 422);
  ok(
    "…as hr_advisory_rule_blocks_money, not as a 200 with a missing line",
    advisoryBody?.error === "hr_advisory_rule_blocks_money",
  );

  // ── Law: unmapped identifiers block BEFORE generation, naming the codes. ────────────────────
  const unmappedEdge = serveFromFixtures("POST", "/hr/exports/payroll", "edge2");
  const unmappedBody = unmappedEdge?.body as { error?: string; details?: { unmapped?: unknown[] } };
  ok("an unmapped identifier is a 400, not a file with blanks", unmappedEdge?.status === 400);
  ok("…carrying details.unmapped[]", (unmappedBody?.details?.unmapped ?? []).length === 2);

  // ── Law: money crosses the wire as a DECIMAL STRING, never a float. ─────────────────────────
  // 241880.12 has no exact binary representation. If the contract handed a client a JSON number the
  // corruption would already have happened before any component could avoid it, so the guarantee
  // has to hold at the fixture, not at the renderer.
  const exportRead = serveFromFixtures("GET", "/hr/exports/00000000-0000-4000-8000-000000000001", "happy");
  const exportBody = exportRead?.body as { total_hours?: unknown; total_amount?: unknown };
  ok("total_hours is a decimal STRING, not a number", typeof exportBody?.total_hours === "string");
  ok("total_amount is a decimal STRING, not a number", typeof exportBody?.total_amount === "string");
  const previewRead = serveFromFixtures("POST", "/hr/exports/payroll/preview", "happy");
  const previewBody = previewRead?.body as {
    total_hours?: unknown;
    by_earning_code?: Array<Record<string, unknown>>;
  };
  ok("the preview's totals are strings too", typeof previewBody?.total_hours === "string");
  ok(
    "…and so is every per-earning-code line",
    (previewBody?.by_earning_code ?? []).every((line) => typeof line.hours === "string"),
  );

  // ── Law: `partial` / failed_units is NEVER a success (FREEZE §4 D-13). ──────────────────────
  const recompute = serveFromFixtures("POST", "/hr/time/recompute", "edge");
  const recomputeBody = recompute?.body as {
    status?: string;
    result?: { failed_units?: unknown[] };
  };
  ok("the recompute edge fixture carries status 'partial'", recomputeBody?.status === "partial");
  ok(
    "…AND a populated failed_units[], so a surface cannot render it as clean",
    (recomputeBody?.result?.failed_units ?? []).length === 2,
  );

  // ── Law: the format registry is the SERVER's, and it carries an availability flag. ───────────
  const formatsFixture = serveFromFixtures("GET", "/hr/exports/formats", "happy");
  const serverFormats = (formatsFixture?.body as { formats: Array<Record<string, unknown>> })
    .formats;
  ok("the format list comes from the server", Array.isArray(serverFormats));
  ok(
    "…and every entry declares `available`, so a client never has to guess",
    serverFormats.every((f) => typeof f.available === "boolean"),
  );
  ok(
    "…and declares which identifiers it requires mapped",
    serverFormats.every((f) => Array.isArray(f.requires_mapping)),
  );

  // ── Law: an org-A payroll admin cannot list org-B exports through the history door. ─────────
  //
  // This is a SQL fact, so it is asserted where the SQL lives rather than by pretending a fixture
  // proved it. `hr.capability(uid, cap)` with no organization answers "does this user hold it in
  // ANY org" after the HRB-007 cross-org hardening, so an ambient call in the export reader is a
  // cross-tenant grant. Both the declaring file and the fix must carry the SCOPED form — if either
  // reverts, re-applying it reopens the hole, and this check goes red before that ships.
  const SQL_FILES = [
    "migrations/hr_l13_02_export_grain_and_reader.sql",
    "migrations/hr_l3_05_export_list_org_scope.sql",
  ];
  const AMBIENT = /hr\.capability\s*\(\s*v_user\s*,\s*'payroll\.read'\s*\)/;
  const SCOPED = "hr.capability(v_user, 'payroll.read', null, current_date, p_organization_id)";
  for (const rel of SQL_FILES) {
    const full = resolve(__dirname, "../../../../..", rel);
    const sql = existsSync(full) ? readFileSync(full, "utf8") : "";
    ok(`${rel} exists`, sql.length > 0);
    // Two exclusions, both named rather than loosened:
    //   • COMMENT lines quote the ambient form on purpose, to explain what was wrong. Reporting
    //     those would report the very explanation that keeps it fixed.
    //   • The `v_old_call` DECLARATION in the fix migration holds the ambient string as the thing
    //     it searches for and replaces. That is a search pattern, not a call — and the migration
    //     would be unable to find and repair a regression without it.
    const code = sql
      .split("\n")
      .filter((line) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith("--")) return false;
        if (trimmed.startsWith("v_old_call constant text")) return false;
        return true;
      })
      .join("\n");
    ok(`${rel} · no ambient payroll.read capability call`, !AMBIENT.test(code));
    ok(`${rel} · scopes payroll.read to p_organization_id`, code.includes(SCOPED));
  }

  // ── Law: unapproved overtime is PAID. No payment word may appear in this vocabulary. ─────────
  const FORBIDDEN = ["unpaid", "withheld", "withhold", "not paid", "on hold", "pending pay", "zeroed"];
  const allLabels = Object.values(OT_STATE_LABEL).join(" | ").toLowerCase();
  ok(
    "no overtime state label contains a payment-withholding word",
    !FORBIDDEN.some((w) => allLabels.includes(w)),
    allLabels,
  );
  ok(
    "the worked-unapproved label says PAID in the label itself",
    OT_STATE_LABEL["worked-unapproved"].toLowerCase().includes("paid"),
  );
  ok(
    "the auto-flagged label says PAID in the label itself",
    OT_STATE_LABEL.auto_flagged.toLowerCase().includes("paid"),
  );
  ok(
    "the decision-time sentence states that denying does not withhold pay",
    DENIAL_DOES_NOT_WITHHOLD_PAY.toLowerCase().includes("does not withhold pay"),
  );
  ok(
    "the deadline sentence rules out BOTH auto-approve and auto-deny",
    NO_DECISION_ESCALATES.includes("never approved by default") &&
      NO_DECISION_ESCALATES.includes("never denied by default"),
  );
  const otEdge = serveFromFixtures("POST", "/hr/time/overtime/evaluate", "edge");
  const otBody = otEdge?.body as {
    hours_worked_to_date: number;
    preapproval: { state: string };
  };
  ok(
    "the evaluator's exceeded_without_approval case keeps the hours intact",
    otBody.preapproval.state === "exceeded_without_approval" && otBody.hours_worked_to_date > 40,
  );

  // ── Law: approve is refused while a timecard is open, PERMITTED with a disagreement. ─────────
  const basePeriod = {
    id: "p1",
    payGroupId: "g1",
    payGroupName: "Hourly",
    periodStartOn: "2026-03-01",
    periodEndOn: "2026-03-15",
    payDate: "2026-03-20",
    sequenceNumber: 6,
    state: "submitted" as const,
    submittedAt: null,
    approvedAt: null,
    exportedAt: null,
    lockedAt: null,
    closedAt: null,
    reopenedAt: null,
    reopenReason: null,
    boundaryWorkweekIds: ["w1", "w2"],
    counts: { employments: 288, approved: 285, open: 0, attested: 285, disputed: 3 },
  };
  const ctx = {
    role: "payroll_admin" as const,
    allowPeriodReopen: true,
    todayLocalDate: "2026-03-20",
  };
  const approvable = offeredTransitions({ period: basePeriod, ...ctx }).find(
    (o) => o.to === "approved",
  );
  ok("approve is OFFERED with three open disagreements", approvable?.unavailableBecause === null);
  ok(
    "…and the consequence names the disagreements in words",
    (approvable?.consequence ?? "").includes("3 timecards are approved with an open disagreement"),
  );
  const withOpen = {
    ...basePeriod,
    counts: { ...basePeriod.counts, open: 2, approved: 283 },
  };
  const blocked = offeredTransitions({ period: withOpen, ...ctx }).find((o) => o.to === "approved");
  ok(
    "approve is REFUSED while two timecards are still open",
    typeof blocked?.unavailableBecause === "string",
  );
  ok(
    "…and the refusal names how many, not just that it is blocked",
    (blocked?.unavailableBecause ?? "").includes("2 timecards"),
  );

  // ── Law: reopen requires a reason and states that it does not un-export or re-pay. ───────────
  const locked = { ...basePeriod, state: "locked" as const };
  const reopen = offeredTransitions({ period: locked, ...ctx }).find((o) => o.to === "reopened");
  ok("reopen is offered from locked", reopen !== undefined);
  ok("reopen requires a reason", reopen?.reasonRequired === true);
  ok(
    "reopen states it does not un-export",
    (reopen?.consequence ?? "").includes("does not un-export"),
  );
  ok("reopen states it does not re-pay", (reopen?.consequence ?? "").includes("does not re-pay"));
  ok(
    "the reopen notice explains WHY (regenerating double-pays)",
    REOPEN_NOTICE.includes("double-pays"),
  );
  const noReopen = offeredTransitions({
    period: locked,
    ...ctx,
    allowPeriodReopen: false,
  }).find((o) => o.to === "reopened");
  ok(
    "reopen is unavailable — with the knob named — when the org has it off",
    (noReopen?.unavailableBecause ?? "").includes("allow_period_reopen"),
  );

  // ── Law: submit only after the period's end date has passed. ─────────────────────────────────
  const open = { ...basePeriod, state: "open" as const };
  const early = offeredTransitions({ period: open, ...ctx, todayLocalDate: "2026-03-10" }).find(
    (o) => o.to === "submitted",
  );
  ok("submit is refused before the end date", typeof early?.unavailableBecause === "string");
  const late = offeredTransitions({ period: open, ...ctx, todayLocalDate: "2026-03-16" }).find(
    (o) => o.to === "submitted",
  );
  ok("submit is offered once the end date has passed", late?.unavailableBecause === null);

  // ── Law: a manager is read-only, and the refusal explains the role rather than hiding. ───────
  const managerOffers = offeredTransitions({
    period: basePeriod,
    role: "manager",
    allowPeriodReopen: true,
    todayLocalDate: "2026-03-20",
  });
  ok(
    "every transition is closed to a manager",
    managerOffers.every((o) => o.unavailableBecause !== null),
  );
  ok(
    "…and every refusal carries a reason",
    managerOffers.every((o) => (o.unavailableBecause ?? "").length > 20),
  );

  // ── Law: `exported` is never a button. It is reached by a run completing. ────────────────────
  const approved = { ...basePeriod, state: "approved" as const };
  ok(
    "no control offers the 'exported' transition",
    !offeredTransitions({ period: approved, ...ctx }).some((o) => o.to === "exported"),
  );

  // ── Law: the two state machines are labelled distinctly. ─────────────────────────────────────
  ok(
    "row progress is worded, not a bare state",
    rowProgressSentence(basePeriod) === "285 of 288 timecards approved",
  );

  // ── Law: the boundary-weeks panel is a SENTENCE, not an id list. ─────────────────────────────
  const boundary = boundaryWeeksSentence(["w1", "w2"]);
  ok("boundary weeks are explained in words", (boundary ?? "").includes("2 workweeks straddle"));
  ok(
    "…including where the overtime is attributed",
    (boundary ?? "").includes("the period containing the week's end date"),
  );
  ok("no straddling weeks produces no sentence", boundaryWeeksSentence([]) === null);
  ok("no disagreements produces no sentence", disputeSentence(0) === null);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  process.stdout.write(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${checks - failures}/${checks} checks passed` +
      `\x1b[0m — exercised from Node with no DOM, no React and no Next.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * ⚠️ DEBT, and it is a real one for D1: `features/hr/time/api/rpc.ts` imports
 * `@/utils/supabase/client`, which calls `createClient()` at MODULE SCOPE and requires
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to be set before the import is
 * evaluated. That is why this script loads `.env.local` by hand above.
 *
 * It works, and the lane is genuinely client-agnostic in behaviour — but a native client would have
 * to satisfy a browser client's env just to import the typed service. The clean fix is a lazy
 * accessor in `utils/supabase/client.ts`, which is a platform-wide change and NOT this lane's call.
 * Recorded here rather than worked around silently.
 */
void main();
