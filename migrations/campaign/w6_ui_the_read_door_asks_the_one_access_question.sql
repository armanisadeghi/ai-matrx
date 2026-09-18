-- chair-step: this replaces the body of custom.read_record, a live door, so the judge cannot read what the statement will do from its allow-list; the sanctioned route is a terminal-confirmed step
-- based-on: custom.read_record(uuid, uuid, boolean) 4240aa5ce6f803c619c7f9380156b724ea48b4d12d27d0c4550eb5518e3fdcde
--
-- W6-UI — THE ONE READ DOOR AND ITS OWN LIST SIBLING GAVE TWO ANSWERS ABOUT ONE RECORD.
--
-- WHAT WAS MEASURED, on one record of the records-ui demo table, for the person who
-- created it (test@test.com), all three asked in the same statement:
--
--   iam.has_access_for(me,'record',id,'viewer')              -> true
--   exists(custom.visible_record_ids(me,'viewer') = id)      -> true
--   custom.has_visibility(me,'record',id,'viewer')           -> false
--
-- `custom.read_records` — the LIST door — admits from `custom.visible_record_ids`, which
-- carries an arm for the records a person created. `custom.read_record` — the ONE-RECORD
-- door beside it — asked `custom.has_visibility`, which has no such arm and answers only
-- from the derived containment graph. So a screen could LIST a record and then be refused
-- when it opened that same record: "You do not have access to this record."
--
-- That is not a permission decision. It is two doors answering different questions about
-- one row, and every consumer that met it has had to work around it:
-- `w4_io_the_read_door_disagreement_degrades_honestly.sql` made `io_comment_write` land a
-- comment with a null `table_id` and `io_restore` return a null version, and said in as
-- many words that patching the read door "belongs to whoever owns the read door's
-- derivation". This file is that patch, and those two degradations can now be retired by
-- their own lane whenever it next passes.
--
-- WHAT CHANGES: exactly one `if` in one function. The door asks `iam.has_access_for` —
-- the platform's ONE access question, which weighs membership, grants, ownership AND the
-- containment graph — which is the same law `w4_io_the_doors_ask_the_one_access_question.sql`
-- already applied to the io doors. Nothing else in the body moves: the masking, the
-- notices, the level and `custom.mask_document` are untouched, so what a reader may SEE of
-- a record they may open is decided exactly where it was before.
--
-- WHAT DOES NOT CHANGE: no new reading path into `custom.record` (this is still the only
-- one-record read door), no grant, no policy, no signature. `custom.has_visibility` is not
-- touched — other callers keep their own question.
--
-- THE INVERSE: `migrations/inverse/w6_ui_read_record_down.sql` puts the
-- `custom.has_visibility` test back, byte for byte.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean default false)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_level    public.permission_level;
  v_visible  text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  select r.table_id, custom.record_values(r.organization_id, r.id)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  -- THE ONE ACCESS QUESTION. `iam.has_access_for` weighs membership, grants, ownership and
  -- the containment graph, and it is the same question `custom.read_records` admits from
  -- and the io doors ask. Asking a narrower one here is what let a person list a record
  -- and then be refused when they opened it.
  if not iam.has_access_for(v_me, 'record', p_record_id, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  v_level := iam.effective_level(v_me, 'record', p_record_id, p_organization_id, v_table);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, v_table, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')) , '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb)
    into v_notices, v_key_ids
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_table
     and not (f.data ->> 'key' = any (v_visible));

  return custom.mask_document(v_doc, v_visible, v_notices, p_by_id, v_key_ids);
end;
$function$;
