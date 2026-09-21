-- chair-step: DOORS-ONLY-3 inverse -- takes the client EXECUTE grant back off the four batch A
-- doors. Running this makes the guided setup checklist, the residential-egress toggles and the
-- Masterwork expert score answer 42501 for every signed-in caller, because after the refusal
-- policies land the door is the ONLY write path those three features have. Say which path broke.

revoke execute on function public.checklist_run_start(uuid, text, text) from authenticated;
revoke execute on function public.checklist_run_save(uuid, uuid, jsonb, integer, boolean, timestamptz, boolean, timestamptz) from authenticated;
revoke execute on function public.egress_device_set(uuid, boolean, text) from authenticated;
revoke execute on function public.masterwork_run_score(uuid, numeric, text) from authenticated;
