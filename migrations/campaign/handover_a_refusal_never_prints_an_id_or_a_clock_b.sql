-- additive: yes
-- based-on: custom.inbound_domain(uuid) 76df3a45ecae8714b47610953b947315c423e62a64f71247c6c8c6267af9cc01
-- HANDOVER (2026-09-27) — A REFUSAL NEVER PRINTS AN ID OR A CLOCK, the one door the first file missed.
--
-- Replaces ONE live function body, same signature; nothing dropped, granted or revoked; no row
-- touched. custom.inbound_domain's production body (fix_provision_validate_labels_and_inbound_domain_knob.sql)
-- is newer than the clone's, so the census on the clone did not see it; production's census did.
-- Now its sentence names no organization id; the id rides in DETAIL.
-- Guard: matrx-frontend/scripts/campaign-tests/handover_a_refusal_never_prints_an_id_or_a_clock.sql
-- Inverse: migrations/inverse/handover_a_refusal_never_prints_an_id_or_a_clock_b_down.sql

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
    raise exception 'inbound_domain: the setting custom/inbound_domain is blank for this organization'
      using errcode = '22023',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;
  return v;
end;
$function$;
