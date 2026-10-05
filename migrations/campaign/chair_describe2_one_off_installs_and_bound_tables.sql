-- chair_describe2_one_off_installs_and_bound_tables.sql — lane CHAIR-DESCRIBE-2 (Unified Data System v7).
--
-- 1. A template table can BIND to a table the organization already has (@ai-matrx/records `bindsTo`):
--    the plan carries `ids` ({"ref:tables.patient": <existing id>}) and custom.template_install starts a
--    new install's id map with them, so no second "Patients" is made and every later step links to it.
-- 2. A describe run installs a ONE-OFF: custom.template gains `ephemeral`; template_declare('org') sets
--    it from the spec's `ephemeral`; custom.templates lists a one-off only when asked for it by id
--    (its own page), and custom.template_keep(p_template_id) puts it on the organization's shelf
--    ("Save as my template").
--
-- based-on: custom.template_install(uuid, uuid, integer) c9eb8fdc0e86e955e24bc887328841a6c7034c744b370b0485ed3a88a54b58d9
-- based-on: custom.template_declare(text, jsonb) 438537b4013dafd17a295d8cfed7bd3e89a26e76dce7fd39414ecc6d6f48414f
-- based-on: custom.templates(jsonb) 439e67a48ea3415a9873add02d33dfbe30997843bf39d23fe7ed73c46eb5ba19

alter table custom.template add column if not exists ephemeral boolean not null default false;

CREATE OR REPLACE FUNCTION custom.template_install(p_organization_id uuid, p_template_id uuid, p_budget_ms integer DEFAULT 4000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '90s'
AS $function$
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
  v_budget  integer := least(greatest(coalesce(p_budget_ms, 4000), 0), 600000);
  v_tz      text;
  v_state   text;
  v_msg     text;
  v_code    text;
  v_hint    text;
  v_detail  text;
  v_where   text;
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
      (organization_id, template_id, catalogue_id, template_version, state, install_day, timezone, installed_by, ids)
    values (p_organization_id, v_t.id, v_t.catalogue_id, v_t.template_version, 'installing',
            (now() at time zone v_tz)::date, v_tz, v_me,
            -- A table the template binds to (bindsTo) is known before the first step: its id seeds the map.
            case when jsonb_typeof(v_t.plan -> 'ids') = 'object' then v_t.plan -> 'ids' else '{}'::jsonb end)
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
    get stacked diagnostics v_msg = message_text, v_code = returned_sqlstate, v_hint = pg_exception_hint, v_detail = pg_exception_detail, v_where = pg_exception_context;
    update custom.template_install i
       set state = 'refused',
           refusal = jsonb_build_object('step', v_k, 'label', v_steps -> v_k ->> 'label', 'door', 'custom.' || (v_steps -> v_k ->> 'door'),
                                        'code', v_code, 'message', v_msg, 'hint', nullif(v_hint, ''), 'detail', nullif(v_detail, ''),
                                        'where', left(nullif(v_where, ''), 2000)),
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

CREATE OR REPLACE FUNCTION custom.template_declare(p_scope text, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_id      uuid;
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
    (organization_id, scope, catalogue_id, template_version, spec_version, card, spec, plan, declared_by, ephemeral)
  values (v_org, p_scope, v_cat, v_ver, nullif(p_spec ->> 'specVersion', '')::integer,
          v_card, v_spec - 'ephemeral', v_plan, auth.uid(),
          p_scope = 'org' and coalesce((p_spec ->> 'ephemeral')::boolean, false))
  on conflict (organization_id, catalogue_id, template_version) do update
     set scope = excluded.scope, spec_version = excluded.spec_version, card = excluded.card,
         spec = excluded.spec, plan = excluded.plan, declared_by = excluded.declared_by,
         ephemeral = excluded.ephemeral, retired_at = null, updated_at = now()
  returning t.id, (t.xmax = 0) into v_id, v_created;   -- xmax = 0: this statement inserted the row
  select * into v_row from custom.template t where t.id = v_id;

  return jsonb_build_object('template_id', v_row.id, 'catalogue_id', v_row.catalogue_id,
                            'version', v_row.template_version, 'scope', v_row.scope,
                            'organization_id', v_row.organization_id, 'created', v_created,
                            'steps', jsonb_array_length(v_row.plan -> 'steps'), 'ephemeral', v_row.ephemeral);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.templates(p_filter jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f          jsonb := coalesce(p_filter, '{}'::jsonb);
  v_me       uuid := auth.uid();
  v_scope    text := coalesce(nullif(f ->> 'scope', ''), 'all');
  v_org      uuid := nullif(f ->> 'organization_id', '')::uuid;
  v_inst     uuid := nullif(f ->> 'installed_in', '')::uuid;
  v_limit    integer := least(greatest(coalesce((f ->> 'limit')::integer, 60), 1), 200);
  v_offset   integer := greatest(coalesce((f ->> 'offset')::integer, 0), 0);
  v_q        text := nullif(btrim(f ->> 'q'), '');
  v_id       uuid := nullif(f ->> 'id', '')::uuid;
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
       -- A one-off (a describe run) is on no shelf; it is read only by its own id, until it is kept.
       and (not t.ephemeral or t.id = v_id)
       and (v_id is null or t.id = v_id)
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
               'install_door', 'custom.template_install', 'ephemeral', p.ephemeral,
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

create or replace function custom.template_keep(p_template_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
as $function$
declare
  v_t custom.template;
begin
  select * into v_t from custom.template t where t.id = p_template_id and t.retired_at is null for update;
  if not found or v_t.scope <> 'org' then
    raise exception 'There is no such organization template.' using errcode = 'P0002';
  end if;
  perform custom.assert_client_may_reach(v_t.organization_id, 'custom.template_keep');
  if not iam.has_org_access(v_t.organization_id) then
    raise exception 'There is no such organization template.' using errcode = 'P0002';
  end if;
  update custom.template t set ephemeral = false, updated_at = now() where t.id = v_t.id;
  return jsonb_build_object('template_id', v_t.id, 'catalogue_id', v_t.catalogue_id, 'kept', true);
end;
$function$;

revoke all on function custom.template_keep(uuid) from public, anon;
grant execute on function custom.template_keep(uuid) to authenticated;
