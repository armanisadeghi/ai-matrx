/**
 * LANE ARGS-RULED — THE CLAUSES THAT CANNOT BE MEASURED FROM psql, MEASURED THROUGH THE DOOR.
 *
 * Three of this lane's fixes sit behind `not iam.is_trusted_backend()`, which answers TRUE for
 * every direct connection (`session_user <> 'authenticator'`). A psql suite — even seated with
 * `set role authenticated` — therefore cannot make those arms fire, and the green suite says so
 * rather than passing quietly. This file is the other half: a REAL PostgREST call under a REAL
 * session JWT for test@test.com, over the same path a browser uses, where `session_user` IS
 * `authenticator` and the arms are live.
 *
 * THE USE CASE. Rincon Plumbing Co, a family plumbing company in Ventura County, keeps its Jobs,
 * Customers and Invoices in the record store. Dana (test@test.com) is a member. Keith Watanabe
 * has an account here and shares no organization with her. Calder Approvals and the "Persia"
 * context scope belong to tenants she has never been part of.
 *
 * RUN IT:  node node_modules/tsx/dist/cli.mjs scripts/campaign-tests/argsruled_through_the_door.ts
 */
import { C, loadEnv, mintUserJwt, rlsRpc } from "../access-matrix/lib.js";

const DANA = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const STRANGER = "000eaa28-cf5d-402a-8f01-5e2c24191323"; // keith.watanabe@comtech.com
const RINCON = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const FOREIGN_SCOPE = "339751a3-1b2c-46bc-a2c3-5fb187bf59b3"; // a context scope in a tenant she is not in

let failures = 0;
function clause(n: string, ok: boolean, saw: string) {
  if (ok) console.log(`${C.green}[PASS]${C.reset} ${n} ${C.dim}— ${saw}${C.reset}`);
  else { failures++; console.log(`${C.red}[FAIL]${C.reset} ${n} — ${saw}`); }
}

async function main() {
  const env = loadEnv();
  if (!env) throw new Error("no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / publishable key");
  const jwt = await mintUserJwt(env, DANA);
  console.log(`${C.bold}A real session JWT for test@test.com, over PostgREST — session_user is 'authenticator' here.${C.reset}\n`);

  // 1 — platform.knob_snapshot: another account's own settings.
  const stranger = await rlsRpc(env, jwt, "knob_snapshot",
    { p_organization_id: RINCON, p_user_id: STRANGER, p_scopes: null }, "platform");
  clause("1  knob_snapshot refuses a stranger's configuration",
    stranger.code === "42501",
    `status ${stranger.status}, code ${stranger.code ?? "-"}, ${stranger.error ?? "ANSWERED — the leak is open"}`);

  // 2 — and she still reads her own.
  const mine = await rlsRpc<Record<string, unknown>>(env, jwt, "knob_snapshot",
    { p_organization_id: RINCON, p_user_id: DANA, p_scopes: null }, "platform");
  clause("2  knob_snapshot still resolves her own",
    mine.status === 200 && mine.data !== null,
    `status ${mine.status}, ${mine.data ? `${Object.keys((mine.data as any).resolved ?? {}).length} knobs resolved` : mine.error}`);

  // 3 — context.provision_scope_dataset: nothing is made in a tenant she is not in.
  const prov = await rlsRpc(env, jwt, "provision_scope_dataset",
    { p_item_id: "00000000-0000-0000-0000-000000000000", p_scope_id: FOREIGN_SCOPE }, "context");
  clause("3  provision_scope_dataset refuses a scope in another tenant",
    prov.code === "42501",
    `status ${prov.status}, code ${prov.code ?? "-"}, ${prov.error ?? "ANSWERED — nothing refused it"}`);

  // 4 — platform.relation_label: the hole this lane opened with, through the real door.
  const label = await rlsRpc<string>(env, jwt, "relation_label",
    { p_organization_id: RINCON, p_target_type: "organization",
      p_target_id: "235a6add-e8b5-43f9-883e-9dd0389c1759" }, "platform");
  clause("4  relation_label withholds another tenant's name",
    label.data === "A record you have not been given access to",
    `answered ${JSON.stringify(label.data ?? label.error)}`);

  console.log("");
  if (failures) { console.log(`${C.red}${failures} clause(s) FAILED${C.reset}`); process.exit(1); }
  console.log(`${C.green}Every clause passed THROUGH THE DOOR.${C.reset}`);
}
main().catch((e) => { console.error(`${C.red}${e}${C.reset}`); process.exit(1); });
