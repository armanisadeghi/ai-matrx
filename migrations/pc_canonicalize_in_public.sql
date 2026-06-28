-- pc_canonicalize_in_public
-- 2026-06-28 — Canonicalize the 5 podcast tables (token-stable) BEFORE the
-- schema move: add base columns + visibility, backfill owner/org/visibility,
-- register entity_types (pc_show + pc_studio_run_asset component edge),
-- apply canonical RLS. Behavior preserved (public content stays anon-readable
-- via visibility='public'; studio runs stay private). Idempotent.

-- ============ pc_shows (token pc_show, entity, ownerless -> assign owner) ============
alter table public.pc_shows add column if not exists organization_id uuid;
alter table public.pc_shows add column if not exists created_by uuid;
alter table public.pc_shows add column if not exists updated_by uuid;
alter table public.pc_shows add column if not exists version int not null default 1;
alter table public.pc_shows add column if not exists deleted_at timestamptz;
alter table public.pc_shows add column if not exists metadata jsonb not null default '{}';
alter table public.pc_shows add column if not exists visibility platform.visibility not null default 'public';

alter table public.pc_shows disable trigger user;
update public.pc_shows s set created_by = e.owner
  from (select show_id, (array_agg(created_by order by created_at desc))[1] owner
        from public.pc_episodes where created_by is not null group by show_id) e
  where e.show_id = s.id and s.created_by is null;
update public.pc_shows set created_by = '4cf62e4e-2679-484f-b652-034e697418df'::uuid where created_by is null;
update public.pc_shows s set organization_id = e.org
  from (select show_id, (array_agg(organization_id order by created_at desc))[1] org
        from public.pc_episodes where organization_id is not null group by show_id) e
  where e.show_id = s.id and s.organization_id is null;
update public.pc_shows s set organization_id = coalesce(
   (select o.id from iam.organizations o where o.is_personal and o.created_by = s.created_by order by o.created_at limit 1),
   '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
  where s.organization_id is null;
update public.pc_shows set visibility = 'public' where visibility is distinct from 'public' and deleted_at is null;
alter table public.pc_shows enable trigger user;

drop trigger if exists pc_shows_updated_at on public.pc_shows;
drop trigger if exists _touch_row on public.pc_shows;
drop trigger if exists _stamp_actor on public.pc_shows;
create trigger _touch_row  before insert or update on public.pc_shows for each row execute function platform._touch_row();
create trigger _stamp_actor before insert or update on public.pc_shows for each row execute function platform._stamp_actor();

-- ============ pc_episodes (token pc_episode, entity) ============
alter table public.pc_episodes add column if not exists visibility platform.visibility not null default 'public';
alter table public.pc_episodes disable trigger user;
update public.pc_episodes set visibility = 'public' where visibility is distinct from 'public';
alter table public.pc_episodes enable trigger user;

-- ============ pc_articles (token pc_article, entity) ============
alter table public.pc_articles add column if not exists visibility platform.visibility not null default 'public';
alter table public.pc_articles disable trigger user;
update public.pc_articles set visibility = 'public' where visibility is distinct from 'public';
alter table public.pc_articles enable trigger user;

-- ============ pc_studio_runs (token pc_studio_run, entity, private) ============
alter table public.pc_studio_runs add column if not exists visibility platform.visibility not null default 'private';
alter table public.pc_studio_runs add column if not exists metadata jsonb not null default '{}';

-- ============ registry: tokens + composition edge ============
insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select 'pc_show','public','pc_shows','Podcast Show','public',false,false,true
where not exists (select 1 from platform.entity_types where token='pc_show');

insert into platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
select 'pc_studio_run_asset','public','pc_studio_run_assets','Podcast Studio Run Asset','private',true,false,true
where not exists (select 1 from platform.entity_types where token='pc_studio_run_asset');

update platform.entity_types set default_visibility='public' where token in ('pc_episode','pc_article');

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind)
select 'pc_studio_run_asset','agent_run','run_id','composition'
where not exists (select 1 from platform.entity_relationships where child_type='pc_studio_run_asset' and kind='composition');

-- ============ canonical RLS ============
select iam.apply_rls('public','pc_shows','pc_show','entity');
select iam.apply_rls('public','pc_episodes','pc_episode','entity');
select iam.apply_rls('public','pc_articles','pc_article','entity');
select iam.apply_rls('public','pc_studio_runs','pc_studio_run','entity');
select iam.apply_rls('public','pc_studio_run_assets','pc_studio_run_asset','component');
