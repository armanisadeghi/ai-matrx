-- dd226_agent_message_template_publishes_exactly_what_it_renders
-- (DD-226. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- `agent.message_template` is the ONE relation in schema `agent` with a real signed-out reader:
-- `app/(public)/p/e/loadPublicResource.ts` renders /p/e/message_template/<id> with the SSR client
-- (which is `anon` for a signed-out visitor) and asks PostgREST for exactly the list
-- `PUBLIC_LANE_COLUMNS.message_template` declares in `utils/permissions/publicLane.ts`:
--
--   id, label, content, role, tags, created_at, updated_at, visibility   — EIGHT columns.
--
-- The live grant is NINE. The extra one is `deleted_at`, which no signed-out surface renders.
-- Under DD-222's rule — the bound of a signed-out surface is the set of columns that surface
-- renders — a ninth column is an over-grant however harmless its values look, and `deleted_at` on
-- a row `pub_read` already admits is always NULL, so nothing is lost by closing it and the rule
-- stops being one-relation-shaped. (Contrast `visibility` and the row gate's own columns, which
-- clients legitimately FILTER on: PostgREST cannot filter a column the caller may not select.
-- `deleted_at` is not filtered by the public loader — `pub_read` already excludes deleted rows.)
--
-- The declaration in `lib/security/public-exposure.ts` drops to the same eight in the same commit,
-- so `pnpm check:anon-column-surface` agrees in both directions.
--
-- Signed-in readers are untouched: the count of columns `authenticated` may SELECT is captured
-- before and asserted identical after.

do $$
declare
  v_before int;
  v_after  int;
  v_auth0  int;
  v_auth   int;
begin
  select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
         count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
    into v_before, v_auth0
    from pg_attribute a
   where a.attrelid = 'agent.message_template'::regclass and a.attnum > 0 and not a.attisdropped;

  if v_before <> 9 then
    raise exception 'dd226: agent.message_template was expected to publish 9 columns to anon; it '
                    'publishes %. Re-measure before changing it.', v_before;
  end if;

  revoke select (deleted_at) on agent.message_template from anon;

  select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
         count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
    into v_after, v_auth
    from pg_attribute a
   where a.attrelid = 'agent.message_template'::regclass and a.attnum > 0 and not a.attisdropped;

  if v_after <> 8 then
    raise exception 'dd226: agent.message_template publishes % columns to anon, expected the 8 the '
                    'public page renders.', v_after;
  end if;
  if has_column_privilege('anon', 'agent.message_template'::regclass, 'deleted_at', 'SELECT') then
    raise exception 'dd226: anon still holds SELECT on agent.message_template.deleted_at.';
  end if;
  -- The eight the page actually asks for must all survive, or /p/e/message_template 42501s.
  if not (has_column_privilege('anon', 'agent.message_template'::regclass, 'id', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'label', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'content', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'role', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'tags', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'created_at', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'updated_at', 'SELECT')
      and has_column_privilege('anon', 'agent.message_template'::regclass, 'visibility', 'SELECT')) then
    raise exception 'dd226: a column the public /p/e/message_template page renders lost its anon '
                    'grant. That page would answer 42501 to every signed-out visitor.';
  end if;
  if v_auth <> v_auth0 then
    raise exception 'dd226: authenticated SELECT on agent.message_template moved from % to %.',
                    v_auth0, v_auth;
  end if;

  raise notice 'dd226: agent.message_template 9 -> 8 anon columns (deleted_at revoked); '
               'authenticated keeps % (unchanged).', v_auth;
end $$;
