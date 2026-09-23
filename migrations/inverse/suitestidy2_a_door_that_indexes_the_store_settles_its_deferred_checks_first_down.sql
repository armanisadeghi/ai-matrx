-- Inverse of migrations/campaign/suitestidy2_a_door_that_indexes_the_store_settles_its_deferred_checks_first.sql — custom.promote_field exactly as it stood, then the helper dropped.
CREATE OR REPLACE FUNCTION custom.promote_field(p_organization_id uuid, p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  v_rows  bigint;
  v_key   text;
  v_expr  text;
  v_uniq  boolean;
  v_name  text;
  v_data  jsonb;
  v_kids  text[];
  v_kid   text;
  v_i     integer;
  v_t0    timestamptz := clock_timestamp();
begin
  -- B1: THE ORGANIZATION'S OWN SYSTEM SWITCH, not a second knob nobody turns on.
  -- custom.store_is_open resolves custom/system_enabled at the organization rung and, like
  -- every other reader of it, treats a switch it cannot READ as closed rather than open.
  v_on := custom.store_is_open(p_organization_id);
  if not v_on then
    raise exception 'promoting a field is switched off here'
      using errcode = '0A000',
            hint = 'This organization''s record store is switched off — custom/system_enabled resolves false for it. Nothing was built, and nothing was changed. Turn the store on for this organization on the switch screen (/administration/database/unified-data-ramp) and promote the field again; there is no separate switch for promotion.';
  end if;

  select f.data into v_data
    from custom.record f
   where f.organization_id = p_organization_id and f.id = p_field_id
     and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
  if v_data is null then
    raise exception 'that field does not belong to this organization' using errcode = '23503';
  end if;

  v_key  := v_data ->> 'key';
  v_uniq := coalesce((v_data ->> 'unique')::boolean, false);
  v_expr := custom.promoted_index_expr(v_data);
  v_name := custom.promoted_index_name(p_table_id, v_key, v_uniq);

  if v_expr is null then
    raise exception 'the field % cannot be promoted: %', v_key,
      (select why_not from custom.promoted_fields(p_organization_id, p_table_id) x where x.field_id = p_field_id)
      using errcode = '0A000',
            hint = 'REC-N-3: a promoted Field is indexed by the path its own storage uses, and this one has none.';
  end if;

  -- Ruling (e): ROUTE A is the SMALL-Table route and says so rather than freezing sixteen
  -- partitions for every organization in the store.
  select count(*) into v_rows from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null;
  if v_rows > custom.promotion_inline_ceiling() then
    raise exception 'this table has % records, which is more than the % this route builds in one go', v_rows, custom.promotion_inline_ceiling()
      using errcode = '53400',
            hint = 'Run the statements custom.promoted_index_ddl(organization, table) returns instead: they build each partition without blocking anybody, and they have to run one at a time rather than inside a transaction.';
  end if;

  execute format('create %s index if not exists %I on custom.record (organization_id, %s) where table_id = %L::uuid and deleted_at is null',
                 case when v_uniq then 'unique' else '' end, v_name, v_expr, p_table_id);

  -- 🚨 REC-N-12 IS ABOUT THE NAME A PERSON READS, AND ROUTE A DOES NOT GIVE THEM ONE.
  -- `CREATE INDEX` on a partitioned parent creates one index per partition and NAMES THEM
  -- ITSELF: `record_p09_organization_id_expr_idx1`. That is the string the database quotes at
  -- whoever loses a concurrent duplicate write, and it carries no field key, no table and
  -- nothing anybody can act on — so the whole reason `custom.promoted_index_name` keeps the
  -- field key in the name is lost on the one path that matters. MEASURED 2026-09-17: the
  -- duplicate refusal read `duplicate key value violates unique constraint
  -- "record_p09_organization_id_expr_idx1"`. The children are therefore renamed to the same
  -- convention ROUTE B builds them under — `<parent>_NN` — so both routes leave one index
  -- naming scheme and the refusal says which field it is about, whichever route built it.
  -- The names are collected BEFORE any rename: renaming inside the walk would reorder it.
  select array_agg(c.relname order by c.relname) into v_kids
    from pg_inherits i join pg_class c on c.oid = i.inhrelid
   where i.inhparent = format('custom.%I', v_name)::regclass;
  for v_i in 1 .. coalesce(array_length(v_kids, 1), 0) loop
    v_kid := left(v_name, 52) || '_' || lpad(v_i::text, 2, '0');
    if v_kids[v_i] is distinct from v_kid then
      execute format('alter index custom.%I rename to %I', v_kids[v_i], v_kid);
    end if;
  end loop;

  return jsonb_build_object(
    'field_key', v_key, 'index_name', v_name, 'unique', v_uniq, 'expression', v_expr,
    'records', v_rows, 'rows_moved', 0, 'route', 'A (in one transaction, under the inline ceiling)',
    'partition_indexes', coalesce(array_length(v_kids, 1), 0),
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end $function$

;
drop function if exists platform.settle_deferred_checks(regclass, boolean);
