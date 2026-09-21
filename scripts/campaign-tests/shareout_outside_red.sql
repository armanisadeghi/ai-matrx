-- SHARE-OUT / item 1 — THE RED TWIN of `shareout_outside_green.sql`.
--
-- It puts the PRE-SHARE-OUT world back inside one transaction — `custom.portal_admits`
-- with its single portal-principal arm, and none of the six `table_share_outside*` doors —
-- builds the same Ojai branch with the same six real jobs, and proves that the everyday
-- case is refused there. Then it ROLLS BACK, so nothing it did survives.
--
-- 🚨 EVERYTHING RUNS INSIDE ONE TRANSACTION THAT ENDS IN ROLLBACK. If this file is
-- interrupted the transaction dies and the live doors stand. Run it with `psql -f`.
--
-- THE THREE CLAUSES IT PROVES RED (the three the green file's nine rest on):
--   A  there is no door to invite somebody outside the organization to a table
--   B  the store refuses the share outright, in the sentence crew F reported
--   C  and even WITH the grant written by hand and the outside lane switched on, the
--      organization wall still refuses her — which is the thing arm 2 exists to fix, and
--      the reason a grant alone was never enough before this lane

\set ON_ERROR_STOP on

begin;

-- The body exactly as it stood before SHARE-OUT: one arm, the portal principal.
create or replace function custom.portal_admits(p_organization_id uuid, p_user_id uuid default null::uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $old$
#variable_conflict use_column
begin
  return (
  select coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and exists (
           select 1
             from custom.portal_principal pp
             join custom.portal p on p.id = pp.portal_id and p.is_active
            where pp.organization_id = p_organization_id
              and pp.user_id = coalesce(p_user_id, (select auth.uid()))
              and pp.user_id is not null
              and pp.is_active)
  );
end
$old$;

drop function if exists custom.table_share_outside_invite(uuid, uuid, text, permission_level);
drop function if exists custom.table_share_outside(uuid, uuid);

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, the office
  c_mara    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, the customer
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_mara_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_jobs    uuid;
  v_job     jsonb;
  v_msg     text;
  v_reds    integer := 0;
begin
  perform set_config('app.actor_system', 'campaign.shareout.outside.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- CLAUSE A RED — the door does not exist in the old world.
  if to_regprocedure('custom.table_share_outside_invite(uuid,uuid,text,permission_level)') is not null then
    raise exception 'RED TWIN BROKEN: the invite door still exists';
  end if;
  v_reds := v_reds + 1;
  raise notice 'CLAUSE A RED: there is no custom.table_share_outside_invite — no way from the refusal to a remedy';

  -- The same branch and the same six real jobs the green file builds.
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co — Ojai Branch',
          'rincon-plumbing-ojai-red-' || substr(v_org::text, 1, 8), 'RPO', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'SHARE-OUT red twin'),
         -- THE OUTSIDE LANE IS SWITCHED ON, deliberately: this twin is not about the knob.
         ('custom', 'external_principal_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'SHARE-OUT red twin');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ojai Branch')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Jobs', 'slug', 'jobs', 'type', 'entity', 'display', 'list',
    'label_singular', 'Job', 'label_plural', 'Jobs', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'work_order', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','work_order'),
                                jsonb_build_object('name','address'),
                                jsonb_build_object('name','problem'),
                                jsonb_build_object('name','stage'),
                                jsonb_build_object('name','scheduled_for'))));
  for v_job in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('work_order','RPO-4471','address','812 Grand Ave, Ojai','problem','Water heater replacement — 50 gal gas, old unit leaking at the base','stage','Parts ordered','scheduled_for','2026-09-24'),
    jsonb_build_object('work_order','RPO-4472','address','1140 Maricopa Hwy, Ojai','problem','Kitchen line backing up into the dishwasher','stage','Scheduled','scheduled_for','2026-09-22')))
  loop
    perform custom.record_write(v_org, v_jobs, v_job);
  end loop;

  -- CLAUSE B RED — the store refuses the share outright, in crew F's own sentence.
  begin
    perform custom.share_grant(v_org, v_jobs, 'person', c_mara, 'viewer'::public.permission_level);
    raise exception 'RED TWIN BROKEN: share_grant accepted an outsider with no portal';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'not in this organization' then
      raise exception 'RED TWIN BROKEN: wrong refusal from share_grant: %', v_msg;
    end if;
    v_reds := v_reds + 1;
    raise notice 'CLAUSE B RED: %', v_msg;
  end;

  -- CLAUSE C RED — the heart of it. The grant is written BY HAND, as the operator, and
  -- the outside lane is on: the only thing missing is arm 2 of `custom.portal_admits`.
  -- She is still refused at the organization wall, which is why a grant alone could never
  -- be enough before this lane.
  perform set_config('role', 'postgres', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id,
                               permission_level, created_by, status)
  values ('record', v_jobs, c_mara, 'viewer'::public.permission_level, c_admin, 'active');

  perform set_config('request.jwt.claims', c_mara_j, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform count(*) from custom.read_records(v_org, v_jobs, false, 5, 0);
    raise exception 'RED TWIN BROKEN: she read the table with the old portal_admits';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'not a member of that organization' then
      raise exception 'RED TWIN BROKEN: refused for a different reason: %', v_msg;
    end if;
    v_reds := v_reds + 1;
    raise notice 'CLAUSE C RED: with the grant written and the lane open, the wall still says — %', v_msg;
  end;

  perform set_config('role', 'postgres', true);
  if v_reds <> 3 then
    raise exception 'RED TWIN INCOMPLETE: % of 3 clauses shown red', v_reds;
  end if;
  raise notice 'SHARE-OUT / item 1 RED: all three clauses fail on the pre-SHARE-OUT bytes.';
end;
$red$;

rollback;
