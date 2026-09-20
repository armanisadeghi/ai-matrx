-- ENTITY-TAIL 1 — INVERSE. Puts back the body that was live before the search_path window,
-- verbatim from pg_get_functiondef on the main database 2026-09-20. It removes only the
-- window; the columns and triggers the retrofit created stay, because dropping them would
-- delete the custom values an organization has written on a standard row.
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
    exception when others then
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
$function$

;
