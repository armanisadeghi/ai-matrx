-- RC-B11 — A PRIVATE HIGHLIGHT OR NOTE IS ONE WRITE.
-- Register: common-docs/projects/rich-content-unification/REGISTER.md row RC-B11.
--
-- THE DEFECT (verify-RC-B11 F4, 2026-09-25): the client created the annotation content.document
-- and THEN asked for its `annotates` edge. When the edge was refused, the annotation stayed
-- live, personal and invisible — a stranded record the person could not see or remove
-- (d33cc6d1…, 0738c3c0… on production, archived by the verifier).
--
-- THE CLASS FIX: one function, one transaction. content.annotation_create inserts the
-- annotation document AND its `annotates` edge (through public.assoc_add, the one association
-- door, with every check it makes); if either refuses, neither exists. The caller mints the id
-- (p_id), so a Retry after a lost response finds the first write and returns it — never a second
-- document, never a second edge (assoc_add is an upsert on source/target/role).
--
-- SECURITY INVOKER on purpose: the document insert runs under the caller's own RLS and
-- content.document triggers (type guard, derived fields, data-class floor), exactly as a direct
-- client insert would. The organization is the caller's, named explicitly (chair ruling
-- 2026-09-25: a person's annotation is filed under that person's own access).
-- The passage payload is still gated client-side (ANCHOR_WRITES_ENABLED) until RC-A5; this door
-- accepts p_anchor because assoc_add already does and validates it.

create or replace function content.annotation_create(
  p_id uuid,
  p_organization_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_body text default '',
  p_color text default 'yellow',
  p_anchor jsonb default null,
  p_title text default null)
returns table (document_id uuid, edge_id uuid, created boolean)
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $fn$
declare
  v_type uuid;
  v_existing record;
  v_created boolean := false;
  v_edge uuid;
begin
  if p_id is null or p_organization_id is null or p_source_type is null or p_source_id is null then
    raise exception 'content.annotation_create: id, organization and source are required'
      using errcode = '22004';
  end if;
  if p_color is not null and p_color not in ('yellow', 'green', 'blue', 'pink', 'purple') then
    raise exception 'content.annotation_create: unknown highlight colour %', p_color using errcode = '22023';
  end if;

  select d.id, d.created_by, d.deleted_at into v_existing from content.document d where d.id = p_id;
  if v_existing.id is not null then
    if v_existing.created_by is distinct from auth.uid() or v_existing.deleted_at is not null then
      raise exception 'content.annotation_create: that annotation id is already used'
        using errcode = '23505';
    end if;
  else
    select c.id into v_type from platform.categories c
     where c.dimension = 'document_type' and c.slug = 'annotation' and c.deleted_at is null
     order by c.created_at limit 1;
    if v_type is null then
      raise exception 'content.annotation_create: the annotation document type is not registered'
        using errcode = '42704';
    end if;
    insert into content.document (id, organization_id, document_type_id, title, body, visibility)
    values (p_id, p_organization_id, v_type,
            left(coalesce(nullif(btrim(p_title), ''),
                          case when p_anchor is not null then 'Highlight: ' || coalesce(p_anchor ->> 'exact', '')
                               else 'Private note' end), 200),
            coalesce(p_body, ''), 'personal');
    v_created := true;
  end if;

  v_edge := public.assoc_add(
    'document', p_id, p_source_type, p_source_id, p_organization_id, null,
    jsonb_build_object('color', coalesce(p_color, 'yellow')), 'annotates', null,
    case when p_anchor is null then null else 'text_anchor' end, p_anchor);

  return query select p_id, v_edge, v_created;
end
$fn$;

comment on function content.annotation_create(uuid, uuid, text, uuid, text, text, jsonb, text) is
  'RC-B11: a private highlight / note as ONE transaction — the personal annotation content.document and its annotates edge (via public.assoc_add) both exist or neither does. Idempotent on the caller-minted p_id. Security invoker: runs under the caller''s RLS and the document triggers.';
-- New functions are closed to anon by platform.close_new_functions_to_anon; signed-in callers only.
grant execute on function content.annotation_create(uuid, uuid, text, uuid, text, text, jsonb, text) to authenticated;
