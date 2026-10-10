-- lane: DATA-HOME-2
-- based-on: custom.my_levels(uuid, jsonb, text) 49ce08826fb6aaa18fb55904614dde6c40b84c76e53f5db81ad3b1a02380480b
--
-- THE LEVEL DOOR ASKS THE LADDER AS A SET.
--
-- Measured as a plain member (test@test.com) on the page's real requests: custom.my_levels asked
-- custom.effective_level once per id - a halving of the whole ladder per id, the access kernel asked
-- afresh each time - and the /data home asks it for every table in hand, one call per organization,
-- in parallel. Together they ran past the statement timeout (57014, a 500 on /data).
--
-- custom.effective_level_many is the ladder's own set form: the same halving, every id standing at
-- one rung asked together through the kernel's batch path (custom.reaches_directly_many ->
-- iam.has_access_for_many), and exactly what effective_level answers for each id. The door now calls
-- it once for the distinct ids and lays the answers back out in the order asked, duplicates and nulls
-- included, so the output is the same rows as before. The world-lane masking is untouched.
--
-- The kernel's own functions are not edited. The grant and the client-door declaration of
-- custom.my_levels(uuid, jsonb, text) are untouched (create or replace keeps both).
--
-- THE INVERSE: migrations/inverse/datahomefix2_a_the_level_door_asks_the_ladder_as_a_set_down.sql


create or replace function custom.my_levels(p_organization_id uuid, p_ids jsonb, p_type text default 'record'::text)
 returns table(id uuid, level public.permission_level)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_me uuid;
  v_world boolean;
  v_type text;
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

  v_type := coalesce(nullif(btrim(p_type), ''), 'record');

  -- Every id asked about gets a row, in the order asked, duplicates and nulls included. A subject this person
  -- holds nothing on answers null, because a missing row and "no access" would be the same thing to the screen
  -- that asked, and one of them is a silence.
  --
  -- DATA-HOME-2 (2026-10-10). THE LEVELS ARE ASKED AS A SET. This door used to call custom.effective_level once
  -- per id - a halving of the ladder per id, the kernel asked afresh each time - and a page asking about a
  -- few hundred tables ran into the statement timeout (57014, a 500 on /data for a plain member). The ladder's
  -- own set form, custom.effective_level_many (the same halving, every id standing at one rung asked together
  -- through the access kernel's batch path), answers every distinct id in one call and exactly what
  -- effective_level answers for each; the ids are then laid back out in the order they were asked.
  return query
  with asked as (
    select a.asked::uuid as aid, a.ord as aord
      from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) with ordinality as a(asked, ord)
  ),
  lv as (
    select m.id as lid, m.level as llevel
      from custom.effective_level_many(
             v_me,
             array(select distinct s.aid from asked s where s.aid is not null),
             v_type) m
  )
  select x.aid,
         -- CHAIR-WORLD-LANE-2: a person admitted only through the world lane is answered about a Public Table, its
         -- rows and its definition rows, and about nothing else (null, as for any subject she holds nothing on).
         case when v_world and not custom.world_reader_may_know_row(p_organization_id, x.aid) then null
              else l.llevel end
    from asked x
    left join lv l on l.lid = x.aid
   order by x.aord;
end
$function$;
