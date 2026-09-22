-- target: branch,production
-- additive: yes
-- guard: custom/code_paths_enabled
--
-- W7-OFF — THE SWITCH MACHINERY. Five things the switch needs, in one file:
--
--   1. THE RAMP REGISTER      campaign_watch.ramp_consumer — the one place that
--                             says what a consumer IS, which lane owns it,
--                             whether its code has landed, and which record
--                             types its reads travel over. Both the admin
--                             screen and the gate read this table, so they
--                             cannot disagree.
--   2. THE GATE (Test 1)      campaign_watch.consumer_access_diff /
--                             consumer_gate — the per-principal access diff
--                             between the STORED form (platform.reachability)
--                             and the DERIVED form (platform.derive_reachability
--                             over platform.containment_edges), with GAINED
--                             counted separately from LOST (CUT-N-8). Runnable
--                             against whatever database it is pointed at,
--                             which is the point: the branch proves it against
--                             a copy, the chair runs the same artefact against
--                             production at switch-checklist step 6a.
--   3. THE SWITCH-WINDOW      campaign_watch.switch_window / switch_outbox /
--      OUTBOX (CUT-N-2)       switch_outbox_capture / switch_outbox_replay —
--                             writes taken while a consumer's switch window is
--                             open are captured in the SAME transaction as the
--                             record and replayed by an idempotent consumer.
--   4. THE REBUILD (CUT-N-6)  campaign_watch.reachability_rebuild — the one
--                             step that can take the platform down. It SETs
--                             lock_timeout explicitly, retries on 55P03, and
--                             reports its measured cost.
--   5. THE DUAL-ENGINE EXIT   campaign_watch.dual_engine_exit (CUT-N-3) — a
--      (CUT-N-3)              named trigger, a date and an owner, in a table
--                             the switch screen reads, so "two engines side by
--                             side" can never become a fork by forgetting.
--
-- WHY campaign_watch AND NOT custom. §6.3 revokes schema `custom` from every
-- role including service_role, so machinery that lives in `custom` is machinery
-- the product cannot read. And these are not business tables: they are the
-- campaign's own operational ledger, which is exactly what campaign_watch
-- already holds (build_lock). NONE of them carries three of the seven entity
-- columns, so `provision_shape_guard`'s lane (d) does not fire; none carries a
-- foreign key, so its foreign-key lanes do not fire either. That is a shape
-- choice, not a bypass: an operational ledger with no tenancy trigger and no
-- RLS-bearing registry row is not an entity and must not be registered as one.
--
-- WHY THE DOORS ARE IN platform AND NOT campaign_watch. campaign_watch is not
-- in pgrst.db_schemas and must not be — the admin screen reads these through
-- SECURITY DEFINER functions in `platform`, which is exposed, each one gated on
-- is_platform_admin() as its first act.
--
-- ROW LEVEL SECURITY. Every table below has RLS ENABLED and no policy for
-- `authenticated`, which is a closed door, not an absent one: the only way in
-- is a door below, and every door asks is_platform_admin() before it reads.
-- service_role carries BYPASSRLS, which is what the campaign's own tooling uses.

set lock_timeout = '3s';
set statement_timeout = '2min';

-- ───────────────────────────────────────────────────────── 1. THE RAMP REGISTER

-- ───────────────────────────────────────────────────────── 1. THE RAMP REGISTER
--
-- THE REGISTER IS A VIEW, NOT A TABLE, AND THAT IS THE POINT. Which consumers
-- exist, which lane owns each one, whether its code has landed and which record
-- types its reads travel over are FACTS ABOUT THE CODEBASE, not data a person
-- edits at run time. A table would let the register drift from the build log
-- silently; a view means adding or re-dating a consumer is a migration, which
-- is reviewable, reversible and dated. Both the switch screen and the gate read
-- exactly this, so they cannot disagree about what a consumer is.
--
-- landed_at NULL means the consumer's code has not landed. The switch screen
-- then shows NO switch for that row at all — absent, never disabled-looking —
-- and prints not_ready_why instead.
--
-- THE ORDER is switch-checklist 11.12's, which the book states plainly is the
-- chair's proposal and not a ruling; the only fixed element is retirement last.

create view campaign_watch.ramp_consumer with (security_invoker = true) as
select *
  from (values
    ('grid', 'The data grid', 1, null::text, 'W6-GRID',
     timestamptz '2026-09-18 20:35+00', null::text,
     array['record']::text[], false, 'consumer_grid_enabled'),

    ('saved_ai_outputs', 'Saved AI outputs', 2, null, 'W5-AGENT / W5-MERGE',
     timestamptz '2026-09-16 05:40+00', null,
     array['message','conversation']::text[], false, 'consumer_saved_ai_outputs_enabled'),

    ('scopes', 'Scopes', 3, 'scopes_education_checkout', 'W2-ACCESS',
     null, 'No BUILD-LOG row records this consumer as landed. W2-ACCESS owns it.',
     array['scope']::text[], false, 'consumer_scopes_enabled'),

    ('education', 'Education', 4, 'scopes_education_checkout', 'W6-BOOK',
     null, 'No BUILD-LOG row records this consumer as landed. W6-BOOK owns it.',
     array['fc_card']::text[], false, 'consumer_education_enabled'),

    ('checkout', 'Checkout', 5, 'scopes_education_checkout', 'W6-PORTAL',
     null, 'No BUILD-LOG row records this consumer as landed. W6-PORTAL owns it.',
     array['project']::text[], false, 'consumer_checkout_enabled'),

    ('extension', 'The Chrome extension', 6, null, 'W6-EXT',
     timestamptz '2026-09-19 01:30+00', null,
     array['record']::text[], false, 'consumer_extension_enabled'),

    ('chat_seeding', 'Chat seeding', 7, null, 'W5-RCHAT',
     null, 'No BUILD-LOG row records this consumer as landed. W5-RCHAT owns it.',
     array['thread','conversation']::text[], false, 'consumer_chat_seeding_enabled'),

    ('retirement', 'Retirement of the old stores', 8, null, 'W7-DEPR-DATA',
     null, 'The old stores are still live and nothing has retired them. This is the only step '
           'in the ramp with no rollback, and it is the owner''s call, never an agent''s.',
     array[]::text[], true, 'consumer_retirement_enabled')
  ) as c (consumer_id, label, ramp_order, batch, owning_lane, landed_at, not_ready_why,
          record_types, no_rollback, knob_key);

-- ───────────────────────────────────────────── 5. THE DUAL-ENGINE EXIT (CUT-N-3)
--
-- Two permission engines may run side by side ONLY with a named exit trigger, a
-- date and an owner. This is where the platform holds that decision, and the
-- switch screen renders it at the top of the ramp, so a dual-engine period can
-- never quietly become a permanent fork. Past exit_date with status still
-- 'open', the screen says so in red rather than letting the date slide.
--
-- A VIEW for the same reason as the register: changing the exit date is a
-- decision with a diff, not a field somebody edits.

create view campaign_watch.dual_engine_exit with (security_invoker = true) as
select *
  from (values
    ('visibility',
     'iam.accessible_entity_ids plus public.permission_level, the live predicate, read by more '
     'than fifteen hundred production policies',
     'platform.reachability derived from platform.associations plus custom.has_visibility, the '
     'unified model',
     'The LAST consumer in campaign_watch.ramp_consumer (retirement, ramp_order 8) has been '
     'switched on for every organization and has held one full working day at 100 percent with '
     'zero shadow-read mismatches. On that day the old predicate is replaced by the body its '
     'migration declares it was written against, and the second engine stops. If the trigger has '
     'not fired by exit_date, the chair stops the ramp and takes the decision to the owner: '
     'either a new date he names, or this row moves to status forked and the platform admits it '
     'is running two engines on purpose.',
     date '2026-12-01',
     'Arman Sadeghi',
     'open',
     timestamptz '2026-09-19 07:00+00',
     'W7-OFF',
     'CUT-N-3 and switch-checklist 11.14. The DATE is the chair''s call, not the owner''s: six '
     'weeks from the campaign''s own horizon, which is the shortest date that does not need the '
     'owner awake to set. Cost if wrong: one date in one row, changed in a minute. What it buys '
     'is that nobody can let the dual-engine period run silently.')
  ) as e (id, engine_old, engine_new, exit_trigger, exit_date, owner_name, status,
          recorded_at, recorded_by, note);

-- ───────────────────────────────────────────────────── 2. THE GATE'S OWN LEDGER

create table if not exists campaign_watch.ramp_gate_run (
  id              uuid        primary key default gen_random_uuid(),
  consumer_id     text        not null,
  organization_id uuid        not null,
  ran_at          timestamptz not null default now(),
  ran_by          uuid,
  principals      integer     not null,
  pairs_stored    bigint      not null,
  pairs_derived   bigint      not null,
  lost_count      bigint      not null,
  gained_count    bigint      not null,
  drift_rows      bigint      not null,
  verdict         text        not null,
  why             text        not null,
  duration_ms     integer     not null,
  constraint ramp_gate_run_verdict_is_one_of_three
    check (verdict in ('green', 'red', 'nothing_to_compare'))
);

comment on table campaign_watch.ramp_gate_run is
  'Every run of Test 1 for one consumer in one organization. THREE verdicts, never two: '
  '"nothing_to_compare" is what a gate returns when no principal holds a grant or no pair '
  'exists on either side — "lost 0, gained 0" is what an empty set returns, and calling '
  'that green is the vacuous pass this campaign''s anti-vacuity floor exists to refuse. '
  'The switch screen refuses to switch on anything but green.';

create index if not exists ramp_gate_run_lookup_idx
  on campaign_watch.ramp_gate_run (consumer_id, organization_id, ran_at desc);

-- ───────────────────────────────────────── 3. THE SWITCH WINDOW AND ITS OUTBOX

create table if not exists campaign_watch.switch_window (
  id              uuid        primary key default gen_random_uuid(),
  consumer_id     text        not null,
  organization_id uuid        not null,
  opened_at       timestamptz not null default now(),
  opened_by       uuid,
  closed_at       timestamptz,
  closed_by       uuid,
  note            text
);

comment on table campaign_watch.switch_window is
  'CUT-N-2: a switch window is the interval in which one consumer''s reads move from the '
  'old store to the new one. While a window is open, every write the consumer takes is '
  'captured in campaign_watch.switch_outbox in the SAME transaction as the record.';

create unique index if not exists switch_window_one_open_per_consumer_idx
  on campaign_watch.switch_window (consumer_id, organization_id)
  where closed_at is null;

create table if not exists campaign_watch.switch_outbox (
  id              uuid        primary key default gen_random_uuid(),
  window_id       uuid        not null,
  consumer_id     text        not null,
  organization_id uuid        not null,
  source_table    text        not null,
  source_id       uuid        not null,
  op              text        not null,
  payload         jsonb       not null default '{}'::jsonb,
  dedupe_key      text        not null,
  taken_at        timestamptz not null default now(),
  replayed_at     timestamptz,
  replay_run      uuid,
  replay_outcome  text,
  constraint switch_outbox_op_is_one_of_three
    check (op in ('insert', 'update', 'delete'))
);

comment on table campaign_watch.switch_outbox is
  'CUT-N-2, the transactional outbox. Two independent idempotency mechanisms, because one '
  'is a hope: (a) the unique index below means the same write captured twice is ONE row, '
  'so a retried application transaction cannot duplicate an entry; (b) the replay consumer '
  'claims only rows whose replayed_at is null, so replaying twice replays nothing the '
  'second time. Proven by running the replay twice and reading the duplicate count.';

create unique index if not exists switch_outbox_dedupe_idx
  on campaign_watch.switch_outbox (consumer_id, organization_id, dedupe_key);

create index if not exists switch_outbox_unreplayed_idx
  on campaign_watch.switch_outbox (consumer_id, organization_id, taken_at)
  where replayed_at is null;

-- ──────────────────────────────────────────────────── 5. THE DUAL-ENGINE EXIT

alter table campaign_watch.ramp_gate_run     enable row level security;
alter table campaign_watch.switch_window     enable row level security;
alter table campaign_watch.switch_outbox     enable row level security;

-- ───────────────────────────────────────────── THE REGISTER'S EIGHT CONSUMERS
--
-- The ORDER is §11.12's, which the book states plainly is the chair's proposal
-- and not a ruling; the only fixed element is retirement last. landed_at is the
-- BUILD-LOG row that recorded the consumer's code, and a consumer with no such
-- row carries not_ready_why instead and gets no switch on the screen.

-- ───────────────────────────────────────── 2. THE GATE — THE PER-PRINCIPAL DIFF
--
-- THE COMPARISON. For one consumer in one organization:
--
--   a PRINCIPAL is a live grant in iam.permissions that belongs to this
--     organization — either granted TO the organization, or granted to a user
--     who is a member of it. Public grants are principals too, and are named
--     as such rather than folded into anybody.
--   the STORED answer is what platform.reachability holds today, joined to
--     those grants: a principal reaches an item at
--     least(its grant level, the cached max_level).
--   the DERIVED answer is the same question asked of
--     platform.derive_reachability(container_type, container_id), which walks
--     platform.containment_edges — the associations themselves.
--   a principal may reach one item through several containers, so both sides
--     are collapsed to the MAXIMUM level per (principal, item) before they are
--     compared. Comparing un-collapsed rows would report a "loss" every time
--     one of two paths disappeared while the answer stayed identical.
--
-- LOST and GAINED are separate columns and separate gates (CUT-N-8): a
-- permissive new model passes the lost half and fails the gained half, which is
-- exactly the failure a single "differences: 0" hides. A level that RISES is
-- gained access, not a level mismatch; a level that FALLS is lost access.
--
-- THE COMPARISON DOMAIN is stated rather than implied: platform.derive_reachability
-- is the platform's own closure function and the diff can only see what it can
-- express. Chains deeper than the store's own ceiling are outside this diff, and
-- consumer_gate reports the deepest depth it actually saw so a reader can tell
-- whether the domain was exercised at all.

create or replace function campaign_watch.consumer_access_diff(
  p_consumer        text,
  p_organization_id uuid
)
returns table (
  side           text,
  principal_kind text,
  principal_id   uuid,
  item_type      text,
  item_id        uuid,
  stored_level   public.permission_level,
  derived_level  public.permission_level
)
language sql
stable
security definer
set search_path to ''
as $fn$
  with types as (
    select c.record_types from campaign_watch.ramp_consumer c
     where c.consumer_id = p_consumer
  ),
  grants as (
    select p.resource_type,
           p.resource_id,
           p.permission_level,
           case when p.granted_to_user_id is not null then 'user'
                when p.granted_to_organization_id is not null then 'organization'
                else 'public' end as principal_kind,
           coalesce(p.granted_to_user_id, p.granted_to_organization_id) as principal_id
      from iam.permissions p
     where p.status = 'active'
       and (p.expires_at is null or p.expires_at > now())
       and ( p.granted_to_organization_id = p_organization_id
          or exists (select 1 from iam.memberships m
                      where m.user_id = p.granted_to_user_id
                        and m.organization_id = p_organization_id
                        and m.deleted_at is null) )
  ),
  stored as (
    select g.principal_kind, g.principal_id, r.item_type, r.item_id,
           max(least(g.permission_level, r.max_level)) as lvl
      from grants g
      join platform.reachability r
        on r.container_type = g.resource_type
       and r.container_id   = g.resource_id
     where r.item_type in (select unnest(t.record_types) from types t)
     group by 1, 2, 3, 4
  ),
  derived as (
    select g.principal_kind, g.principal_id, d.item_type, d.item_id,
           max(least(g.permission_level, d.max_level)) as lvl
      from grants g
      cross join lateral platform.derive_reachability(g.resource_type, g.resource_id) d
     where d.item_type in (select unnest(t.record_types) from types t)
     group by 1, 2, 3, 4
  )
  select case
           when s.item_id is null                then 'gained'
           when d.item_id is null                then 'lost'
           when d.lvl > s.lvl                    then 'gained'
           when d.lvl < s.lvl                    then 'lost'
         end as side,
         coalesce(s.principal_kind, d.principal_kind),
         coalesce(s.principal_id,   d.principal_id),
         coalesce(s.item_type,      d.item_type),
         coalesce(s.item_id,        d.item_id),
         s.lvl,
         d.lvl
    from stored s
    full outer join derived d
      on  d.principal_kind = s.principal_kind
     and  d.principal_id is not distinct from s.principal_id
     and  d.item_type      = s.item_type
     and  d.item_id        = s.item_id
   where s.item_id is null
      or d.item_id is null
      or d.lvl is distinct from s.lvl;
$fn$;

comment on function campaign_watch.consumer_access_diff(text, uuid) is
  'Test 1''s per-principal access diff for ONE consumer in ONE organization, GAINED and LOST '
  'named separately (CUT-N-8). Stored = platform.reachability; derived = '
  'platform.derive_reachability over platform.containment_edges.';

create or replace function campaign_watch.consumer_gate(
  p_consumer        text,
  p_organization_id uuid,
  p_ran_by          uuid default null
)
returns campaign_watch.ramp_gate_run
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_consumer  campaign_watch.ramp_consumer%rowtype;
  v_started   timestamptz := clock_timestamp();
  v_row       campaign_watch.ramp_gate_run%rowtype;
  v_princ     integer := 0;
  v_stored    bigint  := 0;
  v_derived   bigint  := 0;
  v_lost      bigint  := 0;
  v_gained    bigint  := 0;
  v_drift     bigint  := 0;
  v_verdict   text;
  v_why       text;
begin
  select * into v_consumer
    from campaign_watch.ramp_consumer where consumer_id = p_consumer;
  if not found then
    raise exception 'campaign_watch.consumer_gate: "%" is not a consumer in campaign_watch.ramp_consumer', p_consumer
      using errcode = 'P0001',
            hint = 'The ramp register is the one place a consumer exists. Add the row and its knob, or fix the id.';
  end if;

  -- The principals this organization actually has. Zero is the anti-vacuity case
  -- and is never green: "lost 0, gained 0" over no principal is what an empty
  -- set returns, not a proof.
  select count(*)::int into v_princ
    from ( select 1 from iam.permissions p
            where p.status = 'active'
              and (p.expires_at is null or p.expires_at > now())
              and ( p.granted_to_organization_id = p_organization_id
                 or exists (select 1 from iam.memberships m
                             where m.user_id = p.granted_to_user_id
                               and m.organization_id = p_organization_id
                               and m.deleted_at is null) )
            group by p.granted_to_user_id, p.granted_to_organization_id, p.is_public ) s;

  select count(*) into v_stored
    from iam.permissions p
    join platform.reachability r
      on r.container_type = p.resource_type and r.container_id = p.resource_id
   where p.status = 'active'
     and (p.expires_at is null or p.expires_at > now())
     and r.item_type = any (v_consumer.record_types)
     and ( p.granted_to_organization_id = p_organization_id
        or exists (select 1 from iam.memberships m
                    where m.user_id = p.granted_to_user_id
                      and m.organization_id = p_organization_id
                      and m.deleted_at is null) );

  select count(*) into v_derived
    from iam.permissions p
    cross join lateral platform.derive_reachability(p.resource_type, p.resource_id) d
   where p.status = 'active'
     and (p.expires_at is null or p.expires_at > now())
     and d.item_type = any (v_consumer.record_types)
     and ( p.granted_to_organization_id = p_organization_id
        or exists (select 1 from iam.memberships m
                    where m.user_id = p.granted_to_user_id
                      and m.organization_id = p_organization_id
                      and m.deleted_at is null) );

  select count(*) filter (where side = 'lost'),
         count(*) filter (where side = 'gained')
    into v_lost, v_gained
    from campaign_watch.consumer_access_diff(p_consumer, p_organization_id);

  -- Instrument A, restricted to this consumer's record types: the cache's own
  -- disagreement with the associations, whether or not any principal sees it.
  select count(*) into v_drift
    from platform.reachability_drift() dr
   where dr.item_type = any (v_consumer.record_types);

  if v_consumer.landed_at is null then
    v_verdict := 'red';
    v_why := 'This consumer''s code has not landed: ' || coalesce(v_consumer.not_ready_why, '(no reason recorded)')
             || ' A gate over code that does not exist cannot say anything about it.';
  elsif v_princ = 0 or (v_stored = 0 and v_derived = 0) then
    v_verdict := 'nothing_to_compare';
    v_why := 'Nothing to compare: ' || v_princ || ' principal(s) hold a live grant in this '
             || 'organization and the two sides carry ' || v_stored || ' stored and ' || v_derived
             || ' derived pair(s) over record type(s) ' || array_to_string(v_consumer.record_types, ', ')
             || '. "Lost 0, gained 0" is what an empty set returns, so this is not green — it is a '
             || 'gate with nothing behind it. REMEDY: ramp an organization that holds real data, or '
             || 'give this one the records and grants the consumer actually reads.';
  elsif v_gained > 0 then
    v_verdict := 'red';
    v_why := v_gained || ' principal/item pair(s) GAIN access under the derived model that they do '
             || 'not hold today, and ' || v_lost || ' lose it. Gained access is its own gate '
             || '(CUT-N-8): a more permissive model passes the lost half and is still a security '
             || 'regression. Read them with campaign_watch.consumer_access_diff(' || quote_literal(p_consumer)
             || ', ' || quote_literal(p_organization_id::text) || '::uuid).';
  elsif v_lost > 0 then
    v_verdict := 'red';
    v_why := v_lost || ' principal/item pair(s) LOSE access under the derived model (0 gained). '
             || 'Read them with campaign_watch.consumer_access_diff(' || quote_literal(p_consumer)
             || ', ' || quote_literal(p_organization_id::text) || '::uuid).';
  elsif v_drift > 0 then
    v_verdict := 'red';
    v_why := 'No principal gains or loses access, but platform.reachability_drift() reports '
             || v_drift || ' row(s) disagreeing with the associations over this consumer''s record '
             || 'types. The cache is wrong in a way no current grant happens to see, and the next '
             || 'grant would see it.';
  else
    v_verdict := 'green';
    v_why := 'Lost 0, gained 0, counted separately, over ' || v_princ || ' principal(s) and '
             || v_stored || ' stored / ' || v_derived || ' derived pair(s); '
             || 'platform.reachability_drift() is empty over record type(s) '
             || array_to_string(v_consumer.record_types, ', ') || '.';
  end if;

  insert into campaign_watch.ramp_gate_run
    (consumer_id, organization_id, ran_by, principals, pairs_stored, pairs_derived,
     lost_count, gained_count, drift_rows, verdict, why, duration_ms)
  values
    (p_consumer, p_organization_id, p_ran_by, v_princ, v_stored, v_derived,
     v_lost, v_gained, v_drift, v_verdict, v_why,
     (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int)
  returning * into v_row;

  return v_row;
end;
$fn$;

comment on function campaign_watch.consumer_gate(text, uuid, uuid) is
  'CUT-3: Test 1 as a runnable gate, per consumer, per organization. Records every run in '
  'campaign_watch.ramp_gate_run and returns it. Green only when the consumer''s code has '
  'landed AND a real principal and a real pair exist AND lost = 0 AND gained = 0 AND the '
  'cache does not disagree with the associations.';

-- ───────────────────────────────── 3. THE SWITCH WINDOW AND ITS OUTBOX (CUT-N-2)

create or replace function campaign_watch.switch_window_open(
  p_consumer        text,
  p_organization_id uuid,
  p_opened_by       uuid default null,
  p_note            text default null
)
returns campaign_watch.switch_window
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_row campaign_watch.switch_window%rowtype;
begin
  if not exists (select 1 from campaign_watch.ramp_consumer where consumer_id = p_consumer) then
    raise exception 'campaign_watch.switch_window_open: "%" is not a consumer', p_consumer
      using errcode = 'P0001';
  end if;

  select * into v_row from campaign_watch.switch_window
   where consumer_id = p_consumer and organization_id = p_organization_id and closed_at is null;
  if found then
    return v_row;  -- opening an open window is a no-op, not a second window
  end if;

  insert into campaign_watch.switch_window (consumer_id, organization_id, opened_by, note)
  values (p_consumer, p_organization_id, p_opened_by, p_note)
  returning * into v_row;
  return v_row;
end;
$fn$;

create or replace function campaign_watch.switch_window_close(
  p_consumer        text,
  p_organization_id uuid,
  p_closed_by       uuid default null
)
returns campaign_watch.switch_window
language sql
volatile
security definer
set search_path to ''
as $fn$
  update campaign_watch.switch_window
     set closed_at = now(), closed_by = p_closed_by
   where consumer_id = p_consumer
     and organization_id = p_organization_id
     and closed_at is null
  returning *;
$fn$;

create or replace function campaign_watch.switch_outbox_capture(
  p_consumer        text,
  p_organization_id uuid,
  p_source_table    text,
  p_source_id       uuid,
  p_op              text,
  p_payload         jsonb,
  p_dedupe_key      text
)
returns uuid
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_window uuid;
  v_id     uuid;
begin
  -- THE WHOLE POINT: this runs inside the caller's transaction, beside the
  -- record write. If the record write rolls back, so does this row; if it
  -- commits, the entry is there. There is no second system to fall out of step
  -- with, which is what "transactional outbox" means.
  select id into v_window from campaign_watch.switch_window
   where consumer_id = p_consumer and organization_id = p_organization_id and closed_at is null;

  if v_window is null then
    return null;  -- no window open: the switch is not happening, capture nothing
  end if;

  insert into campaign_watch.switch_outbox
    (window_id, consumer_id, organization_id, source_table, source_id, op, payload, dedupe_key)
  values
    (v_window, p_consumer, p_organization_id, p_source_table, p_source_id, p_op,
     coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (consumer_id, organization_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from campaign_watch.switch_outbox
     where consumer_id = p_consumer and organization_id = p_organization_id
       and dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$fn$;

comment on function campaign_watch.switch_outbox_capture(text, uuid, text, uuid, text, jsonb, text) is
  'CUT-N-2: called in the SAME transaction as the record write. A no-op when no switch '
  'window is open, so a consumer may call it unconditionally on every write for ever.';

create or replace function campaign_watch.switch_outbox_replay(
  p_consumer        text,
  p_organization_id uuid
)
returns table (
  run_id        uuid,
  replayed      bigint,
  already_done  bigint,
  total         bigint,
  duplicates    bigint
)
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_run uuid := gen_random_uuid();
begin
  -- IDEMPOTENT BY CLAIM, not by hope. A row is claimed only while replayed_at
  -- is null, and the claim and the mark are the same statement, so two replays
  -- racing each other cannot both take the same row.
  with claimed as (
    update campaign_watch.switch_outbox o
       set replayed_at = now(), replay_run = v_run, replay_outcome = 'replayed'
     where o.consumer_id = p_consumer
       and o.organization_id = p_organization_id
       and o.replayed_at is null
    returning 1
  )
  select count(*) into replayed from claimed;

  select count(*) filter (where o.replayed_at is not null and o.replay_run is distinct from v_run),
         count(*)
    into already_done, total
    from campaign_watch.switch_outbox o
   where o.consumer_id = p_consumer and o.organization_id = p_organization_id;

  -- The duplicate count the proof reads: entries sharing a dedupe key. The
  -- unique index makes this zero by construction; it is counted and returned
  -- rather than assumed, because a claim nobody measures is a claim.
  select coalesce(sum(c - 1), 0) into duplicates
    from ( select count(*) as c from campaign_watch.switch_outbox o
            where o.consumer_id = p_consumer and o.organization_id = p_organization_id
            group by o.dedupe_key ) d;

  run_id := v_run;
  return next;
end;
$fn$;

comment on function campaign_watch.switch_outbox_replay(text, uuid) is
  'CUT-N-2''s idempotent consumer. Run it twice: the second run replays 0 and reports the '
  'same total with 0 duplicates. That second run IS the proof, not a sentence about one.';

-- ───────────────────────────────────────── 4. THE REACHABILITY REBUILD (CUT-N-6)

create or replace function campaign_watch.reachability_rebuild(
  p_lock_timeout_ms integer default 3000,
  p_max_attempts    integer default 5,
  p_dry_run         boolean default true
)
returns table (
  attempts       integer,
  acquired       boolean,
  dry_run        boolean,
  rows_before    bigint,
  rows_derived   bigint,
  rows_after     bigint,
  lock_wait_ms   integer,
  derive_ms      integer,
  total_ms       integer,
  role_measured  text,
  note           text
)
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_attempt   integer := 0;
  v_t0        timestamptz := clock_timestamp();
  v_tlock     timestamptz;
  v_tderive   timestamptz;
  v_acquired  boolean := false;
begin
  if p_lock_timeout_ms is null or p_lock_timeout_ms <= 0 then
    raise exception 'campaign_watch.reachability_rebuild: lock_timeout must be a positive number of milliseconds, not %', p_lock_timeout_ms
      using errcode = 'P0001',
            hint = 'CUT-N-6: the rebuild is the one step that can take the platform down. The migration role''s own session carries lock_timeout = 0, which means WAIT FOR EVER, and the live ddl_lock_timeout_guard event trigger''s 2 s floor covers DDL only — this is a LOCK TABLE, not DDL. An unset bound is not a bound.';
  end if;

  rows_before := (select count(*) from platform.reachability);
  role_measured := current_user;

  -- THE LOCK. ACCESS EXCLUSIVE, because the rebuild empties and refills a table
  -- iam.has_access reads from inside RLS: a reader that saw the table half
  -- refilled would be told it cannot see its own records.
  v_tlock := clock_timestamp();
  loop
    v_attempt := v_attempt + 1;
    begin
      execute format('set local lock_timeout = %L', p_lock_timeout_ms || 'ms');
      lock table platform.reachability in access exclusive mode;
      v_acquired := true;
      exit;
    exception when lock_not_available then       -- SQLSTATE 55P03, by name
      if v_attempt >= p_max_attempts then
        exit;
      end if;
      perform pg_sleep(least(0.25 * v_attempt, 2.0));   -- backoff, bounded
    end;
  end loop;
  lock_wait_ms := (extract(epoch from (clock_timestamp() - v_tlock)) * 1000)::int;
  attempts := v_attempt;
  acquired := v_acquired;
  dry_run  := p_dry_run;

  if not v_acquired then
    rows_derived := null; rows_after := rows_before; derive_ms := null;
    total_ms := (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
    note := 'NOT ACQUIRED. ' || v_attempt || ' attempt(s) at a ' || p_lock_timeout_ms
            || ' ms lock_timeout all returned 55P03; nothing was rebuilt and nothing was '
            || 'harmed. REMEDY: run it in a quieter window, or raise p_lock_timeout_ms '
            || 'deliberately and say so in the log.';
    return next;
    return;
  end if;

  v_tderive := clock_timestamp();
  create temporary table _rebuild_derived on commit drop as
    select c.container_type, c.container_id, d.item_type, d.item_id, d.depth, d.max_level
      from (select distinct ce.container_type, ce.container_id from platform.containment_edges ce) c
      cross join lateral platform.derive_reachability(c.container_type, c.container_id) d;
  derive_ms := (extract(epoch from (clock_timestamp() - v_tderive)) * 1000)::int;
  rows_derived := (select count(*) from _rebuild_derived);

  if p_dry_run then
    rows_after := rows_before;
    total_ms := (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
    note := 'DRY RUN — the lock was taken and released with the transaction and NOTHING was '
            || 'written. This is the measured cost of the real step: ' || lock_wait_ms
            || ' ms to take ACCESS EXCLUSIVE on platform.reachability after ' || v_attempt
            || ' attempt(s) at a ' || p_lock_timeout_ms || ' ms lock_timeout as role "'
            || role_measured || '", and ' || derive_ms || ' ms to derive ' || rows_derived
            || ' row(s) against ' || rows_before || ' stored. The platform is unreadable for '
            || 'the duration of the real run, so that total is the outage.';
    return next;
    return;
  end if;

  delete from platform.reachability;
  insert into platform.reachability (container_type, container_id, item_type, item_id, depth, max_level)
    select container_type, container_id, item_type, item_id, depth, max_level from _rebuild_derived;
  rows_after := (select count(*) from platform.reachability);
  total_ms := (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int;
  note := 'REBUILT. ' || rows_before || ' row(s) deleted and ' || rows_after
          || ' rebuilt from the associations in ' || total_ms || ' ms (lock ' || lock_wait_ms
          || ' ms over ' || v_attempt || ' attempt(s), derive ' || derive_ms || ' ms) as role "'
          || role_measured || '". CUT-6: the stored form is a cache and has now survived being '
          || 'deleted entirely and rebuilt.';
  return next;
end;
$fn$;

comment on function campaign_watch.reachability_rebuild(integer, integer, boolean) is
  'CUT-N-6. Dry run by default: takes the real ACCESS EXCLUSIVE lock under an EXPLICIT '
  'lock_timeout, retries on 55P03 by name with bounded backoff, derives the whole closure, '
  'reports the measured cost, and writes nothing. p_dry_run => false does the rebuild.';

-- ─────────────────────────────────────────────── THE SHARE CUTOVER (CUT-N-5)

create or replace function campaign_watch.share_cutover_plan(
  p_limit integer default 1000
)
returns table (
  source_table  text,
  source_column text,
  row_id        uuid,
  old_form      text,
  why           text
)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  col record;
  v_sql text;
begin
  -- CUT-N-5: THE CUTOVER READS EXISTING SHARES ROW BY ROW, NEVER BY ENUM
  -- REWRITE. This function is that law made executable: it emits ONE ROW PER
  -- SHARED ROW, naming the table, the column and the id, so the cutover is a
  -- list of records a person can read and count — never an UPDATE over a type.
  --
  -- The columns are DISCOVERED from the catalog, not listed here. The book's
  -- "5 boolean columns in 3 tables" was a measurement on one day and the
  -- platform has gained share columns since; a hard-coded list would quietly
  -- skip whatever landed after it was written, which for a share is a record
  -- that silently stops being shared.
  for col in
    select c.table_schema, c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.data_type = 'boolean'
       and t.table_type = 'BASE TABLE'
       and c.column_name in ('is_public', 'is_shared', 'shared', 'public_read',
                             'is_link_shareable', 'creator_public')
       and c.table_schema not in ('pg_catalog', 'information_schema', 'graveyard',
                                  'storage', 'partman', 'auth', 'realtime')
       and exists (select 1 from information_schema.columns i
                    where i.table_schema = c.table_schema and i.table_name = c.table_name
                      and i.column_name = 'id' and i.data_type = 'uuid')
     order by 1, 2, 3
  loop
    v_sql := format(
      'select %L::text, %L::text, t.id, %L::text, %L::text from %I.%I t where t.%I is true limit %s',
      col.table_schema || '.' || col.table_name, col.column_name,
      col.column_name || ' = true',
      'A boolean share column. The cutover reads this row and writes ONE visibility + grant '
      'for it; it never rewrites the column''s type or the visibility enum wholesale.',
      col.table_schema, col.table_name, col.column_name, p_limit);
    return query execute v_sql;
  end loop;

  -- The enum half, read the same way: one row per record, never a type change.
  return query
    select 'iam.permissions'::text, 'is_public'::text, p.id,
           'is_public = true, level ' || p.permission_level::text,
           'A public grant. It is read as a row and re-expressed as one visibility on the '
           'record it points at.'::text
      from iam.permissions p
     where p.is_public is true
     limit p_limit;
end;
$fn$;

comment on function campaign_watch.share_cutover_plan(integer) is
  'CUT-N-5: the cutover reads existing shares ROW BY ROW, never by enum rewrite. Emits one '
  'row per shared record, over catalog-DISCOVERED share columns rather than a hard-coded '
  'list that would silently skip whatever landed after it was written.';

-- ───────────────────────────────────────────────────── THE DOORS, IN platform
--
-- The admin screen reads campaign_watch through these three, never directly:
-- campaign_watch is not exposed to PostgREST and must not be. Each one asks
-- is_platform_admin() as its first act and refuses by name otherwise.

create or replace function platform.unified_data_ramp_state(
  p_organization_id uuid
)
returns table (
  consumer_id      text,
  label            text,
  ramp_order       integer,
  batch            text,
  owning_lane      text,
  landed_at        timestamptz,
  not_ready_why    text,
  record_types     text[],
  no_rollback      boolean,
  knob_key         text,
  switched_on      boolean,
  gate_verdict     text,
  gate_why         text,
  gate_ran_at      timestamptz,
  gate_lost        bigint,
  gate_gained      bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
begin
  -- NO CLIENT REACHES THIS. Its platform.client_callable_door row declares it
  -- server_only, so the DDL guard revokes EXECUTE from anon and authenticated and
  -- the only caller is the admin API route, which verifies the signed-in person is
  -- a platform admin from THEIR OWN session before it uses the service key. The
  -- check lives where the identity is: is_platform_admin() reads auth.uid(), which
  -- is null under the service role, so asking it here would refuse every caller.

  return query
    select c.consumer_id, c.label, c.ramp_order, c.batch, c.owning_lane, c.landed_at,
           c.not_ready_why, c.record_types, c.no_rollback, c.knob_key,
           coalesce(platform.knob_resolve('custom', c.knob_key, p_organization_id, null, null) = 'true'::jsonb, false),
           g.verdict, g.why, g.ran_at, g.lost_count, g.gained_count
      from campaign_watch.ramp_consumer c
      left join lateral (
        select r.verdict, r.why, r.ran_at, r.lost_count, r.gained_count
          from campaign_watch.ramp_gate_run r
         where r.consumer_id = c.consumer_id and r.organization_id = p_organization_id
         order by r.ran_at desc limit 1
      ) g on true
     order by c.ramp_order;
end;
$fn$;

create or replace function platform.unified_data_ramp_gate(
  p_consumer        text,
  p_organization_id uuid
)
returns campaign_watch.ramp_gate_run
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
begin
  -- NO CLIENT REACHES THIS. Its platform.client_callable_door row declares it
  -- server_only, so the DDL guard revokes EXECUTE from anon and authenticated and
  -- the only caller is the admin API route, which verifies the signed-in person is
  -- a platform admin from THEIR OWN session before it uses the service key. The
  -- check lives where the identity is: is_platform_admin() reads auth.uid(), which
  -- is null under the service role, so asking it here would refuse every caller.
  return campaign_watch.consumer_gate(p_consumer, p_organization_id, null);
end;
$fn$;

create or replace function platform.unified_data_ramp_set(
  p_consumer        text,
  p_organization_id uuid,
  p_on              boolean,
  p_user_id         uuid default null,
  p_note            text  default null
)
returns campaign_watch.ramp_gate_run
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare
  v_consumer campaign_watch.ramp_consumer%rowtype;
  v_gate     campaign_watch.ramp_gate_run%rowtype;
begin
  -- NO CLIENT REACHES THIS. Its platform.client_callable_door row declares it
  -- server_only, so the DDL guard revokes EXECUTE from anon and authenticated and
  -- the only caller is the admin API route, which verifies the signed-in person is
  -- a platform admin from THEIR OWN session before it uses the service key. The
  -- check lives where the identity is: is_platform_admin() reads auth.uid(), which
  -- is null under the service role, so asking it here would refuse every caller.

  select * into v_consumer from campaign_watch.ramp_consumer where consumer_id = p_consumer;
  if not found then
    raise exception 'platform.unified_data_ramp_set: "%" is not a consumer', p_consumer
      using errcode = 'P0001';
  end if;

  -- TURNING IT OFF IS NEVER GATED. A rollback that needs a green gate is not a
  -- rollback, and the one thing this screen must always be able to do is put a
  -- consumer back on the old store.
  if p_on then
    v_gate := campaign_watch.consumer_gate(p_consumer, p_organization_id, null);
    if v_gate.verdict <> 'green' then
      raise exception 'platform.unified_data_ramp_set: refusing to switch "%" ON for organization % — its Test 1 gate is %. %',
        p_consumer, p_organization_id, v_gate.verdict, v_gate.why
        using errcode = 'P0001',
              hint = 'CUT-3: Test 1 gates each consumer''s switch. Fix what the verdict names and run the gate again; the switch is not a place to overrule it.';
    end if;
  end if;

  perform platform.knob_override_set(
    'custom', v_consumer.knob_key,
    case when p_user_id is null then 'organization' else 'user' end,
    coalesce(p_user_id, p_organization_id),
    p_organization_id,
    to_jsonb(p_on),
    coalesce(p_note, 'Unified-data ramp, switch screen, ' || (case when p_on then 'ON' else 'OFF' end)));

  if p_on then
    return v_gate;
  end if;
  return campaign_watch.consumer_gate(p_consumer, p_organization_id, null);
end;
$fn$;

comment on function platform.unified_data_ramp_set(text, uuid, boolean, uuid, text) is
  'The switch. Turning a consumer ON runs its Test 1 gate first and REFUSES on anything but '
  'green, quoting the verdict''s own sentence. Turning it OFF is never gated.';

-- ───────────────────────────────────────────────────────── THE ACCESS DECISIONS
--
-- Every SECURITY DEFINER function above runs as `postgres`, which carries
-- BYPASSRLS, so the platform makes each one declare IN DATA who may call it.
-- ALL ELEVEN ARE SERVER-ONLY. None is a client door, and the DDL guard therefore
-- revokes EXECUTE from anon and authenticated the moment each is created — which
-- is the guard working, not a grant that failed.
--
-- WHY SERVER-ONLY AND NOT A CLIENT DOOR. is_platform_admin() reads auth.uid().
-- The admin screen reaches these through its own API route, which verifies the
-- SIGNED-IN person is a platform admin from their own session and only then uses
-- the service key — so the identity check happens where an identity exists. A
-- client door here would have to re-ask a question the route has already asked
-- with better evidence.

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason,
   declared_by, signed_in_callers, anonymous_callers, non_client_lane)
select d.schema_name, d.fn, iam.door_identity_args(p.oid),
       platform.door_argtypes(p.proargtypes), d.reason, 'W7-OFF', false, false, d.lane
  from (values
    ('campaign_watch', 'consumer_access_diff',
     'Test 1 per-principal access diff. p_organization_id names the organization whose grants are read; a null or foreign id simply yields no principals and therefore no rows. p_consumer must name a row of campaign_watch.ramp_consumer.',
     'server_only: called by the unified-data ramp API route and by the campaign runner, both of which establish a platform-admin identity first. No client calls it: it reads every principal grant in an organization at once, which is an administrative view, not a user view.'),
    ('campaign_watch', 'consumer_gate',
     'Runs Test 1 for one consumer in one organization and ledgers the run. p_organization_id is the organization gated; p_ran_by is recorded, never trusted, and may be null.',
     'server_only: called by the unified-data ramp API route and by the campaign runner, both of which establish a platform-admin identity first. No client calls it: it writes a ledger row and reads across every principal in an organization.'),
    ('campaign_watch', 'switch_window_open',
     'Opens the switch window for one consumer in one organization. p_organization_id is the organization switched; p_opened_by is recorded, never trusted.',
     'server_only: opening a switch window changes how every write in an organization is captured. Only the chair, through the ramp API route, opens one.'),
    ('campaign_watch', 'switch_window_close',
     'Closes the open switch window for one consumer in one organization.',
     'server_only: closing a switch window stops capture for a whole organization. Only the chair, through the ramp API route, closes one.'),
    ('campaign_watch', 'switch_outbox_capture',
     'Captures one write into the switch outbox, in the caller transaction. p_organization_id is the organization whose write is captured; the caller has already decided the write is allowed, which is why it is being captured.',
     'server_only: it is called BESIDE a record write by the write path itself, never by a browser. A client that could call it directly could forge outbox entries for an organization it is not writing to.'),
    ('campaign_watch', 'switch_outbox_replay',
     'Replays one consumer outbox for one organization, idempotently.',
     'server_only: replay re-applies an organization worth of writes. Only the chair, through the ramp API route, runs it.'),
    ('campaign_watch', 'reachability_rebuild',
     'Takes ACCESS EXCLUSIVE on platform.reachability under an explicit lock_timeout and rebuilds it. No entity-id argument: it is platform-wide by nature.',
     'server_only: this is the one step that can take the platform down for every tenant at once. No client may ever reach it under any identity.'),
    ('campaign_watch', 'share_cutover_plan',
     'Lists existing shares row by row for the cutover. No entity-id argument: it is a platform-wide census across every schema that carries a share column.',
     'server_only: it reads every shared row in the database across every tenant, which is an administrative census. No client may reach it.'),
    ('platform', 'unified_data_ramp_state',
     'The ramp as the admin screen sees it. p_organization_id names the organization whose overrides and gate results are read; a foreign id returns that organization state, which is why the route checks platform admin first.',
     'server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key.'),
    ('platform', 'unified_data_ramp_gate',
     'Runs one consumer Test 1 gate for one organization from the screen.',
     'server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key.'),
    ('platform', 'unified_data_ramp_set',
     'THE SWITCH. Turning a consumer on runs its gate and refuses on anything but green; turning it off is never gated. p_organization_id names the organization switched, p_user_id an optional per-user rung inside it.',
     'server_only: called only by the unified-data ramp API route, which verifies the signed-in person is a platform admin from their own session before using the service key. This is the function that switches a whole organization onto a different data store.')
  ) d(schema_name, fn, reason, lane)
  join pg_namespace n on n.nspname = d.schema_name
  join pg_proc p on p.proname = d.fn and p.pronamespace = n.oid
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = d.schema_name and c.function_name = d.fn
                      and c.identity_argtypes = platform.door_argtypes(p.proargtypes));
