-- VIS-2 (3 of 3) — "WHO COULD SEE THIS RECORD ON THAT DAY", ASKED OUT LOUD.
--
-- VIS-16 is in the contract and T15 asks it in words: *"Ask 'who could see Patient 7's record
-- on March 3, 2026' and get the answer from History, including principals who have since lost
-- access."* MEASURED LIVE, 2026-09-19: schema `custom` holds 266 functions and NOT ONE of them
-- takes a moment in time and returns a principal. `custom.query_record_as_of` and
-- `custom.query_table_as_of` replay the VALUES of a record on a date; the question of who
-- could REACH it on that date could not be put to the database at all. The verifier could not
-- ask it, so the row was carried on the strength of a benchmark alone.
--
-- IT IS ANSWERED FROM HISTORY, AND NOTHING NEW IS STORED. W3-HIST already opened exactly the
-- two capture windows this needs — `custom.record` (2026-09-18 19:45:20Z) and `iam.permissions`
-- (2026-09-18 19:47:43Z, whose note says in as many words "VIS-16 ... replayed from these
-- rows") — and `membership` has been captured longer than either. Containment needs no third
-- window: a record's parent is `custom.containment_parent(data)` ON THE RECORD ITSELF and a
-- carrying relation IS a record of `data_class = 'relation'`, so both are already inside the
-- `custom.record` history. No new trigger, no new table, no write amplification on
-- `platform.associations`. VIS-16's "no separate access-history store is kept" is kept.
--
-- WHAT THIS FILE LANDS
--
--   · `custom.record_state_as_of(record, at)` — one record's row as it stood at that moment,
--     with `replayed` saying where the answer came from. History keeps CHANGES: a record that
--     has not been touched since its window opened has no history row at all, and for that one
--     the live row IS its state then, which the flag says out loud rather than the door
--     reporting a silent blank.
--
--   · `custom.visibility_as_of(organization, record, at)` — ONE ROW PER PRINCIPAL, each
--     carrying the level, what it came through, the sentence why, and `replayed`. Four arms,
--     every one replayed at `p_at` rather than read live, which is the whole of "including
--     principals who have since lost access": a grant revoked yesterday is still the grant
--     that was live on the day asked about, and it is named.
--       1. THE OWNER      — `created_by` on the record as it stood then. VIS-25's top rung.
--       2. GRANTS         — every `iam.permissions` row live at that moment on the record OR
--          on any container it was inside then, to a person or to another organization
--          (VIS-23). Revoked, deleted and expired grants are judged by their state THEN.
--       3. THE CONTAINERS — the walk up is itself replayed: containment parents and carrying
--          relations as they stood, capped at 32 hops and 1024 nodes, and a trip of either cap
--          is RETURNED AS A ROW that says so. It is never silently short.
--       4. MEMBERSHIP     — the organization's members at that moment, from `membership`
--          history, at the level their role conferred, only where the record's own visibility
--          then admitted the organization lane at all.
--
--     THREE THINGS IT CANNOT REPLAY, and it says so in the row rather than pretending:
--     `custom/member_default_visibility` and `custom/member_default_level` (the knob registry
--     keeps no history — today's values are used and `replayed` is false on those rows), and
--     `custom.carrying_rule`'s `conveys_max` per edge (a live registry, so a grant on a
--     container is reported at the grant's own level with the container named, and VIS-3's
--     minimum-along-the-path is left to the reader of the answer).
--
--     BEFORE HISTORY BEGINS IT REFUSES, WITH THE DATE. A moment earlier than the capture
--     window is a question this database cannot answer, and answering it from the live tables
--     would be the worst possible lie — it would report today's grants as that day's.
--
--   · AN ADMIN OF THE ORGANIZATION ASKS IT. `custom.assert_client_may_reach` is the wall, then
--     the caller must be an owner or admin there (or the store's own role). "Who could see this"
--     is an audit question about other people, which is not a question a member gets to ask.
--
-- ADDITIVE: two new functions and two door rows. It reads history and writes nothing.
--
-- THE INVERSE: migrations/inverse/vis2_who_could_see_this_on_a_date_down.sql

set lock_timeout = '3s';
set statement_timeout = '120s';


-- ────────────────────────────────── ONE RECORD, AS IT STOOD AT THAT MOMENT
create or replace function custom.record_state_as_of(p_record_id uuid, p_at timestamptz)
returns table(state jsonb, replayed boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
-- The latest `history.row_versions` snapshot of this record at or before p_at. History keeps
-- CHANGES, so a record untouched since its capture window opened has no snapshot at all: for
-- that one the LIVE row is its state then, and `replayed = false` says which of the two
-- answers this is. A record whose live row was created AFTER p_at and has no snapshot did not
-- exist then, and the answer is no row.
begin
  return query
    select h.row_data, true
      from history.row_versions h
     where h.entity_type = 'custom.record'
       and h.row_id = p_record_id
       and h.occurred_at <= p_at
     order by h.occurred_at desc, h.id desc
     limit 1;
  if found then
    return;
  end if;

  return query
    select to_jsonb(r), false
      from custom.record r
     where r.id = p_record_id
       and r.created_at <= p_at;
end;
$$;


-- ───────────────────────────── WHO COULD SEE THIS RECORD AT THAT MOMENT (VIS-16 / T15)
create or replace function custom.visibility_as_of(
  p_organization_id uuid, p_record_id uuid, p_at timestamptz)
returns table(principal_kind text, principal_id uuid, level public.permission_level,
              through_kind text, through_id uuid, reason text, replayed boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
declare
  c_max_depth constant integer := 32;
  c_max_nodes constant integer := 1024;
  v_me        uuid := custom.query_principal();
  v_from_rec  timestamptz;
  v_from_grn  timestamptz;
  v_from      timestamptz;
  v_state     jsonb;
  v_replayed  boolean;
  v_nodes     uuid[] := '{}';
  v_flags     boolean[] := '{}';
  v_frontier  uuid[];
  v_next      uuid[];
  v_depth     integer := 0;
  v_parent    uuid;
  v_id        uuid;
  v_capped    boolean := false;
  v_vis       text;
  r           record;
  v_member_default public.permission_level;
  v_lane_open boolean;
begin
  -- THE WALL, then the authority. Reading who ELSE could see something is an audit question.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.visibility_as_of');
  if not (custom.query_is_store_owner()
          or (v_me is not null and public.is_org_admin_for(v_me, p_organization_id))) then
    raise exception 'Only an owner or admin of this organization can ask who could see a record.'
      using errcode = '42501',
            hint = 'VIS-16 / VIS-N-3: "who could see this on that day" is an audit question about other people. A member can ask what THEY can see (custom.query_can_see); this door answers about everybody.';
  end if;

  if p_at is null then
    raise exception 'Asking who could see a record needs a moment to ask about.'
      using errcode = '22023', hint = 'Pass a timestamp, for example custom.visibility_as_of(org, record, ''2026-09-19 12:00Z'').';
  end if;

  -- BEFORE HISTORY BEGINS, IT REFUSES. Answering from the live tables would report today's
  -- grants as that day's, which is the one wrong answer this door must never give.
  select w.opened_at into v_from_rec from history.capture_window w where w.entity_type = 'custom.record';
  select w.opened_at into v_from_grn from history.capture_window w where w.entity_type = 'iam.permissions';
  v_from := greatest(coalesce(v_from_rec, 'infinity'::timestamptz), coalesce(v_from_grn, 'infinity'::timestamptz));
  if v_from is null or p_at < v_from then
    raise exception 'History for this store starts at %, so who could see a record on % cannot be answered.',
      coalesce(to_char(v_from, 'YYYY-MM-DD HH24:MI TZ'), 'no date at all — no capture window is open'),
      to_char(p_at, 'YYYY-MM-DD HH24:MI TZ')
      using errcode = '22023',
            hint = 'VIS-16: the answer is replayed from history.row_versions, never read from the live tables. Reading the live tables for an older date would report today''s grants as that day''s, which is worse than no answer. Ask about a moment at or after the date above.';
  end if;

  select s.state, s.replayed into v_state, v_replayed
    from custom.record_state_as_of(p_record_id, p_at) s;
  if v_state is null or (v_state ->> 'organization_id')::uuid is distinct from p_organization_id then
    raise exception 'There was no record % in this organization at %.',
      p_record_id, to_char(p_at, 'YYYY-MM-DD HH24:MI TZ')
      using errcode = '02000',
            hint = 'It had not been created yet, it belonged to another organization then, or it never existed.';
  end if;
  v_vis := v_state ->> 'visibility';

  -- ARM 1 — THE OWNER, as the record recorded them then (VIS-25).
  if nullif(v_state ->> 'created_by', '') is not null then
    principal_kind := 'user';
    principal_id   := (v_state ->> 'created_by')::uuid;
    level          := iam.top_content_level();
    through_kind   := 'ownership';
    through_id     := p_record_id;
    reason         := 'They created this record, which is the top rung of the ladder and needs no grant row.';
    replayed       := v_replayed;
    return next;
  end if;

  -- THE WALK UP, REPLAYED. Containment parents and carrying relations as they stood then.
  v_nodes := array[p_record_id]; v_flags := array[v_replayed];
  v_frontier := array[p_record_id];
  while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < c_max_depth loop
    v_depth := v_depth + 1;
    v_next := '{}';
    foreach v_id in array v_frontier loop
      select s.state, s.replayed into v_state, v_replayed
        from custom.record_state_as_of(v_id, p_at) s;
      continue when v_state is null;

      -- the containment parent, off the record's own document
      v_parent := custom.containment_parent(v_state -> 'data');
      if v_parent is not null and not (v_nodes @> array[v_parent]) then
        v_next := v_next || v_parent; v_nodes := v_nodes || v_parent; v_flags := v_flags || v_replayed;
      end if;

      -- every carrying relation that pointed AT this node then. A relation is a record, so
      -- this is the same history, asked the other way round.
      for r in
        select distinct (x.state -> 'data' ->> 'from')::uuid as container
          from custom.record c
          cross join lateral custom.record_state_as_of(c.id, p_at) x
         where c.organization_id = p_organization_id
           and c.data_class = 'relation'
           and x.state is not null
           and x.state ->> 'data_class' = 'relation'
           and coalesce((x.state -> 'data' ->> 'carrying')::boolean, false)
           and coalesce(x.state -> 'data' ->> 'kind', 'referenced') <> 'owned'
           and nullif(x.state -> 'data' ->> 'to', '') = v_id::text
           and nullif(x.state ->> 'deleted_at', '') is null
      loop
        if r.container is not null and not (v_nodes @> array[r.container]) then
          v_next := v_next || r.container; v_nodes := v_nodes || r.container; v_flags := v_flags || true;
        end if;
      end loop;
    end loop;
    if coalesce(array_length(v_nodes, 1), 0) > c_max_nodes then
      v_capped := true;
      exit;
    end if;
    v_frontier := v_next;
  end loop;
  if v_depth >= c_max_depth and coalesce(array_length(v_frontier, 1), 0) > 0 then
    v_capped := true;
  end if;

  if v_capped then
    principal_kind := 'ceiling';
    principal_id   := null;
    level          := null;
    through_kind   := 'walk';
    through_id     := p_record_id;
    reason         := format('The replayed walk up from this record hit its ceiling (%s hops or %s containers), so the answer below may be SHORT: a grant on a container further up would not be listed. It is reported rather than hidden.',
                             c_max_depth, c_max_nodes);
    replayed       := true;
    return next;
  end if;

  -- ARM 2 — THE GRANTS, replayed on the record and on every container it was inside then.
  return query
    with live as (
      select distinct on (h.row_id) h.row_id, h.row_data, h.operation
        from history.row_versions h
       where h.entity_type = 'iam.permissions'
         and h.occurred_at <= p_at
       order by h.row_id, h.occurred_at desc, h.id desc
    ), held as (
      select l.row_data as g
        from live l
       where l.operation <> 'DELETE'
         and coalesce(l.row_data ->> 'status', 'active') = 'active'
         and (nullif(l.row_data ->> 'expires_at', '') is null
              or (l.row_data ->> 'expires_at')::timestamptz > p_at)
         and l.row_data ->> 'resource_type' = 'record'
         and (l.row_data ->> 'resource_id')::uuid = any (v_nodes)
    )
    select case when nullif(h.g ->> 'granted_to_user_id', '') is not null then 'user'
                when nullif(h.g ->> 'granted_to_organization_id', '') is not null then 'organization'
                else 'everyone' end,
           coalesce(nullif(h.g ->> 'granted_to_user_id', '')::uuid,
                    nullif(h.g ->> 'granted_to_organization_id', '')::uuid),
           (h.g ->> 'permission_level')::public.permission_level,
           case when (h.g ->> 'resource_id')::uuid = p_record_id then 'grant' else 'container' end,
           (h.g ->> 'resource_id')::uuid,
           case when (h.g ->> 'resource_id')::uuid = p_record_id
                then 'A grant held directly on this record at that moment.'
                else 'A grant held at that moment on a container this record was inside, which carried down to it. What each edge conveys (custom.carrying_rule.conveys_max) is a live registry with no history, so the level shown is the grant''s own and VIS-3''s minimum-along-the-path is not applied here.' end,
           true
      from held h;

  -- ARM 3 — MEMBERSHIP, as the organization stood then, and only where the record's own
  -- visibility admitted the organization lane at all (DD-136).
  if coalesce(nullif(v_vis, ''), 'internal')::platform.visibility >= 'internal'::platform.visibility then
    v_lane_open := iam.member_lane_open(p_organization_id);
    v_member_default := iam.member_default_level(p_organization_id, nullif(v_state ->> 'table_id', '')::uuid);
    return query
      with live as (
        select distinct on (h.row_id) h.row_id, h.row_data, h.operation
          from history.row_versions h
         where h.entity_type = 'membership'
           and h.occurred_at <= p_at
         order by h.row_id, h.occurred_at desc, h.id desc
      ), mem as (
        select l.row_data as m
          from live l
         where l.operation not in ('DELETE', 'SOFT_DELETE')
           and nullif(l.row_data ->> 'deleted_at', '') is null
           and coalesce(l.row_data ->> 'status', 'active') = 'active'
           and l.row_data ->> 'container_type' = 'organization'
           and (l.row_data ->> 'container_id')::uuid = p_organization_id
      )
      select 'user',
             (m.m ->> 'user_id')::uuid,
             case when m.m ->> 'role' in ('owner', 'admin') then iam.top_content_level()
                  else v_member_default end,
             'organization',
             p_organization_id,
             case when m.m ->> 'role' in ('owner', 'admin')
                  then format('They were an %s of this organization at that moment, which reaches every record the organization can see.', m.m ->> 'role')
                  when not v_lane_open
                  then 'They were a member of this organization at that moment. This organization now says membership alone shows nothing (its "What members can see by default" setting), and that setting keeps no history — so this is TODAY''S answer applied to that day, not a replay.'
                  else 'They were a member of this organization at that moment, and membership alone reached this record. The level comes from custom/member_default_level, which keeps no history — so the level is today''s, applied to that day.' end,
             false
        from mem m
       where m.m ->> 'role' in ('owner', 'admin')
          or (v_lane_open and v_member_default is not null);
  end if;
end;
$$;


-- ─────────────────────────────────────────── THE DOORS, DECLARED IN THIS SAME TRANSACTION
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'custom', p.proname,
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       v.signed_in, false, v.lane,
       'migrations/campaign/vis2_who_could_see_this_on_a_date.sql (lane VIS-2)',
       v.reason
  from (values
    ('visibility_as_of', true, null::text,
     'The audit answer to "who could see this record on that day" (VIS-16 / T15). p_organization_id is walled by custom.assert_client_may_reach and the caller must then be an owner or admin of it, because the answer is about other people; p_record_id is resolved inside that organization from history and a record that did not exist there then raises 02000; a null p_at raises 22023 and a p_at before the capture window raises 22023 naming the date history starts, rather than reading the live tables and reporting today''s grants as that day''s.'),
    ('record_state_as_of', false,
     'server_only: it returns a record''s whole stored row with no access decision of its own, by design - it is the replay primitive custom.visibility_as_of walks with, and that door is where the organization wall and the admin test live. A client door onto it would hand any signed-in person any record''s history.',
     'One record''s row as it stood at a moment. p_record_id is a record id and a null one returns no rows; p_at is the moment, and a record created after it returns no rows. It decides nothing itself - its only caller is custom.visibility_as_of, which decides first.')
  ) as v(fn, signed_in, lane, reason)
  join pg_proc p on p.pronamespace = 'custom'::regnamespace and p.proname = v.fn
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select * from custom.reopen_declared_doors();
