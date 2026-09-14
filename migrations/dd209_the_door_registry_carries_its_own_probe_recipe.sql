-- DD-209 — the door registry carries its own probe recipe (`probe_args`).
--
-- THE GAP. `pnpm check:door-rows:strict` derives a door's arguments from
-- `pg_proc`: an organization id, the victim's user id, an entity row id guessed
-- from the argument's NAME. That is all a machine can read off a signature, and
-- on 2026-09-14 it left SEVENTY-FOUR doors of the 483-door blocking population
-- UNMEASURED BY NAME — `p_table_id`, `p_store_id`, `p_pack_id`, `p_class`, an
-- enum label, a status word, a registered token. Honest, and blind: a door whose
-- argument nothing can derive is a door that gate has never once called.
--
-- THE FIX IS NOT A CLEVERER GUESS. A harness that invents a value and reads the
-- resulting type error as a refusal is the exact silent-green failure DD-192
-- exists to close. The missing half is not derivable at all — it is KNOWLEDGE:
-- which row this argument wants. The person who declares a door knows it. So the
-- recipe lives on the door row, beside the reason and the gate predicate, and the
-- harness reads it instead of guessing.
--
-- THE SHAPE (validated by the CHECK constraint below and again by the harness):
--
--   { "args": { "p_store_id": "other_row:rag.data_store",
--               "p_audience": "literal:organization" },
--     "boolean_oracle": "<a sentence: what a TRUE answer about the victim's row means>",
--     "note": "<why these values>" }
--
-- THE VERBS, and nothing else — the harness THROWS on a verb it does not know,
-- because a recipe that silently does nothing puts a door back into UNMEASURED
-- while its row claims it is covered:
--
--   other_org              an organization neither test caller has standing in
--   own_org                the caller's own organization
--   victim_user            the victim identity's user id
--   self                   the caller's own user id
--   pending_invitation     a live pending invitation in a victim organization
--   other_row:<sch.table>  a live row of that table across the boundary
--   own_row:<sch.table>    a live row of that table the caller owns
--   literal:<value>        a fixed value — an enum label, a registered token, a
--                          status word the door's own validator accepts
--   omit                   leave an optional argument out entirely
--
-- `other_org`, `other_row:*`, `victim_user` and `pending_invitation` CROSS the
-- boundary. A recipe made only of the others still earns its place: it gets the
-- door past its own validator so the row-diff can do its work.
--
-- WHAT THIS IS NOT. It is not an excuse list. A recipe cannot make a door PASS —
-- it can only make it MEASURED, and a measured door that hands back a row its
-- caller cannot read is a FAIL exactly as before. The one list that excuses a
-- door is `scripts/door-rows/by-design-allowlist.json`, it is consulted only by
-- the wide lane, and nothing here touches it.

alter table platform.client_callable_door
  add column if not exists probe_args jsonb;

comment on column platform.client_callable_door.probe_args is
  'DD-209. The argument recipe `pnpm check:door-rows` uses to probe this door, written by the person who declared it: {"args": {"<arg>": "<verb>"}, "boolean_oracle": "<sentence>", "note": "<why>"}. Verbs: own_org, other_org, victim_user, self, pending_invitation, omit, own_row:<schema.table>, other_row:<schema.table>, literal:<value>. A recipe makes a door MEASURED, never PASSED — the excuse list for a door that crosses the boundary on purpose is scripts/door-rows/by-design-allowlist.json and it is a different thing entirely.';

-- A recipe nobody can read is worse than no recipe: a malformed one would leave
-- the door UNMEASURED while its row claims coverage, and nobody would be told.
-- The harness throws on the same conditions; this stops the bad row landing.
-- A CHECK cannot carry a subquery, so the vocabulary lives in one IMMUTABLE
-- function — which is also the one place to add a verb when the harness learns
-- one, so the two can never disagree about what a recipe may say.
create or replace function platform.door_probe_args_ok(p_recipe jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $fn$
  select p_recipe is null
      or (
        jsonb_typeof(p_recipe) = 'object'
        and (p_recipe ? 'args' or p_recipe ? 'boolean_oracle')
        and (not p_recipe ? 'args' or jsonb_typeof(p_recipe->'args') = 'object')
        and (
          not p_recipe ? 'args'
          or not exists (
            select 1
            from jsonb_each_text(p_recipe->'args') as a(k, v)
            where v !~ '^(own_org|other_org|victim_user|self|pending_invitation|omit|own_row:[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*|other_row:[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*|literal:.*)$'
          )
        )
        and (
          not p_recipe ? 'boolean_oracle'
          or (jsonb_typeof(p_recipe->'boolean_oracle') = 'string'
              and length(btrim(p_recipe->>'boolean_oracle')) >= 40)
        )
      );
$fn$;

comment on function platform.door_probe_args_ok(jsonb) is
  'DD-209. The vocabulary of platform.client_callable_door.probe_args, in one place, so the CHECK constraint and scripts/check-door-rows.ts can never disagree about what a recipe may say. Adding a verb to the harness means adding it here in the same migration.';

alter table platform.client_callable_door
  drop constraint if exists door_probe_args_is_a_recipe;

alter table platform.client_callable_door
  add constraint door_probe_args_is_a_recipe
  check (platform.door_probe_args_ok(probe_args));
