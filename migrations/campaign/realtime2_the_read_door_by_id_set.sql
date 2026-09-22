-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- REALTIME-2, file 4 — READING BACK ONLY WHAT MOVED.
--
-- THE NOTICE HAS ALWAYS NAMED THE EXACT IDS and nothing has ever been able to use them. A
-- realtime nudge says "these three records moved"; `useRecords` answers by re-reading its
-- whole page, because a whole page is the only thing the store had a door for. Three cells
-- change and fifty rows come back over the wire, every time, for every watching browser.
--
-- WHY A NEW NAME RATHER THAN A SIXTH ARGUMENT. `custom.read_records(uuid, uuid, boolean,
-- integer, integer)` is live and called from everywhere. Adding `p_record_ids uuid[] DEFAULT
-- NULL` beside it makes every existing five-argument call ambiguous — `function
-- custom.read_records(uuid, uuid, boolean, integer, integer) is not unique` — so the only way
-- to add the argument is to drop a live door and re-create it. The chair's ruling, 2026-09-21:
-- never overload a live door, and a NEW NAME CANNOT COLLIDE.
--
-- WHAT IS NOT DUPLICATED, WHICH IS THE WHOLE POINT. Every DECISION this door makes is the same
-- call `custom.read_records` makes, in the same order:
--
--   · `custom.assert_may_know_table`  — may this seat know this Table exists at all
--   · `custom.effective_level`        — her level ON THE TABLE, asked once
--   · `iam.visible_field_ids`         — which columns she may see, asked once
--   · `custom.visible_set`            — THE ONE LADDER, asked once, bounded
--   · `custom.mask_document`          — the hidden-field notices
--   · `custom.choice_render`          — the stored words
--
-- The only thing written out here is the row FILTER, and it is written ONCE rather than as
-- `read_records`' four separate loops, because a bounded id set has no page to order or limit:
-- there is nothing for a planner to stop early, so the four arms collapse into one `case` that
-- says the same thing. A future change to what "visible" means still happens in exactly one
-- place — `custom.visible_set` — and both doors inherit it.
--
-- THE CEILING IS THE SAME CEILING, and it REFUSES rather than clamps. `custom.page_size` is
-- the one page contract twenty-three doors share (lane WRITE-PERF); an id list longer than it
-- is refused by name with the same sentence, because a silently-truncated answer to "read
-- exactly these ids" is worse than no answer: the caller cannot tell a short list from a
-- complete one, which is the defect the notice's own `record_ids: null` exists to avoid.
--
-- IT IS NOT A LIVE-UPDATES DOOR. Nothing about it knows what realtime is. It answers "read
-- exactly these records of this Table", which a printing surface, an export preview and an
-- undo step all want as much as a nudge does.

create or replace function custom.read_records_by_ids(
  p_organization_id uuid,
  p_table_id        uuid,
  p_record_ids      uuid[],
  p_by_id           boolean default false
)
returns table(id uuid, document jsonb, level permission_level)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_set      record;
  v_n        integer := coalesce(cardinality(p_record_ids), 0);
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

  -- STEP 2, once: which fields this caller may see, at which level — her level on the TABLE,
  -- so a set of a hundred ids asks the field question once, exactly as the page door does.
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

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: THE ONE LADDER. Identical call, identical arguments.
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
  end if;

  for v_rec in
    select r.id, custom.record_values_of(r) as doc
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
     order by r.created_at desc
  loop
    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    level := v_level;
    return next;
  end loop;
end;
$function$;

comment on function custom.read_records_by_ids(uuid, uuid, uuid[], boolean) is
  'DOOR-1 for an id SET: exactly these records of this Table, decided by the SAME ladder, level, field visibility and masking custom.read_records uses — a new name rather than a sixth argument, because adding one to the live page door would make every existing five-argument call ambiguous. A record the reader may not see simply does not come back, so a realtime nudge naming ids can re-read only what moved instead of the whole page. Refuses by name above the page ceiling: a short answer to "read exactly these" is indistinguishable from a complete one.';

-- THE DOOR DECLARATION, BEFORE THE GRANT. Without the row, this database's own ddl_guard
-- takes the client EXECUTE straight back off a SECURITY DEFINER function and every call
-- answers 42501.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by, anonymous_callers, signed_in_callers)
values
  ('custom', 'read_records_by_ids',
   'p_organization_id uuid, p_table_id uuid, p_record_ids uuid[], p_by_id boolean',
   'The same read door as custom.read_records, addressed by id set instead of by page. It resolves the reader from the session (auth.uid()), asks custom.assert_may_know_table exactly as the page door does, and filters every row through custom.visible_set — the one ladder — so it can only ever answer with records the caller could already have paged to. Field masking, hidden-field notices and choice rendering are the same calls. A caller who names an id she may not see gets nothing back for it, which is the same answer the page door gives by omission.',
   'realtime2_the_read_door_by_id_set.sql',
   false, true)
on conflict do nothing;
