-- Harden education.learn_doc (security follow-up to education_learn_doc.sql).
--
-- learn_doc is a PROTECTED, super-admin-authored surface. The generic
-- `iam.apply_rls(...,'entity')` profile installed OWNER-based write policies for
-- the `authenticated` role — which let ANY logged-in user directly
-- `.insert({visibility:'public'})` and bypass the super-admin RPC gate (the
-- published row is then anon-visible on /education/learn, the sitemap, and OG).
-- Remove the user write path entirely: reads only for anon/authenticated; all
-- writes go through the SECURITY DEFINER RPCs (owned by a superuser → bypass
-- RLS) or service_role. Also validate slugs + reserve the `admin` segment.
--
-- Idempotent: safe to re-apply. Runs AFTER education_learn_doc.sql.

drop policy if exists std_insert on education.learn_doc;
drop policy if exists std_update on education.learn_doc;
drop policy if exists std_delete on education.learn_doc;
revoke insert, update, delete on education.learn_doc from authenticated;
-- keep: pub_read (anon, published), std_select (authenticated read), svc_all (service_role)

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
  if v_slug !~ '^[a-z0-9]+(?:[/-][a-z0-9]+)*$' then
    raise exception 'invalid slug %: use lowercase letters, numbers, hyphens, and / only', v_slug;
  end if;
  if v_slug = 'admin' or v_slug like 'admin/%' then
    raise exception 'slug "admin" is reserved';
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
