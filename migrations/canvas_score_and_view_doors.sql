-- Submitting a canvas score and recording a canvas view failed for everyone (found
-- 2026-09-28). The SECURITY-SWEEP of 2026-09-21
-- (migrations/campaign/secsweep_eleven_tables_no_client_writes.sql) closed client
-- INSERT/UPDATE/DELETE on canvas.canvas_scores and canvas.canvas_views with RESTRICTIVE
-- refusals because (a) both carry a user_id the generated std_insert pins nothing about
-- (a browser could write a score or a view naming another person, or a leaderboard row
-- under someone else's display name), and (b) its census believed no client wrote them.
-- (b) was wrong: hooks/canvas/useCanvasScore.ts and hooks/canvas/useSharedCanvas.ts do.
--
-- (a) stands, so the refusals stay and these are the write doors, the same shape as
-- canvas.set_canvas_like (migrations/canvas_set_canvas_like_door.sql):
--   * the row is the CALLER's own: user_id = created_by = auth.uid(), never a parameter;
--     a score's username/display_name come from the caller's own profile, never a
--     parameter, so nobody can post a leaderboard row in another person's name;
--   * the canvas must be one the caller can see (public, their own, or viewer access),
--     decided before existence so a foreign id and an invented one answer identically;
--   * the row is stamped with the organization the caller names explicitly, and the
--     caller must belong to it — the database never chooses one.
--
-- Scores are an attempt LEDGER (no natural key): every submission is a new attempt
-- (attempt_number = the caller's live attempts on this canvas + 1), serialized per
-- (canvas, caller) so two quick submits never share a number. The existing
-- trigger_canvas_high_score keeps high_score / total_attempts / average_score. The door
-- returns what the result dialog shows, computed where every score is visible (the
-- browser can read only its own rows, so a client-side rank was always wrong).
--
-- Views are signed-in only. Guests on a public share page do not write view rows: the
-- share-token resolver already records guest token access, the hook has skipped guests
-- since the canonical-RLS retrofit (features/canvas/shared/canvasViewTracking.ts), and an
-- anonymous SECURITY DEFINER insert would let anyone inflate any public canvas's
-- view_count by rotating a client-chosen session id — there is no identity to rate-limit.
-- Rate safety for signed-in callers: one view row per (canvas, caller) per hour; the
-- existing trigger_canvas_view_count then moves view_count.

create function canvas.submit_canvas_score(
  p_canvas_id uuid,
  p_score integer,
  p_max_score integer,
  p_completed boolean,
  p_organization_id uuid,
  p_time_taken integer default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_prior_high integer;
  v_prior_best integer;
  v_attempts integer;
  v_row canvas.canvas_scores%rowtype;
  v_rank integer;
begin
  if v_uid is null then
    raise exception 'submit_canvas_score: sign in to record a score' using errcode = '42501';
  end if;
  if p_canvas_id is null or p_score is null or p_max_score is null or p_completed is null then
    raise exception 'submit_canvas_score: p_canvas_id, p_score, p_max_score and p_completed are required' using errcode = '22023';
  end if;
  if p_time_taken is not null and p_time_taken < 0 then
    raise exception 'submit_canvas_score: p_time_taken cannot be negative' using errcode = '22023';
  end if;

  -- Access before existence.
  if not exists (
    select 1 from canvas.shared_canvas_items s
     where s.id = p_canvas_id
       and s.deleted_at is null
       and (s.visibility = 'public'::platform.visibility
            or s.created_by = v_uid
            or iam.has_access('shared_canvas_item', s.id, 'viewer'::permission_level))
  ) then
    raise exception 'submit_canvas_score: canvas not found or not visible to you' using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'submit_canvas_score: p_organization_id is required — the caller names the organization, the database never chooses one' using errcode = '22023';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'submit_canvas_score: you are not a member of that organization' using errcode = '42501';
  end if;

  -- One attempt at a time per (canvas, caller): attempt numbers never collide.
  perform pg_advisory_xact_lock(hashtextextended('canvas_score:' || p_canvas_id::text || ':' || v_uid::text, 0));

  select count(*), max(sc.score) into v_attempts, v_prior_best
    from canvas.canvas_scores sc
   where sc.canvas_id = p_canvas_id and sc.user_id = v_uid and sc.deleted_at is null;

  select s.high_score into v_prior_high from canvas.shared_canvas_items s where s.id = p_canvas_id;

  select nullif(btrim(p.display_name), '') into v_name
    from users.profiles p where p.id = v_uid and p.deleted_at is null;
  if v_name is null then
    select nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), '')
      into v_name from auth.users u where u.id = v_uid;
  end if;

  insert into canvas.canvas_scores (
    canvas_id, user_id, organization_id, created_by, username, display_name,
    score, max_score, time_taken, completed, attempt_number, data
  ) values (
    p_canvas_id, v_uid, p_organization_id, v_uid, v_name, v_name,
    p_score, p_max_score, p_time_taken, p_completed, v_attempts + 1, coalesce(p_data, '{}'::jsonb)
  )
  returning * into v_row;

  select count(*) + 1 into v_rank
    from canvas.canvas_scores sc
   where sc.canvas_id = p_canvas_id and sc.deleted_at is null and sc.score > p_score;

  return jsonb_build_object(
    'score', to_jsonb(v_row),
    'rank', v_rank,
    'is_high_score', v_prior_high is null or p_score > v_prior_high,
    'beats_own_best', v_prior_best is null or p_score > v_prior_best,
    'attempt_number', v_row.attempt_number
  );
end;
$function$;

comment on function canvas.submit_canvas_score(uuid, integer, integer, boolean, uuid, integer, jsonb) is
  'The one write door for canvas scores. Records a new attempt as the CALLER (user_id/created_by = auth.uid(); username/display_name from the caller''s profile) on a canvas the caller can see, in the organization the caller names. Returns {score, rank, is_high_score, beats_own_best, attempt_number}. canvas.canvas_scores refuses client writes (SECURITY-SWEEP 2026-09-21).';

create function canvas.record_canvas_view(
  p_canvas_id uuid,
  p_organization_id uuid,
  p_session_id text default null,
  p_referrer text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'record_canvas_view: sign in to record a view' using errcode = '42501';
  end if;
  if p_canvas_id is null then
    raise exception 'record_canvas_view: p_canvas_id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from canvas.shared_canvas_items s
     where s.id = p_canvas_id
       and s.deleted_at is null
       and (s.visibility = 'public'::platform.visibility
            or s.created_by = v_uid
            or iam.has_access('shared_canvas_item', s.id, 'viewer'::permission_level))
  ) then
    raise exception 'record_canvas_view: canvas not found or not visible to you' using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'record_canvas_view: p_organization_id is required — the caller names the organization, the database never chooses one' using errcode = '22023';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'record_canvas_view: you are not a member of that organization' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('canvas_view:' || p_canvas_id::text || ':' || v_uid::text, 0));

  -- Rate safety: one view per (canvas, caller) per hour.
  if exists (
    select 1 from canvas.canvas_views v
     where v.canvas_id = p_canvas_id and v.user_id = v_uid and v.deleted_at is null
       and v.viewed_at > now() - interval '1 hour'
  ) then
    return false;
  end if;

  insert into canvas.canvas_views (canvas_id, user_id, organization_id, created_by, session_id, referrer, viewed_at)
  values (p_canvas_id, v_uid, p_organization_id, v_uid,
          left(nullif(p_session_id, ''), 128), left(nullif(p_referrer, ''), 2048), now());
  return true;
end;
$function$;

comment on function canvas.record_canvas_view(uuid, uuid, text, text) is
  'The one write door for canvas views. Records the signed-in CALLER''s view (user_id/created_by = auth.uid()) of a canvas they can see, in the organization they name; at most one row per (canvas, caller) per hour. Returns true when a view row was written. Guests do not record views. canvas.canvas_views refuses client writes (SECURITY-SWEEP 2026-09-21).';

insert into platform.client_callable_door (schema_name, function_name, identity_args, reason, declared_by, argument_rules)
values
(
  'canvas', 'submit_canvas_score',
  'p_canvas_id uuid, p_score integer, p_max_score integer, p_completed boolean, p_organization_id uuid, p_time_taken integer, p_data jsonb',
  'A signed-in person records a score attempt on a canvas they can see. The attempt is always their own (user_id and created_by are auth.uid(); the leaderboard name comes from their own profile, never a parameter); the canvas must be public, theirs, or viewer-accessible, decided before existence; the row carries the organization they name and must belong to.',
  'canvas_score_and_view_doors.sql',
  jsonb_build_object(
    'version', 1,
    'arguments', jsonb_build_object(
      'p_canvas_id', jsonb_build_object(
        'type', 'uuid', 'position', 1, 'optional', false,
        'check', 'public, created by the caller, or iam.has_access(shared_canvas_item, id, viewer), decided before existence',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('bounded', true, 'note', 'A canvas the caller cannot see raises 42501 before any score is read or written; only a new row owned by the caller is written.')),
      'p_score', jsonb_build_object(
        'type', 'integer', 'position', 2, 'optional', false, 'check', 'value only',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('not_an_id', true)),
      'p_max_score', jsonb_build_object(
        'type', 'integer', 'position', 3, 'optional', false, 'check', 'value only',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('not_an_id', true)),
      'p_completed', jsonb_build_object(
        'type', 'boolean', 'position', 4, 'optional', false, 'check', 'value only',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('not_an_id', true)),
      'p_organization_id', jsonb_build_object(
        'type', 'uuid', 'position', 5, 'optional', false,
        'check', 'iam.has_org_access(p_organization_id) before the row is written',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('bounded', true, 'note', 'An organization the caller does not belong to raises 42501; it only stamps the caller''s own new row, never reads another organization.')),
      'p_time_taken', jsonb_build_object(
        'type', 'integer', 'position', 6, 'optional', true, 'check', 'null or >= 0',
        'null_rule', jsonb_build_object('means', 'no time recorded'),
        'foreign', jsonb_build_object('not_an_id', true)),
      'p_data', jsonb_build_object(
        'type', 'jsonb', 'position', 7, 'optional', true, 'check', 'opaque attempt payload stored on the caller''s own row',
        'null_rule', jsonb_build_object('means', 'empty object'),
        'foreign', jsonb_build_object('not_an_id', true))
    )
  )
),
(
  'canvas', 'record_canvas_view',
  'p_canvas_id uuid, p_organization_id uuid, p_session_id text, p_referrer text',
  'A signed-in person records that they viewed a canvas they can see. The view is always their own (user_id and created_by are auth.uid(), never a parameter); the canvas must be public, theirs, or viewer-accessible, decided before existence; the row carries the organization they name and must belong to; at most one view per canvas per hour per person.',
  'canvas_score_and_view_doors.sql',
  jsonb_build_object(
    'version', 1,
    'arguments', jsonb_build_object(
      'p_canvas_id', jsonb_build_object(
        'type', 'uuid', 'position', 1, 'optional', false,
        'check', 'public, created by the caller, or iam.has_access(shared_canvas_item, id, viewer), decided before existence',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('bounded', true, 'note', 'A canvas the caller cannot see raises 42501 before any view is read or written; only a new row owned by the caller is written.')),
      'p_organization_id', jsonb_build_object(
        'type', 'uuid', 'position', 2, 'optional', false,
        'check', 'iam.has_org_access(p_organization_id) before the row is written',
        'null_rule', jsonb_build_object('means', 'refused'),
        'foreign', jsonb_build_object('bounded', true, 'note', 'An organization the caller does not belong to raises 42501; it only stamps the caller''s own new row.')),
      'p_session_id', jsonb_build_object(
        'type', 'text', 'position', 3, 'optional', true, 'check', 'opaque browser session tag, truncated to 128 chars',
        'null_rule', jsonb_build_object('means', 'no session tag'),
        'foreign', jsonb_build_object('not_an_id', true)),
      'p_referrer', jsonb_build_object(
        'type', 'text', 'position', 4, 'optional', true, 'check', 'opaque referrer URL, truncated to 2048 chars',
        'null_rule', jsonb_build_object('means', 'no referrer'),
        'foreign', jsonb_build_object('not_an_id', true))
    )
  )
);

grant execute on function canvas.submit_canvas_score(uuid, integer, integer, boolean, uuid, integer, jsonb) to authenticated;
grant execute on function canvas.record_canvas_view(uuid, uuid, text, text) to authenticated;
