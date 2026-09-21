-- scripts/campaign-tests/tails_the_ladder_names_the_level_red.sql — lane TAILS's RED TWIN.
--
-- A green suite that cannot go red proves nothing. This file puts the PRE-FIX body of
-- `custom.assert_client_may_change` back inside ONE transaction that ends in ROLLBACK, and
-- then runs the same two probes the green suite's PARTs 3 and 4 run. Both must produce the
-- sentence the fix exists to delete — "You do not have access to this table" said to a
-- person who has access to the table — or this file raises.
--
-- Same use case as the green half: Greenline Landscaping Crew's `jobs` Table, its crew
-- lead Dev Okonkwo at viewer and then at editor.
--
-- Run: <scratchpad>/q.sh -v ON_ERROR_STOP=1 -f scripts/campaign-tests/tails_the_ladder_names_the_level_red.sql

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
set local statement_timeout = '600s';

-- ── THE PRE-FIX BODY, PUT BACK ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.assert_client_may_change(p_organization_id uuid, p_subject_id uuid, p_door text, p_required permission_level DEFAULT 'editor'::permission_level, p_subject_word text DEFAULT 'record'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid;
  v_subject_org uuid;
begin
  -- ONE order, always: the organization wall first, then the row. A door that asked about
  -- the row first would answer "you may not touch this record" to somebody who should have
  -- been told they are in the wrong organization entirely.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- Way through 1: the role that owns the store (every campaign and server lane).
  if custom.query_is_store_owner() then
    return;
  end if;

  if p_subject_id is null then
    return;
  end if;

  -- Way through 2: no signed-in person at all — the anonymous capture door, which has
  -- already decided this write against the form's own token.
  v_me := custom.query_principal();
  if v_me is null then
    return;
  end if;

  -- Way through 3: a subject that does not live in this organization (the kernel Tables),
  -- or that is not there at all (the door raises its own 02000 a line later).
  select r.organization_id into v_subject_org
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_subject_id;
  if v_subject_org is null then
    return;
  end if;

  if custom.has_visibility(v_me, 'record', p_subject_id, p_required) then
    return;
  end if;

  raise exception 'You do not have access to this %, so % may not write to it.',
    coalesce(nullif(btrim(p_subject_word), ''), 'record'),
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = format(
            'DOOR-1 decides reading and writing with the SAME question: a %s you may not open is a %s you may not change. This needs the %s level (viewer < commenter < editor < admin) - ask whoever holds it to share it with you, or ask an owner of this organization. Being a member of the organization is not by itself permission to rewrite somebody else''s row.',
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            coalesce(nullif(btrim(p_subject_word), ''), 'record'),
            p_required);
end
$function$

;

do $red$
declare
  c_marisol   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dev       constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_marisol_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dev_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org       uuid := gen_random_uuid();
  v_yard      uuid;
  v_jobs      uuid;
  v_txt       text;
  v_red       integer := 0;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Greenline Landscaping Crew ' || left(v_org::text, 8),
          'greenline-landscaping-' || left(v_org::text, 8), c_marisol);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_marisol, 'owner',  'active', c_marisol),
         (v_org, 'organization', v_org, c_dev,     'member', 'active', c_marisol);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'tails_ladder_red', c_marisol);

  perform set_config('app.actor_system', 'campaign-test/tails_the_ladder_names_the_level_red.sql', true);
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform set_config('role', 'authenticated', true);

  v_yard := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Greenline Yard', 'description', 'the shop on Fescue Lane', '_actor', 'user'));
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Jobs', 'slug', 'jobs', 'description', 'one row per scheduled job, priced and routed',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'job_number', 'direction', 'asc')),
      'label_singular', 'Job', 'label_plural', 'Jobs', 'title_field', 'job_number',
      'fields', jsonb_build_array(jsonb_build_object('name', 'job_number')),
      'parent_id', v_yard));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Job Number', 'key', 'job_number', 'type', 'text', 'required', true));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'job_number', 'GL-1043', '_actor', 'user'));

  -- ── RED 1 — A VIEWER IS TOLD HE HAS NO ACCESS TO A TABLE HE CAN OPEN ──────────────
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  begin
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Gate Code', 'key', 'gate_code', 'type', 'text'));
    raise exception 'RED 1 DID NOT GO RED: a viewer added a column to Jobs';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  if v_txt not like '%do not have access to this table%' then
    raise exception 'RED 1 DID NOT GO RED: the pre-fix body is not in place — it said "%"', v_txt;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 — the old body tells a VIEWER of Jobs: "%"', v_txt;

  -- ── RED 2 — AND AN EDITOR, WHO WRITES INTO IT ALL DAY, THE SAME THING ─────────────
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform custom.share_grant(v_org, v_jobs, 'person', c_dev, 'editor'::public.permission_level);
  perform set_config('request.jwt.claims', c_dev_j, true);
  begin
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('label', 'Gate Code', 'key', 'gate_code', 'type', 'text'));
    raise exception 'RED 2 DID NOT GO RED: an editor added a column to Jobs';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  if v_txt not like '%do not have access to this table%' then
    raise exception 'RED 2 DID NOT GO RED: the pre-fix body is not in place — it said "%"', v_txt;
  end if;
  if v_txt like '%editor%' then
    raise exception 'RED 2 DID NOT GO RED: the old sentence already named the rung, so there was nothing to fix';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 2 — the old body tells an EDITOR of Jobs the same thing: "%"', v_txt;

  if v_red <> 2 then
    raise exception 'only % of 2 blocks are RED', v_red;
  end if;
  raise notice '% of 2 blocks are RED — the sentence the fix deletes is exactly this one', v_red;
end;
$red$;

rollback;
