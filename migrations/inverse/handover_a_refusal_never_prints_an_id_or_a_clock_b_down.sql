-- Inverse of handover_a_refusal_never_prints_an_id_or_a_clock_b.sql: the body it replaced, byte for byte.
-- based-on: PLACEHOLDER
-- chair-step: restores the body of custom.inbound_domain that handover_a_refusal_never_prints_an_id_or_a_clock_b.sql replaced (its refusal printed an organization id)

CREATE OR REPLACE FUNCTION custom.inbound_domain(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v text;
begin
  -- The knob custom/inbound_domain carries the published default
  -- (inbound.matrxserver.com) and any organization's own domain. Failing to read it
  -- is a real failure and says so; it is never papered over with a default here.
  v := nullif(btrim(coalesce(platform.knob_resolve('custom', 'inbound_domain', p_organization_id) #>> '{}', '')), '');
  if v is null then
    raise exception 'inbound_domain: the setting custom/inbound_domain is blank for organization %', p_organization_id
      using errcode = '22023';
  end if;
  return v;
end;
$function$;
