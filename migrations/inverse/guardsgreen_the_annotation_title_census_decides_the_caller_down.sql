-- chair-step: lane GUARDS-GREEN inverse — puts back the census body that did not decide the caller (annotation_trash_titles_and_passage_links).
-- based-on: platform.trash_annotation_title_census() 39c540d6a1a6d37e95a844df7ea6ecd8664180d6fcdfa299ded0843c97709a9d
-- INVERSE of migrations/campaign/guardsgreen_the_annotation_title_census_decides_the_caller.sql (lane GUARDS-GREEN).

create or replace function platform.trash_annotation_title_census()
 returns table(kind text, trashed bigint, empty_titles bigint)
 language sql
 stable
 set search_path to 'platform', 'public'
as $function$
  select 'comment'::text, count(*),
         count(*) filter (where coalesce(btrim(platform.comment_trash_title(c)), '') = '')
    from platform.comments c where c.deleted_at is not null
  union all
  select 'passage_link'::text, count(*),
         count(*) filter (where coalesce(btrim(platform.passage_link_trash_title(a)), '') = '')
    from platform.associations a
   where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null;
$function$;
