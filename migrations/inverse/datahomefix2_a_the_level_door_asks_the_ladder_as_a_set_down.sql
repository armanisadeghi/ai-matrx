-- chair-step: puts the per-id body of custom.my_levels back (the one that timed out for a plain member on /data); only for a defect found in the set-form body
-- INVERSE of migrations/campaign/datahomefix2_a_the_level_door_asks_the_ladder_as_a_set.sql
--
-- The body custom.my_levels(uuid, jsonb, text) had before: one custom.effective_level call per id.


CREATE OR REPLACE FUNCTION custom.my_levels(p_organization_id uuid, p_ids jsonb, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(id uuid, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid;
  v_world boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.my_levels');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_levels');
  v_world := custom.world_reader_only(p_organization_id);

  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'Nobody is signed in, so there is no access to describe.'
      using errcode = '42501',
            hint = 'DOOR-1: this door resolves the person from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  if p_ids is not null and jsonb_typeof(p_ids) <> 'array' then
    raise exception 'This door was asked about a list of things and was not given a list.'
      using errcode = '22023',
            hint = 'p_ids is a JSON array of record ids, for example ["11111111-1111-4111-8111-111111111111"].';
  end if;

  -- Every id asked about gets a row. A subject this person holds nothing on
  -- answers null, because a missing row and "no access" would be the same thing
  -- to the screen that asked, and one of them is a silence.
  return query
  select a.asked::uuid,
         -- CHAIR-WORLD-LANE-2: a person admitted only through the world lane is answered about a Public Table, its
         -- rows and its definition rows, and about nothing else (null, as for any subject she holds nothing on).
         case when v_world and not custom.world_reader_may_know_row(p_organization_id, a.asked::uuid) then null
              else custom.effective_level(v_me, p_organization_id, a.asked::uuid,
                                          coalesce(nullif(btrim(p_type), ''), 'record')) end
    from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) as a(asked);
end
$function$
;
