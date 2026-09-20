-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._field_shape_guard() 8232769a705903723d0f46726edc2454184381d8d8729a477a53237731fbda44
--
-- STORE-T / T8 + B1 — A CHOICE IS A WORD, AND UNIQUE MEANS UNIQUE.
--
-- T8, MEASURED FROM A SIGNED-IN SEAT on 2026-09-20. A Shape table with a Choice column "Kind"
-- carrying Circle, Rectangle and Square. Writing `{"kind":"Circle"}` through the write door is
-- refused: *"Kind was given a choice that is not one of its choices"*, hinted with *"stores the
-- id of an option record, and what it was given is not an id at all"*. The sixth pass's words:
-- "nothing in the refusal says where to get the ids. The Square rule was never reached." The
-- store is right that a choice is a RECORD (FLD-5/FLD-6) — every pick list is a Table — but
-- that is the store's business, not the caller's. A person picks "Circle"; an agent writes
-- "Circle"; an import file says "Circle". Nothing but this store has ever asked a caller to
-- know a uuid for a word it showed them.
--
-- B1, MEASURED THE SAME WAY. Asking for a column to be unique is refused at declaration time:
-- *"the field Code carries a rule of kind unique, which this validator cannot execute"* —
-- `custom._field_shape_guard` ships a CLOSED set of rule kinds and `unique` is not in it. So
-- there was no uniqueness anywhere to test, and two sessions writing the same value both won.
-- This is class (c): never built.
--
-- BOTH ARE FIXED AS TRIGGERS ON `custom.record`, because both are properties of the STORE and
-- not of one door: every door, every import, every agent write and every automation arrives
-- here, and a rule that lived in `custom.record_write` would be a rule the import door did not
-- have. Trigger names decide the order — `custom_record_choice_words` sorts before
-- `custom_record_field_validation`, so the word is already an id by the time the validator
-- judges it, and `zzzz_unique_rule_holds` sorts after every other BEFORE trigger, so it judges
-- the final document.
--
-- WHAT UNIQUENESS IS MADE OF, said plainly. B1 asks for the refusal to carry "the database's
-- own unique-index name". `custom.record` is HASH-PARTITIONED on `organization_id` with a
-- primary key of `(organization_id, id)`, so a unique index enforcing one field's values would
-- be one expression index per field, created with ACCESS EXCLUSIVE on a live 16-partition
-- table — lane TABLE-DELETE already measured that dying on `lock_timeout` under ordinary
-- traffic. So this is a transaction-scoped ADVISORY LOCK on (organization, table, field, value)
-- plus the existence check, which delivers the BEHAVIOUR B1 specifies exactly — the second
-- session blocks until the winner commits and is then refused by name, and no second row
-- exists — and does not deliver the index's NAME. That is stated here rather than implied, and
-- the refusal says "the store" rather than naming an index that is not there.

-- ── THE CHOICE A PERSON TYPED ───────────────────────────────────────────────────────────
create function custom._resolve_choice_words()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  f        record;
  v_key    text;
  v_label  text;
  v_opts   uuid;
  v_val    jsonb;
  v_one    jsonb;
  v_word   text;
  v_id     uuid;
  v_out    jsonb;
  v_items  jsonb;
  v_new    jsonb;
  v_choices text;
begin
  -- Only ordinary records of an ordinary Table. A Field, a Rule, a Table or a kernel row has
  -- no choices of its own to resolve.
  if new.table_id is null or new.data_class = 'kernel'
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  for f in
    select r.data as d from custom.record r
     where r.organization_id = new.organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null
       and r.data_class <> 'kernel'
       and (r.data ->> 'entity_definition_id')::uuid = new.table_id
       and r.data ->> 'type' = 'list'
  loop
    v_key  := f.d ->> 'key';
    v_label := coalesce(nullif(f.d ->> 'label', ''), v_key);
    v_opts := nullif(f.d -> 'config' ->> 'options_table_id', '')::uuid;
    v_val  := new.data -> v_key;
    if v_opts is null or v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) <> 'string' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      v_word := btrim(v_one #>> '{}');
      -- Already an id: left exactly as it is, so nothing that works today changes.
      if v_word ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;
      select o.id into v_id
        from custom.record o
       where o.organization_id = new.organization_id
         and o.table_id = v_opts
         and o.deleted_at is null
         and lower(btrim(o.data ->> 'title')) = lower(v_word)
       order by o.created_at
       limit 1;
      if v_id is null then
        -- REFUSED WITH THE CHOICES THEMSELVES. The sixth pass's complaint was that the refusal
        -- never said where to get them; here they are, in the words the person typed in.
        select string_agg('"' || (o.data ->> 'title') || '"', ', ' order by o.created_at)
          into v_choices
          from custom.record o
         where o.organization_id = new.organization_id
           and o.table_id = v_opts
           and o.deleted_at is null;
        raise exception '% does not have a choice called "%".', v_label, v_word
          using errcode = '23514',
                hint = format('The choices for %s are %s. Pick one of those, or add "%s" to the column''s list of choices first.',
                              v_label, coalesce(v_choices, 'not set up yet'), v_word);
      end if;
      v_out := v_out || jsonb_build_array(to_jsonb(v_id::text));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(v_key, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger custom_record_choice_words
  before insert or update on custom.record
  for each row execute function custom._resolve_choice_words();

-- ── UNIQUE MEANS UNIQUE ─────────────────────────────────────────────────────────────────
create function custom._unique_rule_holds()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  f       record;
  v_key   text;
  v_label text;
  v_val   jsonb;
  v_text  text;
begin
  if new.table_id is null or new.data_class = 'kernel' or new.deleted_at is not null
     or new.table_id in (custom.field_kernel_id(), custom.table_kernel_id(),
                         custom.rule_kernel_id(), custom.merge_field_kernel_id()) then
    return new;
  end if;
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  for f in
    select r.data as d from custom.record r
     where r.organization_id = new.organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null
       and r.data_class <> 'kernel'
       and (r.data ->> 'entity_definition_id')::uuid = new.table_id
       and exists (select 1 from jsonb_array_elements(coalesce(r.data -> 'rules', '[]'::jsonb)) x
                    where x ->> 'kind' = 'unique')
  loop
    v_key   := f.d ->> 'key';
    v_label := coalesce(nullif(f.d ->> 'label', ''), v_key);
    v_val   := new.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;                     -- nothing written is not a duplicate of anything
    end if;
    v_text := lower(btrim(v_val #>> '{}'));
    if v_text is null or v_text = '' then
      continue;
    end if;

    -- THE LOCK IS THE WHOLE OF B1. Two sessions writing the same value at the same moment take
    -- the same advisory lock, which is held until whichever of them commits or rolls back. The
    -- loser then reads the winner's committed row and is refused. Transaction-scoped, so it is
    -- released by the commit itself and nothing can leak it.
    perform pg_advisory_xact_lock(
      hashtextextended(new.organization_id::text || '|' || new.table_id::text || '|' || v_key || '|' || v_text, 0));

    if exists (select 1 from custom.record x
                where x.organization_id = new.organization_id
                  and x.table_id = new.table_id
                  and x.deleted_at is null
                  and x.id <> new.id
                  and lower(btrim(x.data ->> v_key)) = v_text) then
      raise exception 'Another record here already has % "%", and % has to be different on every record.',
                      v_label, btrim(v_val #>> '{}'), v_label
        using errcode = '23505',
              hint = format('FLD-3 / B1: %s carries a rule that says its value is unique in this table. Change the value, or open the record that already holds it. Nothing was written.', v_label);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger zzzz_unique_rule_holds
  before insert or update on custom.record
  for each row execute function custom._unique_rule_holds();
