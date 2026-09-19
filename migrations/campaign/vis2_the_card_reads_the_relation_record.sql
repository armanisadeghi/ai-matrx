-- VIS-2 (5 of 5) — THE CARD READS THE RELATION RECORD, WHICH IS THE ONLY SHAPE A LINK ACROSS
-- THE WALL CAN TAKE.
--
-- MEASURED while the green suite was being written, on the main database: writing a foreign
-- record's id into a relation field's DOCUMENT is refused by `custom.validate_values` with
-- "Supplier points at something that is not there" (REC-51 — a relation field points at a live
-- record of the table it declared, resolved inside the organization). The shape a
-- cross-organization link actually takes is REC-26's: a RECORD of `data_class = 'relation'`
-- carrying `from` and `to`, which is exactly what `custom.assert_organization_wall` judges.
--
-- `custom.relation_target_card` read the association edges and the document keys and not that
-- one, so the door that exists to MASK a foreign record could not be handed a foreign record at
-- all. The arm is added; the two it already had are untouched, and the three answers below it
-- are the bytes they were.
--
-- ADDITIVE: one `create or replace`.
--
-- THE INVERSE: migrations/inverse/vis2_the_card_reads_the_relation_record_down.sql

-- based-on: custom.relation_target_card(uuid, uuid, text) 15b0a0f3959b8d9997b5a94088f79fec39404b93d950b637bc97f81bebe21587

set lock_timeout = '3s';
set statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.relation_target_card(p_organization_id uuid, p_record_id uuid, p_via_key text DEFAULT NULL::text)
 RETURNS TABLE(target_id uuid, target_organization_id uuid, is_foreign boolean, masked boolean, reader_level permission_level, card jsonb, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- FOLLOW THIS RECORD'S RELATIONS AND SHOW WHAT THIS READER MAY ACTUALLY SEE (T15 / VIS-23).
--
-- Every target of `p_record_id` — the declared relation edges in `platform.associations` and
-- the ids written into the document itself — with the foreign ones included and MASKED. Three
-- answers and never a fourth, each carrying the sentence that says which one it is:
--
--   · the wall is shut  — the two organizations have not both turned links on, so the target
--     is reported as existing and nothing else. Not its organization, not its table.
--   · no visibility     — the reader may know it exists and which organization owns it, and
--     that is all. Across the wall this is the normal answer: the org-member lane cannot fire
--     for an organization the reader is not in, so a grant to them or to their organization
--     (VIS-23) is the only way through.
--   · visibility        — `custom.record_card` at the level this reader holds, field-masked
--     exactly as `custom.read_record` masks it at home.
--
-- The door decides the SOURCE first: `custom.assert_client_may_open` is the organization wall
-- and then the one ladder on the record whose relations these are. A person who cannot open
-- the record cannot enumerate what it points at.
declare
  v_me uuid := custom.query_principal();
  r    record;
begin
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
            'custom.relation_target_card', 'viewer'::public.permission_level, 'record');

  for r in
    select x.id as tid, t.organization_id as torg
      from (
        select a.target_id as id
          from platform.associations a
         where a.source_type = 'record'
           and a.source_id = p_record_id
           and a.target_type = 'record'
           and a.deleted_at is null
           and a.relation_field_id is not null
           and (p_via_key is null or a.role = p_via_key)
        union
        -- REC-26's own shape: a relation is a RECORD, `from` one end and `to` the other. It is
        -- the form the organization wall judges and the only form a link across the wall can
        -- take at all - `custom.validate_values` refuses a foreign id written into a relation
        -- field's document (REC-51: it points at a live record of the table it declared), so a
        -- door that read only the document could never see a cross-organization link and the
        -- masking below would be unreachable by construction.
        select (rr.data ->> 'to')::uuid
          from custom.record rr
         where rr.organization_id = p_organization_id
           and rr.data_class = 'relation'
           and rr.deleted_at is null
           and nullif(rr.data ->> 'from', '') = p_record_id::text
           and (p_via_key is null or rr.data ->> 'role' = p_via_key)
           and (rr.data ->> 'to') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        union
        select (e #>> '{}')::uuid
          from custom.record s
          cross join lateral jsonb_each(s.data) kv
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(kv.value) = 'array' then kv.value
                 when jsonb_typeof(kv.value) = 'string' then jsonb_build_array(kv.value)
                 else '[]'::jsonb end) e
         where s.organization_id = p_organization_id
           and s.id = p_record_id
           and s.deleted_at is null
           and (p_via_key is null or kv.key = p_via_key)
           and (e #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) x
      join custom.record t on t.id = x.id and t.deleted_at is null
     order by 1
  loop
    target_id := r.tid;
    is_foreign := r.torg is distinct from p_organization_id;

    if is_foreign and not custom.cross_organization_links_open(p_organization_id, r.torg) then
      target_organization_id := null;
      masked := true;
      reader_level := null;
      card := null;
      why := 'This points at a record in another organization, and the two organizations have not both turned on links to other organizations. Nothing about it is shown here.';
    elsif v_me is null and custom.query_is_store_owner() then
      target_organization_id := r.torg;
      masked := false;
      reader_level := 'admin'::public.permission_level;
      card := custom.record_values(r.torg, r.tid);
      why := null;
    elsif custom.has_visibility(v_me, 'record', r.tid, 'viewer'::public.permission_level) then
      target_organization_id := r.torg;
      masked := false;
      reader_level := custom.effective_level(v_me, r.torg, r.tid);
      card := custom.record_card(v_me, r.torg, r.tid);
      why := null;
    else
      target_organization_id := r.torg;
      masked := true;
      reader_level := null;
      card := null;
      why := case when is_foreign
                  then 'This points at a record in another organization. Links between the two are allowed, but nobody there has shared this record with you or with your organization, so only the fact that it exists is shown.'
                  else 'This points at a record you do not have access to, so only the fact that it exists is shown. Ask whoever holds it to share it with you.' end;
    end if;
    return next;
  end loop;
end;
$function$;
