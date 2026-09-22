-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 7b824929df345a5f1abd7841b4cee09074d34eaf90312fc32fca95e17687c855
--
-- DRILL, file 3 — THE DOOR SAYS ITS OWN ACCESS DECISION OUT LOUD.
--
-- `check:store-doors-decide` refused the filtered read door twice, and it was right both
-- times: "client doors taking an organization id that never decide the caller" and
-- "declared client doors whose body never goes through the one ladder".
--
-- THE DOOR DOES DECIDE. Every row it answers comes through `custom.visible_predicate_sql`,
-- which asks `custom.visible_set` — the one ladder, once — and writes its four arms into
-- this door's own WHERE, and a Table this seat may not know is refused by
-- `custom.assert_may_know_table` before anything is read. But the decision happens through
-- a helper, inside a statement that is BUILT rather than written, so a census reading this
-- body cannot see it — and a door whose access decision cannot be read off it is one
-- refactor away from a door that does not make one. That is not a census to be excused; it
-- is the census doing its job.
--
-- SO THE ORGANIZATION WALL IS ASKED HERE, BY NAME, exactly as `custom.record_aggregate`
-- asks it on its own first line. That is not decoration either: the aggregate is the door
-- that COUNTS the number this one opens, and a number and its rows judged by two different
-- sets of questions is the whole defect this lane exists to close. It also answers the
-- store's own switch, which the read door never did.
--
-- Nothing else moves: same arguments, same ladder, same masking, same page ceiling, same
-- filter evaluator. It can only ever REFUSE more, never answer more.

CREATE OR REPLACE FUNCTION custom.read_records_matching(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_limit    integer;
  v_sql      text;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, FIRST, AND IN THIS DOOR'S OWN BODY. `custom.record_aggregate` —
  -- the door that COUNTS the number this one opens — asks exactly this on its first line, and
  -- its twin asking less would mean a number and its rows were judged by two different sets of
  -- questions. It also answers the store's own switch: a caller reaching a closed store is
  -- refused before a Table id is even looked at.
  --
  -- 🚨 AND IT IS WHAT MAKES THE ROW DECISION READABLE FROM THIS BODY (check:store-doors-decide,
  -- 2026-09-22). This door decides every row through `custom.visible_predicate_sql`, which asks
  -- `custom.visible_set` — the one ladder — and writes its four arms into this door's own WHERE.
  -- That is a real decision, but it happens through a helper and inside a generated statement,
  -- so a census reading this body found no ladder call in it and said so. A door whose access
  -- decision cannot be READ off it is one refactor away from a door that does not make one.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_matching');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_matching');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_matching', p_limit, 200);

  -- STEP 2, once per request: which fields this caller may see, at which level. The level
  -- used for the field question is the caller's level on the TABLE, so a page of a hundred
  -- records asks the field question once, not a hundred times.
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility, and the caller's question, in the SAME where clause.
  -- `custom.visible_predicate_sql` asks `custom.visible_set` once and writes out the same
  -- four arms `custom.read_records` branches on, as a predicate the planner can drive an
  -- index with. `custom.record_filter_sql` writes the caller's question the one way this
  -- database writes it. Neither the caller's keys nor the caller's values ever become SQL:
  -- a key is refused by shape (custom.agg_assert_key), a value is a quoted literal, and a
  -- moment in a window is cast to timestamptz in this transaction before the statement is
  -- built.
  v_sql := format($q$
    select r.id, custom.record_values_of(r) as doc
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     order by r.created_at desc
     limit %s offset %s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    -- CHOICE-VALUE. A chart hands back the RENDERED word of a dropdown and the store holds
    -- the key, so the filter is normalised to what is STORED before the statement is built —
    -- the same one line `custom.record_aggregate` runs before it counts.
    custom.record_filter_sql(custom.choice_filter_normalize(
      custom.choice_field_map(p_organization_id, p_table_id), p_filter)),
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    level := v_level;
    return next;
  end loop;
end;
$function$;
