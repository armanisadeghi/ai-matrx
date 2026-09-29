-- lane: access-ladder T-35f — ops.system_error is platform machinery: owned by the system organization, one write door.
-- based-on: iam.entity_read_kernel_expected() fa488ae0cddae45bde2d77d0afaaba43cbe2be5d48f0f5aa12918efdc12594d3
-- based-on: iam.entity_read_kernel_members_expected() f84422fa1500ee3b1e87f1cc8810700346422bf0375b4d3d40c1434a780e48b6
-- based-on: platform._report_undeclared_confirmation_write(oid, uuid, uuid) 225293fb0464fe543d9f2a4b2384d7aaad463e06c2be032da95aac303ea61b79
-- based-on: platform._provisioner_refuses_a_stale_kernel(jsonb, jsonb, text, uuid, text) 326c4e7bd365993804fa4a6c10140e191ce972698dfee49e07c7ff95fb157085
-- based-on: platform._provisioner_heals_a_stale_kernel(jsonb, jsonb, text, uuid, text) f82af02ad7c7edc519be51b4a962144d8d405c1b7e3036f237e52d8b6bffee32
-- based-on: public.log_client_error(text, text, text, text, text, text, uuid, text, jsonb, jsonb, uuid, text) 6c9b31772ff136f987838d5583e5aacf4950c8cc371ffa1fb3391eddd9f9a66c
--
-- Owner ruling (via the access-ladder coordinator, 2026-09-28): ops.system_error is the platform's own
-- error log. Members read nothing; the admin apps read everything (platform_admin_read /
-- platform_admin_all, the admin lane). Every row is owned by the system organization; the organization
-- an error happened in moves to a real column, occurred_in_organization_id.
--   1. occurred_in_organization_id added.
--   2. (No trigger: the platform refuses any trigger that assigns organization_id. Every writer names the
--      system organization, through the door below or explicitly.)
--   3. ops.record_system_error(jsonb) — THE door for every writer that is not the server itself. It never
--      fails: a row the table refuses is recorded as kind 'system_error_write_refused' with the reason.
--      The three writers that ran as the signed-in person and public.log_client_error now call it.
--   4. Registered as machinery (the generator refuses machinery); the four generated std_* policies are
--      removed straight after (see the note at the end), leaving the admin lane, the service role and the
--      archived-organization gate.
-- Existing rows move in batches afterwards (register T-35f), each an UPDATE the trigger completes.
set local lock_timeout = '2s';

alter table ops.system_error add column if not exists occurred_in_organization_id uuid;
comment on column ops.system_error.occurred_in_organization_id is
  'The organization this error happened in (the row itself is owned by the system organization; access ladder T-35f). Null when it happened in no organization or in the platform itself.';



create or replace function ops.record_system_error(p_error jsonb)
returns uuid
language plpgsql volatile security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_e    jsonb := coalesce(p_error, '{}'::jsonb);
  v_uid  uuid := auth.uid();
  v_user uuid;
  v_org  uuid;
  v_ctx  jsonb;
  v_id   uuid;
  v_why  text;
  v_sys  uuid;
begin
  select s.organization_id into v_sys from iam.system_orgs s where s.key = 'system';
  v_org  := coalesce(nullif(v_e->>'occurred_in_organization_id', '')::uuid, nullif(v_e->>'organization_id', '')::uuid);
  if v_org = v_sys then v_org := null; end if;  -- happened in the platform itself
  v_user := nullif(v_e->>'user_id', '')::uuid;
  v_ctx  := case when jsonb_typeof(v_e->'context') = 'object' then v_e->'context' else '{}'::jsonb end;
  -- A signed-in caller records errors as itself; a different person it named is kept, in words.
  if v_uid is not null and v_user is not null and v_user is distinct from v_uid then
    v_ctx := v_ctx || jsonb_build_object('declared_user_id', v_user);
    v_user := v_uid;
  end if;
  begin
    insert into ops.system_error (id, kind, request_id, user_id, conversation_id, agent_id, source_app, route,
                                  error_type, error_text, traceback, payload, context, occurred_at,
                                  organization_id, occurred_in_organization_id, created_by, metadata, source_feature)
    values (coalesce(nullif(v_e->>'id', '')::uuid, gen_random_uuid()),
            coalesce(nullif(v_e->>'kind', ''), 'unclassified'),
            v_e->>'request_id', v_user,
            nullif(v_e->>'conversation_id', '')::uuid, nullif(v_e->>'agent_id', '')::uuid,
            v_e->>'source_app', v_e->>'route', v_e->>'error_type',
            coalesce(nullif(v_e->>'error_text', ''), '(no message)'),
            v_e->>'traceback', v_e->'payload', v_ctx,
            coalesce(nullif(v_e->>'occurred_at', '')::timestamptz, now()),
            v_sys, v_org,
            coalesce(nullif(v_e->>'created_by', '')::uuid, v_uid, v_user),
            case when jsonb_typeof(v_e->'metadata') = 'object' then v_e->'metadata' else '{}'::jsonb end,
            v_e->>'source_feature')
    returning id into v_id;
  exception when others then
    -- Nothing fails silently and no error is lost: the refused row is kept, with why.
    v_why := sqlstate || ': ' || sqlerrm;
    insert into ops.system_error (kind, error_type, error_text, source_app, route, context, organization_id,
                                  occurred_in_organization_id, created_by)
    values ('system_error_write_refused', 'record_system_error',
            'An error could not be recorded as written (' || v_why || '). What it said is kept in context.original.',
            'database', 'ops.record_system_error',
            jsonb_build_object('original', v_e, 'refusal', v_why),
            v_sys, v_org, v_uid)
    returning id into v_id;
  end;
  return v_id;
end $fn$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
  ('ops', 'record_system_error', 'p_error jsonb', array['jsonb'::regtype]::oid[],
   'p_error is an error row as jsonb; the function makes no access decision about any id in it: the row is owned by the system organization and readable only in the admin apps, a signed-in caller is recorded as itself (a different declared user is kept in context), and a row the table refuses is recorded as system_error_write_refused.',
   'access_ladder_t35f', 'server_only: called from SECURITY DEFINER and trigger-path database functions (public.log_client_error, the provisioner, provenance) — the client door for browsers stays public.log_client_error.', false, false);

comment on function ops.record_system_error(jsonb) is
  'THE door for writing ops.system_error from database code (access ladder T-35f). Never fails: a refused row is kept as system_error_write_refused.';

-- ===== platform._report_undeclared_confirmation_write
CREATE OR REPLACE FUNCTION platform._report_undeclared_confirmation_write(p_relid oid, p_org uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Access ladder T-35f: ops.system_error is platform machinery; every error write goes through its one door.
  perform ops.record_system_error(jsonb_build_object(
    'kind', 'provenance',
    'error_type', 'undeclared_actor_on_admitted_table',
    'error_text', format(
      'A write to %s was born unconfirmed because the door that made it declared no actor. '
      || 'This is a defect in that door: a server path must declare app.actor_tier before it writes '
      || 'to a table admitted to the confirmation rule. The row is honest in the meantime.',
      p_relid::regclass::text),
    'source_app', 'database',
    'source_feature', 'provenance',
    'route', p_relid::regclass::text,
    'organization_id', p_org,
    'user_id', p_user,
    'created_by', p_user,
    'context', jsonb_build_object('relation', p_relid::regclass::text, 'session_role', current_user,
                       'register', 'DD-131')));
end
$function$;

-- ===== platform._provisioner_refuses_a_stale_kernel
CREATE OR REPLACE FUNCTION platform._provisioner_refuses_a_stale_kernel(p_spec jsonb, p_pre jsonb, p_applied_via text, p_org_id uuid, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_live     jsonb := iam.entity_read_kernel_members_live();
  v_snap     jsonb := iam.entity_read_kernel_members_expected();
  v_rec      jsonb := coalesce(v_snap->'members', '{}'::jsonb);
  v_fp_live  text  := iam.entity_read_kernel_fingerprint();
  v_fp_rec   text  := iam.entity_read_kernel_expected();
  v_moved    text[];
  v_target   text;
  v_org      uuid;
  v_uid      uuid := auth.uid();
  v_msg      text;
  v_remedy   text;
  v_id       uuid;
begin
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_moved from (
    select k || case when v_rec ? k then '' else ' (added)' end as k
      from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k || ' (removed)' from jsonb_object_keys(v_rec) k where not v_live ? k
  ) s;

  v_target := case
    when jsonb_typeof(p_spec->'tables') = 'array' then
      format('a batch of %s table(s) (%s)', jsonb_array_length(p_spec->'tables'),
             (select string_agg(coalesce(t->>'schema', '?') || '.' || coalesce(t->>'table', '?'), ', ')
                from jsonb_array_elements(p_spec->'tables') t))
    else coalesce(p_spec->>'schema', '?') || '.' || coalesce(p_spec->>'table', '?') end;

  v_org := coalesce(p_org_id,
                    (select so.organization_id from iam.system_orgs so where so.key = 'system'));

  v_msg := format(
    'The provisioner refused %s (token %s, via %s, lane %s): the access kernel''s recorded fingerprint is stale. '
    'The live kernel bodies hash to %s; iam.entity_read_kernel_expected() records %s. '
    'Moved since the recorded member snapshot%s: %s. Nothing was written.',
    v_target, coalesce(p_spec->>'token', '(none)'), coalesce(p_applied_via, '?'), coalesce(p_lane, '?'),
    v_fp_live, v_fp_rec,
    case when (v_snap->>'fingerprint') is distinct from v_fp_rec
         then format(' (which belongs to fingerprint %s, not the recorded %s)', coalesce(v_snap->>'fingerprint', 'none'), v_fp_rec)
         else '' end,
    case when cardinality(v_moved) = 0 then 'none named — the snapshot matches the live bodies, so the expectation itself is what moved'
         else array_to_string(v_moved, ', ') end);

  v_remedy :=
    'A campaign file that changes a fingerprinted body re-records in the SAME file: prove the read lane with aidream '
    'uv run python scripts/_verify_entity_read_equivalence.py (0 lost), then replace iam.entity_read_kernel_expected() '
    'with the live iam.entity_read_kernel_fingerprint() and iam.entity_read_kernel_members_expected() with '
    'jsonb_build_object(''fingerprint'', <that value>, ''members'', iam.entity_read_kernel_members_live()), refresh aidream '
    'db/entity_read_kernel_members.json, run pnpm check:store-doors-decide and select platform.provision_selfcheck(false), '
    'then call platform.provision again with the same spec. Worked example: matrx-frontend '
    'migrations/campaign/kerneltails_the_kernel_fingerprint_names_the_comment_ruling.sql.';

  -- lane PROVISIONER-SELF-HEAL (2026-09-25): the provisioner tried to re-record the fingerprint
  -- itself first, and the kernel's equivalence self-check did NOT answer identically on its
  -- fixed fixture. So this is a real change in what the kernel answers, and a person decides.
  if p_pre ? 'equivalence' then
    v_msg := v_msg || format(
      ' The kernel equivalence self-check ran first (fixture %s, %s answers, %s ms) and did NOT answer identically: '
      '%s lost, %s gained, %s missing%s%s. So the fingerprint was NOT re-recorded automatically.',
      coalesce(p_pre->'equivalence'->>'version', '?'), coalesce(p_pre->'equivalence'->>'answers', '?'),
      coalesce(p_pre->'equivalence'->>'ms', '?'), coalesce(p_pre->'equivalence'->>'lost', '?'),
      coalesce(p_pre->'equivalence'->>'gained', '?'), coalesce(p_pre->'equivalence'->>'missing', '?'),
      coalesce('; the fixture could not be built: ' || (p_pre->'equivalence'->>'error'), ''),
      case when jsonb_typeof(p_pre->'equivalence'->'differed') = 'array'
           then '; first: ' || (select string_agg(x, '; ') from jsonb_array_elements_text(p_pre->'equivalence'->'differed') x)
           else '' end);
    v_remedy := 'The kernel no longer answers what it answered when its fingerprint was recorded, so this needs a person. '
      || 'If the change is BY RULING: ' || v_remedy
      || ' In the SAME file re-derive platform.kernel_equivalence_expected() from select platform.kernel_equivalence_answers() '
      || '(bump the fixture version if the world changed). If it is NOT by ruling, restore the body the row names.';
  end if;

  -- Access ladder T-35f: ops.system_error is platform machinery; every error write goes through its one door.
  v_id := ops.record_system_error(jsonb_build_object(
    'kind', 'provisioner_fingerprint_stale',
    'error_type', 'preflight.read_kernel',
    'error_text', v_msg || ' Remedy: ' || v_remedy,
    'source_app', 'database',
    'source_feature', 'provisioning',
    'route', 'platform.provision',
    'organization_id', v_org,
    'user_id', v_uid,
    'created_by', v_uid,
    'context', jsonb_build_object('target', v_target, 'token', p_spec->>'token', 'applied_via', p_applied_via,
                             'lane', p_lane, 'organization_id', p_org_id,
                             'fingerprint_live', v_fp_live, 'fingerprint_recorded', v_fp_rec,
                             'snapshot_fingerprint', v_snap->>'fingerprint',
                             'moved', to_jsonb(v_moved), 'findings', p_pre->'findings',
                             'equivalence', p_pre->'equivalence',
                             'session_role', current_user, 'remedy', v_remedy)));

  raise warning '%', v_msg using hint = v_remedy;

  return jsonb_build_object(
    'ok', false, 'refused', true, 'rule_id', 'preflight.read_kernel',
    'kind', 'provisioner_fingerprint_stale', 'token', p_spec->>'token',
    'message', v_msg, 'hint', v_remedy, 'moved', to_jsonb(v_moved),
    'findings', p_pre->'findings', 'equivalence', p_pre->'equivalence', 'system_error_id', v_id);
end;
$function$;

-- ===== platform._provisioner_heals_a_stale_kernel
CREATE OR REPLACE FUNCTION platform._provisioner_heals_a_stale_kernel(p_spec jsonb, p_pre jsonb, p_applied_via text, p_org_id uuid, p_lane text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c_ruling  constant text := 'auto re-recorded after equivalence passed';
  v_fp_from text;
  v_fp_to   text;
  v_live    jsonb;
  v_rec     jsonb;
  v_moved   text[];
  v_check   jsonb;
  v_target  text;
  v_org     uuid;
  v_uid     uuid := auth.uid();
  v_msg     text;
  v_rid     uuid;
  v_eid     uuid;
  v_out     jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  v_fp_from := iam.entity_read_kernel_expected();
  v_fp_to   := iam.entity_read_kernel_fingerprint();
  if v_fp_to is not distinct from v_fp_from then
    return jsonb_build_object('healed', true, 'already', true, 'fingerprint', v_fp_to);
  end if;

  v_check := platform.kernel_equivalence_check();
  if not coalesce((v_check->>'ok')::boolean, false) then
    return jsonb_build_object('healed', false, 'equivalence', v_check);
  end if;

  v_live := iam.entity_read_kernel_members_live();
  v_rec  := coalesce(iam.entity_read_kernel_members_expected()->'members', '{}'::jsonb);
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_moved from (
    select k || case when v_rec ? k then '' else ' (added)' end as k
      from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k || ' (removed)' from jsonb_object_keys(v_rec) k where not v_live ? k
  ) s;

  -- The same two bodies a campaign file writes by hand (kerneltails_the_kernel_fingerprint_names_the_comment_ruling.sql).
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::text
$f$$ddl$, v_fp_to);
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::jsonb
$f$$ddl$, jsonb_build_object('fingerprint', v_fp_to, 'members', v_live)::text);

  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'platform._provisioner_heals_a_stale_kernel: re-recorded % but the live fingerprint now reads %.',
      iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;

  v_target := case
    when jsonb_typeof(p_spec->'tables') = 'array' then
      format('a batch of %s table(s) (%s)', jsonb_array_length(p_spec->'tables'),
             (select string_agg(coalesce(t->>'schema', '?') || '.' || coalesce(t->>'table', '?'), ', ')
                from jsonb_array_elements(p_spec->'tables') t))
    else coalesce(p_spec->>'schema', '?') || '.' || coalesce(p_spec->>'table', '?') end;
  v_org := coalesce(p_org_id, (select so.organization_id from iam.system_orgs so where so.key = 'system'));

  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_fp_from, v_fp_to, v_moved, c_ruling, v_check->>'version', v_check,
          coalesce(p_applied_via, '?') || ' / lane ' || coalesce(p_lane, '?'), v_target)
  returning id into v_rid;

  v_msg := format(
    'The access kernel''s recorded fingerprint was stale when the provisioner was asked for %s (token %s, via %s, lane %s): '
    'the live kernel bodies hash to %s, the recorded value was %s. Changed: %s. '
    'The kernel equivalence self-check ran on its fixed fixture (%s, %s answers, %s ms): %s of %s tables identical on the read lane, '
    '0 lost, 0 gained, every access level identical. So the provisioner re-recorded the fingerprint itself (%s; platform.kernel_fingerprint_record %s) and provisioned.',
    v_target, coalesce(p_spec->>'token', '(none)'), coalesce(p_applied_via, '?'), coalesce(p_lane, '?'),
    v_fp_to, v_fp_from,
    case when cardinality(v_moved) = 0 then 'no member named (only the expectation moved)' else array_to_string(v_moved, ', ') end,
    v_check->>'version', v_check->>'answers', v_check->>'ms',
    v_check->'read_lane'->>'identical', v_check->'read_lane'->>'tables',
    c_ruling, v_rid);

  -- Access ladder T-35f: ops.system_error is platform machinery; every error write goes through its one door.
  v_eid := ops.record_system_error(jsonb_build_object(
    'kind', 'kernel_fingerprint_auto_rerecorded',
    'error_type', 'preflight.read_kernel',
    'error_text', v_msg || ' Look at it: the file that changed these bodies re-recorded nothing. If the change was by ruling, '
                || 'nothing is owed but refreshing aidream db/entity_read_kernel_members.json; if it was not meant to change '
                || 'the kernel at all, find it with pnpm db:body-drift and say so to its lane.',
    'source_app', 'database',
    'source_feature', 'provisioning',
    'route', 'platform.provision',
    'organization_id', v_org,
    'user_id', v_uid,
    'created_by', v_uid,
    'context', jsonb_build_object('target', v_target, 'token', p_spec->>'token', 'applied_via', p_applied_via,
                             'lane', p_lane, 'organization_id', p_org_id,
                             'fingerprint_from', v_fp_from, 'fingerprint_to', v_fp_to,
                             'moved', to_jsonb(v_moved), 'ruling', c_ruling, 'record_id', v_rid,
                             'equivalence', v_check, 'session_role', current_user)));
  update platform.kernel_fingerprint_record set system_error_id = v_eid where id = v_rid;

  raise warning '%', v_msg;

  v_out := jsonb_build_object('healed', true, 'already', false, 'auto_rerecorded', true,
                              'ruling', c_ruling, 'fingerprint_from', v_fp_from, 'fingerprint_to', v_fp_to,
                              'moved', to_jsonb(v_moved), 'record_id', v_rid, 'system_error_id', v_eid,
                              'equivalence', jsonb_build_object('version', v_check->'version', 'answers', v_check->'answers',
                                                                'ms', v_check->'ms', 'read_lane_tables', v_check->'read_lane'->'tables',
                                                                'read_lane_identical', v_check->'read_lane'->'identical',
                                                                'lost', v_check->'lost', 'gained', v_check->'gained'));
  -- The provision answer carries it (platform._provision_says_the_kernel_was_rerecorded).
  perform set_config('matrx.kernel_rerecorded', v_out::text, true);
  return v_out;
end;
$function$;

-- ===== public.log_client_error
CREATE OR REPLACE FUNCTION public.log_client_error(p_source_app text, p_source text, p_message text, p_code text DEFAULT NULL::text, p_route text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text, p_conversation_id uuid DEFAULT NULL::uuid, p_stack text DEFAULT NULL::text, p_payload jsonb DEFAULT NULL::jsonb, p_context jsonb DEFAULT NULL::jsonb, p_organization_id uuid DEFAULT NULL::uuid, p_source_feature text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_source_apps constant text[] := array[
    'matrx-frontend',
    'matrx-extend',
    'matrx-local',
    'matrx-mobile'
  ];
  -- The client analogue of the server's 'server-door': registered, filterable,
  -- and never silent. It is stamped when a caller names no feature at all.
  c_unmapped_feature constant text := 'client-unmapped';
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
  v_feature text := lower(btrim(coalesce(p_source_feature, '')));
  v_id      uuid;
begin
  if p_source_app is null or not (p_source_app = any (c_source_apps)) then
    raise exception
      'log_client_error was called with source app %, which is not one of the client apps this platform knows about (%). The error was NOT recorded. Pass the name of the app that produced the error, exactly as written in that list; if this really is a new client app, add it to the closed list in a migration first.',
      coalesce(quote_literal(p_source_app), 'nothing at all'),
      array_to_string(c_source_apps, ', ')
      using errcode = '22023';
  end if;

  if v_feature = '' then
    v_feature := c_unmapped_feature;
    v_context := v_context || jsonb_build_object(
      'source_feature_note',
      'This client named its app but no feature, so the row carries the '
      || 'client-unmapped sentinel. Either the calling build predates '
      || 'p_source_feature, or that client could not map the failing surface to '
      || 'a registered feature. Add the surface to that client''s map.'
    );
  elsif v_feature !~ '^[a-z0-9][a-z0-9_:./-]{0,190}$' then
    raise exception
      'log_client_error was called with source feature %, which is not the shape of a feature slug (lowercase letters, digits, and _ : . / - , starting with a letter or digit, at most 191 characters). The error was NOT recorded. Pass a feature registered in source_attribution.SOURCE_FEATURES, or pass nothing and the row will be marked %.',
      quote_literal(p_source_feature), quote_literal(c_unmapped_feature)
      using errcode = '22023';
  end if;

  if p_organization_id is not null then
    if auth.role() = 'service_role' then
      v_org := p_organization_id;
    elsif v_user is null
       or not coalesce(iam.has_org_access(p_organization_id), false) then
      raise exception
        'log_client_error refused the explicit organization. The current identity is not admitted to that organization, so the error was NOT recorded. Refresh organization context and retry with an organization the current identity may access.'
        using errcode = '42501';
    else
      v_org := p_organization_id;
    end if;
  else
    -- A caller that names no organization is recorded in the system capture lane; no
    -- organization of the person's is chosen for them.
    if v_org is null then
      select s.organization_id into v_org
      from iam.system_orgs s
      join iam.organizations o on o.id = s.organization_id
      where o.slug = 'matrx-system'
      limit 1;
    end if;
  end if;

  if v_org is null then
    v_context := v_context || jsonb_build_object(
      'organization_note',
      'No organization was supplied for this client error and the matrx-system organization did not resolve. The error was recorded anyway rather than discarded; whatever organization this row carries was attributed by the database capture stamp (ops._stamp_capture_org), not by the client.'
    );
  end if;

  -- Access ladder T-35f: ops.system_error is platform machinery; every error write goes through its one door.
  v_id := ops.record_system_error(jsonb_build_object(
    'id', gen_random_uuid(),
    'kind', coalesce(nullif(p_source, ''), 'client-error'),
    'source_app', p_source_app,
    'source_feature', v_feature,
    'error_type', p_code,
    'error_text', coalesce(nullif(p_message, ''), '(no message)'),
    'route', p_route,
    'request_id', p_request_id,
    'conversation_id', p_conversation_id,
    'traceback', p_stack,
    'payload', p_payload,
    'context', v_context,
    'user_id', v_user,
    'created_by', v_user,
    'organization_id', v_org,
    'occurred_at', now(),
    'created_at', now()));

  return v_id;
end;
$function$;


update platform.entity_types
   set audit_class = 'machinery', type = 'system', custom_fields_enabled = false, default_list_scope = null,
       audit_class_reason = 'Access ladder T-35f (2026-09-28, owner ruling via the access-ladder coordinator): the platform''s own error log. Owned by the system organization, read only in the admin apps (admin lane), written by the server and through ops.record_system_error; the organization an error happened in is occurred_in_organization_id.'
 where token = 'system_error' and is_active;

-- The four generated std_* policies are removed right after this file, outside it (a DROP is refused in
-- a migration file), through iam.take_sign_in_freeze, one statement per transaction; see register T-35f.

