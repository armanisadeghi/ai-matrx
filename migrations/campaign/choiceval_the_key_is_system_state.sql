-- chair-step: it replaces `custom._resolve_choice_words`, a TRIGGER body on the live
--   `custom.record` table, AND moves rows - and a data backfill is in no enumerated additive
--   shape, so the production allow-list refuses it by name. Nothing is dropped and nothing is
--   revoked: four bodies are replaced, 68 option records move one key from `data` to `metadata`,
--   and the field definition that key used to need is RETIRED, not destroyed, because this store
--   has one delete verb and it is a retirement.
--
-- CHOICE-VALUE (6 of 6) - THE STABLE KEY IS SYSTEM STATE, NOT A COLUMN.
--
-- MEASURED BY ANOTHER LANE'S SUITE, 2026-09-20 07:26Z. `scripts/campaign-tests/w1_field_t4_t8.sql`
-- asserts FLD-5 of the kernel's own choice tables - "a category is a Record of a Table with
-- display: list and ONLY A TITLE FIELD" - and it went red on the Merge Field Source table the
-- moment file 1 of this lane declared a `key` column beside `name`. The suite is RIGHT and the
-- contract row is RIGHT; the mistake was this lane's, and it is corrected here rather than
-- argued with.
--
-- `custom.record.metadata` is what this store already calls system-owned keyed state, and
-- `platform._metadata_guard` keeps it to a registry no client may add to. So the option's stable
-- key moves there, as `metadata.option_key`:
--
--   * FLD-5 is byte-true again - a category has one field, its title;
--   * a CLIENT cannot forge one and cannot even try: `_metadata_guard` sorts before
--     `custom_record_choice_words`, so it judges what the caller sent (an unregistered metadata
--     key, which it refuses) and never what the trigger writes afterwards;
--   * a rename still rewrites no row, and now cannot even recompute: on UPDATE the trigger
--     CARRIES the key it already had rather than deriving it from the new title.
--
-- THE INVERSE: migrations/inverse/choiceval_the_key_is_system_state_down.sql.
--
-- based-on: custom.choice_options(uuid, uuid) b066b136e38585435d50a8ed011cb1456659c72ef48e5f339105be5b1dce5729
-- based-on: custom.choice_key_for(uuid, uuid, text, uuid) 2c208241b9b906c966d6848c939c2227ab4fbf1e07d3f0c65a99d2c00e60bd92
-- based-on: custom._resolve_choice_words() 3ed24f5a2141c72bfc5b7ba15b8cb2700e8c6f7eb0f132724157eacf17bbbff7
-- based-on: custom._options_table_for(uuid, text, jsonb) 07a8fa4c3633a5373986c1e5666ada20a6b5327eb1077d8d4c54d7b9395d9e4f

set lock_timeout = '45s';
set statement_timeout = '600s';

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
    from (select coalesce(nullif(o.metadata ->> 'option_key', ''),
                          custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name'))) as k,
                 jsonb_build_object(
                   'label',   coalesce(nullif(o.data ->> 'title', ''),
                                       nullif(o.data ->> 'name', ''),
                                       coalesce(nullif(o.metadata ->> 'option_key', ''), '(unnamed choice)')),
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
$function$;

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
                   and o.metadata ->> 'option_key' = v_try) loop
    v_n := v_n + 1;
    v_try := left(v_base, 50) || '_' || v_n;
  end loop;
  return v_try;
end;
$function$;

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
  -- IT LIVES IN `metadata`, WHICH IS WHAT THAT COLUMN IS FOR: system-owned, keyed system
  -- state, judged by `platform._metadata_guard` against a registry no client may add to. Two
  -- consequences, both deliberate. FLD-5 stays byte-true - a category is still a Record of a
  -- Table with ONE title field, and `w1_field_t4_t8.sql` asserts exactly that of the kernel's
  -- own choice tables. And a client CANNOT forge one: `_metadata_guard` sorts before
  -- `custom_record_choice_words`, so it judges what the CALLER sent (an unregistered key, which
  -- it refuses) and never what this trigger sets afterwards.
  -- ON UPDATE THE EXISTING KEY IS CARRIED, never recomputed: renaming an option must rewrite no
  -- row, and recomputing from the new title is exactly how that promise would be broken.
  if new.table_id is not null
     and coalesce(new.data_class, '') not in ('kernel', 'relation', 'field', 'table', 'rule')
     and exists (select 1 from custom.record f
                  where f.organization_id = new.organization_id
                    and f.table_id = custom.field_kernel_id()
                    and f.deleted_at is null
                    and f.data ->> 'type' = 'list'
                    and (f.data -> 'config' ->> 'options_table_id')::uuid = new.table_id) then
    if tg_op = 'UPDATE' and coalesce(old.metadata ->> 'option_key', '') <> '' then
      new.metadata := coalesce(new.metadata, '{}'::jsonb)
                        || jsonb_build_object('option_key', old.metadata ->> 'option_key');
    elsif coalesce(new.metadata ->> 'option_key', '') = '' then
      v_title := coalesce(nullif(new.data ->> 'title', ''), nullif(new.data ->> 'name', ''));
      if v_title is not null then
        new.metadata := coalesce(new.metadata, '{}'::jsonb)
                          || jsonb_build_object('option_key',
                               custom.choice_key_for(new.organization_id, new.table_id, v_title, new.id));
      end if;
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
$function$;

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
    -- FLD-5: ONE title field. The stable key is system state and lives in `metadata`.
    'fields',         jsonb_build_array(jsonb_build_object('name', 'title')),
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


  for v_word in select value #>> '{}' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    if btrim(coalesce(v_word, '')) <> '' then
      insert into custom.record (organization_id, table_id, data, metadata)
      values (p_organization_id, v_table,
              jsonb_build_object('title', btrim(v_word)),
              jsonb_build_object('option_key',
                custom.choice_key_for(p_organization_id, v_table, btrim(v_word))));
    end if;
  end loop;

  return v_table;
end
$function$;

-- ── THE OPTIONS THAT ALREADY HAVE A KEY IN THE WRONG PLACE ──────────────────────────────

update custom.record o
   set metadata = coalesce(o.metadata, '{}'::jsonb)
                    || jsonb_build_object('option_key', o.data ->> 'key'),
       data = o.data - 'key'
 where coalesce(o.data ->> 'key', '') <> ''
   and o.table_id in (
         select distinct (g.data -> 'config' ->> 'options_table_id')::uuid
           from custom.record g
          where g.organization_id = o.organization_id
            and g.table_id = custom.field_kernel_id()
            and g.deleted_at is null
            and g.data ->> 'type' = 'list'
            and nullif(g.data -> 'config' ->> 'options_table_id', '') is not null);

update custom.record t
   set data = jsonb_set(t.data, '{fields}',
                (select coalesce(jsonb_agg(e), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
                  where e ->> 'name' is distinct from 'key'))
 where t.table_id = custom.table_kernel_id()
   and exists (select 1 from jsonb_array_elements(coalesce(t.data -> 'fields', '[]'::jsonb)) e
                where e ->> 'name' = 'key')
   and t.id in (
         select distinct (g.data -> 'config' ->> 'options_table_id')::uuid
           from custom.record g
          where g.organization_id = t.organization_id
            and g.table_id = custom.field_kernel_id()
            and g.deleted_at is null
            and g.data ->> 'type' = 'list'
            and nullif(g.data -> 'config' ->> 'options_table_id', '') is not null);

update custom.record f
   set deleted_at = now()
 where f.table_id = custom.field_kernel_id()
   and f.deleted_at is null
   and f.data ->> 'key' = 'key'
   and coalesce((f.data ->> 'kept_by_the_app')::boolean, false)
   and (f.data ->> 'entity_definition_id')::uuid in (
         select distinct (g.data -> 'config' ->> 'options_table_id')::uuid
           from custom.record g
          where g.table_id = custom.field_kernel_id()
            and g.deleted_at is null
            and g.data ->> 'type' = 'list'
            and nullif(g.data -> 'config' ->> 'options_table_id', '') is not null);
