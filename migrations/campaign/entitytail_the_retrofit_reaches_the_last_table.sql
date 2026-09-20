-- ENTITY-TAIL 1 — THE RETROFIT REACHES THE LAST TABLE.
--
-- THE DEFECT, measured on the main database 2026-09-20:
--
--   platform.custom_fields_retrofit('output_feedback')
--     -> refused :: 23514 ddl_guard: platform.output_feedback adds or changes an
--        organization_id default
--
-- and the same ALTER TABLE, typed by hand in psql, SUCCEEDS. The retrofit adds one
-- `custom_fields jsonb` column; it does not go near `organization_id`. The message is
-- not true, and the reason is a search_path trap:
--
--   `platform._ddl_guard` freezes the nine historical organization_id defaults as
--   (attrdef oid, object ref, md5 of `pg_get_expr(adbin, adrelid)`), so that unrelated
--   ALTER TABLE work on one of those nine tables stays legal. But `pg_get_expr` DEPARSES
--   against the session's search_path:
--
--     search_path = pg_catalog, public  ->  current_personal_org_id()
--                                           md5 4f5b09b52e1a7f210b4c0d8b8bfa8cb9  (frozen)
--     search_path = pg_catalog          ->  public.current_personal_org_id()
--                                           md5 a5944ccae7eb4b4d034378528323728a  (no match)
--
--   `platform.custom_fields_retrofit` is SECURITY DEFINER `SET search_path TO 'pg_catalog'`
--   — the safe, narrow path — so every statement it issues against any of those nine tables
--   is judged against the wrong rendering and refused by name. Proven by isolation:
--   `begin; set local search_path to pg_catalog; alter table platform.output_feedback add
--   column zz_a jsonb not null default '{}'::jsonb;` raises the guard; the same ALTER without
--   the `set local` does not.
--
-- THE CLASS is `platform._ddl_guard`'s, and it is named where its owner will find it: a
-- catalogue comparison that changes answer with the caller's search_path refuses honest
-- work and says something untrue while doing it. That guard is another lane's object and
-- this lane does not weaken it. What this file fixes is THIS lane's function: the retrofit
-- now issues its DDL under the search_path the frozen hashes were taken under, and puts
-- the narrow path straight back. The widening is three statements long, and every identifier
-- inside it is a literal built by `format(%I)` from the registry — nothing resolves by name
-- through the widened path.
--
-- Everything here is additive: one CREATE OR REPLACE FUNCTION. It drops nothing and
-- revokes nothing, and the inverse puts the previous body back verbatim.
--
-- based-on: platform.custom_fields_retrofit(text) a28d7f4b0152167f8fc1a43244a1d29fa4787afa228289e5994287f08774f606

CREATE OR REPLACE FUNCTION platform.custom_fields_retrofit(p_token text DEFAULT NULL::text)
 RETURNS TABLE(token text, relation text, action text, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r          record;
  v_oid      oid;
  v_kind     "char";
  v_ispart   boolean;
  v_has_col  boolean;
  v_has_trg  boolean;
  v_did_col  boolean;
  v_did_trg  boolean;
begin
  if pg_catalog.current_setting('custom.retrofit_running', true) = 'on' then
    return;                       -- re-entered from the DDL sync; the outer call is doing it
  end if;
  perform pg_catalog.set_config('custom.retrofit_running', 'on', true);

  for r in
    select e.token       as tok,
           e.type        as typ,
           e.schema_name as nsp,
           e.table_name  as rel
      from platform.entity_types e
     where e.custom_fields_enabled
       and e.is_active
       and (p_token is null or e.token = p_token)
     order by e.schema_name, e.table_name
  loop
    token := r.tok;
    relation := r.nsp || '.' || r.rel;
    note := null;
    v_did_col := false;
    v_did_trg := false;

    select c.oid, c.relkind, c.relispartition
      into v_oid, v_kind, v_ispart
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = r.nsp and c.relname = r.rel;

    if v_oid is null then
      action := 'no relation';
      note := 'the registry names a table that is not in this database';
      return next; continue;
    end if;
    if v_kind not in ('r', 'p') then
      action := 'not a table';
      note := format('relkind %s - custom fields live in a column of the table itself', v_kind);
      return next; continue;
    end if;
    if v_ispart then
      action := 'partition child';
      note := 'the parent carries the column and this child inherits it';
      return next; continue;
    end if;

    v_has_col := exists (select 1 from pg_attribute a
                          where a.attrelid = v_oid and a.attname = 'custom_fields'
                            and a.attnum > 0 and not a.attisdropped);
    v_has_trg := exists (select 1 from pg_trigger t
                          where t.tgrelid = v_oid and not t.tgisinternal
                            and t.tgfoid = 'custom._entity_custom_fields_guard'::regproc);

    -- ONE TABLE'S FAILURE IS ONE TABLE'S FAILURE. The nested block is a subtransaction, so a
    -- table that is busy right now (55P03 from the lock timeout above) is reported by name
    -- and the other 642 still get served. It is reported, never swallowed: the caller sees
    -- the code and the message, and the next pass picks it up.
    begin
      -- THE SEARCH_PATH WINDOW (ENTITY-TAIL 1). `platform._ddl_guard` freezes the nine
      -- historical organization_id defaults by the md5 of `pg_get_expr(...)`, and pg_get_expr
      -- DEPARSES against search_path: under this function's narrow 'pg_catalog' the very same
      -- default renders `public.current_personal_org_id()` instead of
      -- `current_personal_org_id()`, misses every frozen hash, and the guard refuses an
      -- ADD COLUMN that never touched organization_id. The window is exactly as wide as the
      -- statements below, which name nothing by search_path: every identifier is a literal
      -- from the registry, quoted by format(%I), and every function is schema-qualified.
      perform pg_catalog.set_config('search_path', 'pg_catalog, public', true);

      if not v_has_col then
        execute format('alter table %I.%I add column custom_fields jsonb not null default %L::jsonb',
                       r.nsp, r.rel, '{}');
        execute format($c$comment on column %I.%I.custom_fields is %L$c$, r.nsp, r.rel,
                       'REC-40 / REC-53: this organization''s own fields on this standard '
                       || r.typ || '. One jsonb per row, validated against the Field records '
                       || 'carrying this table''s registry token. Never system data - that is metadata (REC-59).');
        v_did_col := true;
      end if;

      if not v_has_trg then
        -- The token is the trigger's ONE argument, so the guard never has to work out which
        -- table it is on (REC-51).
        execute format(
          'create trigger custom_fields_validation before insert or update of custom_fields '
          || 'on %I.%I for each row execute function custom._entity_custom_fields_guard(%L)',
          r.nsp, r.rel, r.tok);
        v_did_trg := true;
      end if;

      perform pg_catalog.set_config('search_path', 'pg_catalog', true);
    exception when others then
      perform pg_catalog.set_config('search_path', 'pg_catalog', true);
      action := 'refused';
      note := sqlstate || ' ' || sqlerrm;
      return next; continue;
    end;

    action := case
                when v_did_col and v_did_trg then 'column + trigger'
                when v_did_col then 'column'
                when v_did_trg then 'trigger'
                else 'already'
              end;
    return next;
  end loop;

  perform pg_catalog.set_config('custom.retrofit_running', 'off', true);
  return;
end
$function$;
