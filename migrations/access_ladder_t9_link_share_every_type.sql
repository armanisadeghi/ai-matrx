-- Access ladder T-9a (2026-09-26): "Sharing sits outside the ladder" (common-docs/policies/access-ladder.md).
-- Any record at any level can be shared by its owner by public link. Until this file only 44 of
-- ~290 active registered types answered is_link_shareable = true, so public.create_share_link
-- refused podcast episodes/shows, job postings, skills, deals, study plans and ~240 more.
--
-- WHAT THE FLAG MEANS NOW. `is_link_shareable` is kept, not retired, because it is the only thing
-- standing between an owner and a dead page: public.resolve_share_token serves ONLY the columns in
-- `public_columns`, and 241 of the refused types had none — a link to them would render the
-- generic viewer's bare "Shared item" card. So the rule this file applies is:
--   a type is link-shareable exactly when the generic share viewer (/s/[token] -> GenericRenderer,
--   features/sharing/lenses) has something of the record to show — a title-like or body-like column.
-- The class and the level never enter into it (T-4 already made iam.class_allows(...,'share_link')
-- true for every class). Types with nothing to show stay off and are listed in the T-9 report as
-- needing a viewer; they get no control rather than a dead one.
--
-- WHAT IS SERVED. `public_columns` is derived from a fixed allow-list of display column NAMES —
-- title/name/label/subject/headline/…, description/summary/content/body/text, topic/category/tags/
-- status, created_at/updated_at — never a secret, token, key, email, phone or payload column,
-- because only those names can ever enter the list. A type that already has an allow-list keeps it.
--
-- NOT TOUCHED: data_store (published through LibraryPublishPanel, not share links —
-- features/sharing/FEATURE.md), platform_share_link (a link to a link), organization (T-3),
-- cx_user_request / agent_run (T-10).

do $$
declare
  v_title constant text[] := array['title','name','label','display_name','subject','headline',
    'list_name','document_name','workbook_name','file_name','folder_name','query','url','topic'];
  v_body  constant text[] := array['description','summary','tagline','content','body','text','markdown'];
  v_order constant text[] := array['title','name','label','display_name','subject','headline',
    'list_name','document_name','workbook_name','file_name','folder_name','query','url','slug',
    'description','summary','tagline','content','body','text','markdown',
    'topic','category','tags','status','created_at','updated_at'];
  v_skip  constant text[] := array['data_store','platform_share_link','organization',
    'cx_user_request','agent_run'];
  r record;
  v_cols text[];
  v_on integer := 0;
  v_filled integer := 0;
begin
  for r in
    select s.resource_type, s.schema_name, s.table_name, s.id_column, s.public_columns, s.is_link_shareable
      from platform.shareable_resource_registry s
     where s.is_active
       and not (s.resource_type = any (v_skip))
       and (not s.is_link_shareable or coalesce(cardinality(s.public_columns), 0) = 0)
  loop
    if coalesce(cardinality(r.public_columns), 0) > 0 then
      v_cols := r.public_columns;
    else
      select array_agg(c.column_name::text order by array_position(v_order, c.column_name::text))
        into v_cols
        from information_schema.columns c
       where c.table_schema = r.schema_name and c.table_name = r.table_name
         and c.column_name::text = any (v_order);
    end if;

    -- Something to show: at least one title-like or body-like column among what will be served.
    if v_cols is null or not (v_cols && (v_title || v_body)) then
      continue;
    end if;

    if not (r.id_column = any (v_cols)) then
      v_cols := array_prepend(r.id_column, v_cols);
    end if;

    update platform.shareable_resource_registry
       set public_columns = v_cols,
           is_link_shareable = true
     where resource_type = r.resource_type;
    v_on := v_on + 1;
    if coalesce(cardinality(r.public_columns), 0) = 0 then v_filled := v_filled + 1; end if;
  end loop;
  raise notice 'T-9a: % types made link-shareable or given something to show (% had no public_columns)', v_on, v_filled;
end $$;
