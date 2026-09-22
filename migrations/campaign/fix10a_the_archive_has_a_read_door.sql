-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- FIX-10A-ARCHIVE — AN ARCHIVED RECORD HAS NO WAY BACK FROM ANY SCREEN (VERIFIER-10 F4).
--
-- What the independent verifier measured on 2026-09-22, walking the real product as
-- admin@admin.com on Rincon Plumbing Co's "Truck 1 dispatch backlog":
--
--   "The grid's row action is Delete, and it confirms inline — good. Pressing it soft-deletes
--    correctly: deleted_at = 2026-09-22 01:53:36+00, version 1 -> 2, nothing removed, and the
--    row leaves the grid. Then it is gone for good as far as any screen is concerned. The
--    store's own custom.record_restore exists and does exactly the right thing. The door is
--    there; nothing reaches it."
--
-- The reason nothing reaches it is HERE, not in the UI. Every read door this store has
-- answers LIVE ROWS ONLY, and each of them says so in its own body:
--
--   custom.read_records            `and r.deleted_at is null`   — in all four visibility arms
--   custom.read_records_by_ids     `and r.deleted_at is null`
--   custom.read_records_matching   `and r.deleted_at is null`
--
-- So a screen COULD NOT have listed archived records however it was written. This file is the
-- missing half: the read door for the rows that left, as a general platform primitive over the
-- whole store rather than anything table-shaped, so every Table inherits it at once.
--
-- WHY A NEW NAME AND NOT A FLAG ON THE LIVE DOOR — the ruling DRILL and REALTIME-2 already
-- paid for twice. A defaulted `p_archived boolean` beside the live five-argument
-- `custom.read_records` makes every existing call ambiguous ("function ... is not unique"),
-- and the only way to add an argument in place is to DROP a live door. Never overload a live
-- door; a new name cannot collide. `custom.read_records_by_ids` and
-- `custom.read_records_matching` were named for exactly this reason, and this is their third
-- sibling: the page door, addressed by ABSENCE instead of by a page, an id set or a question.
--
-- WHAT IS NOT WEAKENED, AND IT IS THE WHOLE POINT. Every access decision below is the SAME
-- call `custom.read_records_matching` makes, in the same order:
--   · custom.assert_may_know_table   — may this seat know this Table exists at all
--   · custom.effective_level         — her level ON THE TABLE, asked once for the whole page
--   · iam.visible_field_ids          — which columns she may see, asked once
--   · custom.visible_predicate_sql   — THE ONE LADDER, as a predicate inside this door's own
--                                      WHERE (DOOR-10: filtered in the query, never after it)
--   · custom.mask_document / custom.choice_render — the hidden-field notices and stored words
--   · custom.page_size               — the one page contract, refusing above the ceiling by name
-- The ONLY difference from `custom.read_records_matching` is the sign of one comparison:
-- `r.deleted_at is not null` instead of `is null`. An archived record is exactly as visible,
-- and exactly as masked, as it was the moment before it was archived.
--
-- THE TWO LANES (THE ARCHIVED-ITEMS LAW, Arman 2026-09-09; the four visibility lanes).
-- `p_lane` is 'mine' (what I archived) or 'org' (what anybody in this organization archived).
-- It is a lane over the SAME entitled set — 'mine' can only ever be a subset of 'org' — and
-- an unknown word is refused by name rather than quietly answered as one of them.
--
-- WHO ARCHIVED IT, AND WHEN. `custom.record` has no `deleted_by` column, and adding one would
-- be a lie about every row archived before today. The truth is already written: the archive is
-- a SOFT_DELETE version in `history.row_versions`, with its actor and its moment, captured by
-- the same statement trigger that captures every other write. `custom.record_archiver` reads
-- it, and falls back to `updated_by` — which IS the archiver, because the archive is by
-- construction the last write a record takes — for a row whose history partition has rolled
-- away. The NAME is resolved exactly as `custom.history_people` resolves it: through
-- `iam.organization_member`, so a person who is not a member of this organization is a name
-- this screen never learns.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. WHO PUT IT IN THE ARCHIVE. Not client-callable: it exists to be read from
--    inside the door below, which has already decided the caller may be here.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.record_archiver(p_organization_id uuid, p_record_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select coalesce(
           (select h.actor_id
              from history.row_versions h
             where h.entity_type = 'custom.record'
               and h.organization_id = p_organization_id
               and h.row_id = p_record_id
               and h.operation = 'SOFT_DELETE'
             order by h.version desc, h.occurred_at desc
             limit 1),
           (select r.updated_by
              from custom.record r
             where r.organization_id = p_organization_id
               and r.id = p_record_id));
$function$;

comment on function custom.record_archiver(uuid, uuid) is
  'WHO ARCHIVED THIS RECORD. The SOFT_DELETE version''s actor in history.row_versions — the same capture custom.record_history reads to say "deleted" on the timeline — falling back to custom.record.updated_by, which is the archiver by construction because archiving is the last write a record takes. Null when neither is known, and a screen says so in a sentence rather than printing nobody. Internal to custom.read_records_archived; it makes no access decision of its own and is not client-callable.';

-- ITS ACCESS DECISION, DECLARED IN DATA. `provision_shape_guard` refused this file at
-- COMMIT the first time it ran (SQLSTATE 23514): a SECURITY DEFINER function runs as
-- `postgres` with BYPASSRLS, so SOMEBODY has to say, in data rather than in a comment,
-- who may call it. This one is not a door at all — it is read from inside
-- `custom.read_records_archived`, which has already decided the caller may be here —
-- so it is declared as a NON-CLIENT LANE, reachable by no browser at any level.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'record_archiver',
   'p_organization_id uuid, p_record_id uuid',
   ARRAY['uuid'::regtype, 'uuid'::regtype]::oid[],
   'Answers WHO archived one record and nothing else: the SOFT_DELETE version''s actor in history.row_versions, falling back to custom.record.updated_by. It makes NO access decision of its own and must not be reachable from a browser — p_organization_id and p_record_id are both taken on trust, because its only caller is custom.read_records_archived, which has already run custom.assert_may_know_table, custom.effective_level and custom.visible_predicate_sql for that exact organization and table before it asks. Null for either argument yields null, never a row from another organization.',
   'fix10a_the_archive_has_a_read_door.sql',
   'server_only: read from inside custom.read_records_archived, after that door has decided the caller may see the record it is naming the archiver of. No client lane calls it and none ever should — it takes its organization and record ids on trust, so a browser able to call it directly could learn who last touched any record id it could guess.',
   false, false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE DOOR.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.read_records_archived(
  p_organization_id uuid,
  p_table_id        uuid,
  p_lane            text    default 'org',
  p_by_id           boolean default false,
  p_limit           integer default 200,
  p_offset          integer default 0
)
returns table(
  id               uuid,
  document         jsonb,
  level            public.permission_level,
  archived_at      timestamptz,
  archived_by      uuid,
  archived_by_name text
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_limit    integer;
  v_lane     text := lower(coalesce(p_lane, 'org'));
  v_lane_sql text;
  v_sql      text;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  -- THE LANE IS VOCABULARY, NOT A FREE STRING. An unknown word is refused by name; answering
  -- it as 'org' would quietly show a person more than they asked for.
  if v_lane not in ('mine', 'org') then
    raise exception 'custom.read_records_archived: "%" is not a lane', p_lane
      using errcode = '22023',
            hint = 'Two lanes: "mine" (what I archived) and "org" (what anybody in this organization archived).';
  end if;

  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_archived');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_archived', p_limit, 200);

  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- THE LANE, AS A PREDICATE OVER THE SET THE LADDER ALREADY ALLOWED. `mine` narrows; it
  -- cannot widen, because it is an additional conjunct beside custom.visible_predicate_sql.
  v_lane_sql := case when v_lane = 'mine'
                     then format('a.who = %L::uuid', v_me)
                     else 'true' end;

  -- ONE STATEMENT. Visibility, the lane, the archive test and the page in the same WHERE.
  -- Nothing here is built from a caller's bytes: the only interpolated values are two uuids
  -- this function resolved itself, two integers, and predicates this database wrote.
  v_sql := format($q$
    select r.id,
           custom.record_values_of(r) as doc,
           r.deleted_at               as archived_at,
           a.who                      as archived_by,
           p.nm                       as archived_by_name
      from custom.record r
      cross join lateral (select custom.record_archiver(%1$L::uuid, r.id) as who) a
      left join lateral (
             select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                             nullif(u.raw_user_meta_data ->> 'full_name', ''),
                             split_part(u.email::text, '@', 1)) as nm
               from iam.organization_member m
               join auth.users u on u.id = m.user_id
              where m.organization_id = %1$L::uuid
                and m.user_id = a.who
              limit 1) p on true
     where r.organization_id = %1$L::uuid
       and r.table_id = %2$L::uuid
       and r.deleted_at is not null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %3$s
       and %4$s
     order by r.deleted_at desc
     limit %5$s offset %6$s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    v_lane_sql,
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    id               := v_rec.id;
    document         := custom.choice_render(p_organization_id, p_table_id,
                          custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    level            := v_level;
    archived_at      := v_rec.archived_at;
    archived_by      := v_rec.archived_by;
    archived_by_name := v_rec.archived_by_name;
    return next;
  end loop;
end;
$function$;

comment on function custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) is
  'DOOR-1 FOR THE ROWS THAT LEFT: a page of one Table''s ARCHIVED records (deleted_at is not null), with who archived each one and when. Decided by the SAME ladder, level, field masking, choice rendering and page ceiling as custom.read_records_matching — the only difference in the whole body is the sign of the deleted_at test — so an archived record is exactly as visible, and exactly as masked, as it was the moment before it was archived. p_lane is "mine" (what I archived) or "org" (what anybody in this organization archived): the two lanes THE ARCHIVED-ITEMS LAW names, as a narrowing conjunct beside Visibility that can never widen it. It exists because every other read door in this store hard-codes `deleted_at is null`, so no screen could list an archived record however it was written (VERIFIER-10 F4), and custom.record_restore therefore had nothing that could reach it. A new name rather than a flag on the live door, because a defaulted argument beside it makes every existing call ambiguous.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE DOOR DECLARATION, BEFORE THE GRANT. Without the row, this database's own
--    ddl_guard takes the client EXECUTE straight back off a SECURITY DEFINER
--    function and every call answers 42501.
-- ─────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('custom', 'read_records_archived',
   'p_organization_id uuid, p_table_id uuid, p_lane text, p_by_id boolean, p_limit integer, p_offset integer',
   'The same read door as custom.read_records_matching, addressed by ABSENCE: the rows of this Table whose deleted_at is set. It resolves the reader from the session (auth.uid()), asks custom.assert_may_know_table exactly as the live-row doors do, takes its level from custom.effective_level, its columns from iam.visible_field_ids and its rows from custom.visible_predicate_sql — the one ladder, written into this door''s own WHERE — so it can only ever answer with records the caller could already have paged to before they were archived. It answers no row any other door would have refused; it only stops hiding the ones that left.',
   'fix10a_the_archive_has_a_read_door.sql',
   false, true,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'fix10a_the_archive_has_a_read_door.sql',
     'declared_at', '2026-09-22 lane FIX-10A-ARCHIVE, per-door reading of the body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_may_know_table(arg1), custom.effective_level(arg2), custom.visible_predicate_sql(arg2) — the organization wall — a non-member is refused before anything is read. The archiver''s NAME is resolved through iam.organization_member scoped to this same argument, so a person outside this organization is never named.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-22 lane FIX-10A-ARCHIVE — read from this body: the ladder call, its argument position, and that it precedes every other use of the argument'),
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'this body decides it with custom.assert_may_know_table(arg2), custom.effective_level(arg3), custom.visible_predicate_sql(arg3) — the record ladder at the level this call names, decided before any row is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-22 lane FIX-10A-ARCHIVE — read from this body: the ladder call, its argument position, and that it precedes every other use of the argument'),
       'p_lane', jsonb_build_object(
         'type', 'text', 'position', 3,
         'check', 'VOCABULARY, NOT A FREE STRING, and never SQL. It is compared against the two words "mine" and "org" before anything is read and an unknown word is refused by name (22023); the only fragment it can produce is `a.who = <the caller''s own auth.uid()>`, built from a uuid this function resolved for itself, never from a caller byte. It NARROWS the set custom.visible_predicate_sql already allowed and has no arm that can widen it.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-22 lane FIX-10A-ARCHIVE — read from this body')))
  )
on conflict (schema_name, function_name, identity_argtypes) do update
  set argument_rules = excluded.argument_rules,
      reason         = excluded.reason;
