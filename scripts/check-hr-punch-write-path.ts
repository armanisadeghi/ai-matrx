#!/usr/bin/env npx tsx
/**
 * HR punch write path conformance — the gate that stands where RLS cannot.
 *
 * WHAT IT PROTECTS: the write path into `hr.punch`. A punch row is the raw,
 * legally-relevant record of when a human started and stopped working. RAW IS
 * RAW: it is written by exactly one sanctioned function (`hr.punch_record`),
 * never UPDATEd except through the void lane, and never DELETEd — a correction
 * is a void plus a new punch.
 *
 * WHY RLS IS NOT ENOUGH: `hr.punch` is a `component` table, and the canonical
 * component write policy permits ANYONE HOLDING EDITOR ON THE PARENT to insert.
 * That is correct for components in general and catastrophic here: with the
 * schema exposed, a browser holding an editor grant could `insert into hr.punch`
 * directly and manufacture a time record that never passed a single invariant —
 * no open-punch check, no rounding rules, no device attestation, no audit trail.
 * RLS says "yes, you are an editor" and lets it through. The only things
 * actually holding the door are structural: hr is NOT in PostgREST's exposed
 * schema list, anon holds no table grants on hr.punch, and the sanctioned
 * writers are a short, enumerated set of SECURITY DEFINER functions with pinned
 * search_paths. Those are facts about the LIVE database, invisible to tsc and
 * invisible to a code review. This gate is what checks them.
 *
 * SPEC-TIME §15 named wiring this query into CI — rather than leaving it as a
 * line on a review checklist — as THE ONLY THING standing between us and a
 * client-direct insert path into hr.punch. A checklist item is a hope; a gate
 * is a mechanism. This file is that mechanism.
 *
 * It calls `public.__hr_punch_write_path_conformance()` (SPEC-DATA-MODEL §18.5 /
 * L3-80), which returns one row per structural check with `ok`, a severity, and
 * a `detail` jsonb carrying `why` plus the violating objects it found.
 *
 *   pnpm check:hr-punch-write-path            # loud, exit 0
 *   pnpm check:hr-punch-write-path:strict     # exit 1 on ANY finding (CI/release)
 *
 * WHERE THE STRICT LANE RUNS: .github/workflows/ci.yml, job `hr-punch`, on
 * every PR/push (credential-gated; UNMEASURED without the secret is a hard
 * fail). release.sh runs the release gates `--advisory || true`, so the CI job
 * is the only invocation that can actually block — deleting it re-opens
 * HRB-015, and check-doc-claims.ts's `per-pr-ci` claim guards against that.
 *
 * 🚨 UNMEASURED IS NOT PASSED. Two degenerate outcomes are treated as FAILURES,
 * never as a green light:
 *   1. The live pull failed (no creds, DB unreachable, RPC missing/revoked) —
 *      prints the `LIVE PULL FAILED` banner, which run-release-gates.sh's
 *      advisory-marker regex knows, so a degraded run shows as [WARN] with the
 *      banner instead of a silent green [OK].
 *   2. The RPC answered but returned an empty array, or an array missing any of
 *      any expected check_key. A gate that silently measures nothing is
 *      EXACTLY the failure mode this file exists to prevent: it would report a
 *      clean write path while checking zero of it. So the returned check_keys
 *      are compared against EXPECTED_CHECKS and any absentee is reported as a
 *      finding in its own right. Adding a check to the SQL function means adding
 *      its key here in the same change, or the new check can vanish unnoticed.
 *
 * Exit codes:
 *   0  every check ok, OR findings/unmeasured in default (advisory) mode
 *   1  findings, missing checks, or an unmeasured run AND --strict
 *   2  the script itself crashed
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "__hr_punch_write_path_conformance";
const TIMEOUT_MS = 15_000;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
};

const STRICT = process.argv.includes("--strict");

/**
 * The checks the deployed function is contracted to return. A row that
 * stops being returned is a silent hole in the write path's coverage, so the
 * absence of a key is itself a finding — see the header.
 */
const EXPECTED_CHECKS = [
  "pgrst_hr_not_exposed",
  "punch_triggers_present",
  "anon_no_table_grants_on_punch",
  "only_sanctioned_inserters",
  "only_sanctioned_updaters",
  "no_punch_deleters",
  "wrappers_authenticated_only",
  "kiosk_doors_anon_reachable",
  "punch_record_hardened",
  // The COMPUTED lane (hr_l3_14). hr.work_interval is fenced the way hr.punch is: one sanctioned
  // persist door plus the premium writer, and nothing may ever DELETE a superseded row.
  "only_sanctioned_interval_writers",
  "no_interval_deleters",
  // The client door surface (hr_l3_15). `hr` is not PostgREST-exposed, so every client-called HR
  // RPC is a public.hr_* wrapper; this check fences their shape and publishes the live inventory.
  "client_doors_well_formed",
  // The premium invariant (hr_l3_18), asserted over the ROWS: at most one current premium_only
  // interval per (employment, day, earning code). Two sanctioned writers can emit one for the same
  // exception; this survives a change to either. It catches a DOUBLE premium, never a missing one.
  "premium_line_not_doubled",
  // G2 N1 (hr_l3_24): a knob reader pointed at a feature with zero rows in platform.feature_knob
  // silently falls past the platform rung to its caller default, in EVERY org, unfixable by any
  // admin action. hr._clock_knob read `hr.clock`, which has no registered keys.
  "knob_readers_use_registered_features",
  // Round-4 blocker S6 (hr_l3_44/45), asserted twice on purpose. The DATA check: no stored
  // pay-period rollup may disagree with the breakdown stored beside it — the original form showed
  // every category as 0.00 under a non-zero total, which is a number a manager approves rather
  // than a page anybody reports. The STRUCTURAL check: any function that inserts a current
  // hr.work_interval and does not refresh the rollup in the same body IS that defect by
  // construction, and it catches a new writer before anyone has used it.
  "pay_period_rollup_matches_its_breakdown",
  "interval_writers_refresh_the_rollup",
  // Round-4 blocker S1 (hr_l3_43/46): a READ door that evaluates the reader's capability as-of the
  // RECORD's date refuses an HR admin every period that ended before their own role began. Current
  // standing governs what history you may read; the punch DATE still governs what you may write.
  // This one is a grep and cannot see a date laundered through a local variable — it catches the
  // copy-paste that put the pattern in seven doors, not every possible spelling of it.
  "read_authority_is_as_of_now",
  // The finality lane (hr_l3_48). hr.punch_void enqueued no recompute and left
  // hr.workweek.is_final = true, so a void between finality and export shipped PRE-VOID hours in
  // the payroll file — permanently, and with the function returning `is_stale: true` while
  // pointing at a recompute door it never called. Every writer of hr.punch must drop the flag for
  // that week in the same transaction; only hr.recompute_apply, which re-derives the hours, may
  // ever set it back.
  "punch_writers_unfinalize_their_week",
  "only_recompute_marks_a_week_final",
  // hr_l3_49: hr._record_access_audit gained p_actor_user_id so a privileged caller (aidream, with
  // no auth.uid()) can name the human behind a read. A caller that names the user but omits
  // p_actor_type gets actor_type='automation' on a row naming a person — reproduced live. An
  // access log that credits a robot for what a named human did is read as evidence, so the
  // contradiction is not allowed to accumulate. Fix the CALL, not the row.
  "audit_actor_type_matches_named_user",
  // T-41 (hr_l3_52). SPEC-ACCESS's DEAD-DOOR RULE: a capability token declared by an endpoint and
  // held by no role refuses EVERYONE, so it passes every leak-shaped test and surfaces only as a
  // 403 nobody can clear. T-41 was specified on 2026-08-26 after L13 shipped five of them and was
  // never built; time.recompute was the sixteenth. Asserted as a token-set difference, never as
  // "can role X do Y". The 15 still-dead tokens ride a dated allowlist printed on every run.
  "no_dead_capability_doors",
  // hr_l3_55. Three seeded jurisdiction rules gated on flsa_status eq "non_exempt" while the live
  // CHECK permits only exempt / nonexempt, so overtime had never applied to anybody in any org —
  // and the 67-fixture suite stayed GREEN throughout, because nine fixtures asserted the same
  // unstorable token. Rule and test agreed with each other and neither agreed with the database.
  // Allowed sets are parsed from the live CHECK at check time, so this cannot drift from the
  // schema it polices; superseded rows keep the old token so snapshots stay readable.
  "rule_vocabulary_is_storable",
  // Round-12 P4 (hr_l3_58). A rollup reading 0 overtime beneath a workweek that computed some is
  // EXPECTED for data drained by an engine that split the workweek but not its intervals — and is
  // only acceptable when the row SAYS so via calc.split_pending. Undisclosed disagreement is a
  // refresher defect. And hr.timesheet_get reads calc.multi_rate rather than re-deriving it: the
  // old count over (assignment, rate) counted OT/DT multiplier rates as pay rates, and counted two
  // assignments at the SAME rate as two rates.
  "rollup_overtime_agrees_or_discloses",
  "workweek_carries_multi_rate_flag",
  // hr_l3_59. jsonb_build_object writes the KEY with a JSON null when its value is SQL NULL, and
  // (calc -> 'split_pending') IS NULL is FALSE for a JSON null. Check 23 tested presence, so every
  // row the refresher touched read as already-disclosed and was excluded from its violation set —
  // blocking in name and inert in fact, on the run that installed it. A marker is an array or it is
  // absent; never a JSON null.
  "split_pending_is_absent_or_real",
  // Round-15 (hr_l3_61). A timecard nobody can approve stalls payroll with no error anywhere — the
  // surface simply never advances. Two shapes today: a subject WITH a manager (hr.can_approve has
  // no reporting-line rung, so the selector's rung is structurally dead), and the sole approver's
  // own card (RULE 1 forbids self-approval, sole_authority_mode requires a second actor there is
  // none of). Three known pairs ride a dated allowlist printed on every run; both fixes belong to
  // the workflow lane, because widening the predicate decides who may act on payroll.
  "every_timecard_has_an_approver",
  // Round-18 P1 + round-19 (hr_l3_64/65/66). TWO doors suppressed an opted-out person's own row and
  // then printed that same person's full name one column over as manager_name, to any peer — a raw
  // hr.employee.display_name read with no viewer in it. The row-level suppression is exactly what
  // hid it: anyone testing "is the opted-out employee hidden?" gets a correct YES.
  // hr_directory_list did it (hr_l3_64) and hr.employee_by_party did it too (hr_l3_66) — the latter
  // because it carried a SECOND hand-copied set of the arms, which is the whole lesson: a second
  // body does not drift eventually, it drifts on the day it is written.
  // The load-bearing clause is therefore a FINGERPRINT COUNT, not a caller count: exactly one
  // function in hr may read the opt-out flag AND check identity.write AND call hr._punch_capability.
  // A caller count would forbid a legitimate eighth door while permitting the duplication that
  // actually leaks. The shell (hr._subject_display_name) is asserted by what it DOES — it must call
  // the one body — since asserting only the absence of arm logic would also pass an empty function
  // that silently blanks six doors. Clauses live in hr.name_rule_violations().
  "directory_names_use_the_one_rule",
  // Round-18, the half hr_c4_20 deliberately could not reach. RULE 2b (the reporting-line rung that
  // closed check 26) is gated on sole_authority_mode = auto_record, so it never reaches
  // pay_change_approve / termination_approve / offer_approve — correctly, since a manager must not
  // approve their report's pay alone. A managed subject therefore fails RULE 2 (hr.approval_authority
  // is empty database-wide), RULE 2b (wrong mode) and RULE 3 (top-of-chart only). NOT a deadlock:
  // hr_authority_grant admits org owners explicitly. NOT an activation bug either: SPEC-ACCESS §1.1
  // enumerates what activation creates and no authority row is in it. Two known pairs ride a dated
  // allowlist; whether a fresh org should be seeded is an approval-engine policy call, not this lane's.
  "every_pay_change_has_an_approver",
  // hr_l3_68, the third sibling of checks 26 and 28, filed by the Leave lane as L5-A1
  // ("leave_approve held by NO role and NO org"). Measured: leave_approve is in the auto_record
  // split, so a managed subject resolves at RULE 2b and a top-of-chart subject at RULE 3, and the
  // sole proprietor's own leave auto-records (T-22). Probed against real manager edges with the
  // org's leave authority rows REMOVED: all three populations resolved an approver, so nothing was
  // owed on the routing half. 🚨 Read `leave_requests_in_existence` beside the verdict — the table
  // is effectively empty, so a green here is not evidence that leave routing works.
  "every_leave_request_has_an_approver",
  // hr_l3_77. SPEC-LEAVE §9.6 governs the existence disclosure with ONE switch. hr_l3_69 retired
  // hr.leave.case_existence_visible_to_manager in the required order (seed the survivor, then drop)
  // because the struck knob defaulted TRUE and was the switch turning the statement ON while the
  // survivor was empty. That retirement was then REVERTED IN THE DATABASE while its file sat
  // committed on main and its ledger row still claimed success — another lane re-created
  // hr.leave_calendar from its own source and re-seeded the knob, and nothing said so. All four
  // revert shapes are asserted, including the survivor being cleared, which would retire the switch
  // and turn the disclosure OFF: the exact failure the ordered pair exists to prevent.
  "existence_disclosure_has_one_switch",
  // hr_l3_79. THE REPLAY-ORDER CLASS, GENERALIZED TO CONCURRENT LANES: an edit applied to a shared
  // function must not be silently discardable by a later re-emit. hr_l3_69 was applied, ledgered
  // and committed, then ERASED in the database when another lane re-created hr.leave_calendar from
  // its own source — the ledger row still said "applied" and nothing said the fix was gone.
  // Deriving the expected body from the migration corpus is infeasible here: 69 of 100 hr_l3
  // migrations rewrite via pg_get_functiondef+replace, so no literal body exists to compare, and
  // the SQL gate cannot read files at all. Instead each protected function declares WHAT MUST
  // REMAIN TRUE of it, as rows in hr.function_contract — a re-emit that discards a fix breaks the
  // contract by construction, where a home-migration marker would have been wiped by the same
  // overwrite it was meant to detect. Protection is an INSERT, never a code change (D13).
  // Coverage is opt-in and reported on every run; see the check's coverage_note for what it cannot
  // see. Falsified against the exact lived history.
  "function_contracts_hold",
  // hr_l3_80. F1's edge matcher has been changed twice and each change fixed one shape while
  // breaking another: a bare substring matched a writer name inside a TABLE name
  // (hr.leave_enroll in hr.leave_enrollment) and invented edges; requiring a following paren fixed
  // that and went BLIND to dynamic calls, where the callee sits in a format()-built string literal
  // followed by a quote. Identifier-boundary matching satisfies all four shapes. They are asserted
  // on EVERY run rather than proven once at migration time — a one-time proof protects only the
  // matcher that existed that day, which is exactly how the dynamic shape was lost. A failure with
  // expected=true is a FALSE NEGATIVE: an over-firing detector gets investigated, a blind one lets
  // a STABLE door write in silence.
  "edge_matcher_sees_every_call_shape",
] as const;

interface ConformanceRow {
  readonly check_key: string;
  readonly ok: boolean;
  readonly severity: string;
  readonly detail: Record<string, unknown> | null;
}

function loadSupabaseEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  if (!url || !key) {
    // The secret key WINS over the publishable one regardless of the order the
    // two appear in the file: EXECUTE on this RPC is granted to authenticated
    // and service_role and deliberately NOT to anon (that is one of the things
    // it checks), so the publishable key answers 401 and the gate would report
    // itself UNMEASURED on a perfectly healthy database.
    let secret = "";
    let publishable = "";
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!secret && m[1] === "SUPABASE_SECRET_KEY") secret = v;
        if (!publishable && m[1] === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") publishable = v;
      }
      if (url && secret) break;
    }
    if (!key) key = secret || publishable;
  }
  return url && key ? { url, key } : null;
}

function isRow(value: unknown): value is ConformanceRow {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.check_key === "string" && typeof r.ok === "boolean";
}

async function fetchConformance(): Promise<
  { rows: ConformanceRow[]; failure: null } | { rows: null; failure: string }
> {
  const env = loadSupabaseEnv();
  if (!env) return { rows: null, failure: "no Supabase URL/key in env or .env* files" };

  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc/${RPC}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public",
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        rows: null,
        failure: `rpc/${RPC} returned ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    const parsed: unknown = JSON.parse(await res.text());
    if (!Array.isArray(parsed)) return { rows: null, failure: `rpc/${RPC} did not return an array` };
    const rows = parsed.filter(isRow);
    if (rows.length !== parsed.length) {
      return { rows: null, failure: `rpc/${RPC} returned rows that are not {check_key, ok, ...}` };
    }
    return { rows, failure: null };
  } catch (err) {
    return {
      rows: null,
      failure: `could not reach Supabase at ${endpoint} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/** Renders `detail` for a human: the `why` sentence, then every non-empty finding key. */
function renderDetail(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  const lines: string[] = [];
  const why = detail.why;
  if (typeof why === "string" && why.trim()) lines.push(`${C.dim}${why.trim()}${C.reset}`);
  for (const [k, v] of Object.entries(detail)) {
    if (k === "why") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}: ${v.map((item) => JSON.stringify(item)).join(", ")}`);
    } else if (v !== null && v !== undefined && v !== "") {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return lines;
}

function unmeasured(reason: string, hint: string): never {
  console.log("");
  console.log(
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — HR punch write path is UNMEASURED${C.reset}`,
  );
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(`  ${C.dim}${hint}${C.reset}`);
  console.log(
    `  ${C.dim}This gate needs the live DB. Nothing here was checked — that is NOT a pass.${C.reset}`,
  );
  console.log("");
  process.exit(STRICT ? 1 : 0);
}

async function main(): Promise<void> {
  const { rows, failure } = await fetchConformance();

  if (failure) {
    unmeasured(
      failure,
      `public.${RPC}() is SECURITY DEFINER with EXECUTE granted to authenticated + service_role.`,
    );
  }

  const returned = rows ?? [];
  const seen = new Set(returned.map((r) => r.check_key));
  const missing = EXPECTED_CHECKS.filter((k) => !seen.has(k));

  // An empty result is the worst possible outcome: the call "succeeded" and
  // measured nothing. Never let it read as a pass.
  if (returned.length === 0) {
    unmeasured(
      `rpc/${RPC} returned ZERO rows — the conformance query measured nothing`,
      `Expected ${EXPECTED_CHECKS.length} checks. An empty result means the function was replaced, neutered, or is failing silently.`,
    );
  }

  const failed = returned.filter((r) => !r.ok);

  if (failed.length === 0 && missing.length === 0) {
    console.log(
      `${TAG.info}HR punch write path: ${C.green}${returned.length}/${EXPECTED_CHECKS.length} conformance checks passed${C.reset} ` +
        `${C.dim}(no client-direct insert path into hr.punch)${C.reset}`,
    );
    process.exit(0);
  }

  console.log("");
  console.log(
    `${TAG.fail}${C.bold}${C.red}HR PUNCH WRITE PATH CONFORMANCE FAILED — ` +
      `${failed.length} failing check(s), ${missing.length} missing check(s)${C.reset}`,
  );
  console.log(
    `  ${C.dim}public.${RPC}() · SPEC-DATA-MODEL §18.5 / L3-80 · BLOCKING in strict mode${C.reset}`,
  );
  console.log("");

  for (const r of failed) {
    console.log(`  ${C.bold}${r.check_key}${C.reset} ${C.dim}(${r.severity})${C.reset}`);
    for (const line of renderDetail(r.detail)) console.log(`      ${line}`);
    console.log("");
  }

  for (const k of missing) {
    console.log(`  ${C.bold}${k}${C.reset} ${C.dim}(not returned)${C.reset}`);
    console.log(
      `      ${C.dim}This check did not run at all. An unreturned check is an unmeasured check, not a passing one.${C.reset}`,
    );
    console.log("");
  }

  console.log(`  ${C.yellow}${C.bold}What this means${C.reset}`);
  console.log(
    `  ${C.dim}A client-direct insert path into hr.punch may now exist. hr.punch is a component${C.reset}`,
  );
  console.log(
    `  ${C.dim}table, so its RLS write policy admits anyone holding editor on the parent — RLS will${C.reset}`,
  );
  console.log(
    `  ${C.dim}NOT stop this. The structural facts above (schema not exposed to PostgREST, no anon${C.reset}`,
  );
  console.log(
    `  ${C.dim}grants, an enumerated set of sanctioned writers, pinned search_paths) are the only${C.reset}`,
  );
  console.log(
    `  ${C.dim}things that do. A failure here means a punch row can be manufactured without passing${C.reset}`,
  );
  console.log(
    `  ${C.dim}a single invariant hr.punch_record enforces. Fix the offending object before shipping.${C.reset}`,
  );
  console.log("");

  process.exit(STRICT ? 1 : 0);
}

main().catch((err) => {
  console.error(
    `${TAG.fail}check-hr-punch-write-path crashed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(2);
});
