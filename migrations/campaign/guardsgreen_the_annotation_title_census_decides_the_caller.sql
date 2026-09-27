-- chair-step: lane GUARDS-GREEN, from VERIFIER-27 item 3 (check:trash-doors). platform.trash_annotation_title_census() is executable by `authenticated` and counted every person's trashed comments and passage links without deciding who was asking. It now decides the caller in its own body, like every Trash door: a signed-in person (auth.uid() set) is counted only over the comments and passage links they made; the server lane (no person: service_role, the release check `pnpm check:annotation-trash`) keeps the whole census. Same signature, same columns, counts only; no grant changes, no new permission logic.
-- based-on: platform.trash_annotation_title_census() 9cf25e5b69c769160e59e251f4789a59f5dffa435ae30693f62d3b11ffa60f14
-- lane: GUARDS-GREEN
-- INVERSE: migrations/inverse/guardsgreen_the_annotation_title_census_decides_the_caller_down.sql

create or replace function platform.trash_annotation_title_census()
 returns table(kind text, trashed bigint, empty_titles bigint)
 language sql
 stable
 set search_path to 'platform', 'public'
as $function$
  -- WHOSE ROWS (lane GUARDS-GREEN, 2026-09-27): a person is counted over what they made; the
  -- server lane (no auth.uid(): the release check) over everything. Personal Trash is yours.
  select 'comment'::text, count(*),
         count(*) filter (where coalesce(btrim(platform.comment_trash_title(c)), '') = '')
    from platform.comments c
   where c.deleted_at is not null
     and (auth.uid() is null or c.created_by = auth.uid())
  union all
  select 'passage_link'::text, count(*),
         count(*) filter (where coalesce(btrim(platform.passage_link_trash_title(a)), '') = '')
    from platform.associations a
   where a.role = 'anchored_to' and a.deleted_at is not null and a.deleted_via_type is null
     and (auth.uid() is null or a.created_by = auth.uid());
$function$;
