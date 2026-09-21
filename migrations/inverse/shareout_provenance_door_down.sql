-- chair-step: SHARE-OUT item 2's inverse — it REVOKES the client EXECUTE on custom.computed_provenance and puts back the body that held no ladder call, which closes the record peek's provenance footnote again for every organization
--
-- Puts `custom.computed_provenance` back byte for byte as it stood before
-- `migrations/campaign/shareout_the_provenance_footnote_has_a_door.sql`: a plain SQL
-- function with no SECURITY DEFINER, no ladder call and no client grant. The peek then
-- returns to saying, honestly, that it cannot show which rule computed a value.

revoke execute on function custom.computed_provenance(uuid, uuid) from authenticated;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'computed_provenance'
   and identity_argtypes = array['uuid'::regtype::oid, 'uuid'::regtype::oid];

create or replace function custom.computed_provenance(p_organization_id uuid, p_record_id uuid)
returns table(field_key text, field_id uuid, value jsonb, rule_id uuid,
              rule_version integer, computed_at timestamptz)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select e.key,
         (e.value ->> 'field_id')::uuid,
         e.value -> 'value',
         (e.value ->> 'rule_id')::uuid,
         (e.value ->> 'rule_version')::integer,
         (e.value ->> 'at')::timestamptz
    from custom.record r,
         jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$fn$;
