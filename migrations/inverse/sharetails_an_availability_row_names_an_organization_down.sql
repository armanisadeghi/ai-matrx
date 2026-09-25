-- INVERSE of migrations/campaign/sharetails_an_availability_row_names_an_organization.sql: restores the body it replaced, verbatim.
-- lane: SHARE-TAILS
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION iam._a_share_names_a_person()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.granted_to_organization_id is null then
    return new;
  end if;
  -- Archiving an organization row is always allowed: it takes access away, never gives it.
  if tg_op = 'UPDATE' and new.status = 'archived'
     and old.granted_to_organization_id is not distinct from new.granted_to_organization_id then
    return new;
  end if;
  if coalesce(current_setting('iam.org_availability', true), '') = iam._org_availability_token() then
    new.granted_via := 'availability';
    return new;
  end if;
  raise exception 'Shares name a person, not an organization.'
    using errcode = '42501',
          hint = 'SHARE-PEOPLE-ONLY (access is personal): name the people - the Share dialog''s "Add everyone in <organization>" grants each current member by name. Organization availability (binding an agent to an organization''s surface, contributing to its library, the HR directory) goes through public.grant_org_availability.';
end $function$

;
