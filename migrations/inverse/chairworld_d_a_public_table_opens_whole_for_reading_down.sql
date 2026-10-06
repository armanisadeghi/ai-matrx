-- lane: CHAIR-WORLD-LANE-2
-- chair-step: drops only the three helpers chairworld_d_a_public_table_opens_whole_for_reading.sql created (and their door rows); restores six bodies as they were.
-- based-on: custom.assert_public_reader_names_a_public_table(uuid, uuid, text) b9373a927470aca78b07d8a76c4a51e697cb14be05f48cf4932685f5ad3e2cad
-- based-on: custom.door_reads_only(text) 37be611b8beba7714bc1efba45f747f707fe7a254b0ce8f3f238e68bffd08ba3
-- based-on: custom.field_options(uuid, uuid) 9ff19cc022f305b8b7642084e4c84dfd3bbb6f4fe2dc3f67ceb5f8ab4300827b
-- based-on: custom.public_definition_owner(uuid, uuid, uuid) cbe27600822cc2b4a247cef4e80613b04584a7b435b24eba049eda33b7cde538
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) 7889f7c880a0aba07d012d735a3bf3ea3e18f5c0f440d40ef4d2a943ae8c4a91
-- based-on: custom.work_inbox(uuid, integer, integer, boolean, text) 89fcc6fc3715bdd40797ffabaf32730a1b9e097313f74115a130269e58578579
-- based-on: custom.world_reader_only(uuid) 42d3e85265fcdac26915ff329e70efd21ea52001aadb095661e08a0dd7b63865
-- based-on: custom.world_reader_reads_public_definition(uuid, uuid, uuid[]) 458dd4d45e65ce7bb4f9e5df6df09fa4e175581d6c877d71a1be43992cc5e5f6
-- based-on: platform.knob_snapshot(uuid, uuid, jsonb) 7b1ae9c6a36d6a43d5facd477a1b3628d94452223650075bc925ac03fb234b9f
-- ground-standing-ok: b — this inverse runs BEFORE chairworld_a's (it undoes the later file first); the body it restores
-- calls custom._not_a_member_refusal, which chairworld_a created and only chairworld_a's own inverse drops.
-- Inverse of migrations/campaign/chairworld_d_a_public_table_opens_whole_for_reading.sql: the six bodies exactly as live before it, then the three helpers
-- and their door rows removed.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION custom.assert_public_reader_names_a_public_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Only a seat the wall admitted to this organization through the world lane ALONE, in this statement.
  if platform.memo_k_get('w:pub:' || coalesce(p_organization_id::text, '-')) is distinct from '1'
     or platform.memo_k_get('w:r:' || coalesce(p_organization_id::text, '-')) = '1' then
    return;
  end if;
  if p_table_id is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null
                    and t.published_to_web) then
    -- The read door has named a Public Table: the doors it calls on its way pass the wall (see there).
    perform platform.memo_k_put('w:pubt:' || p_organization_id::text, '1');
    return;
  end if;
  -- Any other Table of the organization — or none named — answers exactly what the wall said before.
  perform custom._not_a_member_refusal(p_door);
end
$function$;

CREATE OR REPLACE FUNCTION custom.door_reads_only(p_door text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- THE READ DOORS THE WORLD LANE ADMITS (CHAIR-WORLD-LANE), by the name each passes to
  -- custom.assert_client_may_reach. A door joins this list only when it names its Table to
  -- custom.assert_may_know_table / custom.assert_client_may_open (or to
  -- custom.assert_public_reader_names_a_public_table) right after the wall, and writes nothing.
  select coalesce(p_door = any (array[
    'platform.resolve_id',
    'custom.where_id_opens',
    'custom.read_records',
    'custom.read_records_page',
    'custom.read_record',
    'custom.read_records_by_ids',
    'custom.read_records_matching',
    'custom.read_records_in_view_order',
    'custom.record_aggregate',
    'custom.applicable_fields',
    'custom.views',
    'custom.view_look_read',
    'custom.table_decorations',
    'custom.table_dimensions',
    'custom.table_kind_facts'
  ]), false)
$function$;

CREATE OR REPLACE FUNCTION custom.work_inbox(p_organization_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_decided boolean DEFAULT false, p_view text DEFAULT 'inbox'::text)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone, table_id uuid, table_name text, decided_by uuid, decided_by_name text, decided_at timestamp with time zone, outcome text, snoozed_until timestamp with time zone, cleared_at timestamp with time zone, snoozed_count integer, cleared_count integer, undo_seconds integer, undo_refusal text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid := custom.query_principal();
  -- LANE S5-PRIME-2 (UNDO): how long a decision is held with Undo before it is made — the
  -- organization's knob, read once per call.
  v_hold integer := greatest(0, least(30, coalesce(
             (platform.knob_resolve('custom', 'decision_undo_seconds', p_organization_id) #>> '{}')::integer, 5)));
  v_view text := lower(coalesce(nullif(btrim(p_view), ''), 'inbox'));
  v_cap  integer;
  v_off  integer;
  v_need integer;
  v_org  uuid;
  v_ceil integer;
  v_chunk integer;
  v_at   integer;
  v_got  integer;
  v_page jsonb;
  v_has  uuid[];
  v_skip boolean;
  v_all  jsonb := '[]'::jsonb;
  v_sn   integer;
  v_cl   integer;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- what waits on a person is the person's, not the selected organization's): every organization
  -- the caller belongs to, each asked through this same door with its name, so each meets its own
  -- wall; this only adds the answers together. An organization whose wall refuses (42501)
  -- contributes nothing. snoozed_count/cleared_count become totals across those organizations.
  -- No permission is changed by this branch.
  --
  -- PAGING ACROSS ORGANIZATIONS (lane ALL-ORGS-PAGING, 2026-10-01; the class DATA-HOME-3B2 found in
  -- custom.archived_tables_everywhere). Each organization is asked only for its own first
  -- v_cap + v_off items, in pages of at most its own ceiling (custom.page_ceiling) — the old body
  -- asked every organization for v_cap + v_off at once, so any page past the 200-row ceiling was
  -- refused (22023 PAGE-1). custom.inbox_counts (the same predicate, already read for the totals)
  -- names the organizations holding anything in this view; the others are not asked. With decided
  -- items included it has no count for them, so then only organizations that can hold one are asked.
  if p_organization_id is null then
    if v_view not in ('inbox', 'snoozed', 'done') then
      raise exception 'The inbox has three views: inbox, snoozed and done, and "%" is none of them.', p_view
        using errcode = '22023';
    end if;
    if v_me is null then
      return;
    end if;
    v_cap := least(greatest(coalesce(p_limit, 50), 1), 1000);
    v_off := greatest(0, coalesce(p_offset, 0));
    v_need := v_cap + v_off;
    select coalesce(sum(c.snoozed), 0)::integer, coalesce(sum(c.cleared), 0)::integer,
           coalesce(array_agg(c.organization_id) filter (where case v_view
                                                                 when 'inbox'   then c.waiting > 0
                                                                 when 'snoozed' then c.snoozed > 0
                                                                 else                c.cleared > 0 end), '{}'::uuid[])
      into v_sn, v_cl, v_has from custom.inbox_counts(null) c;
    v_skip := not (v_view = 'inbox' and coalesce(p_include_decided, false));
    -- WITH DECIDED ITEMS there is no count to skip by, so ask only the organizations that can hold
    -- any inbox item at all — the two sources custom._inbox_items reads: an approval record, or a
    -- person-record of hers (assignments need one). A superset: it narrows which are asked, never
    -- an answer (lane ALL-ORGS-PAGING b: 8 of admin's 52 organizations on the clone).
    if not v_skip then
      select coalesce(array_agg(o.id), '{}'::uuid[]) into v_has
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
         and (exists (select 1 from custom.record r
                       where r.organization_id = o.id and r.data_class = 'work_approval' and r.deleted_at is null)
              or exists (select 1 from custom.record r
                          where r.organization_id = o.id and r.table_id = custom.person_kernel_id()
                            and r.deleted_at is null and r.data ->> 'user_id' = v_me::text));
      v_skip := true;
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      continue when v_skip and not (v_org = any(v_has));
      begin
        v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 200), 1);
        v_at := 0;
        loop
          v_chunk := least(v_need - v_at, v_ceil);
          exit when v_chunk < 1;
          select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb), count(*)
            into v_page, v_got
            from custom.work_inbox(v_org, v_chunk, v_at, p_include_decided, p_view) x;
          v_all := v_all || v_page;
          v_at := v_at + v_got;
          exit when v_got < v_chunk;
        end loop;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    return query
      select w.item_id, w.kind, w.origin, w.title, w.subject_id, w.subject_kind, w.summary, w.state, w.due_on,
             w.due_state, w.actionable, w.requested_by, w.requested_by_name, w."at", w.table_id, w.table_name,
             w.decided_by, w.decided_by_name, w.decided_at, w.outcome, w.snoozed_until, w.cleared_at,
             v_sn, v_cl, w.undo_seconds, w.undo_refusal
        from jsonb_to_recordset(v_all) as w(item_id uuid, kind text, origin text, title text, subject_id uuid,
               subject_kind text, summary text, state text, due_on timestamptz, due_state text, actionable boolean,
               requested_by uuid, requested_by_name text, "at" timestamptz, table_id uuid, table_name text,
               decided_by uuid, decided_by_name text, decided_at timestamptz, outcome text,
               snoozed_until timestamptz, cleared_at timestamptz, snoozed_count integer, cleared_count integer,
               undo_seconds integer, undo_refusal text)
       order by case when v_view = 'snoozed' then w.snoozed_until end asc nulls last,
                case when v_view = 'done' then w.cleared_at end desc nulls last,
                w.actionable desc, w.state nulls last, w."at" desc, w.item_id
       limit v_cap offset v_off;
    return;
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_view not in ('inbox', 'snoozed', 'done') then
    raise exception 'The inbox has three views: inbox, snoozed and done, and "%" is none of them.', p_view
      using errcode = '22023',
            hint = '`inbox` is what is waiting on you now, `snoozed` is what you put off until a time, `done` is what you cleared.';
  end if;
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with x as (
    select * from custom._inbox_items(p_organization_id, v_me, coalesce(p_include_decided, false))
  ),
  n as (
    select (count(*) filter (where x.inbox_state = 'snoozed'))::integer as snoozed,
           (count(*) filter (where x.inbox_state = 'cleared'))::integer as cleared
      from x
  )
  select x.item_id, x.kind, x.origin, x.title, x.subject_id, x.subject_kind, x.summary, x.state,
         x.due_on, x.due_state, x.actionable, x.requested_by, x.requested_by_name, x.at,
         x.table_id, x.table_name, x.decided_by, x.decided_by_name, x.decided_at, x.outcome,
         case when x.inbox_state = 'snoozed' then x.snoozed_until end,
         case when x.inbox_state = 'cleared' then x.cleared_at end,
         n.snoozed, n.cleared,
         -- A DECISION SOMETHING ELSE IS WAITING ON IS MADE AT ONCE: whoever files an approval that
         -- a run resumes from names that run in `resumes_run_id`, and holding it would stall the run.
         case when x.kind = 'assignment' or x.state <> 'pending' then null
              when w.resumes is not null then 0
              else v_hold end,
         case when x.kind <> 'assignment' and x.state = 'pending' and w.resumes is not null
              then 'Something is already waiting on this decision, so it is made the moment you decide and cannot be undone.' end
    from x cross join n
    left join lateral (select nullif(r.data ->> 'resumes_run_id', '') as resumes
                         from custom.record r
                        where r.organization_id = p_organization_id and r.id = x.item_id
                          and x.kind <> 'assignment') w on true
   where case v_view
           when 'inbox'   then x.inbox_state = 'waiting'
                               or (coalesce(p_include_decided, false) and x.inbox_state = 'closed')
           when 'snoozed' then x.inbox_state = 'snoozed'
           else                x.inbox_state = 'cleared'
         end
   order by case when v_view = 'snoozed' then x.snoozed_until end asc nulls last,
            case when v_view = 'done' then x.cleared_at end desc nulls last,
            x.actionable desc, x.state nulls last, x.sort_at desc, x.item_id
   -- the organization's own page ceiling (knob custom/page_size_ceiling), as custom.page_contract() says
   limit custom.page_size(p_organization_id, 'custom.work_inbox', p_limit, 50, null)
  offset greatest(0, coalesce(p_offset, 0));
end
$function$;

CREATE OR REPLACE FUNCTION custom.field_options(p_organization_id uuid, p_field_id uuid)
 RETURNS SETOF custom.record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an
  -- invented one answer identically: both are refused, neither is told whether
  -- the Field exists.
  perform custom.assert_store_door(p_organization_id, 'custom.field_options');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_options');

  return query
  select o.*
    from custom.record f
    join custom.record o
      on o.organization_id = f.organization_id
     and o.table_id = (f.data -> 'config' ->> 'options_table_id')::uuid
     and o.deleted_at is null
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
end
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_by_ids(p_organization_id uuid, p_table_id uuid, p_record_ids uuid[], p_by_id boolean DEFAULT false)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_set      record;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_n        integer := coalesce(cardinality(p_record_ids), 0);
  v_rows     custom.record[];
  v_row      custom.record;
  v_levels   jsonb;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_by_ids');

  -- NOTHING ASKED FOR IS NOT AN ERROR — it is an empty answer, and it costs nothing.
  if v_n = 0 then
    return;
  end if;

  -- THE SAME CEILING THE PAGE DOORS DECLARE, and it refuses above it by name rather than
  -- handing back a short list the caller cannot tell from a complete one.
  perform custom.page_size(p_organization_id, 'custom.read_records_by_ids', v_n, 200);

  -- STEP 1, ONCE: THE ONE LADDER decides WHICH rows. Identical call, identical arguments to
  -- the page door's. This is the question that must never be asked twice in two ways.
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
  end if;

  -- STORE-READ-PERF-2: the rows first, in the door's own order, so the ladder can be asked about
  -- the whole set at once (custom.levels_of) instead of once per row inside custom.read_mask.
  select coalesce(array_agg(r order by r.created_at desc, r.id), '{}'::custom.record[]) into v_rows
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
       and r.id = any (p_record_ids)
       and ( case
               -- The ladder could not answer in a bounded way, so each row is asked directly —
               -- `read_records`' fallback arm, and the same single call.
               when v_set.o_fallback then
                 custom.has_visibility(v_me, 'record', r.id, 'viewer')
               -- Every live row of this Table is hers.
               when v_set.o_all_visible then
                 true
               -- A class she holds, WITH EXCEPTIONS: a granted id is never answered by its
               -- class (VIS-19), and containment only ever adds (VIS-6).
               when coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
                 ( r.created_by = v_me
                   or (r.visibility = any (v_set.o_true_visibility)
                       and not (r.id = any (v_set.o_granted_all)))
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
               -- Nothing by class — `shared_only`, or a Table nobody shared with her.
               else
                 ( r.created_by = v_me
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
             end )
  ;
  v_levels := custom.levels_of(v_me, (select array_agg(x.id) from unnest(v_rows) x));

  foreach v_row in array v_rows
  loop
    select * into v_vs from custom.record_values_step(v_row, v_cache);
    v_cache := v_vs.o_cache;
    if v_cr is null then
      v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
    end if;
    -- STEP 2, PER ROW: THE ONE MASK decides which FIELDS of it she may see, at the level she
    -- holds ON THIS RECORD. The same call `custom.read_record` makes for its one row.
    -- The row is in p_organization_id and p_table_id (the query above says so), which is the
    -- organization and Table custom.read_mask took the mask in; the rung is the set's answer.
    v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id,
                                   (v_levels -> v_row.id::text ->> 'l')::public.permission_level, 'read');
    -- DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the page doors do.
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
      from jsonb_array_elements(v_mask -> 'declared') x;

    id := v_row.id;
    document := custom.choice_render_with(p_organization_id, p_table_id,
                  custom.mask_document(v_vs.o_doc, v_visible, v_mask -> 'notices', p_by_id,
                                       v_mask -> 'all_key_ids', v_declared), v_cr);
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_row.data -> '_values', v_row.data -> '_sources', v_visible, p_by_id, v_mask -> 'all_key_ids');
    -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
    document := custom.with_retired(document, v_row.data -> '_retired', v_visible, v_declared);
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.knob_snapshot(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_scopes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'iam', 'public'
AS $function$
declare
  v_stamp timestamptz;
begin
  -- 🚨 THE ACCESS DECISION, BEFORE THE FIRST READ AND BEFORE EXISTENCE.
  -- The first cut of this function had a truthful door row saying "passing another
  -- organization's id returns that organization's configuration" and called that
  -- acceptable because it is "only configuration". ddl_guard refused it and cited
  -- seo.keyword_value_map, which had a truthful door row and handed 114,686 rows of
  -- another tenant's data to a non-member on 2026-09-17. The guard was right: an
  -- organization's configuration says which features they run, what their ceilings are
  -- and how their operation is posture-d, and none of that is a stranger's to read.
  -- A foreign id and an invented one answer identically, on purpose.
  if p_organization_id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(p_organization_id) then
    raise exception 'platform.knob_snapshot: not a member of that organization'
      using errcode = '42501';
  end if;

  -- 🚨 AND THE PERSON, TOO (ARGS-RULED 2026-09-21). `p_user_id` is handed straight to
  -- `platform.knob_resolve` as the USER rung, so it resolved ANOTHER ACCOUNT'S personal
  -- settings — every knob they have overridden for themselves — to any member who named them,
  -- and to any member who named somebody in an organization they have nothing to do with. It is
  -- a PERSON id, so it takes the ladder that owns a person id.
  if p_user_id is not null
     and not iam.is_trusted_backend()
     and p_user_id is distinct from (select auth.uid())
     and not iam.may_address_user_in_org(p_user_id, p_organization_id) then
    raise exception 'platform.knob_snapshot: that is not your configuration to read'
      using errcode = '42501',
            hint = 'A snapshot resolves the USER rung as well as the organization rung, so it answers one person''s own settings. Ask for your own, or for somebody in an organization you are both in.';
  end if;

  -- 🚨 ONE FETCH, NOT ONE PER SETTING. Arman, 2026-09-20: "we can't be fetching
  -- individual configurations for everything that we do, and we can't be trying to do
  -- these things live or through any sort of application level logic regardless of if
  -- it's a server or the client."
  --
  -- Measured before building this: 870 knobs, 536 delegated, and the ENTIRE resolved map
  -- is 49 kB (31 kB delegated) - a few kB on the wire. There was never a size argument
  -- for resolving them one at a time.
  --
  -- 🚨 IT CALLS knob_resolve PER KEY ON PURPOSE. Resolution is ONE rule and this may not
  -- become a second copy of it: precedence, overridable_by, rung locks, direction and
  -- range clamping all live in knob_resolve, and a snapshot that reimplemented them
  -- set-wise would drift from the single-key answer the moment either changed - exactly
  -- the split-brain this system exists to prevent. These are function calls inside ONE
  -- query, not round trips.
  --
  -- `stamp` is the cache key: the newest write across the register and THIS org's
  -- overrides and rung locks. A holder whose stamp still matches holds current truth and
  -- needs no refetch. The settings_changed directive channel pushes invalidation; this is
  -- the belt to that suspenders, for a tab that was asleep when the push went out.
  select greatest(
           coalesce((select max(updated_at) from platform.feature_knob), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_override
                      where organization_id is not distinct from p_organization_id), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_rung_lock
                      where organization_id is not distinct from p_organization_id), 'epoch'::timestamptz))
    into v_stamp;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'user_id',         p_user_id,
    'stamp',           to_jsonb(v_stamp),
    'count',           (select count(*) from platform.feature_knob),
    'resolved', coalesce((
      select jsonb_object_agg(
               k.feature || '.' || k.key,
               platform.knob_resolve(k.feature, k.key, p_organization_id, p_user_id, p_scopes))
        from platform.feature_knob k), '{}'::jsonb));
end
$function$;


delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('world_reader_only', 'public_definition_owner', 'world_reader_reads_public_definition');
drop function custom.world_reader_reads_public_definition(uuid, uuid, uuid[]);
drop function custom.public_definition_owner(uuid, uuid, uuid);
drop function custom.world_reader_only(uuid);
