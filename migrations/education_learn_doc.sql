-- education.learn_doc — the DB-backed publishing engine for /education/learn
-- (P6 Phase A). Replaces the hardcoded LEARN_DOCS TS registry. Structured
-- study guides authored/edited/published without a deploy. Sections are the
-- canonical EduSection[] vocabulary (features/education/types.ts) serialized to
-- JSONB — ONE content schema, ever.
--
-- Access model (canonical): visibility drives publication.
--   private  = draft  (owner + super-admin only)
--   public   = published (anon read via pub_read; search-indexable)
-- All writes flow through super-admin-gated SECURITY DEFINER RPCs so any
-- super-admin can author/edit any doc regardless of created_by (protected-style).
--
-- Idempotent: safe to re-apply.

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists education.learn_doc (
  -- base entity skeleton (schema-homed table: columns hand-rolled)
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null default '39c38960-d30c-4840-b0c1-c9960de95582', -- Matrx System
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  deleted_at       timestamptz,
  version          int not null default 1,
  metadata         jsonb not null default '{}'::jsonb,
  visibility       platform.visibility not null default 'private',
  -- publishing payload
  slug             text not null,
  title            text not null,
  summary          text not null,
  subject          text,
  letter           text not null default 'Lr',
  keywords         text[] not null default '{}',
  sections         jsonb not null default '[]'::jsonb,   -- EduSection[]
  related          jsonb not null default '{}'::jsonb,   -- { tools?, subjects?, exams? }
  content_updated_at date,                                -- author-controlled "Updated" display date
  published_at     timestamptz
);

create unique index if not exists learn_doc_slug_key
  on education.learn_doc (slug) where deleted_at is null;
create index if not exists learn_doc_visibility_idx
  on education.learn_doc (visibility) where deleted_at is null;
create index if not exists learn_doc_subject_idx
  on education.learn_doc (subject) where deleted_at is null;

-- canonical triggers (touch + actor stamp)
drop trigger if exists _touch_row on education.learn_doc;
create trigger _touch_row before insert or update on education.learn_doc
  for each row execute function platform._touch_row();
drop trigger if exists _stamp_actor on education.learn_doc;
create trigger _stamp_actor before insert or update on education.learn_doc
  for each row execute function platform._stamp_actor();

-- ── Registration ────────────────────────────────────────────────────────────
insert into platform.entity_types
  (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_listed)
select 'learn_doc','education','learn_doc','Study Guide','private',false,true,true
where not exists (select 1 from platform.entity_types where token='learn_doc');

insert into platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
   display_label, url_path_template, rls_uses_has_permission, is_active)
select 'learn_doc','education','learn_doc','id','created_by','visibility',
       'Study Guide','/education/learn/{slug}',true,true
where not exists (select 1 from platform.shareable_resource_registry where resource_type='learn_doc');

-- ── Grants (RLS gates rows; table GRANTs still required per role) ────────────
grant select on education.learn_doc to anon;                         -- reads gated to visibility='public' by pub_read
grant select, insert, update, delete on education.learn_doc to authenticated;
grant all on education.learn_doc to service_role;

-- ── RLS (canonical) ─────────────────────────────────────────────────────────
select iam.apply_rls('education','learn_doc','learn_doc','entity');

-- ── Authoring RPCs (super-admin only; SECURITY DEFINER bypasses RLS) ─────────
-- Upsert a draft (create when p_id is null, else update). Never publishes.
-- Required params lead; p_id is optional (default null) so a create can omit it.
create or replace function public.edu_learn_doc_upsert(
  p_slug              text,
  p_title             text,
  p_summary           text,
  p_sections          jsonb,
  p_id                uuid default null,
  p_subject           text default null,
  p_letter            text default 'Lr',
  p_keywords          text[] default '{}',
  p_related           jsonb default '{}'::jsonb,
  p_content_updated_at date default null
) returns education.learn_doc
language plpgsql security definer set search_path = public, education, platform
as $$
declare
  v_row education.learn_doc;
  v_slug text := lower(btrim(p_slug));
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_slug = '' then
    raise exception 'slug is required';
  end if;

  if p_id is null then
    insert into education.learn_doc
      (slug, title, summary, sections, subject, letter, keywords, related, content_updated_at)
    values
      (v_slug, p_title, p_summary, coalesce(p_sections,'[]'::jsonb), p_subject,
       coalesce(p_letter,'Lr'), coalesce(p_keywords,'{}'), coalesce(p_related,'{}'::jsonb),
       coalesce(p_content_updated_at, current_date))
    returning * into v_row;
  else
    update education.learn_doc set
      slug = v_slug,
      title = p_title,
      summary = p_summary,
      sections = coalesce(p_sections,'[]'::jsonb),
      subject = p_subject,
      letter = coalesce(p_letter,'Lr'),
      keywords = coalesce(p_keywords,'{}'),
      related = coalesce(p_related,'{}'::jsonb),
      content_updated_at = coalesce(p_content_updated_at, content_updated_at, current_date)
    where id = p_id and deleted_at is null
    returning * into v_row;
    if v_row.id is null then
      raise exception 'learn_doc % not found', p_id;
    end if;
  end if;
  return v_row;
end;
$$;

-- Publish / unpublish (flip visibility; stamp published_at on first publish).
create or replace function public.edu_learn_doc_set_status(
  p_id uuid,
  p_publish boolean
) returns education.learn_doc
language plpgsql security definer set search_path = public, education, platform
as $$
declare
  v_row education.learn_doc;
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update education.learn_doc set
    visibility = case when p_publish then 'public'::platform.visibility else 'private'::platform.visibility end,
    published_at = case when p_publish then coalesce(published_at, now()) else published_at end
  where id = p_id and deleted_at is null
  returning * into v_row;
  if v_row.id is null then
    raise exception 'learn_doc % not found', p_id;
  end if;
  return v_row;
end;
$$;

-- Soft-delete.
create or replace function public.edu_learn_doc_delete(p_id uuid)
returns void
language plpgsql security definer set search_path = public, education, platform
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update education.learn_doc set deleted_at = now(), visibility = 'private'
  where id = p_id and deleted_at is null;
end;
$$;

-- Admin list — every doc incl. drafts (RLS would hide other admins' drafts).
create or replace function public.edu_learn_doc_admin_list()
returns setof education.learn_doc
language plpgsql security definer set search_path = public, education, platform
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select * from education.learn_doc where deleted_at is null
    order by updated_at desc;
end;
$$;

revoke all on function public.edu_learn_doc_upsert(text,text,text,jsonb,uuid,text,text,text[],jsonb,date) from anon;
revoke all on function public.edu_learn_doc_set_status(uuid,boolean) from anon;
revoke all on function public.edu_learn_doc_delete(uuid) from anon;
revoke all on function public.edu_learn_doc_admin_list() from anon;
grant execute on function public.edu_learn_doc_upsert(text,text,text,jsonb,uuid,text,text,text[],jsonb,date) to authenticated;
grant execute on function public.edu_learn_doc_set_status(uuid,boolean) to authenticated;
grant execute on function public.edu_learn_doc_delete(uuid) to authenticated;
grant execute on function public.edu_learn_doc_admin_list() to authenticated;
