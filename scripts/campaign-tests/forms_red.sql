-- scripts/campaign-tests/forms_red.sql — the RED twin of forms_green.sql.
--
-- It puts lane FORMS' three defects BACK, inside a transaction it rolls back, and asserts
-- that each one returns. A guard nobody has watched fail is not a guard.
--
-- The bodies planted below are the REAL bytes that were live before this lane, not a
-- paraphrase: the envelope read in `custom.anon_clear`, its `_actor 'anonymous'`, and
-- `custom.form_public` aggregating `f.data` with no id. The third defect — no
-- `custom.rule_declare` at all — is put back by writing the subscription Rule the only way
-- a client had before it existed.
--
-- Ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- ── RED 1 and 2: the accept Rule's envelope, and the word `anonymous` ─────────────
create or replace function custom.anon_clear(p_organization_id uuid, p_submission_id uuid)
returns uuid language plpgsql security definer set search_path to 'pg_catalog' as $fn$
declare v_sub custom.anon_submission; v_form custom.anon_form; v_answer jsonb; v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_clear');
  select * into v_sub from custom.anon_submission
   where organization_id = p_organization_id and id = p_submission_id;
  if not found then return null; end if;
  if v_sub.state <> 'quarantined' then return v_sub.record_id; end if;
  select * into v_form from custom.anon_form
   where organization_id = p_organization_id and id = v_sub.form_id;
  if v_form.quarantine_rule_id is null then return null; end if;
  v_answer := custom.rule_run(p_organization_id, v_form.quarantine_rule_id, v_sub.payload,
                              jsonb_build_object('source', v_sub.source, 'origin', v_sub.remote_origin,
                                                 'form_id', v_sub.form_id));
  -- THE DEFECT: the ENVELOPE, not its `answer`. custom.rule_truth answers NULL for
  -- anything that is not a JSON boolean, so this is false for every Rule that ever existed.
  if not coalesce(custom.rule_truth(v_answer), false) then
    update custom.anon_submission
       set state = 'rejected',
           rejection_reason = coalesce(v_answer ->> 'why', 'The form''s rule did not admit this submission.')
     where organization_id = p_organization_id and id = p_submission_id;
    return null;
  end if;
  -- AND THE SECOND: `anonymous` is not in custom.actor_vocabulary(), and there is no
  -- principal here at all, so the organization wall refuses before the word even matters.
  v_id := custom.record_write(p_organization_id, v_sub.table_id,
                              v_sub.payload || jsonb_build_object('_actor', 'anonymous'));
  update custom.anon_submission
     set state = 'cleared', record_id = v_id, cleared_at = now(),
         cleared_by_rule_id = v_form.quarantine_rule_id
   where organization_id = p_organization_id and id = p_submission_id;
  return v_id;
end; $fn$;

-- ── RED 3: the public face hands out Fields with no identity ──────────────────────
create or replace function custom.form_public(p_form_id uuid)
returns table(form_id uuid, organization_id uuid, table_id uuid, title text,
              presentation jsonb, fields jsonb, honeypot_key text, state text, message text)
language plpgsql stable security definer set search_path to 'pg_catalog' as $fn$
declare v_f custom.anon_form; v_fields jsonb;
begin
  if p_form_id is null then return; end if;
  select * into v_f from custom.anon_form where id = p_form_id and deleted_at is null;
  if not found then return; end if;
  if not custom.store_is_open(v_f.organization_id) then return; end if;
  if v_f.published_at is null then return; end if;
  -- THE DEFECT: f.data alone. Every other reader of a Field on this platform builds
  -- `{id, ...data}`; these were the only Fields arriving without one.
  select coalesce(jsonb_agg(f.data order by ord), '[]'::jsonb) into v_fields
    from jsonb_array_elements_text(v_f.exposed_field_keys) with ordinality k(key, ord)
    join custom.record f
      on f.organization_id = v_f.organization_id and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_f.table_id and f.data ->> 'key' = k.key;
  form_id := v_f.id; organization_id := v_f.organization_id; table_id := v_f.table_id;
  title := coalesce(v_f.title, 'Form'); presentation := v_f.presentation; fields := v_fields;
  honeypot_key := v_f.honeypot_key; state := 'open'; message := null;
  return next;
end; $fn$;

-- ── RED 5: the mute is not read, so "switched off" is a screen telling a lie ──────
--
-- 🚨 DERIVED FROM THE LIVE BODY (lane RED-SUITES-3, 2026-09-21). This block used to carry a
-- hand-typed copy of `custom.agg_subscriptions`, and the live door has grown THREE columns
-- since (`table_id`, `quiet_hours`, and a normalised cadence on both sides of the filter,
-- RED-SUITES-2), so the plant collided with it before anything was proved:
--     ERROR:  cannot change return type of existing function
--     HINT:   Use DROP FUNCTION custom.agg_subscriptions(uuid,uuid,text) first.
-- A red twin that carries a snapshot of a door is a red twin that stops planting the moment
-- the door moves. This takes the LIVE bytes, deletes exactly the one line that reads the
-- mute, and refuses BY NAME if that line is not there to delete — so it can never again
-- quietly plant a body that differs from the shipped one in more ways than the defect.
do $plant_red5$
declare
  v_def  text;
  v_line constant text :=
    '     and coalesce((r.data -> ''subscription'' ->> ''muted'')::boolean, false) = false' || E'\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'agg_subscriptions';
  if v_def is null then
    raise exception 'RED 5 precondition: custom.agg_subscriptions does not exist, so there is no mute arm to take out';
  end if;
  if position(v_line in v_def) = 0 then
    raise exception 'RED 5 precondition: the live custom.agg_subscriptions no longer carries the mute arm this twin removes, so this plant would prove nothing. Re-derive it from the live body before trusting anything below.';
  end if;
  execute replace(v_def, v_line, '');
end
$plant_red5$;

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid; v_table uuid; v_f_name uuid; v_accept uuid; v_bad_rule uuid;
  v_form    uuid; v_state text; v_rec uuid; v_n bigint; v_row record; v_red int := 0;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Rincon Plumbing Co Red ' || left(v_org::text, 8), 'rincon-plumbing-red-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'forms_red.sql', c_admin);
  perform set_config('app.actor_system', 'campaign-test/forms_red.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Red Patients', 'slug', 'red_patients', 'description', 'the red twin''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'full_name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Patient', 'label_plural', 'Patients',
      'title_field', 'full_name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'full_name')), 'parent_id', v_home));
  v_f_name := custom.field_declare(v_org, v_table,
                jsonb_build_object('label', 'full name', 'key', 'full_name', 'type', 'text', 'required', true));
  v_accept := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'the answer is there', 'kind', 'predicate', 'uses', jsonb_build_array('validate'),
      'scope_table_id', v_table, 'applies_to_types', '[]'::jsonb,
      'expr', jsonb_build_object('op', 'present', 'args', jsonb_build_array(jsonb_build_object('field', v_f_name)))));
  v_form := custom.form_declare(v_org, v_table, 'Red intake',
      jsonb_build_array(jsonb_build_object('field', 'full_name', 'required', true)),
      '{}'::jsonb, null, v_accept, null);
  perform custom.anon_publish(v_org, v_form, true);

  -- ── RED 1: a perfectly good answer is REJECTED, because the envelope is not a boolean
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
  select s.state, s.record_id into v_state, v_rec
    from custom.form_submit(v_form, 'https://www.aimatrx.com', '{"full_name":"Dana Reyes"}'::jsonb, 'red') s;
  if v_state = 'accepted' and v_rec is not null then
    raise exception 'RED 1 IS NOT RED: the old anon_clear cleared a submission';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 1 IS RED — a complete answer read state=%, record=% (the accept Rule''s envelope is not a boolean, so every submission is refused)', v_state, v_rec;

  select s.rejection_reason into v_state from custom.anon_submission s
   where s.organization_id = v_org order by s.created_at desc limit 1;
  raise notice '         and the sender was told: "%"', v_state;

  -- ── RED 2: even if it HAD cleared, the write is refused — no principal, and a word
  --    the store does not know. Proven directly, since RED 1 stops it getting that far.
  begin
    perform custom.record_write(v_org, v_table, '{"full_name":"X","_actor":"anonymous"}'::jsonb);
    raise exception 'RED 2 IS NOT RED: a record was written with no principal and the word "anonymous"';
  exception when others then
    get stacked diagnostics v_state = message_text;
    v_red := v_red + 1;
    raise notice 'RED 2 IS RED — "%"', left(v_state, 110);
  end;

  -- ── RED 3: a public Field with no id
  select * into v_row from custom.form_public(v_form);
  if (v_row.fields -> 0 ->> 'id') is not null then
    raise exception 'RED 3 IS NOT RED: the old form_public carried an id';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 3 IS RED — the public face hands out a Field with keys % and no id',
               (select string_agg(k, ',') from jsonb_object_keys(v_row.fields -> 0) k where k in ('key','label','type'));

  -- ── RED 4: no custom.rule_declare — a subscription written the only other way is
  --    invisible to DOOR-18, so nobody is ever told.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  v_bad_rule := custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
      'name', 'written as a plain record', 'kind', 'predicate',
      'uses', jsonb_build_array('membership'), 'scope_table_id', v_table,
      'applies_to_types', '[]'::jsonb, 'expr', jsonb_build_object('const', true),
      'subscription', jsonb_build_object('saved_view_id', null, 'cadence', 'immediate',
                                         'channel', 'in_app', 'recipient_user_id', c_admin,
                                         'event_key', 'custom.form.response')));
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.agg_subscriptions(v_org, null, 'immediate') s where s.rule_id = v_bad_rule;
  if v_n <> 0 then
    raise exception 'RED 4 IS NOT RED: a Rule written with record_write was visible to agg_subscriptions';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 IS RED — a valid subscription Rule written the only way a client had before custom.rule_declare is invisible to DOOR-18 (% rows), so nobody is ever told', v_n;

  -- ── RED 5: a muted subscription still fires
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  v_bad_rule := custom.rule_declare(v_org, jsonb_build_object(
      'name', 'muted and still shouting', 'kind', 'predicate',
      'uses', jsonb_build_array('membership'), 'scope_table_id', v_table,
      'applies_to_types', '[]'::jsonb, 'expr', jsonb_build_object('const', true),
      'subscription', jsonb_build_object('saved_view_id', null, 'cadence', 'immediate',
                                         'channel', 'in_app', 'recipient_user_id', c_admin,
                                         'event_key', 'custom.form.response', 'muted', true)));
  perform set_config('role', v_boss, true);
  select count(*) into v_n from custom.agg_subscriptions(v_org, null, 'immediate') s where s.rule_id = v_bad_rule;
  if v_n <> 1 then
    raise exception 'RED 5 IS NOT RED: the old agg_subscriptions dropped a muted subscription';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 IS RED — a subscription somebody switched off is still live to DOOR-18''s reader (% row), so "off" would be a screen telling a lie', v_n;

  raise notice -- Wording corrected by lane RED-SUITES-3, 2026-09-21: a block that flipped is a defect PUT
  -- BACK by this twin's own plants, not one that is gone.
  '% of 5 blocks are RED — every defect the green suite closes was planted again and observed', v_red;
end;
$red$;

rollback;
