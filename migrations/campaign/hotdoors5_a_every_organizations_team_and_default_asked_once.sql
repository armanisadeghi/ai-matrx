-- draft: HOT-DOORS-5 not yet applied
-- lane: HOT-DOORS-5
-- based-on: iam.my_team_reach(uuid) defd6a6dddd3bfdb3ad44a1b6a0deab4aae1dbc8a661e52e76287ef8fe626cae
-- based-on: custom._record_shown_to_ctx(uuid[], uuid) d48f0353757f55e192a1c39605c8578b46d42b9cb3cfa0d0ef969730beb701bf
--
-- HOT-DOORS-5 a (2026-10-09). Two per-organization questions on the data home's path become one pass each:
--   iam.my_team_reach        "is she on a live team here?" - iam.team_members_resolved once for the teams of all
--                            her organizations instead of once per organization (~80 ms for admin@admin.com, 59 orgs).
--   custom._record_shown_to_ctx  each organization's "Shown to" default read in one statement instead of one
--                            platform.shown_to_default per organization (~100 ms for admin@admin.com).
-- Same answers (each function's header says why). Both new forms run only while iam.kernel_batch_on (knob
-- access/kernel_batch) answers true, which it never does after a write; otherwise each runs its old form.
-- Revert, one statement: update platform.feature_knob set value = '{"on": false, "off_for": []}' where feature = 'access' and key = 'kernel_batch';
-- (that also stands down HOT-DOORS-4's memo). Inverse: migrations/inverse/hotdoors5_a_every_organizations_team_and_default_asked_once_down.sql

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION iam.my_team_reach(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organization_id uuid, user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Every organization the signed-in person belongs to (or the one named, when they belong to
  -- it) AND is on a live team in, paired with everyone sharing a live team with them there.
  -- An organization where the person is on no team contributes NOTHING (2026-09-28, list
  -- shell fix D): it used to contribute the person alone, which made every "My team" lane an
  -- exact copy of "Mine" for anyone without a team. A person on no team now gets no rows, and
  -- the list says there is no team. A caller outside a named organization gets no rows.
  -- HOT-DOORS-5 (2026-10-09): ONE PASS FOR EVERY ORGANIZATION. "Is she on a live team here?" was asked of
  -- iam.team_members_resolved once per organization (~1.3 ms each: 59 organizations ~80 ms for admin@admin.com,
  -- on every data home and every "My team" lane). That function resolves each team inside its own organization
  -- (listed members, department members, organization membership — every arm is keyed by the team and its
  -- organization), so asked once for the teams of all her organizations it answers each organization exactly as
  -- asked alone. The teammates themselves are still iam.my_teammate_user_ids, per organization she is on a team in.
  -- Only while iam.kernel_batch_on (knob access/kernel_batch; never after a write); otherwise the second arm, as before.
  with o as materialized (
    select o.id
      from iam.my_orgs() as o(id)
     where (p_organization_id is null or o.id = p_organization_id)
  ), on_team as materialized (
    select distinct t.organization_id as id
      from iam.team_members_resolved(array(
             select t.id from iam.team t
              where t.organization_id in (select o.id from o) and t.deleted_at is null)) r
      join iam.team t on t.id = r.team_id
     where r.user_id = (select auth.uid())
  )
  select o.id, u.user_id
    from o
    join on_team ot on ot.id = o.id
   cross join lateral unnest(iam.my_teammate_user_ids(o.id)) as u(user_id)
   where iam.kernel_batch_on(null)
  union all
  select o.id, u.user_id
    from iam.my_orgs() as o(id)
   cross join lateral unnest(iam.my_teammate_user_ids(o.id)) as u(user_id)
   where not iam.kernel_batch_on(null)
     and (p_organization_id is null or o.id = p_organization_id)
     and exists (
       select 1
         from iam.team_members_resolved(array(
                select t.id from iam.team t
                 where t.organization_id = o.id and t.deleted_at is null)) r
        where r.user_id = (select auth.uid()))
$function$;

CREATE OR REPLACE FUNCTION custom._record_shown_to_ctx(p_organization_ids uuid[], p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). THE "SHOWN TO" CONTEXT FOR THE RECORDS ONE LIST IS ABOUT TO READ.
--
-- custom.query_visible_ids passes platform.shown_to_context('record') to platform.shown_to_lists
-- for every row it lists. That context names, for EVERY organization the reader belongs to, the
-- organization's default list ('d') and her teammates there ('t'); it is worked out once per
-- transaction, and every PostgREST request is its own transaction, so every door call paid it:
-- ~100 ms for admin@admin.com (47 organizations; iam.teammate_user_ids ~1.3 ms each) and ~30 ms
-- for test@test.com, on every tree, values and items call.
--
-- platform.shown_to_lists reads the context of the ROW'S organization only, and reads the teammates
-- part ('t') only when the row's list resolves to 'my_team' — the row's own shown_to, or, when it has
-- none, the organization's default. So for the organizations this list reads, and this Table when one
-- is named:
--   * when some live row there says 'my_team', or some such organization's default is 'my_team',
--     the answer IS platform.shown_to_context('record'), whole (so the rare case is byte-identical);
--   * otherwise it is that context without the teammates: {org: {"d": <the same default>}} for each
--     of these organizations the reader is a live member of — the only keys any row here can read.
-- It decides nothing: shown_to_lists answers every row exactly as it would with the whole context.
-- The answer waits in the STATEMENT memo (platform.memo_k_*: fenced by the statement, the backend,
-- the transaction's first write and the seat) for the next list of the same statement that reads the
-- same organizations and Table (the scope tree asks once per scope Table).
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_d   platform.shown_to;
  v_key text;
  v_hit text;
  r     record;
  v_found boolean;
  v_seeded boolean;
  v_sys   jsonb;
  v_wide  boolean := false;
begin
  if v_uid is null then
    return v_out;
  end if;
  v_key := 'custom.record_shown_to_ctx:' || v_uid::text || ':' || coalesce(p_table_id::text, '-') || ':'
        || md5(array_to_string(array(select distinct x::text from unnest(p_organization_ids) x order by 1), ','));
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return v_hit::jsonb;
  end if;
  -- HOT-DOORS-3 (2026-10-08): a named Table is read by its index key (organization, table_id) and each organization
  -- by its own partition: `p_table_id is null or` kept the Table out of the index condition, so the generic plan
  -- read every live row of the organization (26,000 rows, 15-30 ms) to find none. Same answer.
  -- mx.read_page_set = off: the one statement as before.
  v_found := case when coalesce(current_setting('mx.read_page_set', true), '') = 'off' then
            exists (select 1 from custom.record x
                     where x.organization_id = any (p_organization_ids)
                       and (p_table_id is null or x.table_id = p_table_id)
                       and x.deleted_at is null
                       and x.shown_to = 'my_team'::platform.shown_to)
          when p_table_id is not null then
            exists (select 1 from unnest(p_organization_ids) o(id)
                     where exists (select 1 from custom.record x
                                    where x.organization_id = o.id
                                      and x.table_id = p_table_id
                                      and x.deleted_at is null
                                      and x.shown_to = 'my_team'::platform.shown_to))
          else
            exists (select 1 from custom.record x
                     where x.organization_id = any (p_organization_ids)
                       and x.deleted_at is null
                       and x.shown_to = 'my_team'::platform.shown_to)
     end;
  if v_found then
    v_out := platform.shown_to_context('record');
    perform platform.memo_k_put(v_key, v_out::text);
    return v_out;
  end if;
  -- HOT-DOORS-5 (2026-10-09): EVERY ORGANIZATION'S DEFAULT IN ONE PASS. The loop below asked
  -- platform.shown_to_default once per organization (~1.7 ms each: 59 organizations ~100 ms for admin@admin.com).
  -- That function's answer for an organization is: null when the knob is not seeded; else
  -- platform.knob_resolve's, which is (1) its own memo (platform.memo_get) when it holds one, (2) the knob's
  -- value-or-default read off the feature map when nothing overrides this key for this organization, the
  -- value is not null and the feature has at most 200 set keys (its fast path, read-only transactions only),
  -- (3) otherwise its uncached resolution. Here (1) and (2) are read for every organization at once and (3)
  -- is still asked of platform.shown_to_default, one organization at a time. Same answers, same early return.
  -- Only while iam.kernel_batch_on (knob access/kernel_batch; never after a write) and the knob feature memo
  -- is not switched off; otherwise the loop below, as before.
  if iam.kernel_batch_on(null)
     and coalesce(current_setting('mx.knob_feature_memo', true), '') <> 'off'
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_seeded := exists (select 1 from platform.feature_knob k
                         where k.feature = 'access.shown_to_default' and k.key = 'record');
    if v_seeded then
      select coalesce(k.value, k.default_value) into v_sys
        from platform.feature_knob k
       where k.feature = 'access.shown_to_default' and k.key = 'record';
      v_wide := (select count(*) from platform.feature_knob f
                  where f.feature = 'access.shown_to_default'
                    and coalesce(f.value, f.default_value) is not null) > 200;
    end if;
    with o as materialized (
      select distinct om.organization_id as id
        from iam.organization_member om
        join iam.organizations og on og.id = om.organization_id and og.archived_at is null
       where om.user_id = v_uid
         and om.organization_id = any (p_organization_ids)
    ), m as materialized (
      select o.id, platform.memo_get('knob|access.shown_to_default|record|' || o.id::text || '|' || v_uid::text) as hit
        from o
    ), d as materialized (
      select m.id,
             case
               when not v_seeded then null::platform.shown_to
               when m.hit is not null then (m.hit::jsonb #>> '{}')::platform.shown_to
               when v_sys is not null and not v_wide
                    and not exists (select 1 from platform.knob_override ko
                                     where ko.feature = 'access.shown_to_default' and ko.key = 'record'
                                       and ko.organization_id = m.id)
                 then (v_sys #>> '{}')::platform.shown_to
               else platform.shown_to_default('record', m.id, v_uid)
             end as d
        from m
    )
    select coalesce(bool_or(d.d = 'my_team'::platform.shown_to), false),
           coalesce(jsonb_object_agg(d.id::text, jsonb_build_object('d', d.d)), '{}'::jsonb)
      into v_found, v_out
      from d;
    if v_found then
      v_out := platform.shown_to_context('record');
    end if;
    perform platform.memo_k_put(v_key, v_out::text);
    return v_out;
  end if;
  for r in
    select distinct om.organization_id
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id and o.archived_at is null
     where om.user_id = v_uid
       and om.organization_id = any (p_organization_ids)
  loop
    v_d := platform.shown_to_default('record', r.organization_id, v_uid);
    if v_d = 'my_team'::platform.shown_to then
      v_out := platform.shown_to_context('record');
      perform platform.memo_k_put(v_key, v_out::text);
      return v_out;
    end if;
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object('d', v_d));
  end loop;
  perform platform.memo_k_put(v_key, v_out::text);
  return v_out;
end;
$function$;
