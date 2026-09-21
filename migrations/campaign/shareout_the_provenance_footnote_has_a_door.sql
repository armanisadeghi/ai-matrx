-- chair-step: this replaces the body of custom.computed_provenance and opens it to the client, so the judge cannot read what the statement will do from its allow-list
-- based-on: custom.computed_provenance(uuid, uuid) 4f64ea935680296057e83ee69467546ee15cde64cedc34624afecc3827ce1c1b
--
-- SHARE-OUT item 2 — THE FOOTNOTE THAT COULD NEVER BE SHOWN.
--
-- WHAT WAS MEASURED (lane PEEK-SHARE, §1, on Ironclad Mobile Mechanic's own service call,
-- as the organization's own admin, on the MAIN database):
--
--   1 read_record            : OK  (8 keys)
--   2 record_history         : OK  (1 rows)
--   3 computed_provenance    : REFUSED 42501 / permission denied for function computed_provenance
--   4 my_level               : admin
--
-- The store was never wrong. `custom.computed_provenance` simply held no EXECUTE for
-- `authenticated` and no `platform.client_callable_door` row, so on EVERY record in the
-- platform the peek says, honestly, that it cannot say which rule worked a value out.
-- The sentence is right; the situation is wrong. An organization's admin should be able
-- to see which rule produced a value on a record she may already read in full.
--
-- WHAT CHANGES. The function becomes a door: SECURITY DEFINER, asking THE ONE LADDER in
-- the same order and with the same two helpers as `custom.record_history` beside it —
-- `custom.assert_client_may_reach` (the organization wall) then
-- `custom.assert_client_may_open` at the VIEWER rung (the row). A viewer of the record may
-- read its provenance; nobody else can, and a record in another organization reads as
-- absent exactly as it does through every other door.
--
-- AND IT WEARS THE SAME MASK. A field this reader may not SEE does not hand over its
-- computed VALUE through the footnote — that would be a read door around the read door.
-- The row still appears (the rule ran, and that is the audit trail), with `value` replaced
-- by the store's own withheld marker, which is exactly what `custom.record_history` does
-- with a change to a masked field.
--
-- WHAT DOES NOT CHANGE: the shape of the returned set, the `_computed` payload it reads,
-- and every existing server-lane caller, which runs as the store owner and walks straight
-- through both asserts.
--
-- THE INVERSE: `migrations/inverse/shareout_provenance_door_down.sql`.

-- ---------------------------------------------------------------------------
-- 1. The body.
-- ---------------------------------------------------------------------------
create or replace function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, rule_id uuid,
              rule_version integer, computed_at timestamptz)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mask jsonb;
begin
  -- THE SAME ORDER AS EVERY OTHER DOOR IN THIS STORE: the organization wall, then the row.
  -- Reversing it would tell somebody in the wrong organization that they may not open a
  -- record, when what is true is that they are not in that organization at all.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.computed_provenance');
  perform custom.assert_client_may_open(p_organization_id, p_record_id,
                                        'custom.computed_provenance',
                                        'viewer'::public.permission_level, 'record');

  v_mask := custom.read_mask(p_organization_id, p_record_id, 'read');

  return query
    select e.key,
           (e.value ->> 'field_id')::uuid,
           -- THE MASK. The rule ran and that fact is not a secret; the value it produced
           -- for a field this reader may not see is.
           case when custom.mask_says_withheld(v_mask, e.key)
                then custom.withheld_marker(v_mask, e.key)
                else e.value -> 'value' end,
           (e.value ->> 'rule_id')::uuid,
           (e.value ->> 'rule_version')::integer,
           (e.value ->> 'at')::timestamptz
      from custom.record r,
           lateral jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
     where r.organization_id = p_organization_id
       and r.id = p_record_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The declaration, BEFORE the grant (db-rules §6d-4: a client-callable
--    SECURITY DEFINER function with no row here has its client EXECUTE revoked
--    from inside the GRANT itself).
-- ---------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers)
values
  ('custom', 'computed_provenance', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'SHARE-OUT',
   'SHARE-OUT / item 2: the record peek''s provenance footnote. p_organization_id is checked by custom.assert_client_may_reach on entry, so a null or an organization the caller is not in is refused there. p_record_id is checked by custom.assert_client_may_open at the VIEWER rung against THIS organization, so a record from another tenant reads as absent and is refused with the same sentence whether or not it exists. It reads only the _computed payload of that one admitted record, and a field the reader''s own read mask withholds hands over custom.withheld_marker instead of its value.',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do update
   set identity_args = excluded.identity_args,
       declared_by   = excluded.declared_by,
       reason        = excluded.reason;

grant execute on function custom.computed_provenance(uuid, uuid) to authenticated;
