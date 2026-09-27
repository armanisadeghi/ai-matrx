-- chair-step: lane FINAL-SWITCH inverse — removes the final switch and puts back the one body it replaced (platform.older_tables_switched).
-- based-on: platform.older_tables_switched(uuid) 9574aab15729e6852491fe33aae6362e3032666100590afbbec560f48e6a8833
-- INVERSE of migrations/campaign/finalswitch_one_press_switches_every_organization_and_one_undo_reverses_it.sql (lane FINAL-SWITCH).
-- Refused while the final switch is on: undo it first from its page (platform.final_switch_undo),
-- so no organization is left switched by a run nothing can reverse. Its press records stay in
-- platform.cutover_seam_press (append-only history); the seam row is retired, never deleted, when
-- a record names it.

do $$
declare
  v_state text;
begin
  -- Dynamic, so this file also runs where the final switch is already gone.
  if to_regprocedure('platform._final_switch_last()') is not null then
    execute 'select (platform._final_switch_last()).direction' into v_state;
    if coalesce(v_state, 'old') = 'new' then
      raise exception 'The final switch is on. Undo it from Administration → Database → Final switch before removing it.'
        using errcode = '55000';
    end if;
  end if;
end $$;

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('final_switch_state', 'final_switch_readiness', 'final_switch_press', 'final_switch_undo');

-- The press log's hold (trigger final_switch_holds_every_organization on platform.cutover_seam_press)
-- goes with its function: DROP FUNCTION … CASCADE, never DROP TRIGGER — a DROP TRIGGER fires
-- Supabase's supautils hook (ACCESS EXCLUSIVE on 23 auth/storage/realtime relations); the cascade
-- takes the lock on platform.cutover_seam_press alone, for the moment of the drop.
-- ground-standing-ok: a — CASCADE drops the trigger with its function in this one statement; no trigger is left over a missing body.
drop function if exists platform._final_switch_holds_every_organization() cascade;

-- The body as it was.
CREATE OR REPLACE FUNCTION platform.older_tables_switched(p_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select p_organization_id is not null
     and coalesce((platform._cutover_seam_last_done('older_tables', p_organization_id)).direction, 'old') = 'new';
$function$

;

drop function if exists platform.final_switch_undo(text, boolean);
drop function if exists platform.final_switch_press(text, jsonb);
drop function if exists platform.final_switch_readiness();
drop function if exists platform.final_switch_state();
drop function if exists platform._final_switch_record(text, text, text, text, jsonb, jsonb, text, uuid);
drop function if exists platform._final_switch_person_refusal();
drop function if exists platform._final_switch_readiness();
drop function if exists platform._final_switch_scopes(text, uuid, text, uuid[]);
drop function if exists platform._final_switch_scopes_code();
drop function if exists platform._final_switch_old_write_doors();
drop function if exists platform._final_switch_is_on();
drop function if exists platform._final_switch_last();
drop function if exists platform._final_switch_platform_org();

update platform.cutover_seam set retired_at = now()
 where seam_key = 'final_switch'
   and exists (select 1 from platform.cutover_seam_press p where p.seam_key = 'final_switch');
delete from platform.cutover_seam s
 where s.seam_key = 'final_switch'
   and not exists (select 1 from platform.cutover_seam_press p where p.seam_key = 'final_switch');
