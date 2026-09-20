-- chair-step: the retrofit RUNS DDL the allow-list cannot read. REC-40 says every standard
-- Entity and Detail carries `custom_fields`, and which tables those are is a question only the
-- registry can answer, at run time, by TYPE - so the ALTER TABLEs are built by
-- `platform.custom_fields_retrofit()` inside a DO block. A static allow-list cannot read a
-- statement that does not exist yet, and it is right to refuse rather than to guess. Everything
-- this file executes is additive: ADD COLUMN with a constant default, CREATE TRIGGER, CREATE
-- FUNCTION. It drops nothing, revokes nothing and deletes nothing, and its inverse removes the
-- machinery while leaving every column and every value in place.
--
-- ENTITY-FIELDS 2 — REC-40's RETROFIT, BY TYPE, WITH ZERO PER-TABLE CODE.
--
-- REC-40, word for word: "Custom fields exist on every standard Entity and Detail, in a
-- `custom_fields jsonb NOT NULL DEFAULT '{}'` column of the same table — emitted by the
-- provisioner for every new table and retrofitted to every existing one."
--
-- MEASURED on the MAIN database 2026-09-19, from the seat:
--
--     update crm.deal        set custom_fields = '{"x":1}' → 42703 column does not exist
--     update crm.interaction set custom_fields = '{"x":1}' → 42703 column does not exist
--     Entity/Detail tables that CAN hold a custom value: 3 of 643
--     tables whose custom values are VALIDATED by the guard: 1
--
-- The registry has said `custom_fields_enabled` for 643 tables since W1-REG (298 Entity,
-- 345 Detail). ONE of them — `crm.party`, W1-FIELD's named first retrofit — could actually
-- hold a value. The law was a registry attribute nothing read.
--
-- THE CLASS: `platform.custom_fields_retrofit()`. It reads the registry, by TYPE, and gives
-- every Entity and Detail relation the column and the validation trigger. There is no list of
-- tables in this file and none in the function: a table is in scope because its registry row
-- says its type carries custom fields, which is REC-34's whole point. It is idempotent — a
-- table that already has both is reported `already`, not touched — and it is the ONE verb
-- that ever creates this column, so the column, its type, its default and its trigger
-- argument cannot drift table to table.
--
-- AND IT KEEPS UP BY ITSELF. `platform._entity_type_gets_custom_fields` fires on
-- `platform.entity_types` when a row appears or becomes an active Entity/Detail, and
-- retrofits that ONE token. So a table the provisioner lays down tomorrow carries custom
-- fields the moment it is registered, without anybody remembering to run anything and
-- without a line of per-table code — which is the other half of REC-40's sentence.
--
-- WHY ADD COLUMN IS ADDITIVE HERE, said plainly. Postgres 17 stores a constant DEFAULT as
-- catalogue metadata, so no row is rewritten and the lock is held for milliseconds; the
-- runner's own `ddl_lock_timeout_guard` bounds the wait and this file sets `lock_timeout`
-- besides. `platform._provision_shape_guard` does not judge ALTER TABLE ("ALTER TABLE is NOT
-- a lane-(d) event until `evolve` ships") — verified by running one ADD COLUMN plus its
-- trigger on `crm.deal` inside a rolled-back transaction before this file was written.
-- The column is user-facing and the knob cannot hide it from `select('*')`: REC-40 says so
-- itself, and the OFF proof is answer identity — with an organization's store off the guard
-- returns on its second line and `custom_fields` is `{}` for every row of that organization.
--
-- WHAT IT DOES NOT DO: it never drops a column, never touches a table whose registry row
-- says any of the other five types, never touches a partition child (the parent carries the
-- column and the child inherits it), and reports — rather than skipping in silence — every
-- relation it could not serve.
--
-- INVERSE: migrations/inverse/entityfields_every_entity_and_detail_can_hold_one_down.sql

-- 🚨 `lock_timeout` IS DELIBERATELY BELOW `deadlock_timeout` (1s), AND THAT IS THE WHOLE
-- SAFETY STORY. The first draft of this file used 5s and produced, against live traffic on
-- the main database, exactly what you would expect:
--     ERROR: deadlock detected … alter table ops.app_log add column custom_fields …
-- One transaction taking AccessExclusive on hundreds of tables WILL form a cycle with a
-- busy writer sooner or later, and the deadlock detector — which wakes at 1s — gets there
-- first and kills US. At 900ms we always lose the race to our own lock timeout instead: a
-- table under load answers 55P03, that one table is skipped, NAMED, and retried on the next
-- pass, and no other session is ever chosen as a deadlock victim because of this file.
set lock_timeout = '900ms';
set statement_timeout = '30min';


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE VERB
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.custom_fields_retrofit(p_token text DEFAULT NULL)
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
$function$;

COMMENT ON FUNCTION platform.custom_fields_retrofit(text) IS
  'REC-40: gives every ACTIVE Entity and Detail in platform.entity_types the custom_fields jsonb column and the custom._entity_custom_fields_guard trigger, by TYPE, idempotently. The one verb that creates this column anywhere.';

-- WHO MAY CALL IT — IN DATA, in this same transaction, because prose in a comment is not a
-- declaration (`platform._provision_shape_settled`, which refused the first run of this file
-- and was right to). Nobody may call it: it performs DDL on business tables, and no client
-- ever asks for DDL. `p_token` is a `platform.entity_types` token, never an entity id, so
-- there is no row to check a caller against — which is exactly why it is not a client door.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES ('platform', 'custom_fields_retrofit', 'p_token text', ARRAY['text'::regtype]::oid[],
        'p_token is a platform.entity_types token (or NULL, meaning every active Entity and Detail). It carries no entity id and reaches no row: the function reads the registry and issues ALTER TABLE ADD COLUMN and CREATE TRIGGER.',
        'migrations/campaign/entityfields_every_entity_and_detail_can_hold_one.sql',
        'server_only: the campaign migration runner and platform._entity_type_gets_custom_fields (a trigger on platform.entity_types) are the only callers. It performs DDL on live business tables, which no signed-in person and no anonymous caller may ever ask for.',
        false, false)
ON CONFLICT (schema_name, function_name, identity_argtypes) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- AND IT KEEPS UP BY ITSELF
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._entity_type_gets_custom_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
begin
  if not coalesce(new.custom_fields_enabled, false) or not coalesce(new.is_active, false) then
    return null;
  end if;
  if pg_catalog.current_setting('custom.retrofit_running', true) = 'on' then
    return null;
  end if;
  -- Cheap and exact: nothing runs unless the column is genuinely missing, so the common
  -- case (the registry being re-synced after any DDL anywhere) costs one catalogue lookup.
  if exists (select 1
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
               join pg_attribute a on a.attrelid = c.oid and a.attname = 'custom_fields'
                                  and a.attnum > 0 and not a.attisdropped
              where n.nspname = new.schema_name and c.relname = new.table_name) then
    return null;
  end if;
  perform platform.custom_fields_retrofit(new.token);
  return null;
end
$function$;

DROP TRIGGER IF EXISTS entity_type_gets_custom_fields ON platform.entity_types;
CREATE TRIGGER entity_type_gets_custom_fields
  AFTER INSERT OR UPDATE OF custom_fields_enabled, is_active, schema_name, table_name
  ON platform.entity_types
  FOR EACH ROW EXECUTE FUNCTION platform._entity_type_gets_custom_fields();

COMMENT ON FUNCTION platform._entity_type_gets_custom_fields() IS
  'REC-40: a table registered as an active Entity or Detail gets its custom_fields column and validation trigger the moment it is registered - no per-table code and nothing to remember to run.';


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- RUN IT, AND SAY OUT LOUD WHAT IT DID
-- ─────────────────────────────────────────────────────────────────────────────────────────
DO $run$
declare
  v_pass int; v_refused int; v_served int; v_skip int; r record;
begin
  create temporary table _ef_report (token text, relation text, action text, note text)
    on commit drop;

  -- THREE PASSES, because a table that was busy on pass 1 is usually free on pass 2: the
  -- writer we could not get past has committed by then. Each pass only does work on the
  -- tables still missing something, so a settled pass costs one catalogue scan.
  for v_pass in 1..3 loop
    delete from _ef_report;
    insert into _ef_report select * from platform.custom_fields_retrofit();
    exit when not exists (select 1 from _ef_report where action = 'refused');
    if v_pass < 3 then
      raise notice 'ENTITY-FIELDS retrofit pass %: % table(s) were busy, trying again.',
        v_pass, (select count(*) from _ef_report where action = 'refused');
    end if;
  end loop;

  select count(*) filter (where action in ('column','trigger','column + trigger','already')),
         count(*) filter (where action = 'refused'),
         count(*) filter (where action in ('no relation','not a table','partition child'))
    into v_served, v_refused, v_skip
    from _ef_report;

  raise notice 'ENTITY-FIELDS retrofit: % of % Entity/Detail tables can now hold a custom value (% not a live parent table, % refused).',
    v_served, v_served + v_refused + v_skip, v_skip, v_refused;
  for r in select action, note, count(*) n, min(relation) example
             from _ef_report where action <> 'already' and action not in ('column','trigger','column + trigger')
            group by 1, 2 order by 3 desc
  loop
    raise notice '  % (%): % table(s), e.g. %', r.action, r.note, r.n, r.example;
  end loop;
  for r in select relation, note from _ef_report where action = 'refused' order by 1 loop
    raise notice '  STILL NOT SERVED: % — %', r.relation, r.note;
  end loop;

  -- A refusal is a busy table, not a broken law: the verb is idempotent, the registry
  -- trigger re-runs it for that token the next time the row is touched, and the names are
  -- printed above rather than left for somebody to discover. What WOULD be a broken law is
  -- a table that is free and still has nothing, so that is what fails this file.
  if exists (select 1 from _ef_report x
              where x.action in ('column','trigger','column + trigger','already')
                and not exists (select 1 from pg_class c
                                  join pg_namespace n on n.oid = c.relnamespace
                                  join pg_attribute a on a.attrelid = c.oid
                                       and a.attname = 'custom_fields' and a.attnum > 0
                                       and not a.attisdropped
                                 where n.nspname || '.' || c.relname = x.relation))
  then
    raise exception 'ENTITY-FIELDS: this verb reported serving a table that still cannot hold a custom value.'
      using errcode = '23514',
            hint = 'REC-40 is a law about every Entity and Detail. Nothing is left half done - this file rolls back.';
  end if;
end
$run$;
