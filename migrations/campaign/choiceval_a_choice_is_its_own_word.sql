-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- CHOICE-VALUE (1 of 4) — A CHOICE VALUE IS THE OPTION'S OWN WORD, NEVER A UUID.
--
-- WHAT IS WRONG TODAY, measured on the main database 2026-09-20: a list Field's value is the
-- OPTION RECORD'S ID. Lane STORE-T let a person TYPE the word ("Circle") and turned it into
-- that id on the way in — so writing works — but the id is what the row holds, and the id is
-- therefore what every read, every filter, every group-by, every export and every agent gets
-- back. The seventh independent pass wrote it up as T8's new failure: *"the record stores the
-- word the person typed as an internal id, so asking 'what columns does THIS record have'
-- answers without Radius"*. Eleven live choice cells: 8 hold a uuid, 3 hold an array of them.
--
-- THE CONTRACT is silent on the stored form. FLD-5 and FLD-6 say what an option IS — a Record
-- of a Table shown as a list, because every pick-list is already a Table — and they stay
-- exactly as they are. They do not say that the Table's PRIMARY KEY is what a cell holds.
--
-- SO THE CHAMPIONS DECIDE IT, and they agree. Airtable's API takes and returns the choice's
-- NAME and keeps an internal choice id so a rename rewrites no cell. Notion's select value is
-- {id, name, colour} and a rename is invisible to every stored page. Neither has ever asked a
-- caller to know a uuid for a word it showed them. So:
--
--   * an option record carries a STABLE KEY (`data.key`), slugged from its title when it is
--     born, unique within its options Table, and never rewritten — renaming "Circle" to
--     "Round" rewrites NO rows;
--   * a cell holds that key;
--   * a person or an agent may write the LABEL or the KEY (and, so nothing that works today
--     breaks, the option record's id — normalised on the way in, never required);
--   * the label is resolved at READ, by the doors (file 2 of this lane);
--   * retiring an option does not make a value vanish: it reads as the retired label with the
--     reason (file 2), and writing a retired choice ANEW is refused by name.
--
-- WHY `data.key` AND NOT `metadata`: `platform._metadata_guard` keeps metadata to a registry of
-- reserved keys that clients may not write, so an option a person adds through the ordinary
-- write door could never get one. WHY DECLARED AND NOT SMUGGLED: an undeclared key in a
-- document is exactly the "second-class" shape this campaign has twice recorded as invisible to
-- the delete rules and to the read door's masking. It is declared, and marked `kept_by_the_app`
-- the same way the options Table itself already is, so no person's column list grows.
--
-- FLD-5 ("only a title field") is about the shape a PERSON declares for a category, and T4
-- already has a category table grow columns and stay a category. The key is the store's own
-- bookkeeping and wears the app's mark.
--
-- THE INVERSE: migrations/inverse/choiceval_a_choice_is_its_own_word_down.sql.


-- based-on: custom._options_table_for(uuid, text, jsonb) e3ca600d1fe4b92a70f9d122090ca77748adf02b2fcac76106137a72d364dd3a
-- based-on: custom._resolve_choice_words() 07fa51cbdc2b1be73fca5683244165fa55f962b00959d84b2203f7c1c5edd76b
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 1c8ec0339bce9f6112c3e9bb4f8fcf7127b64628aed0c72b8e4dc65ae1d643d4
-- based-on: custom.applicable_fields(uuid, uuid, text) 30339eef417f73554114bfff7644d91a3c25869cfc3e662945e530d05e8962cf

set lock_timeout = '45s';
set statement_timeout = '600s';

-- ── 1. THE SLUG, AND THE KEY IT BECOMES ─────────────────────────────────────────────────

create or replace function custom.choice_slug(p_word text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- A word a person typed becomes a key a machine can hold on to. A title with nothing
  -- a-z0-9 in it at all (a Chinese or Arabic choice list) gets a SHORT HASH OF ITS OWN TITLE
  -- rather than a counter, so the key is still derived from the option and still stable.
  select coalesce(
           nullif(left(regexp_replace(regexp_replace(lower(btrim(coalesce(p_word, ''))),
                                                     '[^a-z0-9]+', '_', 'g'),
                                      '^_+|_+$', '', 'g'), 55), ''),
           'c_' || substr(md5(coalesce(btrim(p_word), '')), 1, 8));
$function$;

create or replace function custom.choice_key_for(p_organization_id uuid, p_options_table_id uuid,
                                                 p_title text, p_exclude uuid default null)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
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
$function$;

-- ── 2. WHAT THE STORE KNOWS ABOUT ONE TABLE'S CHOICES ───────────────────────────────────

create or replace function custom.choice_options(p_organization_id uuid, p_options_table_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
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
$function$;

create or replace function custom.choice_field_map(p_organization_id uuid, p_table_id uuid)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- field key -> {label, multi, options_table_id, options}. ONE call per table per request is
  -- what every door below is built on; a table with no list Field answers '{}' and every
  -- caller short-circuits on that.
  select coalesce(jsonb_object_agg(f.data ->> 'key', jsonb_build_object(
           'label',            coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
           'multi',            coalesce((f.data ->> 'multi')::boolean, false),
           'field_id',         f.id::text,
           'options_table_id', f.data -> 'config' ->> 'options_table_id',
           'options',          custom.choice_options(p_organization_id,
                                 (f.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and coalesce(f.data_class, '') <> 'kernel'
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'type' = 'list'
     and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null;
$function$;

-- ── 3. ONE TOKEN IN, ONE KEY OUT ────────────────────────────────────────────────────────

create or replace function custom.choice_key_of(p_field jsonb, p_token text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- THE KEY, THE LABEL OR THE OPTION'S ID — in that order, all case-insensitive. Returns
  -- null when the token names none of the choices, which is what every refusal below reads.
  select coalesce(
    (select e.key from jsonb_each(coalesce(p_field -> 'options', '{}'::jsonb)) e
      where lower(e.key) = lower(btrim(coalesce(p_token, ''))) limit 1),
    (select e.key from jsonb_each(coalesce(p_field -> 'options', '{}'::jsonb)) e
      where lower(e.value ->> 'label') = lower(btrim(coalesce(p_token, ''))) limit 1),
    (select e.key from jsonb_each(coalesce(p_field -> 'options', '{}'::jsonb)) e
      where e.value ->> 'id' = btrim(coalesce(p_token, '')) limit 1));
$function$;

create or replace function custom.choice_words(p_field jsonb)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  -- The live choices, in the words a person reads, for a refusal that says where to get them.
  select string_agg('"' || (e.value ->> 'label') || '"', ', ' order by e.value ->> 'label')
    from jsonb_each(coalesce(p_field -> 'options', '{}'::jsonb)) e
   where not coalesce((e.value ->> 'retired')::boolean, false);
$function$;

create or replace function custom.choice_synonyms(p_organization_id uuid, p_table_id uuid, p_token text)
returns text[]
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- EVERY WAY OF SAYING THE SAME CHOICE: what was asked, its key, its label, its option id.
  -- `applies_to_types` on a Field or a Rule was written by whoever declared it — in words, in
  -- keys, or (before this lane) in ids — and T8 turns on the type field's stored value finding
  -- them all. This is how a Field that says it applies to "Circle" is found by a record whose
  -- type value is `circle`.
  select array(
    select distinct s from (
      select btrim(coalesce(p_token, '')) as s
      union all
      select k from (
        select custom.choice_key_of(e.value, p_token) as k
          from jsonb_each(custom.choice_field_map(p_organization_id, p_table_id)) e) q
       where q.k is not null
      union all
      select v from (
        select custom.choice_field_map(p_organization_id, p_table_id)
                 -> e.key -> 'options' -> custom.choice_key_of(e.value, p_token) ->> w as v
          from jsonb_each(custom.choice_field_map(p_organization_id, p_table_id)) e,
               unnest(array['label', 'id']) w) q2
       where q2.v is not null) u
     where s is not null and s <> '');
$function$;

-- ── 6. A NEW CHOICE LIST IS BORN WITH KEYS ──────────────────────────────────────────────

create or replace function custom._options_table_for(p_organization_id uuid, p_label text, p_options jsonb)
 returns uuid
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
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

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.field_kernel_id(), jsonb_build_object(
    'key', 'title', 'label', 'Choice', 'type', 'text',
    'multi', false, 'dated', false, 'required', false, 'sort', 10,
    'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'depends_on', '[]'::jsonb, 'entity_definition_id', v_table));

  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, custom.field_kernel_id(), jsonb_build_object(
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
$function$;

-- ── 7. THE TRIGGER: A CHOICE ARRIVES AS A WORD AND IS STORED AS ITS KEY ─────────────────

create or replace function custom._resolve_choice_words()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
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
$function$;

-- ── 8. THE VALIDATOR JUDGES A KEY, NOT AN ID ────────────────────────────────────────────
-- Only the `list` arm and the type-field synonyms change; every other arm is byte-for-byte
-- what it was.

create or replace function custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  d        jsonb;
  v_label  text;
  v_key    text;
  v_type   text;
  v_multi  boolean;
  v_val    jsonb;
  v_one    jsonb;
  v_items  jsonb;
  v_n      integer;
  v_rule   jsonb;
  v_kind   text;
  v_other  jsonb;
  v_table  uuid;
  v_map    jsonb;
  v_field  jsonb;
  v_types  text[];
begin
  if p_fields is null or array_length(p_fields, 1) is null then
    return;
  end if;

  -- CHOICE-VALUE. The type field's value is the option's KEY now, and `applies_to_types` was
  -- written by whoever declared the Field or the Rule - in words, in keys, or (before this
  -- lane) in option ids. All three name the same choice, so all three are asked. This is what
  -- keeps T8's Square rule attached to the square.
  v_table := (p_fields[1].data ->> 'entity_definition_id')::uuid;
  v_map   := case when v_table is null then '{}'::jsonb
                  else custom.choice_field_map(p_organization_id, v_table) end;
  v_types := case when p_record_type is null or v_table is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, v_table, p_record_type) end;

  foreach f in array p_fields loop
    d       := f.data;
    v_key   := d ->> 'key';
    v_label := coalesce(nullif(d ->> 'label', ''), v_key);
    v_type  := d ->> 'type';
    v_multi := coalesce((d ->> 'multi')::boolean, false);
    v_val   := p_values -> v_key;

    -- REQUIRED. An absent key and a null value are the same absence and are said the same way.
    if v_val is null or jsonb_typeof(v_val) = 'null'
       or (v_multi and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      if coalesce((d ->> 'required')::boolean, false) then
        raise exception '% is required', v_label
          using errcode = '23514', hint = format('REC-51: the field %s of this table.', v_key);
      end if;
      continue;
    end if;

    -- A FORMULA IS NEVER WRITTEN BY HAND (FLD-9): the declaration says who computes it.
    if v_type = 'formula' then
      raise exception '% is worked out by the system, so it cannot be typed in', v_label
        using errcode = '23514',
              hint = format('FLD-9: this formula computes on %s.', coalesce(d ->> 'compute_on', 'write'));
    end if;

    -- MULTI (FLD-2) is about the SHAPE of the value, never about the behavior.
    if v_multi then
      if jsonb_typeof(v_val) <> 'array' then
        raise exception '% holds many values, so it takes a list', v_label
          using errcode = '23514', hint = 'FLD-2: the multi modifier.';
      end if;
      v_items := v_val;
    else
      if jsonb_typeof(v_val) = 'array' then
        raise exception '% holds one value, and it was given a list', v_label
          using errcode = '23514', hint = 'FLD-2: multi is off for this field.';
      end if;
      v_items := jsonb_build_array(v_val);
    end if;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      -- TYPE.
      if v_type = 'text' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes words, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: text.';
        end if;
      elsif v_type = 'range' then
        if jsonb_typeof(v_one) = 'number' then
          null;
        elsif jsonb_typeof(v_one) = 'string'
              and coalesce(d -> 'config' ->> 'kind', 'number') in ('date', 'datetime') then
          begin
            perform (v_one #>> '{}')::timestamptz;
          exception when others then
            raise exception '% takes a date, and % is not one', v_label, v_one #>> '{}'
              using errcode = '23514', hint = 'FLD-1: range, of kind date.';
          end;
        else
          raise exception '% takes a number, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: range.';
        end if;
      elsif v_type = 'list' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes one of its choices, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-5 / FLD-6: a list field stores the option''s own KEY - a short stable word - because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is the KEY of an option of this Field's own Table.
        -- A RETIRED option's key passes here ON PURPOSE: a record that already holds one has
        -- to stay editable when somebody changes a different column. Picking a retired choice
        -- ANEW is refused by custom._resolve_choice_words, which is the only place that can
        -- tell a new pick from a value that was already there.
        v_field := v_map -> v_key;
        if v_field is null
           or not (coalesce(v_field -> 'options', '{}'::jsonb) ? (v_one #>> '{}')) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target exists, in this organization, in the declared table.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not exists (
          select 1 from custom.record t
           where t.organization_id = p_organization_id
             and t.id = (v_one #>> '{}')::uuid
             and t.table_id = (d ->> 'relation_target')::uuid
             and t.deleted_at is null) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51: a relation field points at a live record of the table it declared.';
        end if;
      end if;

      -- FLD-3: the attached validation Rules, read through the ONE seam.
      -- FLD-10 says the type field selects which Fields AND RULES apply, so a Rule carries
      -- its own applies_to_types: T8's Width applies to a rectangle and to a square, and the
      -- "the sides are equal" Rule attached to it applies to the SQUARE alone. A Rule with an
      -- empty list applies wherever its Field does.
      for v_rule in select r from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r loop
        if jsonb_array_length(coalesce(v_rule -> 'applies_to_types', '[]'::jsonb)) > 0
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ?| v_types) then
          continue;
        end if;
        v_kind := v_rule ->> 'kind';
        if v_kind = 'min' and jsonb_typeof(v_one) = 'number'
           and (v_one #>> '{}')::numeric < (v_rule ->> 'value')::numeric then
          raise exception '% has to be at least %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'max' and jsonb_typeof(v_one) = 'number'
              and (v_one #>> '{}')::numeric > (v_rule ->> 'value')::numeric then
          raise exception '% cannot be more than %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          raise exception '% is not written the way this field expects', v_label
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'equals_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and jsonb_typeof(v_other) <> 'null' and v_other <> v_one then
            raise exception '% and % have to be the same', v_label, v_rule ->> 'value'
              using errcode = '23514',
                    hint = 'FLD-3 / T8: a constraint across two fields is a Rule attached to one of them, never a behavior.';
          end if;
        elsif v_kind = 'differs_from_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and v_other = v_one then
            raise exception '% and % have to be different', v_label, v_rule ->> 'value'
              using errcode = '23514', hint = 'FLD-3.';
          end if;
        end if;
      end loop;
    end loop;

    -- RELATION MAX, once per field rather than once per item.
    if v_type = 'relation' and v_multi then
      v_n := jsonb_array_length(v_items);
      if v_n > coalesce((d ->> 'relation_max')::integer, v_n) then
        raise exception '% points at % things, and it can point at % at most',
                        v_label, v_n, d ->> 'relation_max'
          using errcode = '23514', hint = 'REC-51: relation_max.';
      end if;
    end if;
  end loop;
end;
$function$;

-- ── 9. WHICH COLUMNS THIS RECORD HAS — T8's OWN CLAUSE ──────────────────────────────────

create or replace function custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
 returns setof custom.record
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_types text[];
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  return query
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types));
end $function$;
