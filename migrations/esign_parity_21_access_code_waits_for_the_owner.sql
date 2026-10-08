-- based-on: esign._enforce(text) 2fafd3c6d3d5a7ad1a20414709d7f4e541d9ecee9479a47a53411dd1afaf5dc2
--
-- The access code (CONTRACT §18 F1) is a refusal a person can fail. Law 12: no new refusal without
-- the owner's explicit, dated approval — fix round 2 turned it on without one. It is off again; the
-- sender UI stops offering "Access code" (RecipientsPanel ACCESS_CODE_OFFERED) until Arman approves.
-- To turn it on after his approval: 'F1' then true here, and ACCESS_CODE_OFFERED = true.
create or replace function esign._enforce(p_flag text)
 returns boolean
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  -- §18: F1 access code, F2 required_fields_missing at Sign, F3 save_values shape refusals.
  -- All three stay OFF until Arman approves them in his own words, with the date (law 12).
  select case p_flag when 'F1' then false when 'F2' then false when 'F3' then false else false end
$function$;
