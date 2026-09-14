-- dd230_ai_publishes_exactly_what_a_signed_out_reader_renders
-- (DD-230. db-rules §0/§6d/§9. GRANTS ONLY — no DDL, no policy, no row touched.)
--
-- THE DOCTRINE: a signed-out reader of the catalogue sees EXACTLY what the public surfaces render.
-- DD-222 settled that the bound of a signed-out surface is the set of columns that surface renders;
-- DD-226 closed 121 relations whose census found no such surface and NAMED these catalogue-shaped
-- schemas as its open half, because their readers were said to be "server-side shell catalogue reads
-- that a browser capture cannot see". This file is that half, decided from measurement.
--
-- ═══ HOW THE READERS WERE MEASURED (never assumed) ════════════════════════════════════════════
-- 1. A REAL SIGNED-OUT BROWSER on production (localStorage holds no sb-* key): /, /pricing,
--    /sign-up, /files, /podcast, /canvas/discover. Every request to db.matrxserver.com was captured
--    from the page's own PerformanceResourceTiming. Result: only /canvas/discover issues one, and it
--    is canvas.shared_canvas_items — NOT ONE of the 46 relations below is fetched by any signed-out
--    page in the browser.
-- 2. SUPABASE `edge_logs`, a full 24 h, grouped by request.path x request.sb.jwt.authorization
--    .payload.role x response.status_code, with the verbatim `select=` list of every request.
--    (`request.headers.authorization` is empty on every row and must not be used.)
-- 3. 🚨 THE TRAP IN (2), FOUND BY THIS LANE: a caller holding the new-style `sb_secret_` SERVICE key
--    sends no JWT, so its rows carry an EMPTY role and look exactly like an anonymous reader. Three
--    relations (`ui.ui_surface`, `ui.ui_surface_value`, `ui.ui_surface_write_target`) and
--    `platform.shareable_resource_registry` were "anonymously read" hundreds of times a day by
--    `scripts/check-surface-impact.ts` and `scripts/regen-shareable-registry-snapshot.ts` — both on
--    the secret key. Every candidate was therefore RE-PROBED over HTTPS with the PUBLISHABLE key and
--    no Authorization header; that probe, not the log role, is what decided each row.
-- 4. The code census: every `.from("<table>")` call site in matrx-frontend, matrx-extend, matrx-local
--    and aidream, judged against what a person with no account can cause to run.
--
-- Columns are revoked BY NAME from the catalog (a table-level REVOKE does not remove column grants),
-- the surviving set is asserted to EQUAL the declared bound, and `authenticated`'s column count is
-- captured before and asserted identical after — this file may only close the signed-out door.
-- Register: lib/security/public-exposure.ts#ANON_COLUMN_SURFACE, held true by
-- `pnpm check:anon-column-surface`.

--
-- ═══ BOUNDED — a named, replayable signed-out reader, and its exact columns ══════════════════
--   ai.model_definition → 24 column(s). GET /api/ai-models — an UNAUTHENTICATED route whose client is getScriptSupabaseClient() (publishable key ⇒ anon) and whose answer is CDN-cached to the open internet for 12 h. Its select() names exactly these 24.
--   ai.provider → 2 column(s). the same route, second query: supabase.schema("ai").from("provider").select("id, name") — it resolves a model's maker. Two columns, not fifteen.
--
-- ═══ CLOSED — no signed-out reader exists, so the bound is the EMPTY list ═════════════════════
--   ai.api — no signed-out reader. The 24 h of anon traffic on /rest/v1/api is one curl probe (select=*&limit=1) from a census lane and one select=* from a developer's localhost admin table review — both sessions racing their own auth, neither a page a person without an account can open.
--   ai.endpoint — same as ai.api: one lane probe, one localhost admin table review.
--   ai.model_alias — zero anon requests of any kind in 24 h.
--   ai.offering — one select=* from a developer's localhost admin table review. /api/ai-models reads ai.model_definition + ai.provider, never this.
--   ai.setting — twelve select=* from one developer's localhost admin page (canonical-table-review.localhost:3001). No public route names it.
--   ai.voices — one curl probe. features/podcasts/generator/voiceCatalog.ts is the podcast STUDIO, behind a session.

do $$
declare
  r        record;
  v_col    record;
  v_before int;
  v_total  int;
  v_auth0  int;
  v_auth   int;
  v_left   text;
begin
  for r in
    select * from (values
      ('ai.model_definition', array['id', 'name', 'common_name', 'context_window', 'max_tokens', 'capabilities', 'provider_id', 'is_deprecated', 'is_primary', 'is_premium', 'mid_fallback_id', 'guest_fallback_id', 'visibility', 'deleted_at', 'created_at', 'updated_at', 'release_date', 'description', 'cost_rating', 'speed_rating', 'retry_fallback_id', 'retry_max_attempts', 'retired_at', 'successor_id']),
      ('ai.provider', array['id', 'name'])
    ) as t(rel, keep)
  loop
    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
      into v_before, v_total, v_auth0
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    -- Every declared column must EXIST and already be readable by anon: this file narrows a
    -- bound, it never opens one. A typo in the list is a hard stop, not a silent widening.
    for v_col in
      select k as attname from unnest(r.keep) as k
       where not exists (
         select 1 from pg_attribute a
          where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
            and a.attname = k
            and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
    loop
      raise exception 'dd230: % declares column % as its signed-out bound, but anon cannot select it '
                      '(missing column, or already revoked). This file narrows bounds; it never opens one.',
                      r.rel, v_col.attname;
    end loop;

    for v_col in
      select a.attname
        from pg_attribute a
       where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
         and not (a.attname = any(r.keep))
       order by a.attnum
    loop
      execute format('revoke select (%I) on %s from anon', v_col.attname, r.rel);
    end loop;
    -- A table-level SELECT would re-open every column the loop just closed.
    execute format('revoke select on %s from anon', r.rel);
    foreach v_left in array r.keep loop
      execute format('grant select (%I) on %s to anon', v_left, r.rel);
    end loop;

    select string_agg(a.attname, ', ' order by a.attnum)
             filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
      into v_left, v_auth
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    if coalesce(v_left, '') is distinct from (
         select string_agg(a.attname, ', ' order by a.attnum)
           from pg_attribute a
          where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
            and a.attname = any(r.keep)) then
      raise exception 'dd230: % ended with anon holding (%), which is not the declared bound (%).',
                      r.rel, coalesce(v_left, '(none)'), array_to_string(r.keep, ', ');
    end if;
    if has_table_privilege('anon', r.rel::regclass, 'SELECT') then
      raise exception 'dd230: anon still holds a table-level SELECT on % — that grants every column.', r.rel;
    end if;
    if v_auth <> v_auth0 then
      raise exception 'dd230: authenticated SELECT on % moved from % to % column(s). This file may '
                      'only close the signed-out door.', r.rel, v_auth0, v_auth;
    end if;

    raise notice 'dd230: % bounded to % of % columns for anon (was %), authenticated keeps % (unchanged).',
                 r.rel, cardinality(r.keep), v_total, v_before, v_auth;
  end loop;
end $$;

do $$
declare
  r        record;
  v_col    record;
  v_before int;
  v_total  int;
  v_auth0  int;
  v_auth   int;
  v_after  int;
  v_names  text;
begin
  for r in
    select unnest(array[
      'ai.api',
      'ai.endpoint',
      'ai.model_alias',
      'ai.offering',
      'ai.setting',
      'ai.voices'
    ]) as rel
  loop
    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')),
           string_agg(a.attname, ', ' order by a.attnum)
             filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
      into v_before, v_total, v_auth0, v_names
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    for v_col in
      select a.attname
        from pg_attribute a
       where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped
         and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
       order by a.attnum
    loop
      execute format('revoke select (%I) on %s from anon', v_col.attname, r.rel);
    end loop;
    execute format('revoke select on %s from anon', r.rel);

    select count(*) filter (where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')),
           count(*) filter (where has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
      into v_after, v_auth
      from pg_attribute a
     where a.attrelid = r.rel::regclass and a.attnum > 0 and not a.attisdropped;

    if v_after <> 0 then
      raise exception 'dd230: anon still holds SELECT on % column(s) of %. The point of this file is '
                      'that the number is zero.', v_after, r.rel;
    end if;
    if has_table_privilege('anon', r.rel::regclass, 'SELECT') then
      raise exception 'dd230: anon still holds a table-level SELECT on %.', r.rel;
    end if;
    if v_auth <> v_auth0 then
      raise exception 'dd230: authenticated SELECT on % moved from % to % column(s). This file may '
                      'only close the signed-out door.', r.rel, v_auth0, v_auth;
    end if;

    raise notice 'dd230: % closed to anon — % of % columns revoked (%), authenticated keeps % (unchanged).',
                 r.rel, v_before, v_total, coalesce(v_names, '(none)'), v_auth;
  end loop;
end $$;
