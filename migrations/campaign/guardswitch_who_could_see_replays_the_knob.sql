-- NO `-- target:` HEADER, deliberately, and the reason is said rather than worked around.
-- The runner requires a production-headed file's `-- guard:` knob to resolve FALSE, so that
-- the apply provably changes nothing until a switch is flipped. This file has no such knob
-- and should not pretend to: it makes an AUDIT ANSWER more accurate — "who could see this on
-- that day" now replays the organization's settings as they stood instead of applying
-- today's — and there is no state of any switch in which the old answer is the one anybody
-- wants. Naming `custom/system_enabled` here to satisfy the header would be the formality the
-- guard-read check exists to refuse. A file with no `-- target:` line is production-only by
-- definition and is judged for the non-additive statement CLASSES, which is the right
-- judgement: the one live body it replaces declares its `-- based-on:` sha below.
--
-- based-on: custom.visibility_as_of(uuid, uuid, timestamp with time zone) afa9df8147ddc19fad76de226bcf9812f4c67e2732bddda47ca974bc5d9038ba
--
-- GUARD-SWITCH 3 — "WHO COULD SEE THIS ON THAT DAY" NOW REPLAYS THE SETTING, NOT TODAY'S.
--
-- VIS-2's own note: `custom.visibility_as_of` reports every membership row with
-- `replayed = false`, because the two knobs that decide what membership alone confers —
-- `custom/member_default_visibility` (VIS-33) and `custom/member_default_level` (VIS-19) —
-- kept no history, so the door applied TODAY'S settings to a date in the past and said so in
-- a sentence. Honest, and still the wrong answer to the question that was asked.
--
-- GUARD-SWITCH 2 gave the registry a history. This file teaches the door to read it.
--
--   · `iam.member_lane_open_as_of(organization, at)` — `iam.member_lane_open`'s question,
--     asked of `platform.knob_value_as_of` instead of `platform.knob_resolve`. It returns
--     the answer AND whether it was replayed, never one without the other, and it fails
--     toward today's behaviour exactly as the live reader does.
--   · `iam.member_default_level_as_of(organization, table, at)` — the same for the level,
--     with the two refinements the live function applies replayed as well: the Table's own
--     `member_default_level`, and the rule that a table carrying a `restricted` field confers
--     nothing by membership. Both come from `custom.record_state_as_of`, which is the store's
--     own replay, so this answer is not half-replayed.
--   · `custom.visibility_as_of` ARM 3 asks those two. A membership row is now marked
--     `replayed = true` when — and only when — the knob history was watching at that moment,
--     and the reason sentence stops apologising.
--
-- WHAT IT STILL DOES NOT KNOW, said out loud rather than hidden: before GUARD-SWITCH 2's
-- backfill ran, nothing recorded a knob. A question about a moment before that gets today's
-- values, `replayed = false`, and the same honest sentence VIS-2 wrote. That is the correct
-- behaviour, not a gap: history knows what it was told, and it was told nothing earlier.
--
-- ADDITIVE: two new functions and one `create or replace` that declares its `-- based-on:`.
--
-- INVERSE: migrations/inverse/guardswitch_who_could_see_replays_the_knob_down.sql

set lock_timeout = '3s';
set statement_timeout = '120s';


-- ═══════════════════════════════════════════ THE MEMBER LANE, AS IT STOOD THEN (VIS-33)
create or replace function iam.member_lane_open_as_of(p_organization_id uuid, p_at timestamptz)
returns table(lane_open boolean, replayed boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
-- `iam.member_lane_open`'s question — is `custom/member_default_visibility` anything other
-- than `shared_only` here — asked of the knob's HISTORY at a moment rather than of its live
-- value. It fails toward today's behaviour for the same reason the live reader does: this
-- feeds an audit answer, and an unreadable registry is a platform defect to fix, never a
-- reason to report that nobody could see anything.
declare
  v_word jsonb;
  v_rep  boolean;
begin
  if p_organization_id is null then
    return query select true, false;
    return;
  end if;
  begin
    select k.value, k.replayed into v_word, v_rep
      from platform.knob_value_as_of('custom', 'member_default_visibility', p_organization_id, p_at) k;
  exception when others then
    return query select true, false;
    return;
  end;
  return query
    select coalesce(nullif(btrim(coalesce(v_word #>> '{}', '')), ''), 'all_records') <> 'shared_only',
           coalesce(v_rep, false);
end;
$$;


-- ════════════════════════════════════ WHAT MEMBERSHIP ALONE CONFERRED THEN (VIS-19/VIS-33)
create or replace function iam.member_default_level_as_of(
  p_organization_id uuid, p_table_id uuid, p_at timestamptz)
returns table(level permission_level, replayed boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
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
$$;


-- ═══════════════════════════════════════════════════════════════ THE DOOR ITSELF
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
  v_lane_replayed  boolean;
  v_level_replayed boolean;
  v_table_id  uuid;
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
  -- GUARD-SWITCH (2026-09-19): the RECORD'S OWN table, captured here where its own state is
  -- still in hand. ARM 3 below used to read `v_state ->> 'table_id'` AFTER the walk, by which
  -- point v_state holds the LAST NODE THE WALK TOUCHED — a container, or a relation record —
  -- so the per-table half of `iam.member_default_level` was resolved against the wrong table
  -- whenever the record had a parent. Measured by reading the body, fixed here because it is
  -- the line this file rewrites.
  v_table_id := nullif(v_state ->> 'table_id', '')::uuid;

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
    -- GUARD-SWITCH (2026-09-19): THE SETTINGS OF THAT DAY, NOT TODAY'S. Both knobs are now
    -- replayed out of the registry's history (platform.knob_value_as_of), and each door hands
    -- back whether it managed to replay — so a row says `replayed = true` only when history
    -- was actually watching at that moment.
    select l.lane_open, l.replayed into v_lane_open, v_lane_replayed
      from iam.member_lane_open_as_of(p_organization_id, p_at) l;
    select d.level, d.replayed into v_member_default, v_level_replayed
      from iam.member_default_level_as_of(p_organization_id, v_table_id, p_at) d;
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
                  when not v_lane_open and coalesce(v_lane_replayed, false)
                  then 'They were a member of this organization at that moment, and this organization said then that membership alone shows nothing (its "What members can see by default" setting, replayed from the settings history as it stood that day).'
                  when not v_lane_open
                  then 'They were a member of this organization at that moment. This organization NOW says membership alone shows nothing (its "What members can see by default" setting), and the settings history does not reach back that far — so this is today''s answer applied to that day, not a replay.'
                  when coalesce(v_level_replayed, false)
                  then 'They were a member of this organization at that moment, and membership alone reached this record. What membership conferred is replayed from the settings as they stood that day.'
                  else 'They were a member of this organization at that moment, and membership alone reached this record. The settings history does not reach back that far, so the level shown is today''s, applied to that day.' end,
             case when m.m ->> 'role' in ('owner', 'admin') then true
                  else coalesce(v_level_replayed, false) end
        from mem m
       where m.m ->> 'role' in ('owner', 'admin')
          or (v_lane_open and v_member_default is not null);
  end if;
end;
$function$;


-- ═══════════════════════════════════ THE ACCESS DECISIONS, DECLARED IN DATA (DD-223)
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'member_lane_open_as_of',
   'p_organization_id uuid, p_at timestamp with time zone',
   array['uuid'::regtype, 'timestamptz'::regtype]::oid[],
   'Was the organization-member lane open in this organization at that moment. p_organization_id is an organization id and is checked against NOTHING here by design - a null one answers "open", which is this reader''s fail-toward-today''s-behaviour rule; it makes no access decision. p_at is the moment, and a moment before the settings history begins answers today''s setting with replayed = false.',
   'migrations/campaign/guardswitch_who_could_see_replays_the_knob.sql (lane GUARD-SWITCH)',
   'server_only: it reports what one organization''s membership setting said on a date, for any organization it is handed, with no access decision of its own. Its caller custom.visibility_as_of is where the organization wall and the owner/admin test live, and a client door onto this would leak other organizations'' settings history.',
   false, false),
  ('iam', 'member_default_level_as_of',
   'p_organization_id uuid, p_table_id uuid, p_at timestamp with time zone',
   array['uuid'::regtype, 'uuid'::regtype, 'timestamptz'::regtype]::oid[],
   'What membership alone conferred in this organization, on this Table, at that moment. p_organization_id is an organization id and is checked against NOTHING here by design; p_table_id is a Table record id read only through custom.record_state_as_of and scoped to p_organization_id in the field walk, and a null one skips the per-table half; p_at is the moment. It makes no access decision.',
   'migrations/campaign/guardswitch_who_could_see_replays_the_knob.sql (lane GUARD-SWITCH)',
   'server_only: it reports one organization''s membership default for any organization it is handed, with no access decision of its own. Its caller custom.visibility_as_of is where the organization wall and the owner/admin test live, and a client door onto this would leak other organizations'' settings history.',
   false, false)
on conflict do nothing;
