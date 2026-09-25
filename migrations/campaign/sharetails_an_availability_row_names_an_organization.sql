-- chair-step: lane SHARE-TAILS. REPLACES iam._a_share_names_a_person() so a person (or public) grant can never be stamped granted_via = 'availability'. Organization rows are already stamped availability by the arm at creation (grant_org_availability, review_org_share, hr._reconcile_grants, the organization lane); a share never carries it. Same signature, same trigger.
-- based-on: iam._a_share_names_a_person() f531f5ec66eab7a75b8ddbb4d9a8e65e905940863a4ef9667005959cf9d8cad7
-- lane: SHARE-TAILS
-- INVERSE: migrations/inverse/sharetails_an_availability_row_names_an_organization_down.sql
set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION iam._a_share_names_a_person()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if new.granted_to_organization_id is null then
    -- SHARE-TAILS (2026-09-25): THE ORIGIN IS NEVER AMBIGUOUS AGAIN. `availability` is organization
    -- configuration (surface binding, library contribution, HR's directory, the organization lane)
    -- and it only ever names an organization; a grant to a person or to the public is a share and
    -- never carries it. Before this line nothing stopped a person row from being stamped
    -- availability, and the conversion had to guess which organization rows were contributions.
    if new.granted_via = 'availability' then
      raise exception 'Only an organization is made available; a person is shared with.'
        using errcode = '23514',
              hint = 'SHARE-PEOPLE-ONLY: granted_via = availability names an organization (public.grant_org_availability). A grant to a person is a share: leave granted_via empty or say share.';
    end if;
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
