-- chair-step: the inverse of migrations/campaign/choiceval_the_key_is_system_state.sql AND of
--   choiceval_the_registry_row.sql. It puts the option's stable key back in `data.key` — where it
--   is a COLUMN, which breaks FLD-5 and turns `scripts/campaign-tests/w1_field_t4_t8.sql` red on
--   the kernel's own choice tables — restores the four bodies that read it there, and takes the
--   `option_key` registry row back out. Running this restores a contract violation, which is
--   what it is for.
--
-- 🚨 WHICH ONE RUNS, AND IN WHAT ORDER (lane INVERSE-GUARD, 2026-09-21).
-- The body this file restores calls custom.choice_field_map, custom.choice_key_of, custom.choice_words, and the sibling
-- inverse `choiceval_a_choice_is_its_own_word_down.sql` REMOVES
-- those functions. They are not two independent undos: they are two halves of one lane's
-- teardown, and the pair has exactly one safe order.
--   · THIS FILE ALONE is what puts THIS file's defect back, and it is what the red twin beside
--     it runs. custom.choice_field_map is still there, so the body it restores still resolves.
--   · `choiceval_a_choice_is_its_own_word_down.sql` is the DEEPER teardown — it takes
--     custom.choice_field_map itself away — so it may never run with this file's restore standing in
--     front of it. Run it on its own, against the lane's shipped bodies, never after this one.
-- Running the sibling FIRST and this one SECOND is the one order that leaves the access kernel
-- calling a function that is gone, and it is the order this note exists to forbid.
-- ground-standing-ok: b — the order above is stated, and neither half is run on top of the other.
--

set lock_timeout = '45s';
set statement_timeout = '600s';

update custom.record o
   set data = coalesce(o.data, '{}'::jsonb)
                || jsonb_build_object('key', o.metadata ->> 'option_key'),
       metadata = coalesce(o.metadata, '{}'::jsonb) - 'option_key'
 where coalesce(o.metadata ->> 'option_key', '') <> '';

update custom.record f set deleted_at = null
 where f.table_id = custom.field_kernel_id()
   and f.deleted_at is not null
   and f.data ->> 'key' = 'key'
   and coalesce((f.data ->> 'kept_by_the_app')::boolean, false);

delete from platform.metadata_reserved_keys where key = 'option_key' and table_token = 'record';

CREATE OR REPLACE FUNCTION custom.choice_options(p_organization_id uuid, p_options_table_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- key -> {label, id, retired, reason}. RETIRED OPTIONS ARE IN HERE: a value that points at
  -- one must read as its label with the reason, not disappear. Live rows are aggregated LAST
  -- so that if a retired option and a live one ever shared a key, the live one wins.
  select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
    from (select coalesce(nullif(o.data ->> 'key', ''), custom.choice_slug(o.data ->> 'title')) as k,
                 jsonb_build_object(
                   'label',   coalesce(nullif(o.data ->> 'title', ''),
                                       nullif(o.data ->> 'name', ''),
                                       coalesce(nullif(o.data ->> 'key', ''), '(unnamed choice)')),
                   'id',      o.id::text,
                   'retired', o.deleted_at is not null,
                   'reason',  case when o.deleted_at is not null
                                   then format('This choice was retired on %s. The value is kept and still means what it meant.',
                                               to_char(o.deleted_at at time zone 'utc', 'FMDD Month YYYY'))
                              end) as v
            from custom.record o
           where o.organization_id = p_organization_id
             and o.table_id = p_options_table_id
           order by (o.deleted_at is null), o.created_at) x;
$function$

;

CREATE OR REPLACE FUNCTION custom.choice_key_for(p_organization_id uuid, p_options_table_id uuid, p_title text, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_base text := custom.choice_slug(p_title);
  v_try  text;
  v_n    integer := 1;
begin
  v_try := v_base;
  -- RETIRED OPTIONS COUNT. A key is never handed out twice, because the values that still
  -- hold the retired one have to keep meaning what they meant.
  while exists (select 1 from custom.record o
                 where o.organization_id = p_organization_id
                   and o.table_id = p_options_table_id
                   and (p_exclude is null or o.id <> p_exclude)
                   and o.data ->> 'key' = v_try) loop
    v_n := v_n + 1;
    v_try := left(v_base, 50) || '_' || v_n;
  end loop;
  return v_try;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._resolve_choice_words()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on      boolean;
  v_map     jsonb;
  v_field   jsonb;
  v_key     text;
  v_label   text;
  v_val     jsonb;
  v_items   jsonb;
  v_one     jsonb;
  v_word    text;
  v_hit     text;
  v_out     jsonb;
  v_new     jsonb;
  v_before  text[];
  v_title   text;
  e         record;
begin
  -- THE SWITCH, BY NAME, BEFORE ANYTHING. While `custom/system_enabled` resolves false for this
  -- organization nothing of this store's product behaviour runs and the value is left exactly as
  -- the writer sent it. `custom._record_field_validation` already refuses a CLIENT write while
  -- the switch is off; this is the same rule for the owner-role writes it lets through — a
  -- backfill, a migration, a repair — so an organization whose store is off is byte-untouched by
  -- this lane. The read is the established one (`custom.store_is_open`,
  -- `custom._entity_custom_fields_guard` and `custom.containment_depth_ceiling` all make it):
  -- `platform.knob_resolve` answers jsonb and a switch this writer cannot read is CLOSED.
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean,
                     false);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  -- ── AN OPTION RECORD IS BORN WITH ITS KEY ───────────────────────────────────────────
  -- The store's own bookkeeping, done where every write arrives — the panel, the import,
  -- the agent and the ordinary write door all pass through here. A RENAME NEVER TOUCHES IT:
  -- the key is set when it is missing and never recomputed, which is the whole point.
  if new.table_id is not null
     and coalesce(new.data_class, '') not in ('kernel', 'relation', 'field', 'table', 'rule')
     and coalesce(new.data ->> 'key', '') = ''
     and exists (select 1 from custom.record f
                  where f.organization_id = new.organization_id
                    and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null
                    and f.data ->> 'type' = 'list'
                    and (f.data -> 'config' ->> 'options_table_id')::uuid = new.table_id) then
    v_title := coalesce(nullif(new.data ->> 'title', ''), nullif(new.data ->> 'name', ''));
    if v_title is not null then
      new.data := new.data || jsonb_build_object('key',
                    custom.choice_key_for(new.organization_id, new.table_id, v_title, new.id));
    end if;
  end if;

  -- Only ordinary records of an ordinary Table have choices of their own to resolve.
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;

  v_map := custom.choice_field_map(new.organization_id, new.table_id);
  if v_map = '{}'::jsonb then
    return new;
  end if;

  for e in select key as k, value as v from jsonb_each(v_map) loop
    v_key   := e.k;
    v_field := e.v;
    v_label := coalesce(nullif(v_field ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    -- The keys this cell already held, so that a record carrying a RETIRED choice can still
    -- be saved when somebody edits a different column. Only a NEW retired choice is refused.
    if tg_op = 'UPDATE' then
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_before
        from jsonb_array_elements(
               case when jsonb_typeof(old.data -> v_key) = 'array' then old.data -> v_key
                    when old.data -> v_key is null then '[]'::jsonb
                    else jsonb_build_array(old.data -> v_key) end) x
       where jsonb_typeof(x) = 'string';
    else
      v_before := '{}'::text[];
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      if v_word = '' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      v_hit := custom.choice_key_of(v_field, v_word);

      if v_hit is null then
        -- REFUSED WITH THE CHOICES THEMSELVES, in the words a person reads.
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label,
                              coalesce(custom.choice_words(v_field), 'not set up yet'),
                              v_word);
      end if;

      if coalesce((v_field -> 'options' -> v_hit ->> 'retired')::boolean, false)
         and not (v_hit = any (v_before)) then
        raise exception '% is no longer one of the choices for %.',
                        coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit), v_label
          using errcode = '23514',
                hint = format('It was retired, so it can no longer be picked. Records that already hold it keep it and still read as "%s". The choices now are %s.',
                              coalesce(v_field -> 'options' -> v_hit ->> 'label', v_hit),
                              coalesce(custom.choice_words(v_field), 'none — add one first'));
      end if;

      v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._options_table_for(p_organization_id uuid, p_label text, p_options jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_home  uuid;
  v_table uuid;
  v_slug  text;
  v_word  text;
begin
  v_slug := regexp_replace(lower(btrim(coalesce(p_label, 'choices'))), '[^a-z0-9]+', '_', 'g');
  v_slug := regexp_replace(v_slug, '^_+|_+$', '', 'g');
  if v_slug !~ '^[a-z]' then v_slug := 'c_' || v_slug; end if;
  v_slug := left(v_slug || '_choices_' || replace(gen_random_uuid()::text, '-', ''), 48);

  -- REC-1: a Table has to live somewhere, so it gets its own Home like any other.
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.person_kernel_id(),
          jsonb_build_object('name', coalesce(p_label, 'Choices') || ' choices Home'))
  returning id into v_home;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(p_label, 'Choices') || ' choices',
    'slug',           v_slug,
    'type',           'entity',
    'label_singular', 'Choice',
    'label_plural',   'Choices',
    -- FLD-5: a list Field takes its choices from a Table SHOWN AS A LIST.
    'display',        'list',
    'weight',         'light',
    'ordered',        true,
    'row_order',      'manual',
    'title_field',    'title',
    'retention_days', 365,
    'agent_writable', true,
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'title', 'direction', 'asc')),
    -- The stable key is declared here, beside the title, because a Field definition the Table
    -- does not declare is refused by custom._field_shape_guard.
    'fields',         jsonb_build_array(jsonb_build_object('name', 'title'),
                                        jsonb_build_object('name', 'key')),
    -- KEPT BY THE APP. The tables list already has a lane for the app's own
    -- bookkeeping; a person's list of tables must not fill up with one table
    -- per dropdown they made.
    'kept_by_the_app', true,
    'parent_id',      v_home))
  returning id into v_table;

  -- `'field'`, SAID OUT LOUD. These two inserts used to name no class, so the column
  -- defaulted to `'record'` and every dropdown anybody ever made left second-class Field
  -- rows behind — invisible to `custom.field_declare`'s duplicate check and to every other
  -- reader that asks for a Field by class. `custom._field_class_guard` now refuses that shape.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'title', 'label', 'Choice', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 10,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'entity_definition_id', v_table));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'key', 'label', 'Key', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 20,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'kept_by_the_app', true,
    'entity_definition_id', v_table));

  for v_word in select value #>> '{}' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data)
      values (p_organization_id, v_table,
              jsonb_build_object('title', btrim(v_word),
                                 'key', custom.choice_key_for(p_organization_id, v_table, btrim(v_word))));
    end if;
  end loop;

  return v_table;
end
$function$

;

