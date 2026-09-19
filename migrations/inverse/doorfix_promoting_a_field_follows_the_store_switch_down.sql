-- chair-step: DOOR-FIX 4's inverse — the four promotion guards read custom/field_index_guard
-- again. Running it puts defect B1 back: promote_field refuses everywhere, because that knob
-- has no override anywhere on this database. The knob row's label (DOOR-FIX 4b) is left saying
-- it is retired; run this and it is not, so change it back by hand if you mean to keep it.


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
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;
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
end $function$;

CREATE OR REPLACE FUNCTION custom.promoted_index_ddl(p_organization_id uuid, p_table_id uuid)
 RETURNS TABLE(step integer, purpose text, statement text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  f       record;
  v_part  record;
  v_n     integer := 0;
  v_scope text;
begin
  -- THE GUARD, and it is on the GENERATOR rather than on the expression function: ruling (a).
  -- `custom.store_is_open()`'s pattern, one knob along: a switch this caller cannot read is
  -- CLOSED, and it says so with the key and the remedy rather than returning an empty set
  -- that reads like "this Table has no promoted fields".
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;

  if not v_on then
    raise notice 'This organization''s record store is switched off (custom/system_enabled), so no promoted-field index DDL is generated. Turn the store on for this organization on the switch screen and ask again; there is no separate switch for promotion.';
    return;
  end if;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) loop
    if not f.indexable then
      v_n := v_n + 1;
      return query select v_n, 'skipped: ' || f.field_key,
                          '-- ' || f.field_key || ': ' || f.why_not;
      continue;
    end if;

    -- REC-N-1: organization_id LEADS, and the index is scoped to its own Table. REC-N-12's
    -- unique index is the same index with UNIQUE — scoped to organization, Table and Field,
    -- and `organization_id` is already the partition key, which is what a unique index on a
    -- partitioned table is required to include.
    v_scope := format('(organization_id, %s) where table_id = %L::uuid and deleted_at is null',
                      f.index_expr, p_table_id);

    -- ROUTE B, statement 1: the parent index, ON ONLY. Instant — it indexes no rows and stays
    -- `indisvalid = false` until the sixteenth child is attached.
    v_n := v_n + 1;
    return query select v_n, 'parent index (ON ONLY, invalid until every partition attaches)',
      format('create %s index if not exists %I on only custom.record %s;',
             case when f.is_unique then 'unique' else '' end, f.index_name, v_scope);

    -- ROUTE B, statement 2..n: one CONCURRENTLY per partition, then its ATTACH. These do not
    -- block writers, and they CANNOT run inside a transaction block — the Migration runs them
    -- with autocommit (§4.9).
    for v_part in
      select c.relname, row_number() over (order by c.relname) as ord
        from pg_inherits i
        join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'custom.record'::regclass
       order by c.relname
    loop
      v_n := v_n + 1;
      return query select v_n, format('partition %s: build without blocking writers', v_part.relname),
        format('create %s index concurrently if not exists %I on custom.%I %s;',
               case when f.is_unique then 'unique' else '' end,
               left(f.index_name, 52) || '_' || lpad(v_part.ord::text, 2, '0'),
               v_part.relname, v_scope);
      v_n := v_n + 1;
      return query select v_n, format('partition %s: attach', v_part.relname),
        format('alter index custom.%I attach partition custom.%I;',
               f.index_name, left(f.index_name, 52) || '_' || lpad(v_part.ord::text, 2, '0'));
    end loop;
  end loop;

  if v_n = 0 then
    raise notice 'no Field of this Table is declared promoted, so there is nothing to build.';
  end if;
  return;
end $function$;

CREATE OR REPLACE FUNCTION custom.work_slots_declare(p_organization_id uuid, p_name text, p_slug text, p_home_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  v_table uuid;
  v_field uuid;
  v_home  uuid := coalesce(p_home_id, custom.table_kernel_id());
  v_promo jsonb;
  v_t0    timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slots_declare');

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    raise exception 'slots cannot be declared here yet: the database cannot be asked to decide a double-booking'
      using errcode = '0A000',
            hint = 'REC-71 / REC-N-12: a slot is kept single by a UNIQUE index on its key, and this organization''s record store is switched off (custom/system_enabled), so no index can be built. Nothing was created. Turn the store on for this organization on the switch screen and declare the slots again.';
  end if;

  if p_slug is null or p_slug !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a slot table needs a slug made of lower-case letters, digits and underscores, and this one says %',
                    coalesce(p_slug, 'nothing')
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(nullif(btrim(p_name), ''), 'Slots'),
    'slug',           p_slug,
    'type',           'entity',
    'label_singular', 'Hold',
    'label_plural',   'Holds',
    'title_field',    'slot_key',
    'display',        'page',
    'weight',         'light',
    'ordered',        false,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'expires_at', 'direction', 'asc')),
    'agent_writable', false,
    'retention_days', 365,
    'work_kind',      'slot',
    'fields', jsonb_build_array(jsonb_build_object('name', 'slot_key'),
                                jsonb_build_object('name', 'holder'),
                                jsonb_build_object('name', 'expires_at')),
    'parent_id',      v_home::text))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'slot_key', 'label', 'Slot', 'sort', 10, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', true, 'unique', true, 'entity_definition_id', v_table::text))
  returning id into v_field;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'holder', 'label', 'Held by', 'sort', 20, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'expires_at', 'label', 'Held until', 'sort', 30, 'type', 'range',
    'parity_type', 'datetime', 'config', jsonb_build_object('kind', 'datetime'),
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  -- REC-N-12's index, built by W1-INDEX's own verb. `promote_field` cannot be called from
  -- inside a query that is itself scanning `custom.record` (measured by W1-INDEX), which is
  -- why the Field's id came back from its own INSERT above rather than from a sub-select.
  v_promo := custom.promote_field(p_organization_id, v_table, v_field);

  return jsonb_build_object(
    'table_id',      v_table,
    'slot_field_id', v_field,
    'index_name',    v_promo ->> 'index_name',
    'unique',        (v_promo ->> 'unique')::boolean,
    'fields_created', 3,
    'records_created', 0,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$;

CREATE OR REPLACE FUNCTION custom._promoted_field_cap_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_n     integer;
  v_open  boolean;
begin
  -- THE SWITCH NEVER REMOVES A CHECK (the `w1_val_validation_reads_its_switch.sql` pattern).
  -- `custom/field_index_guard` is READ here and named in the refusal, so a person who meets
  -- the cap knows which switch governs promotion — but the cap is refused whether it is on
  -- or off. A cap that lifts when a flag is off is not a cap; it is a cap-shaped comment.
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', new.organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;

  if new.table_id is distinct from custom.field_kernel_id()
     or new.data_class = 'kernel'
     or not coalesce((new.data ->> 'promoted')::boolean, false) then
    return new;
  end if;

  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_table is null then
    return new;   -- a Field of a STANDARD table (FLD-8's table_token) has no custom Table cap
  end if;

  select count(*) into v_n
    from custom.record f
   where f.organization_id = new.organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.id is distinct from new.id
     and coalesce((f.data ->> 'promoted')::boolean, false)
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = v_table;

  if v_n >= custom.promoted_field_cap() then
    raise exception 'this table already has % fields set up for fast sorting and searching, which is as many as it can have',
                    custom.promoted_field_cap()
      using errcode = '23514',
            hint = format('REC-N-5: %s promoted fields per table, published rather than discovered. Take one off another field first. (The switch that governs promotion here is custom/field_index_guard, and it is currently %s — the cap holds either way.)',
                          custom.promoted_field_cap(), case when v_open then 'on' else 'off' end);
  end if;

  return new;
end $function$;
