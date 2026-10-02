-- CHAIR (Unified Data System v6) — THE ONE TEMPLATE FAMILY: one catalogue, one install door.
--
-- THE USE CASE. Marisol Teague manages Linden Hollow Family Medicine. On the gallery she picks
-- "Family medicine practice", presses Install, and within a few seconds her organization has the
-- six tables, their relations, 40 realistic patients, the visit board, the intake form, the booking
-- page and the dashboard — made by HER, through the same store doors her own screens use. She
-- presses Install again by mistake: nothing doubles. She decides it is not for her and presses
-- Uninstall: every table, form, view, dashboard and document it made is archived, and Bring back
-- returns all of it.
--
-- Doctrine §4.2 ("custom.template — the scope template mechanism ported … all other template
-- mechanisms retired"); v6 PLAN "the chair builds four store primitives" (one custom.template
-- family with a single install door, lanes 2 and 8); lane 8 board "Needs from the chair".
--
-- WHAT THIS FILE LANDS (all additive: two new tables, new functions, door rows; nothing existing
-- is changed, no existing grant moves):
--   a. custom.template          — one row per (owner organization, catalogue id, version): the
--                                 TemplateSpec (aidream @ai-matrx/records src/templates/types.ts),
--                                 its CARD (the gallery's fields, lane 2/8) and its INSTALL PLAN
--                                 (compiled by `templateDeclaration(spec)`, src/templates/plan.ts:
--                                 an ordered list of store-door calls with symbolic ids).
--                                 Platform templates are owned by the Matrx System organization
--                                 (iam.system_orgs key 'system', global_readable) — platform
--                                 context, readable by every signed-in person.
--   b. custom.template_install  — one row per install: who, which template and version, the next
--                                 step, every id it made (`made`), the refusal if one stopped it,
--                                 what uninstall archived. At most ONE live install of a catalogue
--                                 id per organization (partial unique index): install twice = one
--                                 footprint.
--   c. custom.template_declare(p_scope 'org'|'platform', p_spec jsonb)     upsert by catalogue id + version
--   d. custom.templates(p_filter jsonb)                                     card fields only, never a row
--   e. custom.template_install(p_organization_id, p_template_id, p_budget_ms) runs the plan AS THE PERSON
--   f. custom.template_uninstall(p_organization_id, p_install_id, p_budget_ms) archives the footprint
--   g. custom.template_restore(p_organization_id, p_install_id, p_budget_ms)   brings it all back
--   h. custom.template_install_note(p_organization_id, p_install_id, p_kind, p_id, p_label)
--        — the host records what it made outside the store (the agent copy), so uninstall names it.
--   i. internal: custom._template_call (one whitelisted door, named arguments), custom._template_bind
--      (symbolic ids → real ids), custom._template_date (install-relative seed dates),
--      custom._template_answer.
--
-- RUNS AS THE PERSON. Every write is a call to an existing store door (table_from_example,
-- field_declare, record_write_many, view_declare, form_declare, booking_declare, dashboard_declare,
-- pipeline_declare, doc_template_save, action_declare, subscription_declare, portal_declare,
-- table_dimensions_set, record_write …). Those doors judge the caller through the `role` GUC and
-- auth.uid() (custom.caller_role: "`current_user` is useless here"), which a SECURITY DEFINER
-- wrapper does not change — so the person's own wall, rung and store switch decide every step, and
-- a member of one organization can install into that organization only. This function's own
-- writes are its two bookkeeping tables. The plan's door list is CLOSED (custom._template_call);
-- a plan naming any other function is refused at declare time and again at install.
--
-- ATOMIC PER CALL, RESUMABLE ACROSS CALLS. A person's statement ceiling is 8 s (role
-- `authenticated`), and a six-table template measured 12.8 s in one statement (lane 8, clone,
-- 2026-10-02). So one call runs steps until `p_budget_ms` (default 6000) is spent, inside ONE
-- subtransaction: either every step of that call lands and the install row moves forward, or
-- none does and the install row records the refusal verbatim. `done: false` means "call again";
-- the next call resumes at the next step with the same ids. A small template finishes in one call
-- and is atomic outright. A refused install keeps what earlier calls made, listed in `made`, so
-- uninstall archives exactly that.
--
-- INVERSE: migrations/inverse/chair_tf_one_template_family_one_install_door_down.sql
--
-- chair-step: two new tables (custom.template, custom.template_install; RLS on, no client grant, no FK to iam.organizations or auth.users) and seven new signed-in doors with their platform.client_callable_door rows; custom.reopen_declared_doors() issues EXECUTE to authenticated. anon gains nothing.
-- lock: custom
-- lane: CHAIR-TEMPLATE-FAMILY

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ── a. THE CATALOGUE ─────────────────────────────────────────────────────────────────────────────
create table custom.template (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null,   -- the owner: an organization, or Matrx System for 'platform'
  scope           text        not null check (scope in ('org', 'platform')),
  catalogue_id    text        not null check (catalogue_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$'),
  template_version integer    not null check (template_version >= 1),   -- the spec's content version (never named `version`: that word makes a table entity-shaped)
  spec_version    integer,
  card            jsonb       not null check (jsonb_typeof(card) = 'object'),
  spec            jsonb       not null check (jsonb_typeof(spec) = 'object'),
  plan            jsonb       not null check (jsonb_typeof(plan -> 'steps') = 'array'),
  declared_by     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  retired_at      timestamptz,            -- retired: no longer offered (never deleted; installs keep it)
  unique (organization_id, catalogue_id, template_version)
);
create index template_card_idx on custom.template (scope, catalogue_id, template_version desc) where retired_at is null;
revoke all on table custom.template from public, anon, authenticated;
comment on table custom.template is
  'Chair (v6) — THE one template family (Doctrine §4.2). One row per (owner organization, catalogue id, version): the TemplateSpec, its gallery card and its install plan (ordered store-door calls with symbolic ids, compiled by @ai-matrx/records templateDeclaration). Platform templates are owned by Matrx System. Written only by custom.template_declare; read only through custom.templates (cards) and custom.template_install.';

-- ── b. THE INSTALLS ──────────────────────────────────────────────────────────────────────────────
create table custom.template_install (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null,   -- where it was installed
  template_id     uuid        not null references custom.template (id),
  catalogue_id    text        not null,
  template_version integer    not null,
  state           text        not null check (state in ('installing', 'installed', 'refused', 'uninstalling', 'uninstalled')),
  next_step       integer     not null default 0,
  ids             jsonb       not null default '{}'::jsonb,   -- symbolic name → real id (resume uses the same ids)
  made            jsonb       not null default '[]'::jsonb,   -- [{kind, id, ref, title, table_id, step}] in the order made
  archived        jsonb       not null default '[]'::jsonb,   -- what uninstall archived, so restore brings back exactly that
  refusal         jsonb,
  install_day     date        not null,
  timezone        text        not null,
  installed_by    uuid        not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  uninstalled_at  timestamptz,
  uninstalled_by  uuid,
  ms              integer     not null default 0,
  calls           integer     not null default 0,
  updated_at      timestamptz not null default now()
);
create unique index template_install_one_live_idx
  on custom.template_install (organization_id, catalogue_id) where state <> 'uninstalled';
create index template_install_org_idx on custom.template_install (organization_id, started_at desc);
revoke all on table custom.template_install from public, anon, authenticated;
comment on table custom.template_install is
  'Chair (v6) — one row per template install: the next step, every id it made (made), the refusal that stopped it, what uninstall archived. At most one live install of a catalogue id per organization. Written only by custom.template_install / template_uninstall / template_restore / template_install_note.';

-- Both tables are System machinery: no client lane, reached only through the doors below.
insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values
  ('custom_template', 'custom', 'template', 'Template', 1, false, false, true,
   'The one template family (Doctrine §4.2): spec, card and install plan per catalogue id and version.',
   false, false, false, 'system', false, 'machinery',
   'Written only by custom.template_declare; read through custom.templates (cards) and custom.template_install.',
   'table', 'organization',
   'Owned by an organization (Matrx System for platform templates); no client lane, only the template doors.',
   'organization', 'standard', 'system',
   'Chair v6: the one custom.template family lanes 2 and 8 asked for.',
   false, false, 'custom.template'::regclass),
  ('custom_template_install', 'custom', 'template_install', 'Template install', 1, false, false, true,
   'One row per template install: next step, every id it made, refusal, what uninstall archived.',
   false, false, false, 'system', false, 'machinery',
   'Written only by custom.template_install / template_uninstall / template_restore / template_install_note.',
   'table', 'organization',
   'Belongs to the organization it was installed into; no client lane, only the template doors.',
   'organization', 'standard', 'system',
   'Chair v6: the install record that makes install idempotent and uninstall exact.',
   false, false, 'custom.template_install'::regclass)
on conflict (token) do nothing;

-- ── i. INTERNALS ─────────────────────────────────────────────────────────────────────────────────

-- The doors a plan may call, and nothing else. Each is an existing store door that judges the
-- person itself (or a constant: person_kernel_id, file_kernel_id).
create or replace function custom._template_doors()
 returns text[]
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  select array['person_kernel_id', 'file_kernel_id', 'record_write', 'record_write_many',
               'table_from_example', 'table_declare', 'field_declare', 'applicable_fields',
               'table_dimensions_set', 'view_declare', 'form_declare', 'booking_declare',
               'dashboard_declare', 'pipeline_declare', 'doc_template_save', 'action_declare',
               'subscription_declare', 'rule_declare', 'checklist_declare', 'portal_declare']::text[]
$function$;
revoke all on function custom._template_doors() from public, anon, authenticated;

-- A seed date written relative to install day (the TemplateSpec grammar, RELATIVE_DATE in
-- src/templates/types.ts): @today, @today+3d, @today-2w, @today+1m 09:30 …  A bare day answers a
-- date; with a time it answers the moment in the business's time zone, with its offset.
create or replace function custom._template_date(p_token text, p_today date, p_tz text)
 returns text
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  m        text[];
  v_day    date;
  v_n      integer;
  v_local  timestamp;
  v_at     timestamptz;
  v_off    integer;
begin
  m := regexp_match(p_token, '^@today(?:([+-])(\d{1,4})([dwmy]))?(?: ([01]\d|2[0-3]):([0-5]\d))?$');
  if m is null then
    raise exception 'The template has a seed date "%" that is not one the template grammar knows.', p_token
      using errcode = '22007', hint = 'Seed dates are @today, @today+3d, @today-2w, @today+1m or any of them with a 24-hour time: @today+1d 09:30.';
  end if;
  v_day := p_today;
  if m[1] is not null then
    v_n := (case when m[1] = '-' then -1 else 1 end) * m[2]::integer;
    v_day := case m[3]
               when 'd' then v_day + v_n
               when 'w' then v_day + v_n * 7
               when 'm' then (v_day + make_interval(months => v_n))::date
               else (v_day + make_interval(years => v_n))::date
             end;
  end if;
  if m[4] is null then
    return to_char(v_day, 'YYYY-MM-DD');
  end if;
  v_local := v_day + make_time(m[4]::integer, m[5]::integer, 0);
  v_at := v_local at time zone p_tz;                          -- that wall-clock moment in the zone
  v_off := extract(epoch from (v_local - (v_at at time zone 'UTC')))::integer / 60;
  return to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS')
         || case when v_off < 0 then '-' else '+' end
         || lpad((abs(v_off) / 60)::text, 2, '0') || ':' || lpad((abs(v_off) % 60)::text, 2, '0');
end;
$function$;
revoke all on function custom._template_date(text, date, text) from public, anon, authenticated;

-- Symbolic ids → real ids, in the args of one step. Tokens are whole JSON strings or appear inside
-- one (a document body's {{field:${ref:fields.patient.dob}}}):
--   ${org}          the organization being installed into
--   ${ref:NAME}     an id an earlier step saved as NAME
--   ${new:NAME}     an id minted for this install (already in p_ids by the caller)
--   ${date:TOKEN}   an install-relative seed date
-- Ids and dates hold no quote or backslash, so a text replacement inside the JSON is exact.
create or replace function custom._template_bind(p_args jsonb, p_ids jsonb, p_org uuid, p_today date, p_tz text)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_text text := coalesce(p_args, '{}'::jsonb)::text;
  m      text[];
  v_val  text;
begin
  v_text := replace(v_text, '${org}', p_org::text);
  for m in select distinct regexp_matches(v_text, '\$\{(ref|new):([^}]+)\}', 'g') loop
    v_val := p_ids ->> (m[1] || ':' || m[2]);
    if v_val is null then
      raise exception 'The template uses "%" before any step made it, so it cannot be installed as written.', m[2]
        using errcode = '22023', hint = 'This is a fault in the template''s compiled plan: the step that saves this name must come first. Re-declare the template from its file.';
    end if;
    v_text := replace(v_text, '${' || m[1] || ':' || m[2] || '}', v_val);
  end loop;
  for m in select distinct regexp_matches(v_text, '\$\{date:([^}]+)\}', 'g') loop
    v_text := replace(v_text, '${date:' || m[1] || '}', custom._template_date(m[1], p_today, p_tz));
  end loop;
  return v_text::jsonb;
end;
$function$;
revoke all on function custom._template_bind(jsonb, jsonb, uuid, date, text) from public, anon, authenticated;

-- ONE door, by name, with named arguments taken from a JSON object. Only doors in the closed list;
-- each argument is cast to the door's own declared type; an argument the door does not have is
-- refused (a typo never silently drops a value). Answers the door's result as JSON (a set as an
-- array). SECURITY INVOKER: it adds no authority of its own.
create or replace function custom._template_call(p_door text, p_args jsonb)
 returns jsonb
 language plpgsql
 volatile
 set search_path to 'pg_catalog'
as $function$
declare
  v_proc   oid;
  v_names  text[];
  v_types  oid[];
  v_set    boolean;
  v_parts  text[] := array[]::text[];
  v_key    text;
  v_i      integer;
  v_type   text;
  v_expr   text;
  v_sql    text;
  v_out    jsonb;
begin
  if p_door is null or not (p_door = any (custom._template_doors())) then
    raise exception 'A template may only call the store''s own doors, and "%" is not one of them.', coalesce(p_door, '(none)')
      using errcode = '42501', hint = 'The closed list is custom._template_doors(). A template that needs another door waits for it to be added there.';
  end if;
  select p.oid, p.proargnames, p.proargtypes::oid[], p.proretset
    into v_proc, v_names, v_types, v_set
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace and p.proname = p_door;
  if v_proc is null then
    raise exception 'The store has no door named custom.%.', p_door using errcode = '42883';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_args, '{}'::jsonb)) loop
    v_i := array_position(v_names, v_key);
    if v_i is null then
      raise exception 'custom.% has no argument "%", so the template''s step cannot be sent as written.', p_door, v_key
        using errcode = '42883';
    end if;
    v_type := format_type(v_types[v_i], null);
    v_expr := case
      when p_args -> v_key = 'null'::jsonb then format('null::%s', v_type)
      when v_type = 'jsonb' then format('($1 -> %L)', v_key)
      when v_type = 'json' then format('($1 -> %L)::json', v_key)
      when v_type = 'jsonb[]' then format('array(select x from jsonb_array_elements($1 -> %L) x)', v_key)
      when v_type like '%[]' then format('array(select x::%s from jsonb_array_elements_text($1 -> %L) x)', left(v_type, -2), v_key)
      else format('($1 ->> %L)::%s', v_key, v_type)
    end;
    v_parts := v_parts || format('%I => %s', v_key, v_expr);
  end loop;
  if v_set then
    v_sql := format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from custom.%I(%s) r', p_door, array_to_string(v_parts, ', '));
  else
    v_sql := format('select to_jsonb(custom.%I(%s))', p_door, array_to_string(v_parts, ', '));
  end if;
  execute v_sql using p_args into v_out;
  return v_out;
end;
$function$;
revoke all on function custom._template_call(text, jsonb) from public, anon, authenticated;

-- The one answer shape every install / uninstall / restore call returns.
create or replace function custom._template_answer(p_install custom.template_install, p_extra jsonb default '{}'::jsonb)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object(
    'install_id', p_install.id,
    'organization_id', p_install.organization_id,
    'template_id', p_install.template_id,
    'catalogue_id', p_install.catalogue_id,
    'version', p_install.template_version,
    'state', p_install.state,
    'ok', p_install.state in ('installing', 'installed', 'uninstalling', 'uninstalled'),
    'done', p_install.state in ('installed', 'uninstalled'),
    'next_step', p_install.next_step,
    'made', p_install.made,
    'archived', p_install.archived,
    'refusal', p_install.refusal,
    'install_day', p_install.install_day,
    'ms', p_install.ms,
    'calls', p_install.calls) || coalesce(p_extra, '{}'::jsonb)
$function$;
revoke all on function custom._template_answer(custom.template_install, jsonb) from public, anon, authenticated;

-- ── c. DECLARE ───────────────────────────────────────────────────────────────────────────────────
create or replace function custom.template_declare(p_scope text, p_spec jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_org     uuid;
  v_owner   oid;
  v_cat     text := nullif(btrim(p_spec ->> 'catalogueId'), '');
  v_ver     integer;
  v_plan    jsonb := p_spec -> 'installPlan';
  v_card    jsonb := p_spec -> 'card';
  v_spec    jsonb := p_spec - 'installPlan' - 'card' - 'organizationId';
  v_bad     text;
  v_row     custom.template;
  v_created boolean;
begin
  if p_scope is null or p_scope not in ('org', 'platform') then
    raise exception 'A template is declared for an organization (''org'') or for everyone (''platform''); "%" is neither.', coalesce(p_scope, '(none)')
      using errcode = '22023';
  end if;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' then
    raise exception 'Declaring a template needs its spec.' using errcode = '22004';
  end if;

  if p_scope = 'platform' then
    select so.organization_id into v_org from iam.system_orgs so where so.key = 'system';
    select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
    if not (coalesce(public.is_platform_admin(), false) or pg_has_role(custom.caller_role(), v_owner, 'member')) then
      raise exception 'Only a platform administrator, inside the admin apps, can publish a template for everyone.'
        using errcode = '42501', hint = 'An organization''s own template is declared with p_scope = ''org'' and its organizationId in the spec.';
    end if;
  else
    v_org := nullif(p_spec ->> 'organizationId', '')::uuid;
    if v_org is null then
      raise exception 'An organization''s template names its organization (organizationId in the spec).' using errcode = '22004';
    end if;
    perform custom.assert_store_door(v_org, 'custom.template_declare');
    perform custom.assert_client_may_reach(v_org, 'custom.template_declare');
  end if;

  if v_cat is null or v_cat !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' then
    raise exception 'A template needs its catalogue id (catalogueId, for example "T0016").' using errcode = '22023';
  end if;
  begin
    v_ver := (p_spec ->> 'version')::integer;
  exception when others then
    v_ver := null;
  end;
  if v_ver is null or v_ver < 1 then
    raise exception 'Template % needs a whole-number version of 1 or more.', v_cat using errcode = '22023';
  end if;
  if v_card is null or jsonb_typeof(v_card) <> 'object' or nullif(btrim(v_card ->> 'name'), '') is null then
    raise exception 'Template % has no card (a name at least), so the gallery could not show it.', v_cat
      using errcode = '22023', hint = 'Declare through templateDeclaration(spec) in @ai-matrx/records, which derives the card and the install plan from the spec.';
  end if;
  if v_plan is null or jsonb_typeof(v_plan -> 'steps') <> 'array' or jsonb_array_length(v_plan -> 'steps') = 0 then
    raise exception 'Template % has no install plan, so installing it would make nothing.', v_cat
      using errcode = '22023', hint = 'Declare through templateDeclaration(spec) in @ai-matrx/records.';
  end if;
  select s ->> 'door' into v_bad
    from jsonb_array_elements(v_plan -> 'steps') s
   where not coalesce(s ->> 'door', '') = any (custom._template_doors())
   limit 1;
  if found then
    raise exception 'Template %''s plan calls "%", which is not one of the store doors a template may use.', v_cat, coalesce(v_bad, '(none)')
      using errcode = '42501', hint = 'The closed list is custom._template_doors().';
  end if;

  insert into custom.template as t
    (organization_id, scope, catalogue_id, template_version, spec_version, card, spec, plan, declared_by)
  values (v_org, p_scope, v_cat, v_ver, nullif(p_spec ->> 'specVersion', '')::integer,
          v_card, v_spec, v_plan, auth.uid())
  on conflict (organization_id, catalogue_id, template_version) do update
     set scope = excluded.scope, spec_version = excluded.spec_version, card = excluded.card,
         spec = excluded.spec, plan = excluded.plan, declared_by = excluded.declared_by,
         retired_at = null, updated_at = now()
  returning t.* into v_row;
  v_created := v_row.created_at = v_row.updated_at;   -- an update moves updated_at; an insert sets both to now()

  return jsonb_build_object('template_id', v_row.id, 'catalogue_id', v_row.catalogue_id,
                            'version', v_row.template_version, 'scope', v_row.scope,
                            'organization_id', v_row.organization_id, 'created', v_created,
                            'steps', jsonb_array_length(v_row.plan -> 'steps'));
end;
$function$;
comment on function custom.template_declare(text, jsonb) is
  'Chair (v6) — declare one template: upsert by (owner, catalogue id, version). p_scope ''platform'' (platform administrators in the admin apps, or the campaign runner) files it under Matrx System for everyone; ''org'' files it under spec.organizationId for that organization''s members. p_spec is templateDeclaration(spec) from @ai-matrx/records: the TemplateSpec plus its card and install plan; the plan may call only custom._template_doors().';

-- ── d. THE CARDS ─────────────────────────────────────────────────────────────────────────────────
-- p_filter: {industry, job, teaches, strength, q, scope ('platform'|'org'|'all'), organization_id
-- (the page's organization filter, default all of mine), installed_in (an organization to mark
-- installed cards for), limit, offset}. Latest version of each catalogue id per owner. Card fields
-- only — never the spec, the plan or a row.
create or replace function custom.templates(p_filter jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  f          jsonb := coalesce(p_filter, '{}'::jsonb);
  v_me       uuid := auth.uid();
  v_scope    text := coalesce(nullif(f ->> 'scope', ''), 'all');
  v_org      uuid := nullif(f ->> 'organization_id', '')::uuid;
  v_inst     uuid := nullif(f ->> 'installed_in', '')::uuid;
  v_limit    integer := least(greatest(coalesce((f ->> 'limit')::integer, 60), 1), 200);
  v_offset   integer := greatest(coalesce((f ->> 'offset')::integer, 0), 0);
  v_q        text := nullif(btrim(f ->> 'q'), '');
  v_out      jsonb;
  v_total    integer;
begin
  if v_me is null then
    raise exception 'Sign in to see the template gallery.' using errcode = '42501';
  end if;
  if v_scope not in ('all', 'platform', 'org') then
    raise exception 'The gallery shows all, platform or org templates; "%" is none of those.', v_scope using errcode = '22023';
  end if;
  if v_inst is not null and not iam.has_org_access(v_inst) then
    v_inst := null;   -- an organization she is not in marks nothing (and says nothing about it)
  end if;

  with latest as (
    select distinct on (t.organization_id, t.catalogue_id) t.*
      from custom.template t
     where t.retired_at is null
       and (t.scope = 'platform' or iam.has_org_access(t.organization_id))
       and (v_scope = 'all' or t.scope = v_scope)
       and (v_org is null or t.scope = 'platform' or t.organization_id = v_org)
     order by t.organization_id, t.catalogue_id, t.template_version desc
  ), picked as (
    select l.* from latest l
     where (f ->> 'industry' is null or l.card ->> 'industry' = f ->> 'industry')
       and (f ->> 'job' is null or l.card ->> 'job' = f ->> 'job')
       and (f ->> 'teaches' is null or l.card ->> 'teaches' = f ->> 'teaches')
       and (f ->> 'strength' is null or coalesce(l.card -> 'strengths', '[]'::jsonb) ? (f ->> 'strength'))
       and (v_q is null or (coalesce(l.card ->> 'name', '') || ' ' || coalesce(l.card ->> 'persona', '') || ' '
                            || coalesce(l.card ->> 'vertical', '') || ' ' || coalesce(l.card ->> 'business', '')) ilike '%' || v_q || '%')
  )
  select count(*)::integer,
         coalesce(jsonb_agg(c order by c ->> 'name') filter (where rn > v_offset and rn <= v_offset + v_limit), '[]'::jsonb)
    into v_total, v_out
    from (
      select row_number() over (order by p.card ->> 'name', p.catalogue_id) rn,
             jsonb_build_object(
               'id', p.id, 'catalogue_id', p.catalogue_id, 'version', p.template_version, 'scope', p.scope,
               'owner_organization_id', case when p.scope = 'platform' then null else p.organization_id end,
               'name', p.card ->> 'name', 'persona', p.card ->> 'persona',
               'business', p.card ->> 'business', 'vertical', p.card ->> 'vertical',
               'industry', p.card ->> 'industry', 'job', p.card ->> 'job', 'audience', p.card ->> 'audience',
               'teaches', p.card ->> 'teaches', 'strengths', coalesce(p.card -> 'strengths', '[]'::jsonb),
               'requires', coalesce(p.card -> 'requires', '[]'::jsonb),
               'footprint', p.card -> 'footprint', 'preview_image', p.card ->> 'previewImage',
               'install_door', 'custom.template_install',
               'installed', case when v_inst is null then null else
                 (select jsonb_build_object('install_id', i.id, 'state', i.state, 'version', i.template_version)
                    from custom.template_install i
                   where i.organization_id = v_inst and i.catalogue_id = p.catalogue_id and i.state <> 'uninstalled')
               end) c
        from picked p
    ) x;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'cards', v_out);
end;
$function$;
comment on function custom.templates(jsonb) is
  'Chair (v6) — the template gallery: the latest version of each template the caller may see (platform templates to every signed-in person, an organization''s templates to its members), card fields only (name, persona, business, vertical, industry, job, audience, teaches, strengths, requires, footprint, preview image) — never the spec, the plan or a row. Filters: industry, job, teaches, strength, q, scope, organization_id; installed_in marks the cards already installed there.';

-- ── e. INSTALL ───────────────────────────────────────────────────────────────────────────────────
create or replace function custom.template_install(p_organization_id uuid, p_template_id uuid, p_budget_ms integer default 6000)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me      uuid := auth.uid();
  v_t       custom.template;
  v_i       custom.template_install;
  v_steps   jsonb;
  v_n       integer;
  v_k       integer;
  v_from    integer;
  v_step    jsonb;
  v_args    jsonb;
  v_res     jsonb;
  v_ids     jsonb;
  v_made    jsonb;
  v_name    text;
  v_path    jsonb;
  v_each    jsonb;
  v_el      jsonb;
  v_m       jsonb;
  v_t0      timestamptz := clock_timestamp();
  v_budget  integer := least(greatest(coalesce(p_budget_ms, 6000), 0), 600000);
  v_tz      text;
  v_state   text;
  v_msg     text;
  v_code    text;
  v_hint    text;
  v_detail  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.template_install');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_install');
  if v_me is null then
    raise exception 'Installing a template is done by a signed-in person, and nobody is signed in.' using errcode = '42501';
  end if;

  select * into v_t from custom.template t where t.id = p_template_id and t.retired_at is null;
  if not found or (v_t.scope = 'org' and not iam.has_org_access(v_t.organization_id)) then
    raise exception 'There is no such template to install; it may have been retired.' using errcode = 'P0002',
          detail = jsonb_build_object('template_id', p_template_id)::text;
  end if;

  -- One install of a catalogue id per organization at a time: two presses wait for each other.
  perform pg_advisory_xact_lock(hashtextextended('custom.template_install:' || p_organization_id::text || ':' || v_t.catalogue_id, 0));

  select * into v_i from custom.template_install i
   where i.organization_id = p_organization_id and i.catalogue_id = v_t.catalogue_id and i.state <> 'uninstalled'
   for update;
  if found and v_i.state in ('installed', 'uninstalling') then
    return custom._template_answer(v_i, jsonb_build_object('already', true,
             'newer_version', case when v_t.template_version > v_i.template_version then v_t.template_version else null end,
             'agent', v_t.plan -> 'agent'));
  end if;
  if found and v_i.template_id <> v_t.id then
    raise exception 'This organization is part-way through installing version % of this template, so version % cannot start until it finishes or is uninstalled.', v_i.template_version, v_t.template_version
      using errcode = '55000', detail = jsonb_build_object('install_id', v_i.id)::text;
  end if;
  if not found then
    v_tz := coalesce(nullif(v_t.plan ->> 'timezone', ''), 'UTC');
    if not exists (select 1 from pg_timezone_names z where z.name = v_tz) then v_tz := 'UTC'; end if;
    insert into custom.template_install
      (organization_id, template_id, catalogue_id, template_version, state, install_day, timezone, installed_by)
    values (p_organization_id, v_t.id, v_t.catalogue_id, v_t.template_version, 'installing',
            (now() at time zone v_tz)::date, v_tz, v_me)
    returning * into v_i;
  end if;

  v_steps := v_t.plan -> 'steps';
  v_n := jsonb_array_length(v_steps);
  v_from := v_i.next_step;
  v_k := v_from;
  v_ids := v_i.ids;
  v_made := v_i.made;

  begin
    while v_k < v_n loop
      -- Always at least one step per call; then stop when the budget is spent.
      exit when v_k > v_from and extract(epoch from clock_timestamp() - v_t0) * 1000 > v_budget;
      v_step := v_steps -> v_k;

      for v_name in select distinct (regexp_matches((v_step -> 'args')::text, '\$\{new:([^}]+)\}', 'g'))[1] loop
        if not v_ids ? ('new:' || v_name) then
          v_ids := v_ids || jsonb_build_object('new:' || v_name, gen_random_uuid());
        end if;
      end loop;
      v_args := custom._template_bind(v_step -> 'args', v_ids, p_organization_id, v_i.install_day, v_i.timezone);
      v_res := custom._template_call(v_step ->> 'door', v_args);

      -- save: {"NAME": [path…]} — [] is the whole answer.
      for v_name, v_path in select key, value from jsonb_each(coalesce(v_step -> 'save', '{}'::jsonb)) loop
        if v_res #> array(select jsonb_array_elements_text(v_path)) is null
           or jsonb_typeof(v_res #> array(select jsonb_array_elements_text(v_path))) = 'null' then
          raise exception 'custom.% answered without the id the template saves as "%".', v_step ->> 'door', v_name using errcode = 'P0002';
        end if;
        v_ids := v_ids || jsonb_build_object('ref:' || v_name, v_res #>> array(select jsonb_array_elements_text(v_path)));
      end loop;
      -- saveEach: {"array": [path], "key": [path], "value": [path], "prefix": "fields.patient."}
      v_each := v_step -> 'saveEach';
      if v_each is not null then
        for v_el in select x from jsonb_array_elements(coalesce(v_res #> array(select jsonb_array_elements_text(coalesce(v_each -> 'array', '[]'::jsonb))), '[]'::jsonb)) x loop
          if nullif(v_el #>> array(select jsonb_array_elements_text(v_each -> 'key')), '') is not null then
            v_ids := v_ids || jsonb_build_object('ref:' || (v_each ->> 'prefix') || (v_el #>> array(select jsonb_array_elements_text(v_each -> 'key'))),
                                                 v_el #>> array(select jsonb_array_elements_text(v_each -> 'value')));
          end if;
        end loop;
      end if;
      -- made: [{kind, ref, title, table}] — what uninstall archives.
      for v_m in select x from jsonb_array_elements(coalesce(v_step -> 'made', '[]'::jsonb)) x loop
        v_made := v_made || jsonb_build_array(jsonb_build_object(
          'kind', v_m ->> 'kind', 'ref', v_m ->> 'ref', 'title', v_m ->> 'title', 'step', v_k,
          'id', v_ids ->> ('ref:' || (v_m ->> 'ref')),
          'table_id', case when v_m ? 'table' then v_ids ->> ('ref:' || (v_m ->> 'table')) end));
      end loop;
      v_k := v_k + 1;
    end loop;

    v_state := case when v_k >= v_n then 'installed' else 'installing' end;
    update custom.template_install i
       set ids = v_ids, made = v_made, next_step = v_k, state = v_state, refusal = null,
           finished_at = case when v_state = 'installed' then now() end,
           ms = i.ms + (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer,
           calls = i.calls + 1, updated_at = now()
     where i.id = v_i.id
    returning * into v_i;
  exception when others then
    -- Everything THIS call did is rolled back; what earlier calls made stays listed in `made`.
    get stacked diagnostics v_msg = message_text, v_code = returned_sqlstate, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
    update custom.template_install i
       set state = 'refused',
           refusal = jsonb_build_object('step', v_k, 'label', v_steps -> v_k ->> 'label', 'door', 'custom.' || (v_steps -> v_k ->> 'door'),
                                        'code', v_code, 'message', v_msg, 'hint', nullif(v_hint, ''), 'detail', nullif(v_detail, '')),
           ms = i.ms + (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer,
           calls = i.calls + 1, updated_at = now()
     where i.id = v_i.id
    returning * into v_i;
  end;

  return custom._template_answer(v_i, jsonb_build_object(
           'steps', v_n, 'this_call_ms', (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer,
           'agent', case when v_i.state = 'installed' then
             (select jsonb_build_object('platform_agent', v_t.plan -> 'agent' -> 'platformAgent', 'name', v_t.plan -> 'agent' ->> 'name',
                       'bindings', coalesce((select jsonb_agg(b || jsonb_build_object('table_id', v_i.ids ->> ('ref:tables.' || (b ->> 'tableToken'))))
                                               from jsonb_array_elements(coalesce(v_t.plan -> 'agent' -> 'bindings', '[]'::jsonb)) b), '[]'::jsonb),
                       'copied', exists (select 1 from jsonb_array_elements(v_i.made) x where x ->> 'kind' = 'agent'))
               where v_t.plan ? 'agent') end));
end;
$function$;
comment on function custom.template_install(uuid, uuid, integer) is
  'Chair (v6) — install one template into one organization AS THE PERSON: runs the template''s plan through the store''s own doors (custom._template_doors), each judging the caller. Atomic per call (one subtransaction), resumable across calls: done=false means call again; a refusal is returned verbatim and what earlier calls made stays listed for uninstall. A second install of the same catalogue id answers the first (already=true): one footprint. The agent copy is the host''s (answer.agent), recorded with custom.template_install_note.';

-- ── h. THE HOST'S NOTE (the agent copy) ──────────────────────────────────────────────────────────
create or replace function custom.template_install_note(p_organization_id uuid, p_install_id uuid, p_kind text, p_id uuid, p_label text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_i custom.template_install;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_install_note');
  if coalesce(p_kind, '') not in ('agent') then
    raise exception 'An install records only what its host makes outside the store (an agent); "%" is made by the install itself.', coalesce(p_kind, '(none)')
      using errcode = '22023';
  end if;
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id and i.state <> 'uninstalled' for update;
  if not found then
    raise exception 'There is no such install in this organization.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_i.made) x where x ->> 'kind' = p_kind and x ->> 'id' = p_id::text) then
    update custom.template_install i
       set made = i.made || jsonb_build_array(jsonb_build_object('kind', p_kind, 'id', p_id, 'ref', p_kind, 'title', p_label, 'step', null)),
           updated_at = now()
     where i.id = v_i.id
    returning * into v_i;
  end if;
  return custom._template_answer(v_i);
end;
$function$;
comment on function custom.template_install_note(uuid, uuid, text, uuid, text) is
  'Chair (v6) — the host records what it made for an install outside the store (today: the agent copy), so the footprint and uninstall name it.';

-- ── f. UNINSTALL ─────────────────────────────────────────────────────────────────────────────────
-- Archives what the install made, newest first. A table goes through custom.table_archive (its
-- records, fields, saved views, rules and pick lists with it, one archive event, chunked); a
-- dashboard, document or portal through its own archive door; a form or a view the table did not
-- take is archived after the person passes the same rung (custom.assert_client_may_change on its
-- table); a Home or a seeded file record through custom.record_delete. An agent is named, not
-- archived (the agent screens archive agents). Budgeted like install: done=false means call again.
create or replace function custom.template_uninstall(p_organization_id uuid, p_install_id uuid, p_budget_ms integer default 6000)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_i      custom.template_install;
  v_m      jsonb;
  v_id     uuid;
  v_tbl    uuid;
  v_r      jsonb;
  v_t0     timestamptz := clock_timestamp();
  v_budget integer := least(greatest(coalesce(p_budget_ms, 6000), 0), 600000);
  v_arch   jsonb;
  v_left   jsonb := '[]'::jsonb;
  v_done   boolean := true;
  v_kind   text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.template_uninstall');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_uninstall');
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id for update;
  if not found then
    raise exception 'There is no such install in this organization, so there is nothing to uninstall.' using errcode = 'P0002';
  end if;
  if v_i.state = 'uninstalled' then
    return custom._template_answer(v_i, jsonb_build_object('already', true));
  end if;
  if v_i.state = 'installing' then
    raise exception 'This template is still being installed; let it finish (or be refused) before it is uninstalled.' using errcode = '55000';
  end if;
  v_arch := v_i.archived;

  for v_m in select x from jsonb_array_elements(v_i.made) with ordinality as e(x, n) order by n desc loop
    v_kind := v_m ->> 'kind';
    v_id := nullif(v_m ->> 'id', '')::uuid;
    continue when v_id is null or exists (select 1 from jsonb_array_elements(v_arch) a where a ->> 'id' = v_id::text);
    if extract(epoch from clock_timestamp() - v_t0) * 1000 > v_budget then
      v_done := false;
      exit;
    end if;
    case v_kind
      when 'table' then
        loop
          v_r := custom.table_archive(p_organization_id, v_id, 200, true);
          exit when coalesce((v_r ->> 'done')::boolean, false) or coalesce((v_r ->> 'table_archived')::boolean, false);
          if extract(epoch from clock_timestamp() - v_t0) * 1000 > v_budget then
            v_done := false;
            exit;
          end if;
        end loop;
        exit when not v_done;
        v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title', 'event', v_r ->> 'archive_event'));
      when 'dashboard' then
        perform custom.dashboard_delete(p_organization_id, v_id);
        v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
      when 'document' then
        perform custom.doc_template_delete(p_organization_id, v_id);
        v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
      when 'portal' then
        perform custom.portal_archive(p_organization_id, v_id, v_m ->> 'title', 'The template that made it was uninstalled.');
        v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
      when 'form' then
        select f.table_id into v_tbl from custom.anon_form f
         where f.organization_id = p_organization_id and f.id = v_id and f.deleted_at is null;
        if found then
          perform custom.assert_client_may_change(p_organization_id, v_tbl, 'custom.template_uninstall');
          update custom.anon_form f set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
           where f.organization_id = p_organization_id and f.id = v_id;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        end if;
      when 'view' then
        select v.subject_id into v_tbl from platform.saved_view v
         where v.organization_id = p_organization_id and v.id = v_id and v.deleted_at is null;
        if found then
          perform custom.assert_client_may_change(p_organization_id, v_tbl, 'custom.template_uninstall');
          update platform.saved_view v set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
           where v.organization_id = p_organization_id and v.id = v_id;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        end if;
      when 'record' then
        if exists (select 1 from custom.record r where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
          perform custom.record_delete(p_organization_id, v_id);
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        end if;
      when 'agent' then
        v_left := v_left || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title',
                    'says', 'Archive the agent from its own page; agents are not archived by a template.'));
      else
        null;   -- fields, rules, row actions, stage rules, dimensions: they go with their table.
    end case;
  end loop;

  update custom.template_install i
     set archived = v_arch,
         state = case when v_done then 'uninstalled' else 'uninstalling' end,
         uninstalled_at = case when v_done then now() end,
         uninstalled_by = case when v_done then auth.uid() end,
         updated_at = now()
   where i.id = v_i.id
  returning * into v_i;
  return custom._template_answer(v_i, jsonb_build_object('left', v_left, 'done', v_done));
end;
$function$;
comment on function custom.template_uninstall(uuid, uuid, integer) is
  'Chair (v6) — archive everything one install made (delete means archive): tables through custom.table_archive (records, fields, views, rules, pick lists with them), dashboards, documents and portals through their archive doors, forms and views the table did not take after the caller passes custom.assert_client_may_change, Homes and seeded file records through custom.record_delete. The agent is named in answer.left. Budgeted: done=false means call again. custom.template_restore brings back exactly what it archived.';

-- ── g. RESTORE ───────────────────────────────────────────────────────────────────────────────────
create or replace function custom.template_restore(p_organization_id uuid, p_install_id uuid, p_budget_ms integer default 6000)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_i      custom.template_install;
  v_a      jsonb;
  v_id     uuid;
  v_tbl    uuid;
  v_kind   text;
  v_title  text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.template_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_restore');
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id for update;
  if not found then
    raise exception 'There is no such install in this organization.' using errcode = 'P0002';
  end if;
  if v_i.state not in ('uninstalled', 'uninstalling') then
    return custom._template_answer(v_i, jsonb_build_object('already', true));
  end if;
  if exists (select 1 from custom.template_install o
              where o.organization_id = p_organization_id and o.catalogue_id = v_i.catalogue_id
                and o.state <> 'uninstalled' and o.id <> v_i.id) then
    raise exception 'This template has been installed again since, so the earlier install cannot be brought back beside it.' using errcode = '55000';
  end if;

  -- Oldest first: the Home before its tables, a table before the views and forms on it.
  for v_a in select x from jsonb_array_elements(v_i.archived) with ordinality as e(x, n) order by n desc loop
    v_kind := v_a ->> 'kind';
    v_id := (v_a ->> 'id')::uuid;
    v_title := v_a ->> 'title';
    case v_kind
      when 'table', 'record' then
        if exists (select 1 from custom.record r where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is not null) then
          perform custom.record_restore(p_organization_id, v_id);
        end if;
      when 'dashboard' then perform custom.dashboard_restore(p_organization_id, v_id);
      when 'document' then perform custom.doc_template_restore(p_organization_id, v_id);
      when 'portal' then perform custom.portal_restore(p_organization_id, v_id, v_title);
      when 'form' then
        select f.table_id into v_tbl from custom.anon_form f where f.organization_id = p_organization_id and f.id = v_id;
        perform custom.assert_client_may_change(p_organization_id, v_tbl, 'custom.template_restore');
        update custom.anon_form f set deleted_at = null, updated_at = now(), updated_by = auth.uid()
         where f.organization_id = p_organization_id and f.id = v_id;
      when 'view' then
        select v.subject_id into v_tbl from platform.saved_view v where v.organization_id = p_organization_id and v.id = v_id;
        perform custom.assert_client_may_change(p_organization_id, v_tbl, 'custom.template_restore');
        update platform.saved_view v set deleted_at = null, updated_at = now(), updated_by = auth.uid()
         where v.organization_id = p_organization_id and v.id = v_id;
      else null;
    end case;
  end loop;

  update custom.template_install i
     set state = 'installed', archived = '[]'::jsonb, uninstalled_at = null, uninstalled_by = null, updated_at = now()
   where i.id = v_i.id
  returning * into v_i;
  return custom._template_answer(v_i, jsonb_build_object('restored', true));
end;
$function$;
comment on function custom.template_restore(uuid, uuid, integer) is
  'Chair (v6) — bring back everything custom.template_uninstall archived for one install (tables with their records through custom.record_restore, dashboards, documents, portals, forms, views), and mark the install installed again. Refused when the same template has been installed again since.';

-- ── THE DOORS ────────────────────────────────────────────────────────────────────────────────────
revoke all on function custom.template_declare(text, jsonb) from public, anon;
revoke all on function custom.templates(jsonb) from public, anon;
revoke all on function custom.template_install(uuid, uuid, integer) from public, anon;
revoke all on function custom.template_install_note(uuid, uuid, text, uuid, text) from public, anon;
revoke all on function custom.template_uninstall(uuid, uuid, integer) from public, anon;
revoke all on function custom.template_restore(uuid, uuid, integer) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
select 'custom', d.fn, d.args, d.types, d.reason,
       'chair_tf_one_template_family_one_install_door.sql',
       null, true, false,
       jsonb_build_object('version', 1,
         'declared_by', 'chair_tf_one_template_family_one_install_door.sql',
         'declared_at', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY',
         'arguments', d.rules)
  from (values
    ('template_declare', 'p_scope text, p_spec jsonb',
     array['text'::regtype, 'jsonb'::regtype]::oid[],
     'Declares one template (upsert by owner, catalogue id and version). platform scope: a platform administrator in the admin apps or the store owner; org scope: custom.assert_client_may_reach on spec.organizationId. The plan may name only custom._template_doors().',
     jsonb_build_object(
       'p_scope', jsonb_build_object('type', 'text', 'position', 1, 'check', 'org | platform; anything else is refused.', 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'),
       'p_spec', jsonb_build_object('type', 'jsonb', 'position', 2, 'check', 'spec.organizationId (org scope) passes custom.assert_client_may_reach before anything is written.', 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'))),
    ('templates', 'p_filter jsonb',
     array['jsonb'::regtype]::oid[],
     'The gallery: card fields of the templates the caller may see (platform templates to every signed-in person, an organization''s to its members). Never a spec, a plan or a row.',
     jsonb_build_object(
       'p_filter', jsonb_build_object('type', 'jsonb', 'position', 1, 'check', 'organization ids in it only narrow what iam.has_org_access already admits.', 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'))),
    ('template_install', 'p_organization_id uuid, p_template_id uuid, p_budget_ms integer',
     array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
     'Installs one template into one organization as the caller: custom.assert_store_door and custom.assert_client_may_reach first, then each plan step through a store door that judges the caller.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) — the organization wall — before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'),
       'p_template_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'template',
         'check', 'a platform template, or a template of an organization the caller is in.',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'note', 'another organization''s template and an invented id both answer "There is no such template to install".', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'))),
    ('template_install_note', 'p_organization_id uuid, p_install_id uuid, p_kind text, p_id uuid, p_label text',
     array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
     'Records the agent a host copied for an install, so its footprint names it. custom.assert_client_may_reach on the organization; the install must be of that organization.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'),
       'p_install_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'template_install',
         'check', 'matched only with organization_id = arg1.',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'))),
    ('template_uninstall', 'p_organization_id uuid, p_install_id uuid, p_budget_ms integer',
     array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
     'Archives everything one install made, through the archive doors and the caller''s own rung on each table.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'),
       'p_install_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'template_install',
         'check', 'matched only with organization_id = arg1.',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'))),
    ('template_restore', 'p_organization_id uuid, p_install_id uuid, p_budget_ms integer',
     array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
     'Brings back what custom.template_uninstall archived for one install, through the restore doors and the caller''s own rung on each table.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body'),
       'p_install_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'template_install',
         'check', 'matched only with organization_id = arg1.',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-10-02 lane CHAIR-TEMPLATE-FAMILY — written with this body')))
  ) as d(fn, args, types, reason, rules)
on conflict do nothing;

select custom.reopen_declared_doors();

-- Row security last (Supabase's policy hook holds ACCESS EXCLUSIVE on auth/storage/realtime
-- relations to COMMIT when it runs; last means for one statement). No policy: no client lane.
alter table custom.template enable row level security;
alter table custom.template_install enable row level security;
