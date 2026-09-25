-- VIS-FIX — THE RED TWIN of `visfix_green.sql`.
--
-- It puts the two defects BACK inside one rolled-back transaction and proves that every clause the
-- green suite asserts then gives the WRONG answer. A guard you cannot show failing is not a guard.
--
-- RUN IT (against the MAIN database, same connection as the green suite):
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/visfix_red.sql
--
-- It ends in ROLLBACK, so the restored-broken bodies and the disabled trigger never outlive it.
-- It takes about a minute, because two of its clauses are the 30-second cancellations themselves.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A red twin's job is to prove the GREEN suite's
-- clauses flip, so it has to ask the SAME questions from the SAME seat. It used to ask
-- `custom.has_visibility` — which holds no client grant and is nobody's door — as the role that
-- OWNS `custom.record`, about a principal who was not a member of the organization it wrote into,
-- and it wrote that organization's records with raw INSERTs. It now builds ONE disposable
-- organization of its own, makes `admin@admin.com` its owner and `test@test.com` (Dana) a member
-- with `custom/member_default_visibility` set to `shared_only` so MEMBERSHIP HANDS HER NOTHING,
-- takes the seat `authenticated` in PART 0 and proves it holds it, and asks every visibility
-- clause AS DANA through `custom.query_can_see`, exactly as visfix_green.sql does.
--
-- WHAT STAYS OUTSIDE THE SEAT, and why: restoring the two slow bodies, disabling the containment
-- trigger and putting the old `custom.containment_edges` back are DDL — no door does DDL, and the
-- two slow clauses are maintenance lanes with no client grant. They assert nothing about what a
-- person may do. The RECORDS, the Table, the Home placement, the carrying link and the share are
-- all written through the doors a person has (`custom.table_declare`, `custom.field_declare`,
-- `custom.record_write`, `custom.home_add`, `custom.relation_carry`, `custom.share_grant`), and
-- every one of those doors leaves the edge to the trigger this file has just switched off —
-- which is precisely why the defect reproduces through them.
--
-- 🚨 READ THE ORDER. The two SLOW clauses run FIRST, while nothing is locked. The trigger is only
-- disabled afterwards, for the few milliseconds the visibility clauses need — `ALTER TABLE …
-- DISABLE TRIGGER` takes an ACCESS EXCLUSIVE lock on `custom.record` and its sixteen partitions,
-- and holding that for a minute would block every other session writing the store.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'visfix_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'visfix_red_twin', true);

-- ── DEFECT 2 PUT BACK: the per-container bodies T1 could never finish ──────────────────────
create or replace function custom.visibility_parity()
 returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
               stored_level permission_level, derived_level permission_level, reason text)
 language sql stable security definer set search_path to ''
as $$
  with containers as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), derived as (
    select c.ct as container_type, c.ci as container_id, d.item_type, d.item_id, d.depth, d.max_level
    from containers c
    cross join lateral custom.derive_visibility(c.ct, c.ci) d
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null;
$$;

create or replace function custom.visibility_cache_rebuild()
 returns integer language plpgsql security definer set search_path to ''
as $$
declare rec record; v_n integer := 0;
begin
  truncate custom.visibility_cache;
  for rec in select distinct e.container_type as ct, e.container_id as ci from custom.carrying_edges e
  loop
    v_n := v_n + custom.visibility_warm(rec.ct, rec.ci);
  end loop;
  return v_n;
end;
$$;

-- 🚨 THE 30 s LIMIT IS SET AT THE TOP LEVEL, not inside the block. `statement_timeout` is armed
-- when a top-level statement STARTS, so a `set_config('statement_timeout', …, true)` written inside
-- the DO block arrives too late to bind the block that is already running — measured here: the
-- per-container diff ran to completion in 76,743 ms with the timeout set from inside. Set from out
-- here, the DO block IS the statement the limit binds, the inner SELECT is cancelled, and the
-- handler below catches the cancellation.
set local statement_timeout = '30s';
-- `lock_timeout` is deliberately SHORT here and contention is deliberately RETRIED rather than
-- waited out. The only cancellation these two blocks may accept as the defect is 57014, the 30 s
-- statement limit they are measuring; a lock timeout (55P03) or a deadlock (40P01) is another
-- session holding `custom.visibility_cache`, which is contention and must never be read as "T1's
-- rebuild cannot finish". Waiting indefinitely instead just turns that into a deadlock.
set local lock_timeout = '5s';

do $slow1$
declare v_t0 timestamptz; v_n integer;
begin
  begin
    v_t0 := clock_timestamp();
    select count(*) into v_n from custom.visibility_parity();
    raise exception '[RED FAILED] the per-container diff finished in % ms and returned % row(s) - '
                    'the defect this twin exists to show is not there',
      round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1), v_n;
  exception
    when sqlstate '57014' then
      raise notice '[RED] custom.visibility_parity() was CANCELLED by the 30 s limit - T1''s diff cannot be run.';
  end;
end;
$slow1$;

set local statement_timeout = '30s';
-- `lock_timeout` is deliberately SHORT here and contention is deliberately RETRIED rather than
-- waited out. The only cancellation these two blocks may accept as the defect is 57014, the 30 s
-- statement limit they are measuring; a lock timeout (55P03) or a deadlock (40P01) is another
-- session holding `custom.visibility_cache`, which is contention and must never be read as "T1's
-- rebuild cannot finish". Waiting indefinitely instead just turns that into a deadlock.
set local lock_timeout = '5s';

do $slow2$
declare v_t0 timestamptz; v_n integer; v_try integer := 0; v_done boolean := false;
begin
  while not v_done and v_try < 5 loop
    v_try := v_try + 1;
    begin
      v_t0 := clock_timestamp();
      select custom.visibility_cache_rebuild() into v_n;
      raise exception '[RED FAILED] the per-container rebuild finished in % ms (% rows)',
        round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1), v_n;
    exception
      when sqlstate '57014' then
        v_done := true;
        raise notice '[RED] custom.visibility_cache_rebuild() was CANCELLED by the 30 s limit - T1''s other half cannot be run.';
      when sqlstate '55P03' or sqlstate '40P01' then
        -- CONTENTION, NOT THE DEFECT, and it says so rather than passing quietly.
        raise notice '[retry %/5] another session holds custom.visibility_cache (%) - this is contention, not T1', v_try, sqlstate;
    end;
  end loop;
  if not v_done then
    raise exception '[RED NOT MEASURED] custom.visibility_cache_rebuild() could not get the lock in 5 attempts. This is contention on the live store, not the defect - run it again when the store is quieter.';
  end if;
end;
$slow2$;

set local statement_timeout = '60s';
-- The ALTER TABLE below takes ACCESS EXCLUSIVE on `custom.record` and its sixteen partitions.
-- On a busy store it will not get that lock inside the two-second default, and a lock timeout
-- here is contention, never the defect — so it waits. Everything after it is milliseconds, and
-- the transaction rolls back, so the lock is held for about as long as those few statements take.
set local lock_timeout = '10s';

-- ── DEFECT 1 PUT BACK: the containment that never reaches the ladder ───────────────────────
-- From here the lock is held, so everything below is milliseconds.
-- 🚨 DERIVED FROM THE LIVE CATALOGUE (lane RED-SUITES-3, 2026-09-21). This line named ONE
-- trigger, `zz_w2_containment_association`, and
-- `writeperf2_the_after_triggers_fire_once_per_statement.sql` replaced it with the
-- STATEMENT-level pair `zz_w2_containment_association_s_i` / `_s_u` over
-- `custom._containment_association_stmt_insert` / `_stmt_update` — so this file died on
-- "trigger ... does not exist" before it planted anything, and the whole red twin proved
-- nothing. It now asks the catalogue which triggers on `custom.record` write the containment
-- edge, disables every one of them, and RAISES if there are none left to disable.
do $containment$
declare v_sql text; v_n integer := 0;
begin
  for v_sql in
    select format('alter table custom.record disable trigger %I', tg.tgname)
      from pg_trigger tg
      join pg_proc p on p.oid = tg.tgfoid
      join pg_namespace n on n.oid = p.pronamespace
     where tg.tgrelid = 'custom.record'::regclass
       and not tg.tgisinternal
       and n.nspname = 'custom' and p.proname like '\_containment\_association%'
     order by tg.tgname
  loop
    execute v_sql; v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'DEFECT 1 precondition: no trigger on custom.record calls a custom._containment_association* body, so there is no containment edge to take away';
  end if;
  raise notice 'DEFECT 1 — % containment-edge trigger(s) disabled, derived from the live catalogue.', v_n;
end
$containment$;

create or replace function custom.containment_edges(p_organization_id uuid)
 returns table(parent_id uuid, child_id uuid, via text)
 language sql stable set search_path to 'pg_catalog'
as $$
  select custom.containment_parent(r.data), r.id, 'contained'::text
    from custom.record r
   where r.organization_id = p_organization_id and r.deleted_at is null
     and custom.containment_parent(r.data) is not null
  union all
  select (r.data ->> 'from')::uuid, (r.data ->> 'to')::uuid, 'carrying'::text
    from custom.record r
   where r.organization_id = p_organization_id and r.deleted_at is null
     and r.data_class = 'relation'
     and coalesce((r.data ->> 'carrying')::boolean, false)
     and r.data ->> 'from' is not null and r.data ->> 'to' is not null;
$$;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_hq uuid; v_proj uuid; v_x uuid; v_y uuid; v_risk uuid; v_r1 uuid;
  v_note_tbl uuid; v_note uuid; v_caught text;
begin
  perform set_config('app.actor_system', 'campaign-test/visfix_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenline Landscaping Crew — Riverside Yard', 'greenline-landscaping-riverside-red-' || substr(v_org::text, 1, 8), 'GLR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'visfix_red'),
    -- The same property the green suite rests on: membership conveys NOTHING here, so every
    -- `false` below is the missing edge and not a default that was never there.
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'visfix_red');

  -- A Home record is made by the onboarding path and no client door covers it.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'VIS-FIX RED HQ')) returning id into v_hq;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- ── the same fixtures the green suite builds, through the same doors ──────────────────
  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'visfix_red_project', 'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
    'title_field', 'name', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_proj, jsonb_build_object('key','name','label','Name','plain','text','sort',10));
  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('name','Project X','parent_id', v_hq::text));
  v_y := custom.record_write(v_org, v_proj, jsonb_build_object('name','Project Y','parent_id', v_hq::text));

  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'visfix_red_risk', 'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_risk, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.home_add(v_org, v_risk, v_x);
  v_r1 := custom.record_write(v_org, v_risk, jsonb_build_object('title','X risk','parent_id', v_x::text));

  v_note_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Note', 'slug', 'visfix_red_note', 'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'body')),
    'title_field', 'body', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_note_tbl, jsonb_build_object('key','body','label','Body','plain','text','sort',10));
  v_note := custom.record_write(v_org, v_note_tbl, jsonb_build_object('body','the note','parent_id', v_hq::text));
  -- The carrying link through the door a person has. `custom.relation_carry` writes the
  -- `relation` record and leaves the EDGE to `zz_w2_containment_association` — the trigger this
  -- file has just switched off — which is why the defect reproduces through the real door.
  perform custom.relation_carry(v_org, v_x, v_note);

  -- The share through the door, not an INSERT into iam.permissions.
  perform custom.share_grant(v_org, v_x, 'user', c_dana, 'viewer'::public.permission_level);

  -- ════════════════════════════════════════════════════════════════════════════
  -- Every clause below is asked AS DANA, through `custom.query_can_see` — the one door every
  -- read in the store climbs, and the same one visfix_green.sql asks.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- clause 1's RED: the store has the containment and the ladder does not, so the record
  -- inside the project she was shared does not reach her.
  if custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception '[RED FAILED] Dana already sees the contained record — the trigger is still on';
  end if;
  -- AND THE CONTROL, so this is not a door that refuses her everything and a seat that can ask
  -- nothing: the record she was shared DIRECTLY still reaches her, and reads back.
  if not custom.query_can_see(v_org, v_x, 'viewer') then
    raise exception '[RED FAILED] Dana cannot see Project X, which was shared with her directly — this file is measuring a broken seat, not the defect';
  end if;
  if (custom.read_record(v_org, v_x, false) ->> 'name') <> 'Project X' then
    raise exception '[RED FAILED] the record shared with Dana does not read back for her';
  end if;
  raise notice '[RED] clause 1 — query_can_see(contained record) = false for a viewer on the project that contains it, while the project itself still reads back.';

  -- clause 2's RED (T10): the Table homed in X is invisible to the person shared on X.
  if custom.query_can_see(v_org, v_risk, 'viewer') then
    raise exception '[RED FAILED] Dana already sees the Risk Table';
  end if;
  raise notice '[RED] clause 2 (T10) — shared on X, Dana cannot see the Risk Table homed in X.';

  -- clause 3's RED (T2): the note carried by A is invisible to a viewer on A.
  if custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception '[RED FAILED] Dana already sees the note';
  end if;
  raise notice '[RED] clause 3 (T2) — a viewer on A does not see the note A carries.';

  -- THE NEGATIVE CLAUSE, paired with the control above: she is a member who holds nothing
  -- beyond that one viewer grant, so a shape change is refused.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_risk, jsonb_build_object('label','Sneaked in','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '[RED FAILED] test@test.com added a column to a table she is not an admin of — this seat is not a client seat';
  end if;

  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '[RED] VIS-FIX: every clause the green suite asserts gives the wrong answer with the fix removed — asked from the seat `authenticated`, as test@test.com, through custom.query_can_see.';
end;
$t$;

rollback;
