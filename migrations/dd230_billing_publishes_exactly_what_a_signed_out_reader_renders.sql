-- dd230_billing_publishes_exactly_what_a_signed_out_reader_renders
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
--   billing.product → 6 column(s). app/(public)/pricing → features/pricing/education/loadEducationPricing.ts, a server read on a PUBLIC route: cookie-less, therefore anon. Renders name+description, filters active, orders created_at; tier is the plan it belongs to.
--   billing.price → 6 column(s). the same loader's second query: id, unit_amount, currency, interval — filtered on product_id + active.
--   billing.capability_limit → 4 column(s). the same loader's third query: select("capability, limit_value, period, tier") for the Free-tier headline caps. Measured live as anon 200s on production.
--
-- ═══ CLOSED — no signed-out reader exists, so the bound is the EMPTY list ═════════════════════
--   billing.capability — one curl probe. Its exposure row claims "plan capability catalogue shown on the public pricing page" — app/(public)/pricing/compare and /pledge issue no database read at all, and the pricing loader reads product, price and capability_limit only.
--   billing.plan_limit — two probes (one curl select=*, one curl select=capability,period,limit_value). Its exposure row claims the public plan comparison table; that table reads nothing.

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
      ('billing.product', array['id', 'name', 'description', 'tier', 'active', 'created_at']),
      ('billing.price', array['id', 'product_id', 'unit_amount', 'currency', 'interval', 'active']),
      ('billing.capability_limit', array['capability', 'limit_value', 'period', 'tier'])
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
      'billing.capability',
      'billing.plan_limit'
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
