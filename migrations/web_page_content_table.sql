-- web.page_content — the authored draft content for a canonical page (1:1).
-- Lives OUTSIDE web.page so explicit saves never bump web.page.version and
-- spuriously fail the intent card's optimistic-concurrency writes.
-- Component of web_site (access derives from the site, same as web.page /
-- web.snapshot). Markdown text per the house standard.

create table if not exists web.page_content (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references iam.organizations(id),
  site_id uuid not null references web.site(id) on delete cascade,
  page_id uuid not null unique references web.page(id) on delete cascade,
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz
);

create index if not exists page_content_site_idx on web.page_content (site_id);

grant select, insert, update, delete on web.page_content to authenticated;
grant all on web.page_content to service_role;

-- Standard platform triggers (mirroring web.page's set)
drop trigger if exists _stamp_actor on web.page_content;
create trigger _stamp_actor before insert or update on web.page_content
  for each row execute function platform._stamp_actor();
drop trigger if exists _stamp_org_default on web.page_content;
create trigger _stamp_org_default before insert on web.page_content
  for each row execute function _stamp_org_default();
drop trigger if exists _touch_row on web.page_content;
create trigger _touch_row before insert or update on web.page_content
  for each row execute function platform._touch_row();
drop trigger if exists _enforce_site_component_organization on web.page_content;
create trigger _enforce_site_component_organization before insert or update on web.page_content
  for each row execute function web.enforce_site_component_organization();
drop trigger if exists _version_capture on web.page_content;
create trigger _version_capture after insert or delete or update on web.page_content
  for each row execute function platform._version_capture('web_page_content');

-- Entity token + composition parent, then canonical RLS (component variant:
-- access derives from web_site via site_id — same as web.page/web.snapshot).
insert into platform.entity_types
  (token, schema_name, table_name, label, is_component, rls_variant, table_ref, notes)
values
  ('web_page_content', 'web', 'page_content', 'Page Draft Content', true, 'component', 'web.page_content'::regclass,
   'Authored draft content for a canonical page (1:1 web.page). Separate table so draft saves never bump web.page.version.')
on conflict (token) do nothing;

insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note)
values ('web_page_content', 'web_site', 'site_id', 'composition', 'access derives from site')
on conflict do nothing;

select iam.apply_rls('web', 'page_content', 'web_page_content', 'component');

notify pgrst, 'reload schema';
