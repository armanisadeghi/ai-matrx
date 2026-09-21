-- The fixture `scripts/campaign-tests/w4_agg_red.sql` rebuilds after each ROLLBACK, so every
-- break starts from the same GREEN state. Not a migration, not run on its own.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A fixture asserts nothing, so nothing here is a
-- product clause — but what it BUILDS decides what the suite that includes it can prove. Built
-- as the role that owns `custom.record`, every Table, record, Rule and knob could take a shape
-- no signed-in person could ever have produced, and the suite would then be measuring a store
-- state the product cannot reach.
--
-- So it now makes a PERSON's fixture: a disposable organization, a membership for each of the
-- two test accounts, this organization's store switched on, a Home, and then everything a
-- person can make made THROUGH THE DOORS from the seat `authenticated` — the Tables with
-- `custom.table_declare`, the Deals with `custom.record_write`, the two subscriptions with
-- `custom.record_write` onto the Rule kernel. The two steps no client door covers — the
-- global knob table and nothing else here — say so where they happen.
--
-- IT HANDS THE SEAT BACK at the end, deliberately: `w4_agg_red.sql` replaces function bodies
-- between the four rebuilds, and replacing a body is DDL that belongs to the operator.

select set_config('zz.boss', current_user, true);

-- The two guards the store's doors read. A global knob table is an operator surface.
update platform.feature_knob set value = 'true'::jsonb
 where feature = 'custom' and key in ('associations_guard', 'accessible_entity_ids_guard');

do $agg_fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_home  uuid;
  v_deal  uuid;
  v_d1    uuid;
  v_d5    uuid;
  v_open  uuid;
  v_all   uuid;
begin
  perform set_config('app.actor_system', 'campaign.w4_agg.red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Meridian Software', 'meridian-software-' || substr(v_org::text, 1, 8), 'MSW', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w4_agg_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- THE SEAT. Everything below is what a signed-in admin of this Home can actually make.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'agg fixture: the seat was not taken — current_user is %', current_user;
  end if;

  v_deal := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Deals', 'slug', 'deals', 'type', 'entity', 'display', 'list',
    'label_singular', 'Deal', 'label_plural', 'Deals', 'ordered', false, 'weight', 'light',
    'retention_days', 365, 'row_order', 'sorted', 'agent_writable', true,
    'parent_id', v_home::text, 'title_field', 'title', 'default_sort', '[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','title'),
                                jsonb_build_object('name','status'),
                                jsonb_build_object('name','amount'))));

  -- THE FIXTURE, and every expected number in the suite is read straight off it:
  --   open   : 100 + 200 + 700 = 1000 over 3 records
  --   won    : 300 + 400       =  700 over 2 records
  --   lost   : 500             =  500 over 1 record
  --   total  :                   2200 over 6 records
  v_d1 := custom.record_write(v_org, v_deal, '{"title":"D1","status":"open","amount":"100"}'::jsonb);
  perform custom.record_write(v_org, v_deal, '{"title":"D2","status":"open","amount":"200"}'::jsonb);
  perform custom.record_write(v_org, v_deal, '{"title":"D3","status":"won","amount":"300"}'::jsonb);
  perform custom.record_write(v_org, v_deal, '{"title":"D4","status":"won","amount":"400"}'::jsonb);
  v_d5 := custom.record_write(v_org, v_deal, '{"title":"D5","status":"lost","amount":"500"}'::jsonb);
  perform custom.record_write(v_org, v_deal, '{"title":"D6","status":"open","amount":"700"}'::jsonb);

  insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
  values ('Open deals', 'custom/records', v_org,
          jsonb_build_object('table_id', v_deal, 'filters', jsonb_build_object('status', 'open')),
          'internal'::platform.visibility)
  returning id into v_open;

  insert into platform.saved_view (name, surface_key, organization_id, definition, visibility)
  values ('All deals', 'custom/records', v_org,
          jsonb_build_object('table_id', v_deal, 'filters', '{}'::jsonb),
          'internal'::platform.visibility)
  returning id into v_all;

  -- TWO subscriptions over the SAME organization: one immediate on one channel, one digest on
  -- another. DOOR-18's "immediately or on a schedule, per channel" is one mechanism, so both
  -- are Rule records of the same kind differing in two keys — and both are made through the
  -- ONE write door, onto the Rule kernel, which is how a person makes a Rule.
  perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'kind','predicate','name','Notify on close','sort',10,
    'uses', jsonb_build_array('membership'),
    'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
    'message','this deal counts','applies_to_types','[]'::jsonb,
    'scope_table_id', v_deal,
    'subscription', jsonb_build_object(
      'saved_view_id', v_open, 'cadence','immediate','channel','in_app',
      'recipient_user_id', c_admin, 'event_key','records.changed')));
  perform custom.record_write(v_org, custom.rule_kernel_id(), jsonb_build_object(
    'kind','predicate','name','Monday pipeline digest','sort',20,
    'uses', jsonb_build_array('membership'),
    'expr', jsonb_build_object('op','const','args', jsonb_build_array(true)),
    'message','this deal counts','applies_to_types','[]'::jsonb,
    'scope_table_id', v_deal,
    'subscription', jsonb_build_object(
      'saved_view_id', v_all, 'cadence','digest','schedule','0 9 * * 1',
      'channel','email','recipient_user_id', c_admin, 'event_key','records.changed')));

  perform set_config('zz.org', v_org::text, true);
  perform set_config('zz.tdeal', v_deal::text, true);
  perform set_config('zz.d1', v_d1::text, true);
  perform set_config('zz.d5', v_d5::text, true);

  -- THE SEAT GOES BACK. `w4_agg_red.sql` replaces function bodies between rebuilds, and
  -- replacing a body is DDL: no client door does it and none ever will.
  perform set_config('role', current_setting('zz.boss'), true);
end $agg_fixture$;
