-- RC-A1 step 0 (common-docs/projects/rich-content-unification/STORE-DESIGN.md §5.0):
-- the schema `content` that holds the ONE canonical rich-content store.
--
-- What this file does, and nothing else:
--   1. creates schema `content` (empty) and grants USAGE to authenticated + service_role
--      (anon gets nothing until the public-read door `content.read_published` exists — §3.11);
--   2. declares the schema's client exposure (platform.schema_client_exposure) as OPEN —
--      clients read and write content.document directly through supabase-js + RLS;
--   3. publishes the repo's generate targets for `content` into
--      platform.provision_generate_target, which is exactly what
--      `uv run python scripts/check_provision_generate_targets.py --fix` writes once the two
--      repo lists name `content` (aidream db/matrx_orm.yaml additional_schemas + matrx-frontend
--      package.json db-types --schema) — both lists gain `content` in the same commit as this
--      file, so the guard stays green;
--   4. APPENDS `content` to PostgREST's exposed schemas (pgrst.db_schemas on authenticator) —
--      never retypes the list — and reloads PostgREST's config and schema cache;
--   5. seeds the `document_type` categories (STORE-DESIGN §3.4) in the system organization and
--      creates the two helpers rcstore_b's build names (content.document_search_vector for the
--      FTS index, content._capture_bypassed for the migration bypass) — here, so that the
--      provision in rcstore_b is the first real work of a young transaction.
--
-- Row-level writes only on shared tables (platform.categories, the two registries). Idempotent.

create schema if not exists content;
comment on schema content is
  'The ONE canonical store for authored rich content (STORE-DESIGN.md, rich-content-unification): content.document + its certified custom version store content.document_version, plus per-type Details. Opt-in: a feature opts in to get storage, versions, sharing, search, realtime and sync.';

grant usage on schema content to authenticated, service_role;

insert into platform.schema_client_exposure (schema_name, client_exposed, reason, declared_by)
values ('content', true,
        'Clients read and write content.document directly through supabase-js under RLS (iam.apply_rls entity lane); the write doors (univer_save, version_publish, version_restore) are signed-in RPCs.',
        'rcstore_a_content_schema')
on conflict (schema_name) do update
   set client_exposed = excluded.client_exposed,
       reason         = excluded.reason,
       declared_by    = excluded.declared_by;

insert into platform.provision_generate_target (schema_name, orm_target, types_target, published_by, published_at)
values ('content', true, true, 'rcstore_a_content_schema (repo lists name content: aidream db/matrx_orm.yaml + matrx-frontend package.json db-types)', now())
on conflict (schema_name) do update
   set orm_target   = true,
       types_target = true,
       published_by = excluded.published_by,
       published_at = excluded.published_at;

-- APPEND, never retype: a wrong value is a total API outage (PGRST002 / 503).
do $$
declare v_cur text; v_val text;
begin
  select cfg into v_cur
    from (select unnest(rolconfig) cfg from pg_roles where rolname = 'authenticator') s
   where cfg like 'pgrst.db_schemas=%';
  if v_cur is null then
    raise exception 'pgrst.db_schemas is unset on authenticator - refusing to invent one';
  end if;
  v_val := split_part(v_cur, '=', 2);
  if v_val ~ '(^|,\s*)content(\s*,|$)' then
    return;
  end if;
  execute format('alter role authenticator set pgrst.db_schemas = %L', v_val || ', content');
end $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- ============================================================================================
-- document_type categories (system org). The hierarchy only groups types in pickers
--    (§3.4); a `group` row is not itself a type a document may carry.
-- ============================================================================================
insert into platform.categories (organization_id, dimension, name, slug, parent_id, is_system, position, metadata)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'document_type', g.name, g.slug, null, true, g.pos,
       jsonb_build_object('group', g.is_group, 'wave', g.wave)
  from (values
    ('Note',                 'note',                10, false, 'W1'),
    ('Annotation',           'annotation',          20, false, 'W2'),
    ('Working document',     'working_document',    30, false, 'W2'),
    ('Scratch',              'scratch',             31, false, 'W2'),
    ('Transcript document',  'transcript_document', 40, false, 'W1'),
    ('Interview document',   'interview_document',  50, false, 'W2'),
    ('Article',              'article',             60, true,  'W1'),
    ('Template',             'template',            70, true,  'W1'),
    ('Skill',                'skill',               80, false, 'W1'),
    ('Research synthesis',   'research_synthesis',  90, false, 'W1'),
    ('Rendered document',    'rendered_document',  100, false, 'W1'),
    ('Repository doc',       'repo_doc',           110, false, 'W1'),
    ('Univer document',      'univer',             120, false, 'W2'),
    ('Sample',               'sample',             130, false, 'W2')
  ) as g(name, slug, pos, is_group, wave)
 where not exists (select 1 from platform.categories c
                    where c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                      and c.dimension = 'document_type' and c.slug = g.slug and c.deleted_at is null);

insert into platform.categories (organization_id, dimension, name, slug, parent_id, is_system, position, metadata)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'document_type', t.name, t.slug, p.id, true, t.pos,
       jsonb_build_object('group', false, 'wave', t.wave)
  from (values
    ('Study guide',       'study_guide',       'note',     11, 'W1'),
    ('Blog post',         'blog',              'article',  61, 'W1'),
    ('Show notes',        'show_notes',        'article',  62, 'W1'),
    ('Learn article',     'learn_article',     'article',  63, 'W1'),
    ('Web page',          'web_page',          'article',  64, 'W1'),
    ('Podcast script',    'podcast_script',    'article',  65, 'W1'),
    ('Message template',  'message_template',  'template', 71, 'W1'),
    ('Content block',     'content_block',     'template', 72, 'W1'),
    ('Document template', 'document_template', 'template', 73, 'W1')
  ) as t(name, slug, parent_slug, pos, wave)
  join platform.categories p
    on p.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and p.dimension = 'document_type' and p.slug = t.parent_slug and p.deleted_at is null
 where not exists (select 1 from platform.categories c
                    where c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                      and c.dimension = 'document_type' and c.slug = t.slug and c.deleted_at is null);

-- ============================================================================================
-- Helpers rcstore_b's build names (the FTS index names the vector function).
-- ============================================================================================
create or replace function content.document_search_vector(p_title text, p_summary text, p_body text)
returns tsvector
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $fn$
  select setweight(to_tsvector('english'::regconfig, coalesce(p_title, '')), 'A')
      || setweight(to_tsvector('english'::regconfig, coalesce(p_summary, '')), 'B')
      || setweight(to_tsvector('english'::regconfig, left(coalesce(p_body, ''), 200000)), 'C')
$fn$;
comment on function content.document_search_vector(text, text, text) is
  'STORE-DESIGN §3.3: the search vector of a document — title (A), summary (B), the first 200,000 characters of body (C). Never stored; the GIN expression index document_fts is built over it.';

-- The migration bypass (§3.3): honoured ONLY when the session itself is the migration role.
-- PostgREST connects as `authenticator`, so no client can reach it by setting the GUC.
create or replace function content._capture_bypassed()
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select coalesce(current_setting('content.capture_bypass', true), '') = 'on'
     and session_user = 'postgres'
$fn$;

