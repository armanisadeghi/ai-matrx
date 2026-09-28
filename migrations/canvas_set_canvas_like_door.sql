-- Liking a canvas failed for everyone (2026-09-28). The SECURITY-SWEEP of 2026-09-21
-- (migrations/campaign/secsweep_eleven_tables_no_client_writes.sql) closed client
-- INSERT/UPDATE/DELETE on canvas.canvas_likes with RESTRICTIVE refusals because
-- (a) the table carries a user_id the generated std_insert/std_update pin nothing about
-- (the CRITICAL-1 shape: a browser could write a like naming another person), and
-- (b) its census believed no client wrote the table. (b) was wrong: the census grepped
-- features/app/lib/components/packages and missed hooks/canvas/useCanvasLike.ts.
--
-- (a) stands, so the refusals stay and this is the write door instead. The door enforces
-- what the sweep wanted enforced:
--   * the like is the CALLER's own: user_id = created_by = auth.uid(), never a parameter;
--   * the canvas must be one the caller can see (public, their own, or viewer access),
--     decided before existence so a foreign id and an invented one answer identically;
--   * a new like is stamped with the organization the caller names explicitly, and the
--     caller must belong to it — the database never chooses one;
--   * delete means archive: unliking sets deleted_at; liking again revives the same row
--     ((canvas_id, user_id) is a full unique index). The like_count trigger follows.
-- Returns the canvas's like_count after the change.

create function canvas.set_canvas_like(
  p_canvas_id uuid,
  p_liked boolean,
  p_organization_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row_id uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'set_canvas_like: sign in to like a canvas' using errcode = '42501';
  end if;
  if p_canvas_id is null or p_liked is null then
    raise exception 'set_canvas_like: p_canvas_id and p_liked are required' using errcode = '22023';
  end if;

  -- Access before existence: a canvas the caller cannot see and one that does not exist
  -- answer the same sentence.
  if not exists (
    select 1 from canvas.shared_canvas_items s
     where s.id = p_canvas_id
       and s.deleted_at is null
       and (s.visibility = 'public'::platform.visibility
            or s.created_by = v_uid
            or iam.has_access('shared_canvas_item', s.id, 'viewer'::permission_level))
  ) then
    raise exception 'set_canvas_like: canvas not found or not visible to you' using errcode = '42501';
  end if;

  select l.id into v_row_id
    from canvas.canvas_likes l
   where l.canvas_id = p_canvas_id and l.user_id = v_uid
   for update;

  if p_liked then
    if v_row_id is null then
      if p_organization_id is null then
        raise exception 'set_canvas_like: p_organization_id is required for a new like — the caller names the organization, the database never chooses one' using errcode = '22023';
      end if;
      if not iam.has_org_access(p_organization_id) then
        raise exception 'set_canvas_like: you are not a member of that organization' using errcode = '42501';
      end if;
      insert into canvas.canvas_likes (canvas_id, user_id, organization_id, created_by)
      values (p_canvas_id, v_uid, p_organization_id, v_uid);
    else
      update canvas.canvas_likes set deleted_at = null
       where id = v_row_id and deleted_at is not null;
    end if;
  elsif v_row_id is not null then
    update canvas.canvas_likes set deleted_at = now()
     where id = v_row_id and deleted_at is null;
  end if;

  select s.like_count into v_count from canvas.shared_canvas_items s where s.id = p_canvas_id;
  return coalesce(v_count, 0);
end;
$function$;

comment on function canvas.set_canvas_like(uuid, boolean, uuid) is
  'The one write door for canvas likes. Likes/unlikes the CALLER''s own like on a canvas the caller can see; unlike archives (deleted_at), like revives the same row; a new like carries the organization the caller names. Returns the canvas like_count. canvas.canvas_likes refuses client writes (SECURITY-SWEEP 2026-09-21).';

-- No REVOKE needed: the §6d-4 guard takes back the default-privilege client grant at
-- CREATE (the door is not declared yet); only the GRANT below re-opens it, to authenticated.

insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, declared_by, argument_rules)
values (
  'canvas', 'set_canvas_like', 'p_canvas_id uuid, p_liked boolean, p_organization_id uuid',
  'A signed-in person likes or unlikes a canvas they can see. The like is always their own (user_id and created_by are auth.uid(), never a parameter); the canvas must be public, theirs, or viewer-accessible, decided before existence; a new like carries the organization they name and must belong to. Unlike archives the row, like revives it.',
  'canvas_set_canvas_like_door.sql',
  jsonb_build_object(
    'version', 1,
    'arguments', jsonb_build_object(
      'p_canvas_id', jsonb_build_object(
        'type', 'uuid', 'position', 1, 'optional', false,
        'check', 'public, created by the caller, or iam.has_access(shared_canvas_item, id, viewer), decided before existence',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('bounded', true, 'note', 'A canvas the caller cannot see raises 42501 before any like row is read or written; only the caller''s own like row is ever touched.')),
      'p_liked', jsonb_build_object(
        'type', 'boolean', 'position', 2, 'optional', false,
        'check', 'true = like (insert or revive), false = unlike (archive)',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('not_an_id', true)),
      'p_organization_id', jsonb_build_object(
        'type', 'uuid', 'position', 3, 'optional', true,
        'check', 'iam.has_org_access(p_organization_id) before a new like is written',
        'null_rule', jsonb_build_object('means', 'allowed for unlike and revive; a new like refuses'),
        'foreign', jsonb_build_object('bounded', true, 'note', 'An organization the caller does not belong to raises 42501; it only stamps the caller''s own like row, never reads another organization.'))
    )
  )
);

grant execute on function canvas.set_canvas_like(uuid, boolean, uuid) to authenticated;
