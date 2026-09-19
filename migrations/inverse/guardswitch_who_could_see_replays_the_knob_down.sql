-- INVERSE of migrations/campaign/guardswitch_who_could_see_replays_the_knob.sql
-- custom.visibility_as_of exactly as it stood before GUARD-SWITCH (captured live 2026-09-19),
-- and the two as-of doors this lane added, removed. Running it puts the membership arm back
-- to applying today's settings to a past date and reporting replayed = false.

CREATE OR REPLACE FUNCTION custom.visibility_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(principal_kind text, principal_id uuid, level permission_level, through_kind text, through_id uuid, reason text, replayed boolean)
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
$function$

;

drop function if exists iam.member_default_level_as_of(uuid, uuid, timestamptz);
drop function if exists iam.member_lane_open_as_of(uuid, timestamptz);
