-- chair-step: two sentences on our own door register go from stale-and-overstated to measured,
--   and one undeclared client EXECUTE the register already says must not exist is taken back.
--   NON-ADDITIVE BY CONSTRUCTION and therefore header-less: an UPDATE and a REVOKE are both
--   refused by name on the additive allow-list, correctly — this file changes two things that
--   are already there instead of adding anything. Nothing is created, nothing is dropped, no
--   function body is touched, no policy and no trigger, and no row of anybody's data is read,
--   written or moved. Its inverse is
--   `migrations/inverse/cifix3_two_door_rows_say_what_is_true_down.sql` and puts both back
--   byte-for-byte.
-- lock: platform
-- lane: CI-FIX-3
--
-- ══════════════════════════════════════════════════════════════════════════════════════════
-- CI-FIX-3 — THE IMPL-DOORS CENSUS GOES BACK TO ZERO FINDINGS.
-- ══════════════════════════════════════════════════════════════════════════════════════════
--
-- `pnpm check:impl-doors --strict` was red on two clauses. Both are the register disagreeing
-- with the database, in opposite directions, and neither is a body defect.
--
-- ── D11 · platform.entity_organization_id(p_token text, p_id uuid) ───────────────────────────
--
-- THE RULE (DD-195): if a door's REASON names an access predicate from the live `iam` gate
-- vocabulary, that door must actually reach it. Absolute — no baseline, no allowlist — because
-- the reason is the sentence the next reviewer trusts INSTEAD of opening the function, and the
-- three assoc reader doors that said they "resolve access per entity via iam.has_access" had
-- never called it while handing a plain member other people's private rows.
--
-- This row's reason ended: "Every caller is a door that checks iam.has_org_access on the answer
-- before doing anything with it." Two things are wrong with that sentence and only one of them
-- is D11's:
--
--   1  IT IS A CLAIM ABOUT THE CALLERS, NOT ABOUT THIS BODY, and it sits in the field that
--      describes this body. `platform.entity_organization_id` is a server-only helper — both
--      client flags are already false — whose whole job is to answer, as the definer, which
--      organization owns one entity id. It must NOT gate: gating is what the doors around it
--      do, which is exactly why it is not client-callable. So the body is right and the field
--      is wrong, and D11's own remedy applies — "fix the REASON if the body is".
--
--   2  🚨 IT IS ALSO NO LONGER TRUE, which is the finding worth keeping. Measured on the main
--      database 2026-09-22: TWO functions name this helper, not one — `public.cmt_add` (which
--      does check `iam.has_org_access`) and `public.access_request_create`, which arrived after
--      this row was written and gates on `iam.has_access` instead. The row's own
--      `non_client_lane` still said "public.cmt_add today". A universal "every caller does X"
--      became false the moment a second caller appeared, and nothing was watching. The caller
--      census therefore moves into `non_client_lane` — the field for who really calls it — and
--      is stated per caller, by name, with the predicate each one actually reaches, so the next
--      caller to arrive contradicts something specific instead of quietly widening a "every".
--
-- The REASON keeps the one sentence that matters and states no gate of its own: this body reads
-- one column of one row as the definer, it answers a tenant for an id, and a direct caller could
-- use it as an oracle — so it is never client-callable.
--
-- ── D16a · workbench._udt_display_spec(p_raw jsonb) ──────────────────────────────────────────
--
-- THE RULE: a door row's declared clients and the live grant must agree. This row declares
-- `signed_in_callers = false`, `anonymous_callers = false` and
-- `non_client_lane = 'server_only: … there is nothing for a client to reach through it'` — and
-- `authenticated` holds EXECUTE on it anyway.
--
-- WHY IT SURVIVED, AND IT IS A CLASS, NOT AN ACCIDENT. The three siblings declared in the same
-- file (`oldtables_w2_the_older_store_gets_its_own_words_door.sql`) are SECURITY DEFINER, so the
-- DDL guard `enforce_definer_client_grants` took the undeclared client EXECUTE off each of them
-- the moment their bodies landed. `_udt_display_spec` is a SECURITY INVOKER — an immutable pure
-- normaliser — so that guard does not cover it, and whatever grant it was created with simply
-- stood. Population measured on the main database today: exactly one, this function; every other
-- door row's flags match its live grant (D13, D16a, D16b all otherwise green).
--
-- SAFE, MEASURED RATHER THAN ARGUED. Nothing calls it from a client: the only body that names it
-- is `workbench._udt_row_words`, which is SECURITY DEFINER and owned by `postgres`, so it keeps
-- executing it exactly as it does today; the repository names it in migrations, in the generated
-- types and in `scripts/campaign-tests/udtwords_green.sql`, and in no application code. The one
-- door a screen actually calls, `workbench.udt_row_words_many`, is untouched and keeps its grant.
-- Reversible in one statement, which is what the inverse is.

-- ── D11 ──────────────────────────────────────────────────────────────────────────────────────
update platform.client_callable_door
   set reason =
         'Reads one column of one row of a registered table as the definer, so it bypasses RLS: '
         'given an entity id it answers which organization owns it. It decides nothing and gates '
         'nothing — that is the point of it, and it is why it is NEVER client-callable: a direct '
         'caller could use it as an oracle mapping any record id to its tenant. The doors that '
         'call it are where access is decided; they are named in non_client_lane.',
       non_client_lane =
         'server_only: called from inside SECURITY DEFINER doors that need the organization a '
         'record belongs to. Callers on the main database, measured 2026-09-22 (lane CI-FIX-3): '
         'public.cmt_add, which checks iam.has_org_access on the answer before it writes, and '
         'public.access_request_create, which gates on iam.has_access. Stated per caller on '
         'purpose — the row previously claimed "every caller checks iam.has_org_access" and named '
         'only cmt_add, and that universal was already false.'
 where schema_name = 'platform'
   and function_name = 'entity_organization_id'
   and identity_args = 'p_token text, p_id uuid';

-- ── D16a ─────────────────────────────────────────────────────────────────────────────────────
revoke execute on function workbench._udt_display_spec(jsonb) from authenticated;
