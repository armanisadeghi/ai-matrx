-- chair-step: undo hotdoors5_a_every_organizations_team_and_default_asked_once.sql - restores iam.my_team_reach and custom._record_shown_to_ctx as they were before HOT-DOORS-5.
-- lane: HOT-DOORS-5
-- based-on: iam.my_team_reach(uuid) NEW_TEAM
-- based-on: custom._record_shown_to_ctx(uuid[], uuid) NEW_CTX

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
  select o.id, u.user_id
    from iam.my_orgs() as o(id)
   cross join lateral unnest(iam.my_teammate_user_ids(o.id)) as u(user_id)
   where (p_organization_id is null or o.id = p_organization_id)
     and exists (
       select 1
         from iam.team_members_resolved(array(
                select t.id from iam.team t
                 where t.organization_id = o.id and t.deleted_at is null)) r
        where r.user_id = (select auth.uid()));
$function$
;

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
$function$
;
