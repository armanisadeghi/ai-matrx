-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) f151c98d20962dedadfbab754147151cf3451238a1bf63294c327cc16a9c708f
--
-- REALTIME-2, file 5 — THE ID-SET DOOR ASKS `custom.read_mask`, BECAUSE THE RATCHET SAID SO.
--
-- WHAT HAPPENED. `custom.read_records_by_ids` shipped an hour ago doing EXACTLY what
-- `custom.read_records` does: resolve the caller's level on the TABLE once, build the visible
-- field list once, and hand that to `custom.mask_document` for every row. That is the page
-- door's own shape, and `pnpm check:fields-stay-masked` failed it anyway:
--
--   [FAIL] 8 client door(s) in schema `custom` reach a raw value source and never reach
--          custom.read_mask; the ratchet stands at 7.
--          - custom.read_records_by_ids(...)
--
-- THE GUARD IS RIGHT AND THE RATCHET IS THE POINT. Its header says it in one line: *"There is
-- no excuse list, because an excuse list is how a ratchet dies."* `custom.read_records` is
-- itself one of the seven counted doors — the census is a class, not a shame list — and a new
-- sibling of a known class is the census GROWING, which is the one thing a ratchet exists to
-- refuse. Raising the ceiling to 8 would have been the easy edit and the wrong one.
--
-- AND THE FIX IS NOT A CONCESSION — IT IS MORE CORRECT THAN WHAT IT REPLACES.
-- `custom.read_mask(org, record_id)` resolves `custom.effective_level` on the RECORD.
-- `custom.read_records` resolves it on the TABLE, once, and says so in its own comment: a page
-- of a hundred records asks the field question once rather than a hundred times. That is a
-- deliberate trade a PAGE has to make — and a record shared with this reader at a level that
-- differs from her level on the Table is therefore masked, on a page, by the Table's answer.
--
-- An ID SET is not a page. It is bounded, it is small in the case it exists for (a realtime
-- notice names the records that just moved), and it is capped by the same page ceiling. So it
-- can afford the per-record answer, and the per-record answer is the true one. This door now
-- asks `custom.read_mask` for every row it returns, which is the same call `custom.read_record`
-- makes for the one row IT returns — so the id-set door and the single-record door now agree
-- exactly, and the page door remains the only one making the page's trade.
--
-- WHAT DOES NOT CHANGE: the ladder. `custom.visible_set` is still asked ONCE for the whole
-- set, and it is still the only thing deciding WHICH rows come back. `read_mask` decides only
-- which FIELDS of a row this reader may see — the second question, never the first.

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
  v_set      record;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
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

  -- STEP 1, ONCE: THE ONE LADDER decides WHICH rows. Identical call, identical arguments to
  -- the page door's. This is the question that must never be asked twice in two ways.
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
    -- STEP 2, PER ROW: THE ONE MASK decides which FIELDS of it she may see, at the level she
    -- holds ON THIS RECORD. The same call `custom.read_record` makes for its one row.
    v_mask := custom.read_mask(p_organization_id, v_rec.id, 'read');
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
      from jsonb_array_elements(v_mask -> 'declared') x;

    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_mask -> 'notices', p_by_id,
                                       v_mask -> 'key_ids', v_declared));
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$;

comment on function custom.read_records_by_ids(uuid, uuid, uuid[], boolean) is
  'DOOR-1 for an id SET: exactly these records of this Table. custom.visible_set — THE ONE LADDER — is asked ONCE and decides which rows come back; custom.read_mask is asked per row and decides which fields of each, at the level this reader holds ON THAT RECORD, which is the same call custom.read_record makes and is stricter than the page door''s table-level answer. A record the reader may not see simply does not come back, so a realtime nudge naming ids can re-read only what moved. Refuses by name above the page ceiling.';
