-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.read_record(uuid, uuid, boolean) 6ee178d3dc90743fd0bf67b9453478cd9a50f1afb109daa5f251c75c6615e9a5
--
-- SEAT-SUITES — THE READ DOOR SHOWS WHAT WAS RETIRED.
--
-- FOUND BY RUNNING A CAMPAIGN SUITE FROM THE SEAT A SIGNED-IN PERSON HAS. `custom.read_record`
-- already carries `_alternates` — the OTHER value a merge kept — through to the person. It did
-- not carry `_retired`, the value the store kept WITH ITS REASON when it could not keep it as a
-- value at all. Both exist for one purpose: nothing is lost in silence. One of them reached the
-- product and one of them did not, and no suite could tell, because every suite read
-- `custom.record.data` straight, as the role that owns the table.
--
-- WHAT MAKES IT FAIL (rule 3): delete the `_retired` block, which is exactly what
-- `migrations/inverse/seatsuites_the_read_door_shows_what_was_retired_down.sql` does.

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE. `custom.resolve_id` walks the whole
  -- chain and ignores a REVOKED alias, so an undone merge puts the id back to itself. The
  -- read then happens on the record the id MEANS, and the answer SAYS which id was asked
  -- for — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := custom.effective_level(v_me, p_organization_id, v_now);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  -- EVERY key this Table has a Field record for, visible or not. The difference between
  -- this list and v_visible is what masking is about; a key in NEITHER is undeclared.
  select coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  v_out := custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT. Two Chens become one Person and BOTH phone
  -- numbers survive, each with its source — and until now the read door showed one of them.
  -- Only for keys this reader may see: an alternate IS the value, so a masked field's
  -- alternates are masked with it.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY. When a merge
  -- meets a key that is not a declared Field, and when a Field changes what it holds and a
  -- value cannot be converted, the store does NOT drop the value: it keeps it in `_retired`
  -- WITH THE SENTENCE SAYING WHY ("not a declared field", "Phone now holds numbers"). That
  -- whole design exists so nothing is lost in silence — and this door, the only way a person
  -- ever sees a record, did not carry it. Measured from the seat `authenticated` on the main
  -- database, 2026-09-19: the stored row holds `_retired: [{key: nickname, value: "Chen-Chen",
  -- reason: "… not a declared field …"}]` and `custom.read_record` answers a document with no
  -- `_retired` at all. Only the suites that read `custom.record` directly — as the role that
  -- owns it — could ever see it, which is why four lanes shipped this green.
  --
  -- MASKED EXACTLY LIKE THE VALUE IT USED TO BE. A retired value IS a value, so an entry whose
  -- key is a declared Field this reader may not see is withheld with it; a key that is not a
  -- declared Field at all carries no field-level sensitivity (there is no Field to carry one)
  -- and rides with the rest of the undeclared document, exactly as `custom.mask_document`
  -- already treats it.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$

;
