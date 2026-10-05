-- agent_names_count_live_copies.sql — applied on live 2026-10-05 (lane KITS-MERGE-2).
--
-- An agent's name is unique among the organization's LIVE agents only. Archived copies used to hold
-- their names, so a template installed after an earlier remove named its copy "My Org Chart 4".
-- Now an archived agent frees its name; bringing it back (is_archived true → false) while a live agent
-- holds the name gives it the next free name in the same write — it never fails the restore.

create or replace function agent.next_free_agent_name(p_organization_id uuid, p_name text, p_except uuid default null::uuid)
returns text language plpgsql stable set search_path to ''
as $function$
declare
  v_org  uuid := coalesce(p_organization_id, public.system_org_id('system'));
  v_base text := btrim(coalesce(p_name, ''));
  v_try  text := v_base;
  v_n    integer := 1;
begin
  if v_base = '' then return p_name; end if;
  while exists (
    select 1 from agent.definition d
     where d.organization_id = v_org
       and d.deleted_at is null and not coalesce(d.is_archived, false)
       and (p_except is null or d.id <> p_except)
       and lower(btrim(d.name)) = lower(v_try)
  ) loop
    v_n := v_n + 1;
    v_try := format('%s (%s)', v_base, v_n);
    exit when v_n > 999;
  end loop;
  return v_try;
end;
$function$;

create or replace function agent._refuse_duplicate_agent_name()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  v_free text;
  v_org_name text;
  v_restoring boolean := TG_OP = 'UPDATE' and coalesce(OLD.is_archived, false) and not coalesce(NEW.is_archived, false);
begin
  if NEW.deleted_at is not null or coalesce(NEW.is_archived, false) or NEW.organization_id is null or btrim(coalesce(NEW.name, '')) = '' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and not v_restoring
     and lower(btrim(NEW.name)) = lower(btrim(coalesce(OLD.name, '')))
     and NEW.organization_id is not distinct from OLD.organization_id
     and OLD.deleted_at is null then
    return NEW;
  end if;
  if exists (
    select 1 from agent.definition d
     where d.organization_id = NEW.organization_id
       and d.deleted_at is null and not coalesce(d.is_archived, false)
       and d.id <> NEW.id
       and lower(btrim(d.name)) = lower(btrim(NEW.name))
  ) then
    v_free := agent.next_free_agent_name(NEW.organization_id, NEW.name, NEW.id);
    if v_restoring and lower(btrim(NEW.name)) = lower(btrim(coalesce(OLD.name, ''))) then
      -- Brought back while its name is in use: it takes the next free name.
      NEW.name := v_free;
      return NEW;
    end if;
    select o.name into v_org_name from iam.organizations o where o.id = NEW.organization_id;
    raise exception 'An agent named "%" already exists in %. Name this one "%".',
      btrim(NEW.name), coalesce(v_org_name, 'this organization'), v_free
      using errcode = '23505', detail = v_free, hint = 'agent_name_taken';
  end if;
  return NEW;
end;
$function$;

drop trigger if exists zzz_refuse_duplicate_agent_name on agent.definition;
create trigger zzz_refuse_duplicate_agent_name before insert or update of name, organization_id, deleted_at, is_archived
  on agent.definition for each row execute function agent._refuse_duplicate_agent_name();
