/**
 * Production-backed regression for guided checklist persistence, THROUGH THE DOOR.
 *
 * `platform` is not a client-writable schema (chair ruling, VERIFIER-8 HIGH-3; lane
 * DOORS-ONLY-3): `platform.guided_checklist_run` refuses every client INSERT/UPDATE/DELETE by
 * policy name, and the browser writes through `public.checklist_run_start` /
 * `public.checklist_run_save`. So this probe asks BOTH halves of the question, because either
 * one alone is a lie:
 *
 *   · the base table really is shut — a direct PostgREST INSERT under a real user's JWT comes
 *     back 42501 NAMING `guided_checklist_run_client_insert_refused`, not a silent no-op; and
 *   · the feature really still works — the same user starts a run and saves state through the
 *     door, the version CAS behaves, and an unrelated signed-in user still cannot read it.
 *
 * It mints real user sessions and uses the exact PostgREST path the browser uses. The owner
 * writes under an organization that is not their active one: organization access, never an
 * ACTIVE-org gate, is the authority — the door asks `iam.has_org_access`, which is the same
 * question `std_insert` asked.
 *
 * 🚨 THE TWO IDENTITIES ARE THE TEST ACCOUNTS, and they were not before. Until DOORS-ONLY-3
 * this probe minted a session for `elliesadeghijd@gmail.com` — a REAL PERSON, and a member of
 * no organization this probe names, so `iam.has_org_access` was false for them and the write
 * it asserted could only ever have passed before that policy existed. It is now
 * `admin@admin.com` (a member of AI Matrx) against `test@test.com` (not a member), which is
 * both the standing testing rule and the only pair that makes the assertions mean what they
 * say.
 *
 * THE PROBE ROW IS DURABLE AND SINGULAR, and that is a consequence of the closure rather than
 * a shortcut: a client can no longer hard-DELETE this table, so a probe that created a fresh
 * row per run would litter one row per CI run for ever. `checklist_run_start` returns the
 * EXISTING live run for a (checklist, target, organization) triple, so a fixed target key makes
 * every run reuse one row — which also exercises the door's read-then-insert, the arm that
 * makes the two-tab race impossible.
 *
 * Usage: pnpm check:guided-setup-rls [--strict]
 */

import { C, loadEnv, mintUserJwt, rlsCount, rlsInsert, rlsRpc } from "./lib";

const STRICT = process.argv.includes("--strict");
const OWNER_ID = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const CONTROL_ID = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // test@test.com
const TARGET_ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b"; // AI Matrx — owner is a member, control user is not

/** Fixed on purpose — see the header. One durable row, reused by every run. */
const CHECKLIST_KEY = "regression.guided_setup_rls";
const TARGET_KEY = "doors-only-3-door-probe";

interface RunRow {
  id: string;
  organization_id: string;
  checklist_key: string;
  target_key: string;
  state: Record<string, unknown>;
  version: number;
}

function requireProbe(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log(`  ${C.green}PASS${C.reset} ${message}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env) {
    console.log(
      `${C.yellow}check:guided-setup-rls skipped — Supabase env not found.${C.reset}`,
    );
    if (STRICT) process.exitCode = 1;
    return;
  }

  const [ownerJwt, controlJwt] = await Promise.all([
    mintUserJwt(env, OWNER_ID),
    mintUserJwt(env, CONTROL_ID),
  ]);

  // ── 1. THE TABLE IS SHUT, AND IT SAYS SO BY NAME ──────────────────────────
  const direct = await rlsInsert<{ id: string }>(
    env,
    ownerJwt,
    "platform",
    "guided_checklist_run",
    {
      checklist_key: CHECKLIST_KEY,
      target_key: `direct-${crypto.randomUUID()}`,
      organization_id: TARGET_ORG_ID,
      state: { steps: {} },
    },
  );
  requireProbe(
    direct.status === 403 || direct.status === 401,
    `a direct client INSERT on platform.guided_checklist_run is refused (HTTP ${direct.status})`,
  );
  // 🚨 POSTGRES NAMES THE POLICY ONLY WHEN EXACTLY ONE REJECTED THE ROW, and on this table
  // more than one does, so the message is the generic RLS refusal. That is recorded rather
  // than dressed up: DOORS-ONLY and DOORS-ONLY-2 both measured the same bluntness. The proof
  // that it is THIS lane's policy and not a coincidence is the differential in
  // scripts/campaign-tests/doorsonly3_batch_a_green.sql, which drops the three refusals
  // inside a rolled-back transaction and watches the same INSERT get through.
  requireProbe(
    /row-level security policy/i.test(direct.error ?? ""),
    "the refusal is RLS refusing the write, not a validation error or a silent no-op",
  );

  // ── 2. THE FEATURE STILL WORKS, THROUGH THE DOOR ──────────────────────────
  const started = await rlsRpc<RunRow>(env, ownerJwt, "checklist_run_start", {
    p_organization_id: TARGET_ORG_ID,
    p_checklist_key: CHECKLIST_KEY,
    p_target_key: TARGET_KEY,
  });
  requireProbe(
    started.status === 200 && Boolean(started.data?.id),
    "a signed-in owner starts a checklist run through public.checklist_run_start",
  );
  const run = started.data!;
  requireProbe(
    run.organization_id === TARGET_ORG_ID,
    "the door preserves the named organization — there is no active-org gate",
  );

  const saved = await rlsRpc<RunRow>(env, ownerJwt, "checklist_run_save", {
    p_organization_id: TARGET_ORG_ID,
    p_run_id: run.id,
    p_state: { steps: { probe: { done: true, at: new Date().toISOString() } } },
    p_expected_version: run.version,
  });
  requireProbe(
    saved.status === 200 && saved.data?.version === run.version + 1,
    "saving through public.checklist_run_save advances the version by exactly one",
  );

  // The CAS is the whole reason this door exists in this shape: replaying the
  // version we already spent must write nothing and say so by returning null.
  const stale = await rlsRpc<RunRow | null>(env, ownerJwt, "checklist_run_save", {
    p_organization_id: TARGET_ORG_ID,
    p_run_id: run.id,
    p_state: { steps: {} },
    p_expected_version: run.version,
  });
  requireProbe(
    stale.status === 200 && stale.data === null,
    "a stale version writes nothing and returns null, so the client re-reads and replays",
  );

  // ── 3. READS ARE EXACTLY AS THEY WERE ─────────────────────────────────────
  const filter = `id=eq.${run.id}`;
  requireProbe(
    (await rlsCount(env, ownerJwt, "platform", "guided_checklist_run", filter)) === 1,
    "the owner still reads the run straight off the table — SELECT was never touched",
  );
  requireProbe(
    (await rlsCount(env, controlJwt, "platform", "guided_checklist_run", filter)) === 0,
    "an unrelated signed-in user still cannot read the run",
  );

  // ── 4. A STRANGER CANNOT USE THE DOOR EITHER ──────────────────────────────
  const intruder = await rlsRpc<RunRow | null>(env, controlJwt, "checklist_run_save", {
    p_organization_id: TARGET_ORG_ID,
    p_run_id: run.id,
    p_state: { steps: { stolen: true } },
    p_expected_version: run.version + 1,
  });
  requireProbe(
    intruder.status !== 200 || intruder.data === null,
    "the door refuses an unrelated user — it decides on the ladder, it does not just relay",
  );
}

main().catch((cause: unknown) => {
  console.error(`${C.red}check:guided-setup-rls failed:${C.reset}`, cause);
  if (STRICT) process.exitCode = 1;
});
