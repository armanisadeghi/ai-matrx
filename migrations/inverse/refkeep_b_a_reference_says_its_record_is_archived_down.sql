-- chair-step: the INVERSE of refkeep_b_a_reference_says_its_record_is_archived.sql — the words door
--   back to its two output columns (record_id, words), its grants put back by the DDL guard.
-- lock: custom
-- lane: REFERENCE-KEEPS-ARCHIVED
-- based-on: custom.relation_words_many(uuid, uuid, uuid[]) 3e7801956ca2c2a565b80597dde84a239e86c13f4e05889daf7c32f3b813d434

DROP FUNCTION custom.relation_words_many(uuid, uuid, uuid[]);

CREATE FUNCTION custom.relation_words_many(p_organization_id uuid, p_field_id uuid, p_record_ids uuid[])
 RETURNS TABLE(record_id uuid, words text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_display jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_words_many');
  v_display := custom._display_of_field(p_organization_id, p_field_id);
  -- A PAGE AT A TIME, and the ladder is still asked per record inside the resolver, so
  -- batching buys a round trip and never a disclosure.
  return query
    select i.id, custom._words_for(p_organization_id, i.id, v_display, null, 0)
      from unnest(coalesce(p_record_ids, '{}'::uuid[])) as i(id)
     where i.id is not null;
end
$function$;

-- Grants: none written here. The DDL guard re-opens a declared door's grants when it is born
-- (platform.reopen_declared_doors from its platform.client_callable_door row), so the signed-in
-- lane comes back exactly as it was and anon stays shut.
