-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._card_words(uuid, text, text) 90d40da65cb2226fc41d20c942d0861440dbefd99fbe986b50b411904016a760
-- based-on: custom.record_words(uuid, uuid, text) 0be6e865382c8a86f911e07daf4933945f9cd0b33be3b08b2fc305c1a64889fd
-- based-on: custom._field_document_for(uuid, uuid, jsonb) 87c25663abe1f46acff11c41467d19727d12b60f2fad97f7c43d51858ac7f863
-- based-on: custom.field_update(uuid, uuid, jsonb) ab21cf93f15d38fa48fb525c875e3bc282f4a27215cee12290626939ef2e1007
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- A RELATION SAYS WHICH WORDS IT SHOWS — ONE STORED VALUE, ONE RESOLVER, AND NOW A
-- PER-COLUMN OVERRIDE THAT CAN JOIN SEVERAL COLUMNS INTO ONE STRING.
-- lane RELATION-DISPLAY · 2026-09-21
--
-- THE OWNER'S RULING (2026-09-21): a column that offers choices from ANOTHER table is a
-- relation; the stored value is always the id; what is DISPLAYED is resolved by ONE
-- primitive. His worked example is a Jobs table pointing at Customers, where the chip
-- should read "first name" + " " + "last name" — two columns of the target, joined —
-- and not whatever single column that Table happens to be titled by.
--
-- WHAT EXISTED BEFORE THIS FILE, measured on the main database 2026-09-21:
--   · a Table has ONE stored default reference column, `title_field` (REC-2);
--   · `custom.record_words` (TAILS-2, 2026-09-21) is the one resolver, used by thirteen
--     readers, and it reads that `title_field` and then a fixed chain of conventional
--     names — `title`, `name`, `label`, `full_name`, `company`, `subject` — and then the
--     first words the record holds;
--   · so EVERY relation column pointing at a Table displayed the SAME column, and a Table
--     whose people are stored as `first_name` + `last_name` could show only one of them.
--     There was no per-field override anywhere in the store, and no way to join two
--     columns into one string at all.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE WRITES
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- 1. `custom._words_for(org, record_id, display, noun, hop)` — THE ONE RESOLVER. Every
--    existing front door becomes a one-liner onto it, so there is exactly one body that
--    decides what a record is called and it is tested once and hardened once:
--
--       custom.record_words(org, id, noun)   -> custom._words_for(org, id, NULL, noun, 0)
--       custom._card_words(org, value, noun) -> custom._words_for(org, value::uuid, NULL, noun, 0)
--       custom.relation_words(org, field, value)        -> the FIELD's display spec
--       custom.relation_words_many(org, field, ids[])   -> the same, batched per page
--
--    NOTHING gets a second path. `record_words` and `_card_words` keep their exact
--    signatures, so all thirteen readers TAILS-2 fixed inherit this without being touched
--    — which is also why this file replaces bodies rather than adding a defaulted
--    parameter: an overload would make every existing three-argument call ambiguous
--    (42725), and dropping the old one is not additive.
--
--    The order it answers in is TAILS-2's order, unchanged, with the override inserted
--    where the Table's own column used to be the only answer:
--      a. THE LADDER DECIDES BEFORE THE NAME IS READ. Naming a record is disclosing it,
--         and every caller of this function runs inside a SECURITY DEFINER door where
--         nothing else would stop it. A reader who may not open the record gets
--         `platform.relation_withheld_label()` — the withheld sentence, never the name and
--         never the id. A principal-less caller (a trigger, the store owner, a background
--         run) is not a seat and is not gated.
--      b. the columns the FIELD named, in order, joined by its separator;
--      c. failing that (the field named none, or the record holds nothing in the ones it
--         did), the Table's own `title_field`, then the conventional names, then the first
--         words the record holds — never a uuid-shaped one;
--      d. ONE HOP, and then it says it does not know. A display column that is ITSELF a
--         relation reads as that record's own words — once. `p_hop` is the cap and it is
--         an integer, not a convention: at hop 1 a value that is still an id reads as
--         "an untitled <noun>" rather than being followed. A door that followed relations
--         forever is a recursion a person waits on, and the hop the resolver does take is
--         itself gated by (a), so one hop discloses nothing the first hop did not.
--
-- 2. `custom._display_spec_for(org, target_table_id, raw)` — the ONE judge of a display
--    spec, and the only place its shape is decided. It takes what a caller reaches for —
--    a bare column name, a list of them, or the full object — and normalises all three to
--
--        {"columns": ["first_name", "last_name"], "separator": " "}
--
--    ABSENT MEANS TODAY'S BEHAVIOUR. A field with no `display` key is resolved exactly as
--    it was yesterday, through the Table's `title_field`. Nothing in the store changes
--    shape for a column nobody has given a spec to, which is why this file is additive in
--    behaviour as well as in DDL.
--
--    EVERY COLUMN MUST EXIST ON THE TARGET, and the refusal NAMES the one that does not
--    and lists the ones that do. A display spec that points at a column nobody has is the
--    same class of defect as a relation pointing at a uuid that names nothing, which
--    RELATION-DECLARE closed on 2026-09-20 — accepted silently, and then every reader
--    downstream has to guess what it meant.
--
-- 3. `custom._with_display(org, document, spec)` — the one line every relation arm of
--    `custom._field_document_for` now returns through. The three arms that build a
--    relation (a caller's own `relation` naming its target, `member` at the Person kernel,
--    `attachment` at the File kernel) are NOT patched one by one: all three `return d;`
--    sites become `return custom._with_display(p_organization_id, d, p_spec);`, and the
--    function is a no-op for every document that is not a relation. So a new relation type
--    cannot be added later that forgets to carry a display spec — it inherits it by
--    standing on the same return.
--
--    A `display` on a column that is NOT a relation is REFUSED BY NAME rather than
--    silently dropped ("a door that quietly ignores what it was told" is the exact defect
--    SHARE-OUT left behind on `compute_on` and TAILS-2 closed on 2026-09-21).
--
-- 4. `custom.field_update` gains a `display` settings arm, so a spec can be changed and
--    REMOVED (`{"display": null}` drops it and the column goes back to the Table's own
--    reference column) after the column exists. Without this arm a person could only ever
--    set a display spec at the moment they created the column.
--
-- 5. Two client doors, because the screens need the words and `custom.record_words` is
--    declared `server_only` with `signed_in_callers = false` (TAILS-2) — correctly, since
--    it takes a bare record id with no field to scope it:
--       · `custom.relation_words(org, field_id, value)` — one cell;
--       · `custom.relation_words_many(org, field_id, ids[])` — A PAGE AT A TIME. The
--         reason TAILS-2 gave for the browser resolving labels one id at a time was that
--         "there is still no batch door on the store"; this is that door. The ladder is
--         still per record — it is asked inside `_words_for` for every id in the array —
--         so batching buys a round trip and never a disclosure.
--
-- WHAT IS DELIBERATELY NOT HERE:
--   · No recursion past one hop, stated in words above and enforced by `p_hop`.
--   · `_words_for` does NOT filter `deleted_at`, matching `custom.record_words`'s existing
--     behaviour exactly rather than quietly tightening the thirteen readers that stand on
--     it. `custom._card_words` DID filter it, so the one behaviour that moves is this: a
--     relation chip pointing at a soft-deleted record now reads that record's name instead
--     of "an untitled quote". Naming it here rather than leaving it to be discovered.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────────────
-- 1. THE JUDGE OF A DISPLAY SPEC
-- ──────────────────────────────────────────────────────────────────────────────────────
create or replace function custom._display_spec_for(
  p_organization_id uuid,
  p_target_table_id uuid,
  p_raw             jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_cols  text[];
  v_sep   text;
  v_have  text[];
  c       text;
begin
  -- ABSENT, OR EXPLICITLY NOTHING, MEANS THE TABLE'S OWN REFERENCE COLUMN.
  if p_raw is null or jsonb_typeof(p_raw) = 'null' then
    return null;
  end if;

  -- The three shapes a caller reaches for, all normalised to one.
  if jsonb_typeof(p_raw) = 'string' then
    v_cols := array[p_raw #>> '{}'];
    v_sep  := ' ';
  elsif jsonb_typeof(p_raw) = 'array' then
    select array_agg(e.value #>> '{}' order by e.ordinality)
      into v_cols
      from jsonb_array_elements(p_raw) with ordinality e;
    v_sep := ' ';
  elsif jsonb_typeof(p_raw) = 'object' then
    if jsonb_typeof(p_raw -> 'columns') = 'string' then
      v_cols := array[p_raw -> 'columns' #>> '{}'];
    elsif jsonb_typeof(p_raw -> 'columns') = 'array' then
      select array_agg(e.value #>> '{}' order by e.ordinality)
        into v_cols
        from jsonb_array_elements(p_raw -> 'columns') with ordinality e;
    elsif jsonb_typeof(p_raw -> 'column') = 'string' then
      v_cols := array[p_raw -> 'column' #>> '{}'];
    end if;
    v_sep := coalesce(p_raw ->> 'separator', p_raw ->> 'join', ' ');
  else
    raise exception 'Which columns to show has to be a column name, a list of them, or {"columns": [...], "separator": " "} - and this is a %.', jsonb_typeof(p_raw)
      using errcode = '23514',
            hint = 'REL-DISP: say display: "last_name", or display: ["first_name","last_name"], or the whole object. Nothing was changed.';
  end if;

  -- Blanks are dropped rather than joined into a string of separators.
  select array_agg(x order by o)
    into v_cols
    from unnest(coalesce(v_cols, '{}'::text[])) with ordinality t(x, o)
   where nullif(btrim(coalesce(x, '')), '') is not null;

  if v_cols is null or array_length(v_cols, 1) is null then
    raise exception 'A column that says which of the other record''s columns to show has to name at least one.'
      using errcode = '23514',
            hint = 'REL-DISP: leave display out entirely and the column shows whatever that table is titled by. Nothing was changed.';
  end if;

  -- EVERY NAMED COLUMN MUST EXIST ON THE TARGET, and the refusal says which one does not
  -- and what IS there. A spec naming a column nobody has is the relation-pointing-at-
  -- nothing defect wearing different clothes (RELATION-DECLARE, 2026-09-20).
  select array_agg(f.data ->> 'key' order by f.data ->> 'key')
    into v_have
    from custom.record f
   where (f.organization_id = p_organization_id or f.data_class = 'kernel')
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and nullif(f.data ->> 'entity_definition_id', '')::uuid = p_target_table_id;

  foreach c in array v_cols loop
    if not (c = any (coalesce(v_have, '{}'::text[]))) then
      raise exception 'The table this column points at has no column called "%".', c
        using errcode = '23503',
              hint = format('REL-DISP: its columns are %s. Nothing was changed.',
                            coalesce(nullif(array_to_string(coalesce(v_have, '{}'::text[]), ', '), ''),
                                     '(none yet - give that table a column first)'));
    end if;
  end loop;

  return jsonb_build_object('columns', to_jsonb(v_cols), 'separator', coalesce(v_sep, ' '));
end
$fn$;

comment on function custom._display_spec_for(uuid, uuid, jsonb) is
  'lane RELATION-DISPLAY 2026-09-21. The ONE judge of a relation column''s display spec: '
  'normalises a name, a list or the object to {"columns":[...],"separator":" "} and refuses '
  'BY NAME any column the target Table does not have. Null means the Table''s own title_field.';

-- ──────────────────────────────────────────────────────────────────────────────────────
-- 2. THE ONE RESOLVER
-- ──────────────────────────────────────────────────────────────────────────────────────
create or replace function custom._words_for(
  p_organization_id uuid,
  p_record_id       uuid,
  p_display         jsonb   default null,
  p_noun            text    default null,
  p_hop             integer default 0)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_rec   custom.record;
  v_tab   jsonb;
  v_noun  text;
  v_me    uuid;
  v_cols  text[];
  v_sep   text;
  v_parts text[] := '{}'::text[];
  v_raw   text;
  v_one   text;
  c       text;
  k_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_record_id is null then return null; end if;

  -- (a) THE LADDER DECIDES BEFORE THE NAME IS READ.
  v_me := custom.query_principal();
  if v_me is not null and not custom.has_visibility(v_me, 'record', p_record_id, 'viewer') then
    return platform.relation_withheld_label();
  end if;

  select r.* into v_rec from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then
    -- Not hers and not here read the same from outside, which is REC-29 working.
    return platform.relation_withheld_label();
  end if;

  select t.data into v_tab from custom.record t
   where t.organization_id = p_organization_id and t.id = v_rec.table_id;

  v_noun := lower(coalesce(nullif(p_noun, ''),
                           nullif(v_tab ->> 'label_singular', ''),
                           nullif(v_tab ->> 'name', ''),
                           'record'));

  -- (b) THE COLUMNS THIS FIELD NAMED, IN ORDER — the per-field override, and the whole
  --     reason "first name" + " " + "last name" is one string rather than two chips.
  if p_display is not null and jsonb_typeof(p_display -> 'columns') = 'array' then
    select array_agg(e.value #>> '{}' order by e.ordinality)
      into v_cols
      from jsonb_array_elements(p_display -> 'columns') with ordinality e;
    v_sep := coalesce(p_display ->> 'separator', ' ');

    foreach c in array coalesce(v_cols, '{}'::text[]) loop
      v_raw := nullif(btrim(coalesce(v_rec.data ->> c, '')), '');
      v_one := null;
      if v_raw is not null then
        if v_raw ~ k_uuid then
          -- (d) ONE HOP. A display column that is itself a relation reads as its own
          --     words, once, and the hop is gated by (a) exactly as this call was.
          if p_hop < 1 then
            v_one := custom._words_for(p_organization_id, v_raw::uuid, null, null, p_hop + 1);
          end if;
        else
          v_one := v_raw;   -- already the words somebody typed
        end if;
      end if;
      if nullif(btrim(coalesce(v_one, '')), '') is not null then
        v_parts := v_parts || v_one;
      end if;
    end loop;

    if array_length(v_parts, 1) is not null then
      return array_to_string(v_parts, coalesce(v_sep, ' '));
    end if;
    -- The named columns hold nothing on THIS record. Fall through to the Table's own
    -- answer rather than printing an empty chip: a screen never goes blank where a name
    -- belongs any more than it prints an id there.
  end if;

  -- (c) THE TABLE'S OWN DEFAULT REFERENCE COLUMN, then the conventional names, then the
  --     first words the record holds — never a uuid-shaped one, because a bare id in
  --     `name` is the same lie as a bare id in `title_field`.
  v_raw := coalesce(nullif(v_rec.data ->> (v_tab ->> 'title_field'), ''),
                    nullif(v_rec.data ->> 'title', ''),
                    nullif(v_rec.data ->> 'name', ''),
                    nullif(v_rec.data ->> 'label', ''),
                    nullif(v_rec.data ->> 'full_name', ''),
                    nullif(v_rec.data ->> 'company', ''),
                    nullif(v_rec.data ->> 'subject', ''),
                    custom._first_words(v_rec.data));

  if v_raw is not null and v_raw !~ k_uuid then
    return v_raw;
  end if;

  if v_raw is not null and p_hop < 1 then
    v_one := custom._words_for(p_organization_id, v_raw::uuid, null, null, p_hop + 1);
    if nullif(btrim(coalesce(v_one, '')), '') is not null then
      return v_one;
    end if;
  end if;

  -- (d) The hop landed on another id, or on nothing: say so rather than print either.
  return 'an untitled ' || v_noun;
end
$fn$;

comment on function custom._words_for(uuid, uuid, jsonb, text, integer) is
  'lane RELATION-DISPLAY 2026-09-21. THE ONE RESOLVER for what a record is called. '
  'Ladder first (a record the viewer may not see reads the withheld sentence), then the '
  'FIELD''s display columns joined by its separator, then the Table''s title_field and the '
  'conventional names, and exactly ONE hop when the chosen value is itself an id. '
  'custom.record_words, custom._card_words, custom.relation_words and '
  'custom.relation_words_many are all one-liners onto this body.';

-- ── the existing front doors become one-liners onto it. Signatures UNCHANGED, so all
--    thirteen readers TAILS-2 fixed inherit the override without being touched. ─────────
create or replace function custom.record_words(
  p_organization_id uuid, p_record_id uuid, p_noun text default null)
returns text
language sql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
  select custom._words_for(p_organization_id, p_record_id, null, p_noun, 0);
$fn$;

create or replace function custom._card_words(
  p_organization_id uuid, p_value text, p_noun text)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_untitled constant text :=
    'an untitled ' || coalesce(nullif(btrim(coalesce(p_noun, '')), ''), 'record');
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return v_untitled;
  end if;
  -- Not a uuid at all: it is already the words somebody typed.
  if p_value !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return p_value;
  end if;
  return coalesce(custom._words_for(p_organization_id, p_value::uuid, null, p_noun, 0), v_untitled);
end
$fn$;

-- ──────────────────────────────────────────────────────────────────────────────────────
-- 3. THE RECORD-SHAPED FRONT DOOR FOR A *FIELD'S* VALUE, ONE AND MANY
-- ──────────────────────────────────────────────────────────────────────────────────────
create or replace function custom._display_of_field(p_organization_id uuid, p_field_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
  select f.data -> 'display'
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
$fn$;

create or replace function custom.relation_words(
  p_organization_id uuid, p_field_id uuid, p_value text)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_display jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_words');
  if nullif(btrim(coalesce(p_value, '')), '') is null then return null; end if;
  if p_value !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return p_value;
  end if;
  v_display := custom._display_of_field(p_organization_id, p_field_id);
  -- The ladder on the TARGET is asked inside the resolver, per record, exactly as it is
  -- for every other caller. This door adds the field's spec and nothing else.
  return custom._words_for(p_organization_id, p_value::uuid, v_display, null, 0);
end
$fn$;

create or replace function custom.relation_words_many(
  p_organization_id uuid, p_field_id uuid, p_record_ids uuid[])
returns table(record_id uuid, words text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_display jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.relation_words_many');
  v_display := custom._display_of_field(p_organization_id, p_field_id);
  -- A PAGE AT A TIME, and the ladder is still asked per record inside the resolver, so
  -- batching buys a round trip and never a disclosure.
  return query
    select i.id, custom._words_for(p_organization_id, i.id, v_display, null, 0)
      from unnest(coalesce(p_record_ids, '{}'::uuid[])) as i(id)
     where i.id is not null;
end
$fn$;

-- ── the doors are DECLARED before the bodies are granted anything, because
--    ddl_guard[definer_client_grant_revoked] takes the client EXECUTE from any definer
--    with no door row the moment its body is replaced (RELATION-DECLARE, 2026-09-20). ───
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes)
values
  -- The resolver itself is a SERVER LANE. It takes a bare record id with no field to scope
  -- it, exactly as custom.record_words does (TAILS-2 declared that one server_only for the
  -- same reason), so no client reaches it: the client doors below and the thirteen store
  -- doors above it are what a person actually calls, and each has already decided the
  -- organization wall before it asks what a record is called.
  ('custom', '_words_for', 'p_organization_id uuid, p_record_id uuid, p_display jsonb, p_noun text, p_hop integer',
   'migrations/campaign/reldisp_a_relation_says_which_words_it_shows.sql (lane RELATION-DISPLAY)',
   'p_record_id is checked against the caller''s own visibility ladder (custom.has_visibility at viewer) whenever there IS a caller, and a record that fails it reads as platform.relation_withheld_label(); a null p_record_id answers null. p_organization_id scopes the read, so a record of another organization is not found and reads the same withheld sentence (REC-29). p_display is a spec already judged by custom._display_spec_for at declare time and never a caller''s raw input at read time. p_hop caps the relation hop at one. No client reaches it.',
   false, false,
   'server_only: it is the body custom.record_words, custom._card_words, custom.relation_words and custom.relation_words_many are one-liners onto, and every one of those has already decided the organization wall and the caller''s reach before it asks what a record is called.',
   '{2950,2950,3802,25,23}'),
  ('custom', '_display_of_field', 'p_organization_id uuid, p_field_id uuid',
   'migrations/campaign/reldisp_a_relation_says_which_words_it_shows.sql (lane RELATION-DISPLAY)',
   'p_organization_id scopes the read to one organization''s own Field records, so a field id from another organization is not found and answers null - which resolves to the target Table''s own title_field, never to an error and never to another organization''s spec. It returns only the display spec (which of the target''s columns this column shows), never any record''s values. A null field id answers null.',
   false, false,
   'server_only: the two client doors below read a field''s display spec through it after they have asserted the organization wall; it exists as its own function so the batch door reads the spec once for a whole page rather than once per row.',
   '{2950,2950}'),
  ('custom', 'relation_words', 'p_organization_id uuid, p_field_id uuid, p_value text',
   'migrations/campaign/reldisp_a_relation_says_which_words_it_shows.sql (lane RELATION-DISPLAY)',
   'What one relation cell reads, through the column''s own display spec. custom.assert_client_may_reach decides the organization wall before anything is read, and the record at the far end is judged on its own inside custom._words_for with custom.has_visibility at viewer - so a reader who may not open the target gets platform.relation_withheld_label() and never its name and never its id. A value that is not a uuid is handed straight back, because it is already the words somebody typed.',
   true, false, null, '{2950,2950,25}'),
  ('custom', 'relation_words_many', 'p_organization_id uuid, p_field_id uuid, p_record_ids uuid[]',
   'migrations/campaign/reldisp_a_relation_says_which_words_it_shows.sql (lane RELATION-DISPLAY)',
   'The same answer for a whole page of cells in one round trip - the batch door TAILS-2 said did not exist, which is why the browser resolved labels one id at a time. The ladder is NOT batched: custom._words_for asks custom.has_visibility for every id in the array separately, so a page containing one record the reader may not see reads the withheld sentence for that row and every other row normally.',
   true, false, null, '{2950,2950,2951}')
on conflict do nothing;

grant execute on function custom.relation_words(uuid, uuid, text) to authenticated;
grant execute on function custom.relation_words_many(uuid, uuid, uuid[]) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────────────
-- 4. THE ONE LINE EVERY RELATION ARM OF THE FIELD DOOR RETURNS THROUGH
-- ──────────────────────────────────────────────────────────────────────────────────────
create or replace function custom._with_display(
  p_organization_id uuid, p_document jsonb, p_spec jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_display jsonb;
begin
  if p_spec is null or not (p_spec ? 'display') then
    return p_document;   -- no spec: today's behaviour, byte for byte
  end if;
  -- NOTHING FAILS SILENTLY. A display spec on a column that does not point at other
  -- records is the "door that quietly ignores what it was told" defect, and it is refused
  -- by name with the way to change it.
  if (p_document ->> 'type') is distinct from 'relation' then
    raise exception 'Only a column that points at other records can say which of their columns to show, and "%" does not point at any.',
        coalesce(nullif(p_document ->> 'label', ''), nullif(p_document ->> 'key', ''), 'this column')
      using errcode = '23514',
            hint = 'REL-DISP: make it a column that points at another table first (type relation, naming relation_target), or leave display out. Nothing was written.';
  end if;
  v_display := custom._display_spec_for(p_organization_id,
                                        nullif(p_document ->> 'relation_target', '')::uuid,
                                        p_spec -> 'display');
  if v_display is null then
    return p_document - 'display';
  end if;
  return p_document || jsonb_build_object('display', v_display);
end
$fn$;

-- ── `custom._field_document_for`: PATCHED IN PLACE, not snapshotted. Other lanes are
--    working in this body tonight, so this reads the body that is LIVE, replaces exactly
--    the three lines that must change, and REFUSES BY NAME if they have moved — the
--    concurrency check `create or replace` does not have, on top of the `-- based-on:`
--    hash above. All three `return d;` sites go through ONE function that is a no-op for
--    every document that is not a relation, so a relation type added later inherits the
--    display spec by standing on the same return rather than by somebody remembering. ───
do $patch$
declare
  v_src text;
  v_new text;
  v_hits integer;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = '_field_document_for'
     and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid, p_table_id uuid, p_spec jsonb';
  if v_src is null then
    raise exception 'custom._field_document_for(uuid, uuid, jsonb) is not there to patch.'
      using errcode = '42883';
  end if;

  select count(*) into v_hits
    from regexp_matches(v_src, '(^|\n)(\s*)return d;', 'g');
  if v_hits <> 3 then
    raise exception 'custom._field_document_for has % `return d;` sites, not the 3 this file was written against - the body has moved.', v_hits
      using errcode = '55000',
            hint = 'lane RELATION-DISPLAY: re-read the live body, re-take the -- based-on: hash, and re-aim this patch. Nothing was written.';
  end if;

  v_new := regexp_replace(v_src, '(^|\n)(\s*)return d;',
                          E'\\1\\2return custom._with_display(p_organization_id, d, p_spec);', 'g');

  execute format(
    'create or replace function custom._field_document_for(p_organization_id uuid, p_table_id uuid, p_spec jsonb) '
    'returns jsonb language plpgsql stable set search_path to ''pg_catalog'' as %L', v_new);
  raise notice 'custom._field_document_for: 3 return sites now carry the display spec.';
end
$patch$;

-- ── `custom.field_update` gains a `display` settings arm, in place, same rules. Without
--    it a display spec could only ever be set at the moment a column was created, and a
--    person who wanted "first name last name" on a column they already had would have had
--    to delete it and start again. `{"display": null}` REMOVES the spec and the column
--    goes back to the Table's own reference column. ───────────────────────────────────
do $patch$
declare
  v_src    text;
  v_new    text;
  v_anchor constant text :=
    E'  if p_patch ? ''rules''          then v_next := jsonb_set(v_next, ''{rules}'', coalesce(p_patch -> ''rules'', ''[]''::jsonb)); end if;\n';
  v_add constant text :=
    E'  -- ── lane RELATION-DISPLAY, 2026-09-21: WHICH OF THE OTHER RECORD''''S COLUMNS THIS ONE\n'
    '  --    SHOWS. The same judge the create door uses (custom._display_spec_for), so a spec\n'
    '  --    cannot be looser here than it was there, and an explicit null REMOVES it - the\n'
    '  --    column goes back to whatever the table it points at is titled by.\n'
    '  if p_patch ? ''display'' then\n'
    '    if (v_next ->> ''type'') is distinct from ''relation'' then\n'
    '      raise exception ''Only a column that points at other records can say which of their columns to show, and "%" does not point at any.'',\n'
    '          coalesce(nullif(v_next ->> ''label'', ''''), nullif(v_next ->> ''key'', ''''), ''this column'')\n'
    '        using errcode = ''23514'',\n'
    '              hint = ''REL-DISP: retype it to a column that points at another table first, or leave display out. Nothing was changed.'';\n'
    '    end if;\n'
    '    if jsonb_typeof(p_patch -> ''display'') = ''null'' then\n'
    '      v_next := v_next - ''display'';\n'
    '    else\n'
    '      v_next := jsonb_set(v_next, ''{display}'',\n'
    '                  coalesce(custom._display_spec_for(p_organization_id,\n'
    '                             nullif(v_next ->> ''relation_target'', '''')::uuid,\n'
    '                             p_patch -> ''display''), ''null''::jsonb));\n'
    '      if jsonb_typeof(v_next -> ''display'') = ''null'' then v_next := v_next - ''display''; end if;\n'
    '    end if;\n'
    '  end if;\n';
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'custom' and p.proname = 'field_update'
     and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid, p_field_id uuid, p_patch jsonb';
  if v_src is null then
    raise exception 'custom.field_update(uuid, uuid, jsonb) is not there to patch.' using errcode = '42883';
  end if;
  if position(v_anchor in v_src) = 0 then
    raise exception 'custom.field_update: the settings line this file inserts after has moved.'
      using errcode = '55000',
            hint = 'lane RELATION-DISPLAY: re-read the live body and re-aim the anchor. Nothing was written.';
  end if;
  if position(E'p_patch ? ''display''' in v_src) > 0 then
    raise notice 'custom.field_update already carries the display arm; leaving it alone.';
    return;
  end if;

  v_new := replace(v_src, v_anchor, v_anchor || v_add);

  execute format(
    'create or replace function custom.field_update(p_organization_id uuid, p_field_id uuid, p_patch jsonb) '
    'returns uuid language plpgsql security definer set search_path to ''pg_catalog'' as %L', v_new);
  raise notice 'custom.field_update: the display settings arm is in.';
end
$patch$;
