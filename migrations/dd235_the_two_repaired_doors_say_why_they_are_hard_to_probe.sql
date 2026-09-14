-- DD-235 (B-125) — the two doors repaired by
-- `dd235_a_door_never_names_a_relation_the_catalog_does_not_have.sql` now REACH
-- their own bodies, so the door-rows harness can finally say something true about
-- them. It says it on the door row (DD-209 `probe_args`), not in a lane report:
--
--   * `communication.set_my_sms_assistant_enabled` writes exactly one row —
--     the CALLER'S OWN preference row (`preference.user_id = caller`) — so no
--     recipe can make it cross a boundary, and both test identities have no such
--     row on this database, so its honest probe is a refusal. The note says so;
--     nothing about the door is measurable until a test identity owns a bound SMS
--     preference row.
--   * `public.masterwork_improvement_summary` needed a value for
--     `p_mandate_keys text[]` that nothing can derive from the argument's name.
--     A literal registered Masterwork key gets it past its own `like
--     'masterwork.%'` filter so the benign-argument row-diff can run.
--
-- Data only: no function, grant or gate changes here.

set lock_timeout = '8s';

update platform.client_callable_door
   set probe_args = jsonb_build_object(
     'note',
     'This door writes only the caller''s own communication.sms_notification_preferences row '
     || '(preference.user_id = caller), so no recipe can make it cross an identity boundary; and '
     || 'neither test identity owns a bound SMS preference row on this database, so its honest '
     || 'answer is P0002 for both of them. Measurable only once a test identity holds one.')
 where schema_name = 'communication'
   and function_name = 'set_my_sms_assistant_enabled';

update platform.client_callable_door
   set probe_args = jsonb_build_object(
     'args', jsonb_build_object('p_mandate_keys', 'literal:masterwork.conductor'),
     'note',
     'p_mandate_keys is a list of registered Masterwork mandate keys and nothing can derive one '
     || 'from the argument name. masterwork.conductor is a live key, so the literal gets the door '
     || 'past its own mandate_key like ''masterwork.%'' filter and the benign-argument row-diff can run.')
 where schema_name = 'public'
   and function_name = 'masterwork_improvement_summary';

do $$
declare
  n integer;
begin
  select count(*) into n
  from platform.client_callable_door
  where (schema_name, function_name) in
        (('communication','set_my_sms_assistant_enabled'), ('public','masterwork_improvement_summary'))
    and probe_args is not null;
  if n <> 2 then
    raise exception 'DD-235: expected both repaired doors to carry a probe_args recipe, found %', n;
  end if;
end;
$$;
