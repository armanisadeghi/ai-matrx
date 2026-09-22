-- WRITE-PERF-4 WAVE 1 — THE RED TWIN. WITHOUT THE ONE-KEY DROP, A LEGAL CHOICE IS REFUSED BY NAME.
--
-- WHAT THIS PROVES. Wave 1 memoises `custom.choice_options` per options table. Every memo slot's
-- stamp carries `statement_timestamp()`, which does NOT move between two writes issued inside ONE
-- client statement — so within one statement the ONLY thing that can invalidate that slot is
-- `_aa_memo_clear` (`platform.memo_clear_on_structure_row`) dropping the `co:` key for the
-- `(organization_id, table_id)` of the row being written. WRITE-PERF-3 named this gap and refused
-- to memoise `choice_options` because of it; wave 1 closes it with an O(1) drop that needs no
-- lookup. This file takes that drop out and shows the gap reopening, with the exact refusal a
-- person would read — then puts it back and shows the same write accepted.
--
-- A GUARD YOU CANNOT DEMONSTRATE FAILING IS NOT A GUARD. That is why this file exists.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Cascade Dental Lab is a crown-and-bridge
-- laboratory in Portland. A remake comes back from Sellwood Family Dentistry, the lab adds
-- "Remake requested" to its case-status list and files the case under it in the same breath.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf4_red.sql
\set ON_ERROR_STOP on
\set suite 'writeperf4_red.sql'
\set requires 'exec:custom.record_write|exec:custom.table_declare|function:platform.memo_k_get'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

-- ═══ RED — the drop taken out ═══════════════════════════════════════════════════════════════
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

-- `platform.memo_clear_on_structure_row` WITHOUT the `co:` drop: the pre-wave-1 body, which is
-- correct for a blob that is emptied wholesale and wrong for a per-key store.
create or replace function platform.memo_clear_on_structure_row()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(new.table_id, old.table_id) in (custom.table_kernel_id(),
                                              custom.field_kernel_id(),
                                              custom.rule_kernel_id()) then
    perform platform.memo_clear();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- ── THE LAB ─────────────────────────────────────────────────────────────────────────────────
create temp table wp4_fx (k text primary key, v text) on commit drop;
grant all on wp4_fx to authenticated;

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_home uuid; v_cases uuid; v_opts uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Cascade Dental Lab', 'cascade-dental-lab-' || substr(md5(random()::text),1,8), 'CDL', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf4_green', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Cascade Dental Lab — Portland Bench'));

  v_cases := custom.table_declare(v_org, jsonb_build_object(
    'name','Crown & Bridge Cases','slug','cbcases_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Case','label_plural','Crown & Bridge Cases','title_field','case_no','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','case_no')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Case number','key','case_no','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Practice','key','practice','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Restoration','key','restoration','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Shade','key','shade','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Due','key','due','type','date'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Case status','key','status','type','select',
    'options', jsonb_build_array('Received','Model poured','Waxed','Cast','Glazed','Shipped')));

  select (f.data -> 'config' ->> 'options_table_id')::uuid into v_opts
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and (f.data ->> 'entity_definition_id')::uuid = v_cases
     and f.data ->> 'key' = 'status';
  if v_opts is null then
    raise exception 'SETUP FAILED: the Case status field declared no options table';
  end if;

  insert into wp4_fx values ('org', v_org::text), ('home', v_home::text),
                            ('cases', v_cases::text), ('opts', v_opts::text);
end;
$t$;


do $t$
declare
  v_org uuid := (select v::uuid from wp4_fx where k='org');
  v_cases uuid := (select v::uuid from wp4_fx where k='cases');
  v_opts uuid := (select v::uuid from wp4_fx where k='opts');
  v_rec uuid;
  v_msg text;
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform custom.choice_field_map(v_org, v_cases);        -- warm the options memo
  begin
    select custom.record_write(v_org, v_cases, jsonb_build_object(
             'case_no','CDL-2026-0412','practice','Sellwood Family Dentistry',
             'restoration','PFM bridge #19-21','shade','B1','due','2026-10-02',
             'status','Remake requested'))
      into v_rec
      from (select custom.record_write(v_org, v_opts,
                     jsonb_build_object('title','Remake requested')) as o) s;
    raise exception 'RED FAILED: the case was accepted WITHOUT the one-key drop, so this block proves nothing about it';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'RED FAILED%' then raise; end if;
    if v_msg not like '%does not have a choice called%' then
      raise exception 'RED FAILED: it refused, but with "%" rather than the stale-choice refusal this twin is about', v_msg;
    end if;
  end;
  raise notice 'RED   without the one-key drop the lab is refused its own new status: "%"', v_msg;
end;
$t$;
rollback;

-- ═══ GREEN — the live bodies ════════════════════════════════════════════════════════════════
begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

-- ── THE LAB ─────────────────────────────────────────────────────────────────────────────────
create temp table wp4_fx (k text primary key, v text) on commit drop;
grant all on wp4_fx to authenticated;

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org uuid; v_home uuid; v_cases uuid; v_opts uuid;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Cascade Dental Lab', 'cascade-dental-lab-' || substr(md5(random()::text),1,8), 'CDL', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf4_green', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Cascade Dental Lab — Portland Bench'));

  v_cases := custom.table_declare(v_org, jsonb_build_object(
    'name','Crown & Bridge Cases','slug','cbcases_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Case','label_plural','Crown & Bridge Cases','title_field','case_no','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','case_no')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Case number','key','case_no','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Practice','key','practice','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Restoration','key','restoration','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Shade','key','shade','type','text'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Due','key','due','type','date'));
  perform custom.field_declare(v_org, v_cases, jsonb_build_object('label','Case status','key','status','type','select',
    'options', jsonb_build_array('Received','Model poured','Waxed','Cast','Glazed','Shipped')));

  select (f.data -> 'config' ->> 'options_table_id')::uuid into v_opts
    from custom.record f
   where f.organization_id = v_org
     and f.table_id = custom.field_kernel_id()
     and (f.data ->> 'entity_definition_id')::uuid = v_cases
     and f.data ->> 'key' = 'status';
  if v_opts is null then
    raise exception 'SETUP FAILED: the Case status field declared no options table';
  end if;

  insert into wp4_fx values ('org', v_org::text), ('home', v_home::text),
                            ('cases', v_cases::text), ('opts', v_opts::text);
end;
$t$;


do $t$
declare
  v_org uuid := (select v::uuid from wp4_fx where k='org');
  v_cases uuid := (select v::uuid from wp4_fx where k='cases');
  v_opts uuid := (select v::uuid from wp4_fx where k='opts');
  v_rec uuid;
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  perform custom.choice_field_map(v_org, v_cases);        -- warm the options memo
  select custom.record_write(v_org, v_cases, jsonb_build_object(
           'case_no','CDL-2026-0412','practice','Sellwood Family Dentistry',
           'restoration','PFM bridge #19-21','shade','B1','due','2026-10-02',
           'status','Remake requested'))
    into v_rec
    from (select custom.record_write(v_org, v_opts,
                   jsonb_build_object('title','Remake requested')) as o) s;
  if v_rec is null then
    raise exception 'GREEN FAILED: the case write returned nothing';
  end if;
  raise notice 'GREEN with the one-key drop the same statement is accepted: case %', v_rec;
end;
$t$;
rollback;
