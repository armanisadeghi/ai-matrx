-- target: clone
--
-- LEVEL THE CLONE WITH PRODUCTION'S ANNOTATION TITLE CENSUS (lane GUARDS-GREEN, 2026-09-27).
-- The clone (clone-20260926, 12:19Z) predates annotation_trash_titles_and_passage_links.sql, so
-- platform.comment_trash_title, platform.passage_link_trash_title and
-- platform.trash_annotation_title_census do not exist there and rule 27 for
-- migrations/campaign/guardsgreen_the_annotation_title_census_decides_the_caller.sql cannot run.
-- These are production's bodies as pg_get_functiondef printed them at 2026-09-27; the clone's next
-- nightly refresh overwrites them. NEVER for production (refused by location).

CREATE OR REPLACE FUNCTION platform.comment_trash_title(c platform.comments)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'platform', 'public'
AS $function$
  select case when c.parent_id is not null then 'Reply: ' else '' end || coalesce(
    case
      when c.suggested_text is not null then
        coalesce('Suggested: ' || nullif(btrim(c.suggested_text), ''),
                 'Suggested removal of “' || nullif(btrim(c.anchor ->> 'exact'), '') || '”')
      else
        coalesce(nullif(btrim(c.body), ''),
                 '“' || nullif(btrim(c.anchor ->> 'exact'), '') || '”')
    end,
    'Comment on ' || coalesce(nullif(btrim(platform.entity_title(c.entity_type, c.entity_id)), ''), 'a record')
  );
$function$;

CREATE OR REPLACE FUNCTION platform.passage_link_trash_title(a platform.associations)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'platform', 'public'
AS $function$
  select coalesce(nullif(btrim(platform.entity_title(a.source_type, a.source_id)), ''), 'A linked record')
         || coalesce(' — “' || nullif(btrim(left(a.payload ->> 'exact', 120)), '') || '”', '');
$function$;

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
