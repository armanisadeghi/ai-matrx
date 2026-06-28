-- pc_move_to_podcast_schema
-- 2026-06-28 — Move the 5 canonicalized podcast tables public -> podcast (clean
-- cut; data/policies/triggers/constraints/indexes follow SET SCHEMA), grant the
-- podcast schema to PostgREST roles, repoint registry schema_name, and repoint
-- the 3 schema-qualified functions (slug-uniqueness pair + dashboard metrics).
-- Idempotent. Companion: expose_podcast_schema_postgrest.sql adds podcast to the
-- authenticator pgrst.db_schemas list.

-- 1) expose podcast schema to PostgREST roles (chat-schema parity)
grant usage on schema podcast to anon, authenticated, service_role;
alter default privileges in schema podcast grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema podcast grant usage, select on sequences to anon, authenticated, service_role;

-- 2) move the cluster
alter table if exists public.pc_shows             set schema podcast;
alter table if exists public.pc_episodes          set schema podcast;
alter table if exists public.pc_articles          set schema podcast;
alter table if exists public.pc_studio_runs       set schema podcast;
alter table if exists public.pc_studio_run_assets set schema podcast;

-- 3) table grants explicit/idempotent for the moved tables
grant select, insert, update, delete on all tables in schema podcast to anon, authenticated, service_role;

-- 4) registry: point tokens at the new schema
update platform.entity_types set schema_name='podcast'
  where token in ('pc_show','pc_episode','pc_article','pc_studio_run','pc_studio_run_asset');

-- 5) repoint schema-qualified function references public.pc_* -> podcast.pc_*
create or replace function public.pc_check_episode_slug_unique()
returns trigger language plpgsql as $fn$
BEGIN
    IF EXISTS (SELECT 1 FROM podcast.pc_shows WHERE slug = NEW.slug) THEN
        RAISE EXCEPTION 'Slug "%" already exists in pc_shows', NEW.slug;
    END IF;
    RETURN NEW;
END;
$fn$;

create or replace function public.pc_check_show_slug_unique()
returns trigger language plpgsql as $fn$
BEGIN
    IF EXISTS (SELECT 1 FROM podcast.pc_episodes WHERE slug = NEW.slug) THEN
        RAISE EXCEPTION 'Slug "%" already exists in pc_episodes', NEW.slug;
    END IF;
    RETURN NEW;
END;
$fn$;

create or replace function public.get_user_dashboard_metrics()
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('agents',0,'conversations',0,'knowledge_files',0,'published_apps',0,
      'notes',0,'tasks',0,'transcripts',0,'scopes',0,'shortcuts',0,'research_reports',0,'podcasts',0,'messages',0);
  end if;
  return jsonb_build_object(
    'agents',           (select count(*) from agent.definition      where created_by = uid and coalesce(is_archived, false) = false),
    'conversations',    (select count(*) from chat.conversation      where created_by = uid and deleted_at is null),
    'knowledge_files',  (select count(*) from files.files            where created_by = uid and deleted_at is null),
    'published_apps',   (select count(*) from app.definition         where created_by = uid and status = 'published'),
    'notes',            (select count(*) from workbench.notes        where created_by = uid and deleted_at is null),
    'tasks',            (select count(*) from workspace.tasks        where created_by = uid),
    'transcripts',      (select count(*) from transcripts.transcripts where user_id = uid and coalesce(is_deleted, false) = false),
    'scopes',           (select count(*) from context.scopes         where created_by = uid),
    'shortcuts',        (select count(*) from agent.shortcut         where created_by = uid and coalesce(is_active, false) = true),
    'research_reports', (select count(*) from research.rs_topic      where created_by = uid),
    'podcasts',         (select count(*) from podcast.pc_episodes    where user_id = uid),
    'messages',         (select count(*) from communication.dm_messages where sender_id = uid and deleted_at is null)
  );
end;
$fn$;
