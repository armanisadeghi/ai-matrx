-- LANE SC-2' P8 — THE OLD SIDE TELLS THE COPY, measured RED then GREEN on the dev clone.
--
-- THE USE CASE. Harbor Point Physical Therapy keeps a Clinics scope type in the current scope
-- screens, with a "Front desk hours" context item and one clinic, "Harbor Point — Eastlake". Its
-- scope system is copied into the record store; until the owner flips, the current screens are
-- the writer and the copy must FOLLOW every edit. This suite proves the old side's half: every
-- change to a scope type, item, scope or value leaves one re-armed custom.io_outbox row
-- (event 'context.follow') that the follow worker claims — and nothing else.
--
-- The organization, clinic and hours are synthesized (a clone-only fixture organization, rolled
-- back). Nothing of the owner's is read or written.
--
-- WHAT MAKES IT FAIL (RED before sc2_the_context_copy_follows_the_current_screens.sql, GREEN after):
--   T1  a person writing a value in the current screens leaves exactly one pending follow row
--       for that value row, naming the organization, the scope type (the copy's Table) and
--       dedupe key 'context.follow:context_item_values:<row id>'
--   T2  renaming the clinic twice leaves ONE row for it, re-armed after the follow claimed it
--   T3  a 50-clinic batch import leaves 50 rows and ONE io_outbox_drain call claims them all
--   T4  an organization whose custom/context_copy_following is off writes no follow row
--   T5  the compare panel's lag reader (custom.context_compare_facts) sees the follow running
--       and counts what is pending
--   T6  the old edit itself is unchanged: the value is current at version 2 in the old table

\set ON_ERROR_STOP on
\timing off
\set suite 'sc2_the_context_copy_follows_red_green.sql'
\set requires 'relation:custom.io_outbox|function:custom.io_outbox_drain|function:custom.context_compare_facts'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table sf (k text primary key, v uuid) on commit drop;

do $fixture$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_org  uuid := gen_random_uuid();
  v_off  uuid := gen_random_uuid();
  v_type uuid; v_item uuid; v_clinic uuid; v_otype uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/sc2-follow', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Harbor Point Physical Therapy ' || substr(v_org::text, 1, 6), 'harbor-point-pt-' || substr(v_org::text, 1, 8), 'HPT', c_admin),
    (v_off, 'Harbor Point Validation ' || substr(v_off::text, 1, 6), 'harbor-point-val-' || substr(v_off::text, 1, 8), 'HPV', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner', 'active'),
    (v_off, 'organization', v_off, c_admin, 'owner', 'active');
  if exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'context_copy_following') then
    insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
      ('custom', 'context_copy_following', 'organization', v_off, v_off, 'false'::jsonb, 'sc2 follow suite: the store is the writer here');
  end if;

  insert into context.scope_types (organization_id, label_singular, label_plural, slug, created_by)
  values (v_org, 'Clinic', 'Clinics', 'clinics', c_admin) returning id into v_type;
  insert into context.context_items (scope_type_id, key, display_name, slug, value_type)
  values (v_type, 'front_desk_hours', 'Front desk hours', 'front-desk-hours', 'string') returning id into v_item;
  insert into context.scopes (organization_id, scope_type_id, name, slug, created_by)
  values (v_org, v_type, 'Harbor Point — Eastlake', 'harbor-point-eastlake', c_admin) returning id into v_clinic;
  insert into context.context_item_values (context_item_id, scope_id, value_text, authored_by)
  values (v_item, v_clinic, 'Mon–Fri 7:00–19:00', c_admin);

  insert into context.scope_types (organization_id, label_singular, label_plural, slug, created_by)
  values (v_off, 'Clinic', 'Clinics', 'clinics', c_admin) returning id into v_otype;
  insert into context.scopes (organization_id, scope_type_id, name, slug, created_by)
  values (v_off, v_otype, 'Harbor Point — Validation', 'harbor-point-validation', c_admin);

  insert into sf values ('org', v_org), ('off', v_off), ('type', v_type), ('item', v_item), ('clinic', v_clinic);
end
$fixture$;

do $t$
declare
  v_org uuid; v_off uuid; v_type uuid; v_item uuid; v_clinic uuid;
  v_val uuid; v_n int; v_claimed int; v_facts jsonb; v_ver int;
begin
  select v into v_org from sf where k = 'org';    select v into v_off from sf where k = 'off';
  select v into v_type from sf where k = 'type';  select v into v_item from sf where k = 'item';
  select v into v_clinic from sf where k = 'clinic';

  -- ══ T1: a person's value write in the current screens ══
  insert into context.context_item_values (context_item_id, scope_id, value_text, authored_by)
  values (v_item, v_clinic, 'Mon–Fri 7:00–19:00, Sat 8:00–12:00', '87a6e699-3622-4869-8843-d0867456c0dd')
  returning id into v_val;
  select count(*) into v_n from custom.io_outbox
   where organization_id = v_org and event_key = 'context.follow'
     and dedupe_key = 'context.follow:context_item_values:' || v_val::text
     and record_id = v_val and table_id = v_type and operation = 'created' and consumed_at is null;
  if v_n <> 1 then
    raise exception 'T1 RED: writing Eastlake''s front desk hours left % follow row(s) for the value, not 1 — the copy is never told', v_n;
  end if;

  -- ══ T2: renaming the clinic twice is ONE row, re-armed after a claim ══
  update context.scopes set name = 'Harbor Point — Eastlake Clinic' where id = v_clinic;
  select count(*) into v_claimed from custom.io_outbox_drain(v_org, 'context-follow', 1000, 'context.follow');
  update context.scopes set name = 'Harbor Point Eastlake' where id = v_clinic;
  select count(*) into v_n from custom.io_outbox
   where organization_id = v_org and dedupe_key = 'context.follow:scopes:' || v_clinic::text and deleted_at is null;
  if v_n <> 1 then
    raise exception 'T2: renaming the clinic twice left % rows for it, not one', v_n;
  end if;
  if exists (select 1 from custom.io_outbox where organization_id = v_org
               and dedupe_key = 'context.follow:scopes:' || v_clinic::text and consumed_at is not null) then
    raise exception 'T2: the second rename did not re-arm the row the follow had claimed — the copy would miss it';
  end if;

  -- ══ T3: a 50-clinic batch import, one drain ══
  select count(*) into v_claimed from custom.io_outbox_drain(v_org, 'context-follow', 1000, 'context.follow');
  insert into context.scopes (organization_id, scope_type_id, name, slug, created_by)
  select v_org, v_type, 'Harbor Point — Satellite ' || g, 'harbor-point-satellite-' || g, '87a6e699-3622-4869-8843-d0867456c0dd'
    from generate_series(1, 50) g;
  select count(*) into v_claimed from custom.io_outbox_drain(v_org, 'context-follow', 1000, 'context.follow');
  if v_claimed <> 50 then
    raise exception 'T3: the 50-clinic import was claimed as % row(s) in one drain, not 50', v_claimed;
  end if;

  -- ══ T4: an organization that is not following writes nothing ══
  update context.scopes set name = 'Harbor Point — Validation Clinic' where organization_id = v_off;
  select count(*) into v_n from custom.io_outbox where organization_id = v_off and event_key = 'context.follow';
  if v_n <> 0 then
    raise exception 'T4: an organization with the copy not following wrote % follow row(s)', v_n;
  end if;

  -- ══ T5: the lag reader sees it ══
  update context.context_items set display_name = 'Front desk hours (patients)' where id = v_item;
  v_facts := custom.context_compare_facts('87a6e699-3622-4869-8843-d0867456c0dd', '{}'::uuid[], '{}'::uuid[], '[]'::jsonb);
  if not coalesce((v_facts -> 'follow' ->> 'running')::boolean, false) or coalesce((v_facts -> 'follow' ->> 'pending')::int, 0) < 1 then
    raise exception 'T5: the compare panel''s lag reader says %', v_facts -> 'follow';
  end if;

  -- ══ T6: the old edit is untouched ══
  select version into v_ver from context.context_item_values where id = v_val and is_current;
  if v_ver is distinct from 2 then
    raise exception 'T6: the old value is not current at version 2 (%)', v_ver;
  end if;

  raise notice 'GREEN T1 T2 T3 T4 T5 T6 — every old edit tells the copy, coalesced per row, and only while it follows';
end
$t$;

rollback;
