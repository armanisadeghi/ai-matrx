-- LANE W1-ORG — `C-7` BLOCKS 3 AND 4, SPLIT OUT: REC-61's DEPRECATION AND REC-64's AUDIENCE WORD.
--
-- WHY IT IS ITS OWN FILE (SUITES-TIDY, 2026-09-22). These were blocks 3 and 4 of
-- `w1_org_c7.sql`. Both depend on W1-ORG migrations that are `-- target: branch` and were held
-- for an attended step, and neither has been applied to the main database. Measured on the dev
-- clone (production's own data) 2026-09-22: `iam.organizations_one_personal_per_creator` is
-- still enforcing, `platform.deprecated_relations` carries no row for `is_personal`,
-- `iam.is_personal_dependents()` does not exist, and `context.templates.is_personal` is still
-- a column rather than the `audience` word.
--
-- Kept inside C-7, two unshipped laws took three shipped ones down with them. Here they
-- DECLARE what they need, so this file asserts on a database that has the wave and SKIPS BY
-- NAME on one that does not — which the preamble prints as "this is NOT a pass" — and lights
-- up on its own the day the wave lands.
--
-- WHAT MAKES IT FAIL: re-create `organizations_one_personal_per_creator`, delete the
-- `platform.deprecated_relations` row, or loosen `context.templates`' audience CHECK so a
-- third word lands.
--
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_org_c7_is_personal_deprecation.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'w1_org_c7_is_personal_deprecation.sql'
\set requires 'function:iam.is_personal_dependents|!relation:iam.organizations_one_personal_per_creator|column:context.templates.audience'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  v_n      integer;
  v_tmpl   uuid;
  v_caught text;
  v_json   jsonb;
begin
  -- ============================================= 3. REC-61 — the flag records, it does not rule
  select count(*) into v_n from pg_indexes
   where schemaname = 'iam' and indexname = 'organizations_one_personal_per_creator';
  if v_n <> 0 then
    raise exception 'C-7 3a: is_personal still ENFORCES - the partial unique index is back';
  end if;
  select count(*) into v_n from platform.deprecated_relations
   where old_ref = 'iam.organizations.is_personal'
     and new_ref = 'users.user_preferences.default_organization_id';
  if v_n <> 1 then
    raise exception 'C-7 3b: the deprecation is not registered';
  end if;
  -- the work list is a QUERY and it is not empty, which is the honest state: the column stays
  -- until it is.
  select count(*) into v_n from iam.is_personal_dependents();
  if v_n = 0 then
    raise exception 'C-7 3c: the dependent list is empty, so the column should have been DROPPED, not deprecated';
  end if;
  raise notice 'GREEN 3 — REC-61: the partial unique index is gone, the deprecation is registered, and % dependents remain to rewrite', v_n;

  -- ====================================================== 4. REC-64 — the audience is a word
  insert into context.templates (key, name, category, audience)
  values ('cascade-technician-intake', 'Technician Intake', 'electronics-recycling', 'individual') returning id into v_tmpl;
  insert into context.templates (key, name, category, audience)
  values ('cascade-client-site-intake', 'Client Site Intake', 'electronics-recycling', 'organization');

  v_caught := null;
  begin
    insert into context.templates (key, name, category, audience)
    values ('cascade-crew-intake', 'Crew Intake', 'electronics-recycling', 'team');
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'C-7 4a: a third audience word landed';
  end if;

  v_json := public.list_templates('electronics-recycling', null);
  if not exists (select 1 from jsonb_array_elements(v_json) e
                  where e ->> 'key' = 'cascade-technician-intake'
                    and e ->> 'audience' = 'individual'
                    and (e ->> 'is_personal')::boolean) then
    raise exception 'C-7 4b: list_templates did not emit the word (and the derived boolean) for the individual template';
  end if;
  if not exists (select 1 from jsonb_array_elements(public.list_templates('electronics-recycling', false)) e
                  where e ->> 'key' = 'cascade-client-site-intake') then
    raise exception 'C-7 4c: the legacy boolean argument stopped selecting organization templates';
  end if;
  raise notice 'GREEN 4 — REC-64: individual and organization both land, a third word is refused by the table''s own CHECK, and list_templates emits the word while the old boolean argument still works';

end $t$;

rollback;
