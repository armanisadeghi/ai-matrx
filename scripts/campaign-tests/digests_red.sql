-- scripts/campaign-tests/digests_red.sql — the RED TWIN of digests_green.sql.
--
-- A guard you cannot show failing is not a guard. Each block below breaks exactly ONE
-- thing lane DIGESTS built, re-runs the green suite's own clause against it, and
-- demands that the clause now FAILS. A block that stays green is printed as a DEFECT
-- IN THE SUITE, because it means that clause would have passed with the product
-- broken — which is the only way a test file can lie.
--
-- Each break is made inside its own plpgsql subtransaction and ended by raising a
-- sentinel, so PostgreSQL restores the function byte for byte rather than a second
-- copy written here that could drift from the real one. (A DO block cannot issue
-- ROLLBACK TO SAVEPOINT; a BEGIN/EXCEPTION frame is the subtransaction plpgsql gives
-- you, and plpgsql variables are not rolled back with it, so each block's verdict
-- survives its own undo.) The whole file ends in ROLLBACK and leaves nothing.

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '30s';
set local statement_timeout = '600s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss    text := current_user;
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_table   uuid;
  v_view    uuid;
  v_weekly  uuid;
  v_instant uuid;
  v_lead1   uuid;
  v_mark    timestamptz;
  v_red     integer := 0;
  v_green   integer := 0;
  v_def     jsonb;
  v_row     record;
  v_n       bigint;
  v_i       integer;
begin
  insert into iam.organizations (id, name, slug, created_by)
  values (v_org, 'Fairhaven Steelworks red ' || left(v_org::text, 8), 'fairhaven-steelworks-red-' || left(v_org::text, 8), c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active', c_admin);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note, updated_by)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'digests_red.sql', c_admin);

  perform set_config('app.actor_system', 'campaign-test/digests_red.sql', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════
  -- A red twin has to sit where the green suite sits, or the clause it claims to be
  -- breaking is not the clause the green suite runs. Every FIXTURE and every
  -- MEASUREMENT below is made from this seat; only the five deliberate breaks step
  -- out, because replacing a function is an operator's act and no client door does it.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this red twin did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — seated as %', current_user;

  v_home := custom.record_write(v_org, custom.organization_kernel_id(),
              jsonb_build_object('name', 'Workspace', '_actor', 'user'));
  v_table := custom.table_declare(v_org, jsonb_build_object(
      'name', 'Leads', 'slug', 'leads', 'description', 'the red twin''s table',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light',
      'retention_days', 30, 'row_order', 'sorted',
      'default_sort', jsonb_build_array(jsonb_build_object('field', 'name', 'direction', 'asc')),
      'agent_writable', true, 'label_singular', 'Lead', 'label_plural', 'Leads',
      'title_field', 'name',
      'fields', jsonb_build_array(jsonb_build_object('name', 'name'), jsonb_build_object('name', 'stage'),
                                  jsonb_build_object('name', 'phone')),
      'parent_id', v_home));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'name', 'key', 'name', 'type', 'text', 'required', true));
  perform custom.field_declare(v_org, v_table, jsonb_build_object('label', 'stage', 'key', 'stage', 'type', 'text'));
  v_view := custom.view_declare(v_org, v_table,
              jsonb_build_object('name', 'New leads', 'filters', jsonb_build_object('stage', 'new')));
  select sv.definition into v_def from platform.saved_view sv where sv.id = v_view;
  v_instant := custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'New lead', 'saved_view_id', v_view, 'cadence', 'instant', 'channel', 'in_app'));
  v_weekly := custom.subscription_declare(v_org, v_table, jsonb_build_object(
      'name', 'Monday summary', 'saved_view_id', v_view, 'cadence', 'weekly',
      'schedule', 'monday 08:00', 'channel', 'in_app',
      'quiet_hours', jsonb_build_object('start', '22:00', 'end', '07:00', 'tz', 'America/Chicago')));
  v_lead1 := custom.record_write(v_org, v_table,
               jsonb_build_object('name', 'Marcus Feldman', 'stage', 'new', 'phone', '555-0101', '_actor', 'user'));
  v_mark := clock_timestamp();
  perform custom.record_update(v_org, v_lead1, jsonb_build_object('phone', '555-0999'), null);

  -- ══ RED 1 — the predicate reads a replayed ROW as a document ═════════════════
  -- The exact defect the first live run found: `custom.record_as_of` nests the
  -- document under `data`, and a predicate that misses that answers "not in the view"
  -- for every record at every past moment, so nothing was ever in a view before.
  begin
    perform set_config('role', v_boss, true);   -- replacing a function is an operator's act
    create or replace function custom.agg_view_admits_state(p_definition jsonb, p_state jsonb)
    returns boolean language plpgsql immutable set search_path to 'pg_catalog' as $b$
    declare v_key text;
    begin
      if p_state is null then return false; end if;
      for v_key in select k from jsonb_object_keys(coalesce(p_definition -> 'filters', '{}'::jsonb)) k loop
        if coalesce(p_state ->> v_key, '') is distinct from (p_definition -> 'filters' ->> v_key) then
          return false;
        end if;
      end loop;
      return true;
    end; $b$;
    if custom.agg_view_admits_state(v_def, jsonb_build_object(
         'id', v_lead1, 'data_class', 'record', 'deleted_at', null,
         'data', jsonb_build_object('stage', 'new'))) then
      v_green := v_green + 1;
      raise warning 'RED 1 STAYED GREEN — clause 6l would pass with the envelope defect in place';
    else
      v_red := v_red + 1;
      raise notice 'RED 1 IS RED — the envelope defect is caught by clause 6l';
    end if;
    raise exception 'RED1_UNDO';
  exception when raise_exception then
    perform set_config('role', 'authenticated', true);
    if sqlerrm <> 'RED1_UNDO' then raise; end if;
  end;

  -- ══ RED 2 — a cadence nothing acts on is accepted ════════════════════════════
  begin
    perform set_config('role', v_boss, true);
    create or replace function custom.agg_cadence_normalize(p_cadence text)
    returns text language sql immutable set search_path to 'pg_catalog' as
    $b$ select coalesce(nullif(btrim(p_cadence), ''), 'instant') $b$;
    perform set_config('role', 'authenticated', true);   -- the measurement is a client door
    begin
      perform custom.subscription_declare(v_org, v_table, jsonb_build_object(
        'name', 'fortnightly', 'saved_view_id', v_view, 'cadence', 'fortnightly'));
      -- It was ACCEPTED, which is the break: clause 3b of the green suite expects a
      -- refusal naming the bad word, so with this normaliser in place that clause
      -- fails. Red is what we want here.
      v_red := v_red + 1;
      raise notice 'RED 2 IS RED — with the normaliser blunted the store took a cadence no runner acts on, and clause 3b catches it';
    exception when invalid_parameter_value then
      v_green := v_green + 1;
      raise warning 'RED 2 STAYED GREEN — the store still refused the bad cadence, so clause 3b is not what is holding that wall up';
    end;
    raise exception 'RED2_UNDO';
  exception when raise_exception then
    perform set_config('role', 'authenticated', true);
    if sqlerrm <> 'RED2_UNDO' then raise; end if;
  end;

  -- ══ RED 3 — the next summary ignores the schedule and the time zone ══════════
  begin
    perform set_config('role', v_boss, true);
    create or replace function custom.agg_digest_due_at(p_cadence text, p_schedule text,
                                                        p_quiet jsonb, p_after timestamptz)
    returns timestamptz language sql immutable set search_path to 'pg_catalog' as
    $b$ select case when custom.agg_cadence_normalize(p_cadence) = 'instant'
                    then null else p_after + interval '1 hour' end $b$;
    perform set_config('role', 'authenticated', true);   -- the measurement is a client door
    select * into v_row from custom.subscriptions(v_org, v_table) s where s.rule_id = v_weekly;
    if v_row.next_digest_at is not null
       and extract(dow from (v_row.next_digest_at at time zone 'America/Chicago')) = 1
       and (v_row.next_digest_at at time zone 'America/Chicago')::time = '08:00'::time then
      v_green := v_green + 1;
      raise warning 'RED 3 STAYED GREEN — clause 4e would pass while "Monday 08:00" means an hour from now';
    else
      v_red := v_red + 1;
      raise notice 'RED 3 IS RED — clause 4e catches a next-summary time that ignores the schedule';
    end if;
    raise exception 'RED3_UNDO';
  exception when raise_exception then
    perform set_config('role', 'authenticated', true);
    if sqlerrm <> 'RED3_UNDO' then raise; end if;
  end;

  -- ══ RED 4 — the one reader forgets that muted means muted ════════════════════
  begin
    perform custom.subscription_mute(v_org, v_weekly, true);   -- a client door, from the seat
    perform set_config('role', v_boss, true);
    create or replace function custom.agg_subscriptions(p_organization_id uuid,
            p_saved_view_id uuid default null, p_cadence text default null)
    returns table(rule_id uuid, saved_view_id uuid, table_id uuid, cadence text,
                  schedule text, quiet_hours jsonb, channel text,
                  recipient_user_id uuid, event_key text, name text)
    language sql stable set search_path to 'pg_catalog' as $b$
      select r.id,
             nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
             nullif(r.data ->> 'scope_table_id', '')::uuid,
             custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence'),
             nullif(r.data -> 'subscription' ->> 'schedule', ''),
             case when jsonb_typeof(r.data -> 'subscription' -> 'quiet_hours') = 'object'
                  then r.data -> 'subscription' -> 'quiet_hours' else null end,
             coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
             nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
             coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
             coalesce(r.data ->> 'name', 'Subscription')
        from custom.record r
       where r.organization_id = p_organization_id
         and r.data_class = 'rule' and r.deleted_at is null and r.data ? 'subscription'
         and (p_saved_view_id is null
              or (r.data -> 'subscription' ->> 'saved_view_id')::uuid = p_saved_view_id)
         and (p_cadence is null
              or custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence') = p_cadence);
    $b$;
    select count(*) into v_n from custom.agg_subscriptions(v_org, null, null) a where a.rule_id = v_weekly;
    v_i := custom.agg_digest_run(v_org, v_weekly, null);
    if v_n = 0 and v_i = 0 then
      v_green := v_green + 1;
      raise warning 'RED 4 STAYED GREEN — clauses 7c/7d would pass while a switched-off subscription keeps paging somebody';
    else
      v_red := v_red + 1;
      raise notice 'RED 4 IS RED — clauses 7c/7d catch a reader that lost its muted arm (saw %, sent %)', v_n, v_i;
    end if;
    raise exception 'RED4_UNDO';
  exception when raise_exception then
    perform set_config('role', 'authenticated', true);
    if sqlerrm <> 'RED4_UNDO' then raise; end if;
  end;

  -- ══ RED 5 — instant goes back to meaning "touched" ═══════════════════════════
  begin
    perform set_config('role', v_boss, true);
    create or replace function custom.agg_subscription_fire_entered(p_organization_id uuid,
            p_record_id uuid, p_table_id uuid default null, p_since timestamptz default null)
    returns integer language plpgsql set search_path to 'pg_catalog' as $b$
    declare s record; v_n integer := 0;
    begin
      perform custom.assert_store_door(p_organization_id, 'custom.agg_subscription_fire');
      for s in select * from custom.agg_subscriptions(p_organization_id, null, 'instant') loop
        if s.saved_view_id is null or s.recipient_user_id is null then continue; end if;
        if not custom.agg_view_admits(p_organization_id, s.saved_view_id, p_record_id) then continue; end if;
        v_n := v_n + 1;                 -- no ENTERING test at all: it counts a touch
      end loop;
      return v_n;
    end; $b$;
    v_i := custom.agg_subscription_fire_entered(v_org, v_lead1, v_table, v_mark);
    if v_i = 0 then
      v_green := v_green + 1;
      raise warning 'RED 5 STAYED GREEN — clause 5a would pass while every field edit re-announces its record';
    else
      v_red := v_red + 1;
      raise notice 'RED 5 IS RED — clause 5a catches "a lead was touched" wearing "a new lead" (fired %)', v_i;
    end if;
    raise exception 'RED5_UNDO';
  exception when raise_exception then
    perform set_config('role', 'authenticated', true);
    if sqlerrm <> 'RED5_UNDO' then raise; end if;
  end;

  raise notice 'RED TWIN: % of 5 blocks RED, % stayed green', v_red, v_green;
  if v_green > 0 then
    raise exception 'THE SUITE IS THE DEFECT: % block(s) stayed green, so that many clauses of digests_green.sql would pass with the product broken', v_green;
  end if;
end;
$red$;

rollback;
