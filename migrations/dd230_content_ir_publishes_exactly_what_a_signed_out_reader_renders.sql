-- dd230_content_ir_publishes_exactly_what_a_signed_out_reader_renders
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
--   content_ir.kind_definition → 10 column(s). the Shape System registry (features/content-ir/registry/schema-source-kind-tables.ts and the studio's public readers), whose browser client runs as anon before a session hydrates and on guest surfaces. Columns taken from the live anon select= lists in Supabase edge_logs over 24 h.
--   content_ir.kind_component → 16 column(s). features/content-ir/registry/schema-source-kind-components.ts — the (kind, platform, role) → component_key resolver, same anon path. Columns from the live anon select= lists.
--   content_ir.kind_edge → 5 column(s). the same registry's ref graph (parent→child field edges). Live anon select=parent_definition_id,field_name,child_definition_id,deleted_at and child_definition_id,field_name,position.
--   content_ir.kind_surface → 8 column(s). features/content-ir/registry/surface-registry.ts — the enumerable input-surface list. Live anon select=surface_type,token,parser_strategy,streaming,… and id,kind_definition_id,surface_type,token,is_active.
--   content_ir.kind_example → 6 column(s). features/content-ir/studio/kind-examples.ts. Live anon select=id,kind_definition_id,is_canonical,data,updated_at.

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
      ('content_ir.kind_definition', array['id', 'kind', 'label', 'data', 'sample_data', 'emitted_json_schema', 'is_active', 'deleted_at', 'created_at', 'updated_at']),
      ('content_ir.kind_component', array['id', 'kind_definition_id', 'platform', 'role', 'component_key', 'source', 'component_source', 'props_transform', 'config', 'pinned_kind_version', 'is_default', 'is_active', 'sort_order', 'created_at', 'updated_at', 'deleted_at']),
      ('content_ir.kind_edge', array['parent_definition_id', 'child_definition_id', 'field_name', 'position', 'deleted_at']),
      ('content_ir.kind_surface', array['id', 'kind_definition_id', 'surface_type', 'token', 'parser_strategy', 'streaming', 'is_active', 'deleted_at']),
      ('content_ir.kind_example', array['id', 'kind_definition_id', 'is_canonical', 'data', 'updated_at', 'deleted_at'])
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
