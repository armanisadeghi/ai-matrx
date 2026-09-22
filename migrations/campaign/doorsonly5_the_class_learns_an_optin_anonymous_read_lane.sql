-- lane: DOORS-ONLY-5
-- chair-step: this file REPLACES two live generator function bodies and ALTERs a registry table.
-- The additive allow-list cannot read a body it patches at run time, and `platform` / `iam` are
-- REVOKE-protected, so it is confirmed at the command line. Every replacement asserts the anchors
-- it expects in the LIVE body before it writes, and returns untouched if the rule is already
-- taught.
--
-- DD-249 / R12: A ROW MARKED `visibility = 'public'` IS AN ANONYMOUS READ LANE BY DEFINITION.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE RULING THIS IMPLEMENTS, and why it is a fourth option the refusal did not offer
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `iam.apply_rls` has refused `platform.categories` by name since DD-249, with a message that is
-- exactly right about the contradiction and offers three fixes: make the table's CLASS `public`,
-- move the rows off `public`, or withdraw `anon`'s grant. Every one of the three changes what a
-- person already decided.
--
-- **The chair's ruling (2026-09-22): `visibility = 'public'` MEANS an anonymous reader is
-- welcome — that is what the word means to the person who set it.** So the fix is neither to
-- take the read away nor to keep the table off the canonical route. The CLASS learns the lane:
--
--   `organization` gains an OPTIONAL anonymous read lane that
--     · exists only when the table has a `visibility` column,
--     · admits only rows where `visibility = 'public'` (and, per the soft-delete doctrine, not
--       deleted ones — the generator's own `v_delpfx` already does that),
--     · and is DECLARED PER TABLE as an explicit opt-in, with a reason.
--
-- `platform.categories` opts in. **Nothing else changes**: the flag defaults false, so every one
-- of the other ~700 registered tokens resolves byte-identically.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHERE THE LANE IS DECIDED, AND WHY THAT IS THE ONLY EDIT THE REFUSAL NEEDS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🚨 The R12 guard does NOT hard-code a class. Read live from `iam.apply_rls`, its condition is
-- `... AND NOT (iam.class_lanes(p_token)).anon_lane`. And `iam._apply_rls_unchecked` emits
-- `pub_read` on exactly the same question: `if v_has_vis then … if v_pub_lanes.anon_lane then`.
-- So teaching `iam.class_lanes` teaches the refusal, the emitter and
-- `iam.verify_canonical.class_lanes_match_policy` in ONE place — which is the whole reason
-- DD-249 moved the lane question into that function in the first place. **No edit to
-- `iam.apply_rls` is needed to stop it refusing**, and none is made: the guard stops firing
-- because the answer it asks for changed, not because the guard was weakened.
--
-- The one thing `iam.apply_rls` DOES get is an honest HINT: its message said "three legal fixes"
-- and "hand-writing a pub_read policy beside this generator is not a fourth option". The second
-- sentence is still true. The first is not, and a refusal that lies about the ways out of it is
-- worse than one that refuses.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE GRANT IS THE GENERATOR'S OUTPUT NOW, NOT A HAND-WRITTEN ACL
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A policy is the access RULE; the grant is the access. `platform.categories`' anonymous lane has
-- been live on THIRTEEN HAND-WRITTEN COLUMN ACLs — read live from `pg_attribute.attacl`:
-- `{anon=r/postgres}` on id, dimension, name, slug, parent_id, color, icon, position, created_at,
-- updated_at, deleted_at, placement_type, visibility. Nobody declared them and nothing
-- regenerates them, which is the same shape as the `iam.api_keys` column-exclusion design
-- DOORS-ONLY-4 had to declare before that table could regenerate.
--
-- So `iam.apply_table_grants` learns to ISSUE that grant, and the seven columns anon does NOT
-- hold are DECLARED rather than inferred — `db-rules` §6d-2's rule, and for the same reason:
-- `ADD COLUMN` leaves `attacl` NULL, so a generator that inferred the set would hand every future
-- column to anonymous readers the day somebody adds one.
--
-- 🚨 **WHAT THIS DELIBERATELY DOES NOT DO, said out loud rather than left as a silence.** The
-- symmetric half — revoking `anon`'s SELECT when the flag is NOT declared — is not written here.
-- DD-249 measured ten tokens carrying hand-written anon column grants on a class that issues no
-- anon lane, and FIVE of them serve real public rows today (`app.definition` 81,
-- `platform.categories` 355, `education.learn_doc` 11, `agent.message_template` 8,
-- `workbench.notes` 2). A blanket revoke in this function would take four live anonymous pages
-- away the next time anything regenerated those tables, and this lane has censused one of the
-- five. The withdrawal half belongs with that census. Until then the flag GRANTS and never
-- revokes, and this paragraph is why.
--
-- ADDITIVE except for the two `create or replace function`s, both of which read the live body
-- first and assert every anchor.
-- Inverse: migrations/inverse/doorsonly5_the_class_learns_an_optin_anonymous_read_lane.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, the seated suite
--        scripts/campaign-tests/doorsonly5_categories_doors_work_from_a_seat.sql -v closed=1,
--        and the whole-registry before/after lane diff in
--        scripts/campaign-tests/doorsonly5_the_anon_lane_is_optin_only.sql.

set local lock_timeout = '5s';

-- ── 1. THE DECLARATION ─────────────────────────────────────────────────────────
-- Per TABLE, in the class registry, beside `client_read_only` — the flag DOORS-ONLY-4 used for
-- exactly this kind of per-table narrowing, and the place `iam.class_lanes` already reads.

alter table platform.entity_types
  add column if not exists client_anonymous_public_read boolean not null default false,
  add column if not exists client_anonymous_public_read_reason text,
  add column if not exists client_anonymous_excluded_columns text[];

comment on column platform.entity_types.client_anonymous_public_read is
  'DOORS-ONLY-5 / chair ruling 2026-09-22 (DD-249 / R12): this table opts IN to the anonymous read lane on a class that does not carry one by default. A row marked visibility = ''public'' means an anonymous reader is welcome -- that is what the word means to the person who set it -- so a table serving such rows does not have to be reclassified, emptied of public rows, or kept off the canonical route. The lane exists only when the table also has a `visibility` column, and it admits only public, non-deleted rows: iam._apply_rls_unchecked emits `pub_read` and nothing wider. Defaults FALSE, so every other registered token generates byte-identically.';
comment on column platform.entity_types.client_anonymous_public_read_reason is
  'WHICH ANONYMOUS SURFACE SERVES THESE ROWS, in a sentence. Required when client_anonymous_public_read is true, and at least 40 characters, for the same reason platform.client_callable_door requires a non_client_lane: a flag with no reason is a decision nobody can review.';
comment on column platform.entity_types.client_anonymous_excluded_columns is
  'The columns an ANONYMOUS reader must NOT hold, DECLARED rather than inferred (db-rules 6d-2). iam.apply_table_grants grants anon every OTHER column individually. It is declared because ADD COLUMN leaves attacl NULL: a generator that inferred the set from the live ACLs would hand every future column to anonymous readers the day somebody added one.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'entity_types_anon_read_is_declared') then
    alter table platform.entity_types
      add constraint entity_types_anon_read_is_declared
      check (
        not client_anonymous_public_read
        or (client_anonymous_public_read_reason is not null
            and length(btrim(client_anonymous_public_read_reason)) >= 40)
      );
  end if;
end $$;

-- ── 1b. THE SHAPE GUARD'S DEBT, SETTLED HONESTLY ──────────────────────────────
-- `provision_shape_guard` refuses a SECURITY DEFINER function that reaches COMMIT with no
-- ACCESS DECISION DECLARED IN DATA, and a `create or replace` of one counts. It is right to:
-- a definer function runs as `postgres` with BYPASSRLS, and prose in a comment is not a
-- declaration (lessons ledger 23, 27, 28). Proven live on the rehearsal copy — replacing
-- `iam.class_lanes` was refused 23514 with exactly that message.
--
-- The honest answer is a DECLARATION, not the `definer_no_door` grandfather lane. Measured on
-- both databases: `authenticated` and `anon` hold NO EXECUTE on `iam.class_lanes`, so it is a
-- server-only lane and `non_client_lane` is the true shape — `signed_in_callers` and
-- `anonymous_callers` both false, with a sentence saying which lane calls it and why no client
-- ever does. Declaring it is also worth more than a grandfather row: the next person replacing
-- this function finds the reason rather than an exemption.
--
-- It is idempotent, so re-applying this file settles nothing twice.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'iam', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'server_only: iam.class_lanes is the GENERATOR''s own lane resolver. It is called by iam.apply_rls, iam._apply_rls_unchecked and iam.verify_canonical while a migration or platform.provision is building a table''s policies, all of which run as the table owner or the provisioner role. It takes a registry TOKEN, not an entity id, and returns a lane set -- it reads platform.entity_types and decides nothing about any row. No client holds EXECUTE on it on either database (measured 2026-09-22), and none ever should: a client that could ask it questions would be enumerating the access CONTRACT of every registered table.',
       'migrations/campaign/doorsonly5_the_class_learns_an_optin_anonymous_read_lane.sql (lane DOORS-ONLY-5)',
       'p_token is a REGISTRY TOKEN, not an entity id: it is checked against platform.entity_types and nothing else, and the function returns a lane SET describing what the token''s class admits. It reads no tenant row, writes nothing, and decides nothing about any individual record, so there is no entity-id argument to bind to a caller. An absent or unregistered token resolves to the STRICTEST class (private) rather than raising, because this function is also on the kernel''s read path where refusing would deny a person their own data (chair R3, both directions).'
  from pg_proc p
 where p.pronamespace = 'iam'::regnamespace
   and p.proname = 'class_lanes'
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 2. `iam.class_lanes` — THE ONE PLACE THE LANE IS DECIDED ───────────────────
-- 🚨 THE BODY IS READ LIVE AND PATCHED, NEVER REPLACED FROM A FILE. `db-rules` line 491 records
-- the recurrence: a 2026-08-29 migration replaced the RLS generator from a stale file copy and
-- silently reverted a live fix. Reading the live body is also what makes these same bytes
-- applicable to two databases whose generators differ.

do $patch$
declare
  v_src text := pg_get_functiondef('iam.class_lanes'::regproc);
  v_anchor_select constant text := 'select et.data_class, et.rls_variant, true into v_class, v_variant, v_found';
  v_anchor_lane   constant text := 'r.anon_lane           := v_class = ''public'';';
  v_new text;
begin
  if position('client_anonymous_public_read' in v_src) > 0 then
    raise notice 'iam.class_lanes already reads the opt-in anonymous lane — nothing to patch.';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor_select, ''))) / length(v_anchor_select) <> 1 then
    raise exception 'iam.class_lanes: expected EXACTLY ONE registry select anchor; the body has moved. Re-read it before patching.'
      using errcode = '22023';
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor_lane, ''))) / length(v_anchor_lane) <> 1 then
    raise exception 'iam.class_lanes: expected EXACTLY ONE anon_lane assignment; the body has moved. Re-read it before patching.'
      using errcode = '22023';
  end if;

  v_new := replace(v_src, v_anchor_select,
    'select et.data_class, et.rls_variant, true, coalesce(et.client_anonymous_public_read, false)'
    || ' into v_class, v_variant, v_found, v_anon_optin');

  v_new := replace(v_new, v_anchor_lane,
    '-- 🚨 THE OPT-IN ANONYMOUS LANE (chair ruling 2026-09-22, DD-249 / R12). `public` is still'
 || E'\n  -- the one class whose lane set includes anon BY DEFAULT. What changed is that a row marked'
 || E'\n  -- `visibility = ''public''` IS an anonymous read lane by definition -- that is what the word'
 || E'\n  -- means to the person who set it -- so a table serving such rows on an `organization` class'
 || E'\n  -- can DECLARE the lane instead of being reclassified, emptied, or kept off the canonical'
 || E'\n  -- route. It is per table, it is explicit, it defaults false, and it is asked HERE because'
 || E'\n  -- this is the one place the lane is decided: iam.apply_rls''s R12 guard, the pub_read'
 || E'\n  -- emitter in iam._apply_rls_unchecked, and iam.verify_canonical''s class_lanes_match_policy'
 || E'\n  -- all read this answer, so teaching it once teaches all three and they cannot disagree.'
 || E'\n  -- The lane still admits ONLY public, non-deleted rows: the emitter''s predicate is'
 || E'\n  -- unchanged, and it is gated on the table having a `visibility` column at all.'
 || E'\n  r.anon_lane           := v_class = ''public'' or coalesce(v_anon_optin, false);');

  v_new := replace(v_new, E'  v_found boolean;', E'  v_found boolean;\n  v_anon_optin boolean;');
  if position('v_anon_optin boolean;' in v_new) = 0 then
    raise exception 'iam.class_lanes: could not declare v_anon_optin — the DECLARE block has moved.'
      using errcode = '22023';
  end if;

  execute v_new;
  raise notice 'iam.class_lanes: the opt-in anonymous read lane is taught.';
end
$patch$;

-- ── 3. `iam.apply_table_grants` — THE KEY, NOT ONLY THE RULE ───────────────────

do $patch$
declare
  v_src text := pg_get_functiondef('iam.apply_table_grants'::regproc);
  v_anchor constant text := '  -- service_role is the server''s bypass lane and always needs full reach.';
  v_new text;
begin
  if position('client_anonymous_public_read' in v_src) > 0 then
    raise notice 'iam.apply_table_grants already issues the opt-in anonymous grant — nothing to patch.';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'iam.apply_table_grants: expected EXACTLY ONE service_role anchor; the body has moved.'
      using errcode = '22023';
  end if;

  v_new := replace(v_src, v_anchor,
    '  -- 🚨 THE OPT-IN ANONYMOUS READ LANE''S KEY (chair ruling 2026-09-22, DD-249 / R12).'
 || E'\n  -- A policy is the access RULE; the grant is the ACCESS. platform.categories'' anonymous'
 || E'\n  -- lane has been live on THIRTEEN hand-written column ACLs that nobody declared and nothing'
 || E'\n  -- regenerates -- the same shape as the iam.api_keys column-exclusion design DOORS-ONLY-4'
 || E'\n  -- had to declare before that table could regenerate. It is the generator''s output now.'
 || E'\n  --'
 || E'\n  -- The excluded set is DECLARED, never inferred, for db-rules 6d-2''s reason: ADD COLUMN'
 || E'\n  -- leaves attacl NULL, so inferring it would hand every future column to anonymous readers'
 || E'\n  -- the day somebody adds one.'
 || E'\n  --'
 || E'\n  -- 🚨 IT GRANTS AND NEVER REVOKES, deliberately. The symmetric half -- withdrawing anon''s'
 || E'\n  -- SELECT where the flag is absent -- would take away four OTHER live anonymous lanes that'
 || E'\n  -- DD-249 measured and this lane has not censused (app.definition 81 public rows,'
 || E'\n  -- education.learn_doc 11, agent.message_template 8, workbench.notes 2). That withdrawal'
 || E'\n  -- belongs with that census, not with this flag.'
 || E'\n  declare'
 || E'\n    v_anon_optin boolean;'
 || E'\n    v_anon_excluded text[];'
 || E'\n  begin'
 || E'\n    select coalesce(et.client_anonymous_public_read, false), et.client_anonymous_excluded_columns'
 || E'\n      into v_anon_optin, v_anon_excluded'
 || E'\n      from platform.entity_types et'
 || E'\n     where et.schema_name = p_schema and et.table_name = p_table and et.is_active'
 || E'\n     limit 1;'
 || E'\n    if coalesce(v_anon_optin, false) then'
 || E'\n      if not platform.schema_is_client_exposed(p_schema) then'
 || E'\n        raise notice'
 || E'\n          ''apply_table_grants: %.% declares client_anonymous_public_read but schema % is CLOSED to client roles in platform.schema_client_exposure -- the pub_read rule exists and NO anon grant was issued, so the anonymous lane is inert until the schema is opened.'','
 || E'\n          p_schema, p_table, p_schema;'
 || E'\n      elsif v_anon_excluded is null then'
 || E'\n        execute format(''grant select on %s to anon'', v_tbl);'
 || E'\n      else'
 || E'\n        execute format(''grant select (%s) on %s to anon'','
 || E'\n                       iam._client_grant_column_list(v_rel, v_anon_excluded), v_tbl);'
 || E'\n        raise notice'
 || E'\n          ''apply_table_grants: %.% anonymous read lane issued, withholding from anon: %.'','
 || E'\n          p_schema, p_table, array_to_string(v_anon_excluded, '', '');'
 || E'\n      end if;'
 || E'\n    end if;'
 || E'\n  end;'
 || E'\n'
 || v_anchor);

  execute v_new;
  raise notice 'iam.apply_table_grants: the opt-in anonymous read grant is taught.';
end
$patch$;

-- ── 4. THE REFUSAL STOPS SAYING "THREE" ────────────────────────────────────────
-- `iam.apply_rls` needs NO logic change: its guard already asks
-- `(iam.class_lanes(p_token)).anon_lane`, so it stops firing for an opted-in table on its own.
-- What it does need is to stop telling the next reader there are only three ways out.

do $patch$
declare
  v_src text := pg_get_functiondef('iam.apply_rls'::regproc);
  v_anchor constant text := 'HINT = ''Three legal fixes.';
  v_new text;
begin
  if position('FOUR legal fixes' in v_src) > 0 then
    raise notice 'iam.apply_rls already names the fourth fix — nothing to patch.';
    return;
  end if;
  -- 🚨 ABSENT IS NOT MOVED, AND THE DIFFERENCE MATTERS ON TWO DATABASES. The rehearsal copy's
  -- `iam.apply_rls` carries an EARLIER revision of the DD-249 / R12 refusal, worded without the
  -- "Three legal fixes" hint this patch corrects — measured, not assumed: zero occurrences on
  -- the branch, exactly one on the main database. That is a legitimate difference between two
  -- generators, not drift, and raising on it would make these bytes unapplicable to the very
  -- database rule 27 rehearses on. **The lane itself does not depend on this patch at all**: it
  -- is taught in `iam.class_lanes`, which both databases share, and the R12 guard reads its
  -- answer. This step only stops a message telling the next reader there are three ways out
  -- when there are four.
  --
  -- So: ZERO occurrences is a NOTICE and a return. MORE THAN ONE is still an exception, because
  -- that is a body somebody changed under us.
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) = 0 then
    raise notice 'iam.apply_rls on this database carries an earlier wording of the DD-249 / R12 refusal with no "Three legal fixes" hint, so there is nothing to correct here. The lane itself is taught in iam.class_lanes, which this file already patched, and the guard reads its answer.';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'iam.apply_rls: the R12 hint anchor appears more than once — the body has moved. Re-read it before patching.'
      using errcode = '22023';
  end if;
  v_new := replace(v_src, v_anchor,
    'HINT = ''FOUR legal fixes. (0) THE ROWS REALLY ARE MEANT FOR ANONYMOUS READERS AND THE TABLE IS OTHERWISE ORG-SCOPED: declare the lane per table -- set platform.entity_types.client_anonymous_public_read = true with a client_anonymous_public_read_reason naming the anonymous surface, and list the columns anon must not hold in client_anonymous_excluded_columns -- then re-run. The lane admits only public, non-deleted rows, iam.apply_table_grants issues the grant, and nothing else in the registry changes (chair ruling 2026-09-22).');
  execute v_new;
  raise notice 'iam.apply_rls: the R12 hint names the fourth fix.';
end
$patch$;

-- ── 5. platform.categories OPTS IN ─────────────────────────────────────────────
-- The seven excluded columns are the seven `anon` does NOT hold today, read live from
-- pg_attribute before this file ran. The generator's output is therefore byte-identical to the
-- hand-written ACLs it replaces — this declares what is already true, it does not widen anything.

update platform.entity_types
   set client_anonymous_public_read = true,
       client_anonymous_public_read_reason =
         'The platform''s public vocabulary: 355 rows marked visibility = ''public'' are read by signed-out visitors through the marketing and shared-link surfaces (the block library`s categories, public agent-app categories, and the shared-view pages under (public) and (link)). The lane has been live on thirteen hand-written anon column ACLs since before DD-249; this declares it so the generator owns it. Chair ruling 2026-09-22.',
       client_anonymous_excluded_columns =
         array['organization_id','is_system','created_by','updated_by','version','metadata','custom_fields']
 where schema_name = 'platform' and table_name = 'categories';
