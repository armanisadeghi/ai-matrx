/**
 * A LIST OF PEOPLE A PERSON SEES NAMES ONLY PEOPLE IN THEIR OWN ORGANIZATIONS.
 *
 * WHAT THIS CLOSES, measured live on the main database on 2026-09-20 (lane FIX-7B) from the
 * seat a signed-in person really has — `role authenticated`, `request.jwt.claims` =
 * test@test.com, an ordinary member of fifteen organizations, none of them the platform's own:
 *
 *   crm.party           950 rows across 5 organizations    941 of them the platform tenant's
 *   crm.contact_medium  948 rows                           942 of them the platform tenant's
 *
 * Real names, real email addresses, real phone numbers, readable by EVERY signed-in account.
 * The seventh-pass verdict saw the same thing from the other end: a share dialog in a
 * brand-new organization "lists people from all over the database", and a CRM reporting 454
 * contacts in an organization that has never had one added.
 *
 * Not a bug in `crm.party`. ONE CLASS: db-rules §6e gives the `organization` data class a lane
 * that asks about no membership, no role and no grant —
 *
 *     organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)
 *
 * — which exists so platform CONTENT is readable by everybody. A table of people inherited it
 * because `platform.derive_data_class` back-filled its class from what the table happened to
 * look like, and then 941 people were written into the platform's own tenant.
 *
 * WHAT THIS GUARD IS. Two QUERIES over the live catalogue, exactly like
 * `custom.doors_not_masking_fields()` before it — never a list of names in a script:
 *
 *   · `iam.people_lists_a_non_member_can_read()` — a relation `iam.personal_data_relations()`
 *     calls personal whose live SELECT policy still carries that arm. MUST BE ZERO.
 *   · `iam.people_shaped_relations_with_no_verdict()` — a relation that LOOKS personal (a
 *     person's own name or contact detail as a column, or a foreign key into `crm.party`) and
 *     which nobody has ruled on. MUST BE ZERO. This is the half that makes the census GROW:
 *     the next people-shaped table somebody builds turns this red until somebody rules on it.
 *
 * BOTH ARE ZERO OR NOTHING IS. There is no ratchet and no excuse list here, because there is
 * no acceptable number of people lists a stranger can read.
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:people-lists-stay-in-your-organizations
 *   pnpm check:people-lists-stay-in-your-organizations:self-test   # proves it can still go red
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const OPEN_LISTS = `select relation, policy_name, why from iam.people_lists_a_non_member_can_read()`;
const NO_VERDICT = `select relation, why from iam.people_shaped_relations_with_no_verdict()`;

/**
 * THE SELF-TEST, and why it is shaped like this.
 *
 * A guard whose passing state is "zero rows" cannot be proved able to go red by lowering a
 * number — there is nothing to lower. So the self-test runs the SAME two predicates with one
 * classification dropped from each, and BOTH must then return rows:
 *
 *   · the first, over every registered relation instead of only the personal ones. A relation
 *     ruled NOT personal — a public registry's own contact address — still carries the §6e arm,
 *     correctly. If this returns nothing, the predicate is no longer finding that arm in live
 *     policy text.
 *   · the second, without the person-column / crm.party-foreign-key test, so it asks "which
 *     relations carry the arm and have no verdict at all" — hundreds do, because the arm is
 *     right for platform content. If this returns nothing, it is not reading the catalogue.
 *
 * Measured 2026-09-20, right after the corrected predicate landed: 1 row and 240 rows.
 */
const SELF_TEST_OPEN = `
  select r.relation, p.polname::text as policy_name, r.why
    from iam.personal_data_relations() r
    join pg_catalog.pg_class c on c.oid = to_regclass(r.relation)
    join pg_catalog.pg_policy p on p.polrelid = c.oid
   where p.polcmd in ('r', '*')
     and iam.policy_carries_a_plain_system_org_arm(
           pg_catalog.pg_get_expr(p.polqual, p.polrelid))
   order by 1, 2`;

const SELF_TEST_NO_VERDICT = `
  select n.nspname || '.' || c.relname as relation, 'carries the arm' as why
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where p.polcmd in ('r', '*')
     and iam.policy_carries_a_plain_system_org_arm(
           pg_catalog.pg_get_expr(p.polqual, p.polrelid))
     and not exists (select 1 from iam.personal_data_relations() r
                      where r.relation = n.nspname || '.' || c.relname)
   order by 1`;

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

interface OpenRow {
  relation: string;
  policy_name: string;
  why: string;
}

interface NoVerdictRow {
  relation: string;
  why: string;
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const env = loadDbEnv();
  if (!("host" in env)) {
    fail(
      `UNMEASURED: no database credentials (looked in ${(env as { looked?: string[] }).looked?.join(", ") ?? "the usual places"}). ` +
        "A guard that cannot measure has not passed.",
    );
  }

  const client = await connectDirect(env, "check-people-lists-stay-in-your-organizations").catch(
    (error: unknown) => {
      fail(`UNMEASURED: could not reach the database — ${String(error)}`);
    },
  );

  try {
    if (selfTest) {
      const loosenedOpen = (await client.query<OpenRow>(SELF_TEST_OPEN)).rows;
      if (loosenedOpen.length === 0) {
        fail(
          "SELF-TEST FAILED — with `is_personal` dropped from the predicate the first census " +
            "still returned nothing. The three relations ruled NOT personal do carry the §6e " +
            "arm, so this predicate is no longer finding it in live policy text and the guard " +
            "is measuring nothing.",
        );
      }
      const loosenedUnruled = (await client.query<NoVerdictRow>(SELF_TEST_NO_VERDICT)).rows;
      if (loosenedUnruled.length === 0) {
        fail(
          "SELF-TEST FAILED — with the people-shape test dropped the second census still " +
            "returned nothing, although hundreds of relations carry the §6e arm. It is not " +
            "reading the catalogue.",
        );
      }
      console.log(
        `[ OK ] self-test — both censuses went RED when loosened: ${loosenedOpen.length} ` +
          `registered relation(s) carrying the arm (starting with ${loosenedOpen[0]?.relation}), ` +
          `and ${loosenedUnruled.length} relation(s) carrying it with no verdict.`,
      );
      return;
    }

    const open = (await client.query<OpenRow>(OPEN_LISTS)).rows;
    if (open.length > 0) {
      const named = open.map((r) => `  - ${r.relation} (${r.policy_name}) — ${r.why}`).join("\n");
      fail(
        `${open.length} list(s) of people can be read by somebody who is in none of the ` +
          `organizations that own them:\n${named}\n` +
          "  A relation that holds or names a natural person is `confidential`, never " +
          "`organization`: `organization` carries the db-rules §6e global-readable " +
          "system-organization lane, which asks about no membership, no role and no grant. " +
          "Set platform.entity_types.data_class with a real data_class_reason and re-run " +
          "iam.apply_rls — see " +
          "migrations/campaign/fix7b_a_list_of_people_is_never_platform_content.sql.",
      );
    }

    const unruled = (await client.query<NoVerdictRow>(NO_VERDICT)).rows;
    if (unruled.length > 0) {
      const named = unruled.map((r) => `  - ${r.relation} — ${r.why}`).join("\n");
      fail(
        `${unruled.length} relation(s) look like people and nobody has ruled on them:\n${named}\n` +
          "  Add a row to iam.personal_data_relations() saying whether it holds a natural " +
          "person's identity, and WHY. `is_personal = false` is a legitimate answer for a " +
          "business's own published address — it still has to say so. Do not narrow the " +
          "census to make this go away.",
      );
    }

    console.log(
      "✅ PEOPLE LISTS STAY IN YOUR ORGANIZATIONS: no relation of people is readable by a " +
        "non-member through the global-readable platform tenant, and every people-shaped " +
        "relation in the database has a recorded verdict.",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
