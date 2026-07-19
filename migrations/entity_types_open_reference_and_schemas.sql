-- entity_types_open_reference_and_schemas.sql
--
-- 1. `platform.schemas` — pretty display names for DB schemas. The reference
--    "Allowed types" chooser buckets entity types by schema (tier 1), so the
--    schema name needs a human label. Admin-writable via admin_upsert_schema.
-- 2. Opens up reference_pickable: every active entity type with a detectable
--    human title column becomes pickable (the platform does not predetermine
--    what users may associate). Types with NO detectable title column stay
--    unpickable only because a generic picker cannot list candidates for
--    them — an admin can set title_column at any time to enable one.

create table if not exists platform.schemas (
  schema_name text primary key,
  display_name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true
);

comment on table platform.schemas is
  'Pretty display names for DB schemas — tier-1 buckets in reference type choosers and admin surfaces.';

insert into platform.schemas (schema_name, display_name, sort_order, is_active) values
  ('public','General',10,true),
  ('agent','Agents',20,true),
  ('app','Apps',25,true),
  ('skill','Skills',30,true),
  ('workflow','Workflows',35,true),
  ('chat','Chat',40,true),
  ('files','Files',45,true),
  ('code','Code',50,true),
  ('workbench','Workbench',55,true),
  ('workspace','Workspace',60,true),
  ('transcripts','Transcripts',65,true),
  ('podcast','Podcasts',70,true),
  ('education','Education',75,true),
  ('research','Research',80,true),
  ('rag','Knowledge',85,true),
  ('web','Marketing & Web',90,true),
  ('scraper','Web Scraper',95,true),
  ('docproc','Document Processing',100,true),
  ('pdf','PDF',105,true),
  ('canvas','Canvas',110,true),
  ('content_ir','Structured Content',115,true),
  ('context','Context',120,true),
  ('communication','Communication',125,true),
  ('legal','Legal',130,true),
  ('scheduler','Scheduling',135,true),
  ('ai','AI Models',140,true),
  ('tool','Tools',145,true),
  ('extend','Browser Extension',150,true),
  ('users','Users',155,true),
  ('user','User Data',160,true),
  ('iam','Access & Identity',165,true),
  ('platform','Platform',170,true),
  ('reg','Registry',175,true),
  ('runtime','Runtime',180,true),
  ('ui','UI',185,true),
  ('admin','Admin',190,true),
  ('graveyard','Graveyard',900,false)
on conflict (schema_name) do nothing;

-- Keep the registry self-healing: any schema referenced by entity_types but
-- missing above gets a humanized default row.
insert into platform.schemas (schema_name, display_name)
select distinct e.schema_name, initcap(replace(e.schema_name,'_',' '))
from platform.entity_types e
where not exists (select 1 from platform.schemas s where s.schema_name = e.schema_name);

-- ── Open the gate: auto-detect a title column for every active type ─────────
with cand(col, pri) as (values
  ('title',1),('name',2),('label',3),('display_name',4),('file_name',5),
  ('folder_name',6),('document_name',7),('subject',8),('key',9),('slug',10)
),
detected as (
  select e2.token,
         (select c.column_name
            from information_schema.columns c
            join cand on cand.col = c.column_name
           where c.table_schema = e2.schema_name and c.table_name = e2.table_name
           order by cand.pri limit 1) as col
    from platform.entity_types e2
   where e2.is_active
     and not e2.reference_pickable
     and e2.schema_name <> 'graveyard'
)
update platform.entity_types e set
  reference_pickable = true,
  title_column = d.col
from detected d
where d.token = e.token and d.col is not null;

-- ── entity_schemas_list — read path for the generator + clients ─────────────
-- `scope` stays a SYNTHETIC picker type (org scope tree, allowed_scope_type_ids
-- filter) — the generic table-read picker must not shadow it.
update platform.entity_types set reference_pickable = false, title_column = null
where token = 'scope';

create or replace function public.entity_schemas_list()
returns table(schema_name text, display_name text, sort_order integer, is_active boolean)
language sql stable security definer set search_path = ''
as $$
  select s.schema_name, s.display_name, s.sort_order, s.is_active
    from platform.schemas s
   order by s.sort_order, s.schema_name;
$$;
grant execute on function public.entity_schemas_list() to anon, authenticated;

-- ── admin_upsert_schema — super-admin write path ────────────────────────────
create or replace function public.admin_upsert_schema(
  p_schema_name text, p_display_name text,
  p_sort_order integer default 100, p_is_active boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  insert into platform.schemas (schema_name, display_name, sort_order, is_active)
  values (p_schema_name, p_display_name, p_sort_order, p_is_active)
  on conflict (schema_name) do update set
    display_name = excluded.display_name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;
end $$;
grant execute on function public.admin_upsert_schema(text, text, integer, boolean) to authenticated;
