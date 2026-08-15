/**
 * Production-backed regression for guided checklist persistence.
 *
 * Mints real user sessions and exercises the exact PostgREST/RLS path used by
 * the browser. The owner deliberately writes a run under a target organization
 * they do not belong to: ownership, not active-org membership, is the INSERT
 * authority. The row is re-read by its owner, hidden from an unrelated user,
 * and deleted through RLS in a finally block.
 *
 * Usage: pnpm check:guided-setup-rls [--strict]
 */

import { C, loadEnv, mintUserJwt, rlsCount, rlsDelete, rlsInsert } from "./lib";

const STRICT = process.argv.includes("--strict");
const OWNER_ID = "77c6af70-a35e-4724-a304-64a0dd789674";
const CONTROL_ID = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const TARGET_ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

interface RunRow {
  id: string;
  created_by: string;
  organization_id: string;
  checklist_key: string;
  target_key: string;
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
  const checklistKey = "regression.guided_setup_rls";
  const targetKey = `probe-${crypto.randomUUID()}`;
  let runId: string | undefined;

  try {
    const inserted = await rlsInsert<RunRow>(
      env,
      ownerJwt,
      "platform",
      "guided_checklist_run",
      {
        checklist_key: checklistKey,
        target_key: targetKey,
        organization_id: TARGET_ORG_ID,
        state: { steps: {} },
      },
      "id,created_by,organization_id,checklist_key,target_key",
    );
    runId = inserted.data[0]?.id;

    requireProbe(
      inserted.status === 201 && inserted.rows === 1 && Boolean(runId),
      "signed-in owner can create a checklist run",
    );
    requireProbe(
      inserted.data[0]?.created_by === OWNER_ID,
      "actor trigger stamps the authenticated user as owner",
    );
    requireProbe(
      inserted.data[0]?.organization_id === TARGET_ORG_ID,
      "target organization is preserved without an active-org gate",
    );

    const filter = `id=eq.${runId}`;
    requireProbe(
      (await rlsCount(
        env,
        ownerJwt,
        "platform",
        "guided_checklist_run",
        filter,
      )) === 1,
      "the same signed-in owner can re-read the run",
    );
    requireProbe(
      (await rlsCount(
        env,
        controlJwt,
        "platform",
        "guided_checklist_run",
        filter,
      )) === 0,
      "an unrelated signed-in user cannot read the run",
    );
  } finally {
    if (runId) {
      const deleted = await rlsDelete<{ id: string }>(
        env,
        ownerJwt,
        "platform",
        "guided_checklist_run",
        `id=eq.${runId}`,
      );
      requireProbe(
        deleted.rows === 1,
        "owner cleanup removed the regression row",
      );
    }
  }
}

main().catch((cause: unknown) => {
  console.error(`${C.red}check:guided-setup-rls failed:${C.reset}`, cause);
  if (STRICT) process.exitCode = 1;
});
