-- chair-step: DOORS-ONLY-3 inverse -- REMOVES the four doors batch A built onto
-- platform.guided_checklist_run, platform.egress_device and platform.masterwork_run, and
-- their platform.client_callable_door rows. Run this ONLY together with the inverses of the
-- three refusal files, and only after the callers have been moved back to the base tables:
-- on its own it takes the only write path those three features have and leaves the guided
-- setup checklist, the residential-egress toggles and the Masterwork expert score with
-- nowhere to write. Say which path broke.

delete from platform.client_callable_door
 where schema_name = 'public'
   and function_name in ('checklist_run_start', 'checklist_run_save',
                         'egress_device_set', 'masterwork_run_score');

drop function if exists public.checklist_run_start(uuid, text, text);
drop function if exists public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamptz, boolean, timestamptz);
drop function if exists public.egress_device_set(uuid, boolean, text);
drop function if exists public.masterwork_run_score(uuid, numeric, text);
