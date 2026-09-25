-- chair-step: lane SHARE-TAILS (chair ruling 2026-09-25). The history replay stays honest about "mine". REPLACES custom.visibility_as_of (a repaired record replayed from today's row reports the visibility it really had, with a note row naming the repair; from the moment the rule took effect a personal record is carried by no container) and iam.member_default_level_as_of (membership confers nothing on a row whose Table was below internal at that moment, from the moment the rule took effect). iam.member_lane_open_as_of is an organization-wide knob with no record or Table in it, so there is nothing of the repair to bind there. No data is written. Same signatures.
-- based-on: custom.visibility_as_of(uuid, uuid, timestamp with time zone) 7b936e0c306ba038cd4f9112950073a6a341a0200c7caeb82bdd566b18c71d12
-- based-on: iam.member_default_level_as_of(uuid, uuid, timestamp with time zone) 4920ae9a5618ddd2f235b35204a89857e06f06d5e34626b4f20f5a86e96f2e4b
-- lane: SHARE-TAILS
-- INVERSE: migrations/inverse/sharetails_history_replay_knows_the_repair_down.sql
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.visibility_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(principal_kind text, principal_id uuid, level permission_level, through_kind text, through_id uuid, reason text, replayed boolean, held_from timestamp with time zone, held_to timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_lane_replayed  boolean;
  v_level_replayed boolean;
  v_table_id  uuid;
  v_born      timestamptz;
  -- SHARE-TAILS (2026-09-25): the moment "mine means only the people named" took effect, and the
  -- repair that went with it (custom._share_tails_mine_repair).
  c_mine_rule_from constant timestamptz := '2026-09-25 15:04:50.358246+00'::timestamptz;
  v_rep_vis   text;
  v_rep_at    timestamptz;
  v_personal_then boolean := false;
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
  v_table_id := nullif(v_state ->> 'table_id', '')::uuid;
  v_born := nullif(v_state ->> 'created_at', '')::timestamptz;

  -- 🚨 SHARE-TAILS — REPLAY KNOWS THE REPAIR. Three records on the explicit "mine" lane were still
  -- `internal` until the repair moved them to `personal`. When their state is replayed from
  -- history the visibility of the moment is already right; when it is NOT (no capture that far
  -- back, so custom.record_state_as_of fell back to TODAY's row), today's `personal` would be
  -- reported for a moment when every member could in fact read it. The repair table says what it
  -- was, and a note row says why.
  select k.visibility_before::text, k.repaired_at into v_rep_vis, v_rep_at
    from custom._share_tails_mine_repair k where k.record_id = p_record_id;
  if v_rep_at is not null and p_at < v_rep_at then
    if not coalesce(v_replayed, false) then
      v_vis := v_rep_vis;
    end if;
    principal_kind := 'note';
    principal_id   := null;
    level          := null;
    through_kind   := 'repair';
    through_id     := p_record_id;
    reason         := format('At that moment its owner had chosen "Only people I share it with", but the store still left it readable by every member of the organization (its visibility said %s). That mismatch was repaired at %s. The rows below are what really held at that moment.',
                             v_rep_vis, to_char(v_rep_at, 'YYYY-MM-DD HH24:MI TZ'));
    replayed       := true;
    held_from      := null;
    held_to        := v_rep_at;
    return next;
  end if;
  -- From the moment the rule took effect, a personal record is carried by no container
  -- (custom.reaches_directly, SHARE-TAILS); before it, the ladder of that day carried it.
  v_personal_then := p_at >= c_mine_rule_from
                     and coalesce(nullif(v_vis, ''), 'internal')::platform.visibility < 'internal'::platform.visibility;

  -- ARM 1 — THE OWNER, as the record recorded them then (VIS-25). Their reach began when the
  -- record did and no grant row ever ended it, which is what an open interval says.
  if nullif(v_state ->> 'created_by', '') is not null then
    principal_kind := 'user';
    principal_id   := (v_state ->> 'created_by')::uuid;
    level          := iam.top_content_level();
    through_kind   := 'ownership';
    through_id     := p_record_id;
    reason         := 'They created this record, which is the top rung of the ladder and needs no grant row.';
    replayed       := v_replayed;
    held_from      := v_born;
    held_to        := null;
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

      v_parent := custom.containment_parent(v_state -> 'data');
      if v_parent is not null and not (v_nodes @> array[v_parent]) then
        v_next := v_next || v_parent; v_nodes := v_nodes || v_parent; v_flags := v_flags || v_replayed;
      end if;

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
    held_from      := null;
    held_to        := null;
    return next;
  end if;

  -- ARM 2 — THE GRANTS, replayed on the record and on every container it was inside then,
  -- EACH WITH THE INTERVAL IT WAS HELD. `held_from` is when the version in force at p_at was
  -- written; `held_to` is the first later version that ENDS it — a DELETE, a status that is
  -- no longer active, or the grant's own expiry, whichever comes first. Null means the grant
  -- was still held, as far as history knows.
  return query
    with live as (
      select distinct on (h.row_id) h.row_id, h.row_data, h.operation, h.occurred_at
        from history.row_versions h
       where h.entity_type = 'iam.permissions'
         and h.occurred_at <= p_at
       order by h.row_id, h.occurred_at desc, h.id desc
    ), held as (
      select l.row_id, l.row_data as g, l.occurred_at as since
        from live l
       where l.operation <> 'DELETE'
         and coalesce(l.row_data ->> 'status', 'active') = 'active'
         and (nullif(l.row_data ->> 'expires_at', '') is null
              or (l.row_data ->> 'expires_at')::timestamptz > p_at)
         and l.row_data ->> 'resource_type' = 'record'
         and (l.row_data ->> 'resource_id')::uuid = any (v_nodes)
         and (not v_personal_then or (l.row_data ->> 'resource_id')::uuid = p_record_id)
    ), ended as (
      select h.row_id,
             (select min(n.occurred_at)
                from history.row_versions n
               where n.entity_type = 'iam.permissions'
                 and n.row_id = h.row_id
                 and n.occurred_at > p_at
                 and (n.operation = 'DELETE'
                      or coalesce(n.row_data ->> 'status', 'active') <> 'active'
                      or nullif(n.row_data ->> 'deleted_at', '') is not null)) as gone_at
        from held h
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
           true,
           h.since,
           least(e.gone_at, nullif(h.g ->> 'expires_at', '')::timestamptz)
      from held h
      left join ended e on e.row_id = h.row_id;

  -- ARM 3 — MEMBERSHIP, as the organization stood then, and only where the record's own
  -- visibility admitted the organization lane at all (DD-136). The interval is the membership
  -- row's own: when the version in force at p_at was written, and the first later version that
  -- removed, soft-deleted or deactivated it.
  if coalesce(nullif(v_vis, ''), 'internal')::platform.visibility >= 'internal'::platform.visibility then
    select l.lane_open, l.replayed into v_lane_open, v_lane_replayed
      from iam.member_lane_open_as_of(p_organization_id, p_at) l;
    select d.level, d.replayed into v_member_default, v_level_replayed
      from iam.member_default_level_as_of(p_organization_id, v_table_id, p_at) d;
    return query
      with live as (
        select distinct on (h.row_id) h.row_id, h.row_data, h.operation, h.occurred_at
          from history.row_versions h
         where h.entity_type = 'membership'
           and h.occurred_at <= p_at
         order by h.row_id, h.occurred_at desc, h.id desc
      ), mem as (
        select l.row_id, l.row_data as m, l.occurred_at as since
          from live l
         where l.operation not in ('DELETE', 'SOFT_DELETE')
           and nullif(l.row_data ->> 'deleted_at', '') is null
           and coalesce(l.row_data ->> 'status', 'active') = 'active'
           and l.row_data ->> 'container_type' = 'organization'
           and (l.row_data ->> 'container_id')::uuid = p_organization_id
      ), ended as (
        select m.row_id,
               (select min(n.occurred_at)
                  from history.row_versions n
                 where n.entity_type = 'membership'
                   and n.row_id = m.row_id
                   and n.occurred_at > p_at
                   and (n.operation in ('DELETE', 'SOFT_DELETE')
                        or nullif(n.row_data ->> 'deleted_at', '') is not null
                        or coalesce(n.row_data ->> 'status', 'active') <> 'active')) as gone_at
          from mem m
      )
      select 'user',
             (m.m ->> 'user_id')::uuid,
             case when m.m ->> 'role' in ('owner', 'admin') then iam.top_content_level()
                  else v_member_default end,
             'organization',
             p_organization_id,
             case when m.m ->> 'role' in ('owner', 'admin')
                  then format('They were an %s of this organization at that moment, which reaches every record the organization can see.', m.m ->> 'role')
                  when not v_lane_open and coalesce(v_lane_replayed, false)
                  then 'They were a member of this organization at that moment, and this organization said then that membership alone shows nothing (its "What members can see by default" setting, replayed from the settings history as it stood that day).'
                  when not v_lane_open
                  then 'They were a member of this organization at that moment. This organization NOW says membership alone shows nothing (its "What members can see by default" setting), and the settings history does not reach back that far — so this is today''s answer applied to that day, not a replay.'
                  when coalesce(v_level_replayed, false)
                  then 'They were a member of this organization at that moment, and membership alone reached this record. What membership conferred is replayed from the settings as they stood that day.'
                  else 'They were a member of this organization at that moment, and membership alone reached this record. The settings history does not reach back that far, so the level shown is today''s, applied to that day.' end,
             case when m.m ->> 'role' in ('owner', 'admin') then true
                  else coalesce(v_level_replayed, false) end,
             greatest(m.since, v_born),
             e.gone_at
        from mem m
        left join ended e on e.row_id = m.row_id
       where m.m ->> 'role' in ('owner', 'admin')
          or (v_lane_open and v_member_default is not null);
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION iam.member_default_level_as_of(p_organization_id uuid, p_table_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(level permission_level, replayed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- `iam.member_default_level`, arm for arm, replayed. The two knobs come from the registry's
-- history; the Table's own override and the `restricted`-field rule come from
-- `custom.record_state_as_of`, which is the store's own replay — so the answer is replayed
-- all the way down or it says it is not.
declare
  v_lane      boolean;
  v_lane_rep  boolean;
  v_word      text;
  v_word_rep  boolean;
  v_val       jsonb;
  v_table_rep boolean := true;
  v_state     jsonb;
  v_over      text;
  c_mine_rule_from constant timestamptz := '2026-09-25 15:04:50.358246+00'::timestamptz;
  v_tvis      text;
  v_rep_vis   text;
  v_rep_at    timestamptz;
begin
  select l.lane_open, l.replayed into v_lane, v_lane_rep
    from iam.member_lane_open_as_of(p_organization_id, p_at) l;
  if not v_lane then
    -- The organization said membership alone shows nothing. Same answer as the live function.
    return query select null::public.permission_level, coalesce(v_lane_rep, false);
    return;
  end if;

  begin
    select k.value, k.replayed into v_val, v_word_rep
      from platform.knob_value_as_of('custom', 'member_default_level', p_organization_id, p_at) k;
    v_word := v_val #>> '{}';
  exception when others then
    v_word := 'viewer'; v_word_rep := false;
  end;

  if p_table_id is not null and to_regclass('custom.record') is not null then
    select s.state, s.replayed into v_state, v_table_rep
      from custom.record_state_as_of(p_table_id, p_at) s;
    v_over := nullif(btrim(coalesce(v_state -> 'data' ->> 'member_default_level', '')), '');

    -- 🚨 SHARE-TAILS — THE TABLE BOUND, REPLAYED. iam.member_lane_confers gives membership nothing on
    -- a row whose Table is below `internal`, from the moment that rule took effect. The Table's
    -- visibility is the one of that moment: replayed from history, or — when history does not
    -- reach back and today's row stood in — corrected from custom._share_tails_mine_repair.
    v_tvis := v_state ->> 'visibility';
    select k.visibility_before::text, k.repaired_at into v_rep_vis, v_rep_at
      from custom._share_tails_mine_repair k where k.record_id = p_table_id;
    if v_rep_at is not null and p_at < v_rep_at and not coalesce(v_table_rep, false) then
      v_tvis := v_rep_vis;
    end if;
    if p_at >= c_mine_rule_from and nullif(v_tvis, '') is not null
       and p_table_id is distinct from custom.table_kernel_id()
       and v_tvis::platform.visibility < 'internal'::platform.visibility then
      return query select null::public.permission_level,
                          coalesce(v_lane_rep, false) and coalesce(v_word_rep, false) and coalesce(v_table_rep, false);
      return;
    end if;
    if v_over is not null then
      v_word := v_over;
    end if;

    -- A table carrying a `restricted` field confers NOTHING by membership, whatever the knob
    -- says — asked of the fields AS THEY STOOD THEN, never of today's.
    if exists (select 1
                 from custom.record f
                 cross join lateral custom.record_state_as_of(f.id, p_at) x
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and x.state is not null
                  and nullif(x.state ->> 'deleted_at', '') is null
                  and nullif(x.state -> 'data' ->> 'entity_definition_id', '')::uuid = p_table_id
                  and x.state -> 'data' ->> 'sensitivity' = 'restricted') then
      return query select null::public.permission_level,
                          coalesce(v_lane_rep, false) and coalesce(v_word_rep, false) and coalesce(v_table_rep, false);
      return;
    end if;
  end if;

  if v_word is null or v_word = 'none' then
    return query select null::public.permission_level,
                        coalesce(v_lane_rep, false) and coalesce(v_word_rep, false) and coalesce(v_table_rep, false);
    return;
  end if;
  if not exists (select 1 from iam.content_levels() l where l.level::text = v_word) then
    raise exception 'custom/member_default_level said % at that moment, and the levels are %',
                    v_word,
                    (select string_agg(l.level::text, ', ' order by l.ordinal) from iam.content_levels() l)
      using errcode = '22023',
            hint = 'VIS-19: a role sets a default level, and a default has to be one of the four - or "none".';
  end if;

  return query select v_word::public.permission_level,
                      coalesce(v_lane_rep, false) and coalesce(v_word_rep, false) and coalesce(v_table_rep, false);
end;
$function$

;
