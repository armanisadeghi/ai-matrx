-- chair-step: the inverse of migrations/campaign/storereadperf2_the_read_door_decides_in_its_own_body.sql (lane STORE-READ-PERF-2) — puts custom.read_record back exactly as production held it before it.
-- based-on: custom.read_record(uuid, uuid, boolean) dbb40e301a344944dcab0c3430d813a7e36b8f448067f31e38f0baeb93632f31

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- DOOR-1. The whole door — the organization wall, the merge redirect, the ladder before
  -- existence, the one mask, the choice words, the whole-value pointers, the alternates and the
  -- retired values — is custom._read_record_with; alone, nothing is handed in and it asks every
  -- question itself, exactly as this body did.
  return (select w.o_doc from custom._read_record_with(p_organization_id, p_record_id, p_by_id,
                                                       '{}'::jsonb, '{}'::jsonb) w);
end;
$function$
;

