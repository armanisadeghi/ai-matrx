-- Inverse of w1_org_nothing_substitutes_an_organization_dm_default_org.sql.
--
-- Restores the personal-org substitution on `communication.dm_conversations`.
-- Running this re-opens the class the 2026-09-19 ruling closed: it should only
-- ever be used to unblock an incident, and never left in place.

create or replace function public.dm_default_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT o.id INTO NEW.organization_id
      FROM iam.organizations o
     WHERE o.is_personal AND o.created_by = COALESCE(NEW.created_by, ( SELECT auth.uid()))
     LIMIT 1;
  END IF;
  RETURN NEW;
END $function$;

create trigger trg_default_org
  before insert on communication.dm_conversations
  for each row execute function public.dm_default_org();
