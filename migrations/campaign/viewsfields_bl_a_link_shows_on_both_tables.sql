-- additive: yes
--   It ADDS one platform.feature_knob row (custom.back_links, boolean, default true, an
--   organization may turn it off), four functions — custom._may_know_table(uuid, uuid) and
--   custom._inverse_key_default(uuid, uuid, jsonb) (helpers, SECURITY INVOKER, no client lane),
--   and the two client doors custom.reverse_columns(uuid, uuid) and
--   custom.reverse_links_many(uuid, uuid, uuid, uuid[], integer, integer) (declared in
--   platform.client_callable_door, EXECUTE to authenticated) — and REPLACES one body,
--   custom.field_declare, declared below with the body it was written against. No table, column,
--   trigger, policy or stored row of anybody's data is touched: no existing Field is rewritten.
--   Locks: pg_proc row locks, two platform.client_callable_door rows, one platform.feature_knob row.
--   Inverse: migrations/inverse/viewsfields_bl_a_link_shows_on_both_tables_down.sql
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on TWO new read-only client doors of schema
--   `custom` (`custom.reverse_columns`, `custom.reverse_links_many`) and writes their argument
--   rules into their platform.client_callable_door rows. The grant is the point of the file: a
--   table that another table links to cannot show those links without it. Both doors read only
--   what the caller may already see (custom.assert_may_know_table on the linked-to table, the same
--   question of the linking table, and custom.visible_predicate_sql on each linking record) and
--   write nothing. Nothing is dropped or revoked.
--
-- ORDER: custom.field_declare is based on the body that
--   visionreach_w4_a_the_store_asks_before_an_agent_changes_a_table.sql leaves (it carries
--   custom._agent_change_gate). Apply that file first; the based-on line refuses until it is.
-- guard: custom/system_enabled
-- lock: custom
-- lane: VIEWS-AND-FIELDS
-- based-on: custom.field_declare(uuid, uuid, jsonb) 626483477f27f64ae786aee9cfd520db828360b5c915cf046a3a2f46a7da4b9f
--
-- LANE 10 VIEWS-AND-FIELDS, SUBLANE BL — A LINK SHOWS ON BOTH TABLES (Airtable's reverse column).
--
-- THE GAP (measured on the nightly clone, 2026-10-02): when a column of table A links to table B,
-- B showed nothing. 0 of the relation Fields carried an inverse_key (it was stored only when a
-- caller named one, and nothing named one), custom.applicable_fields(B) lists none, and the one
-- per-record reverse read, platform.relations_to, was called by no client. Airtable shows the
-- reverse column on B the moment the link is made, with no step.
--
-- REL-9 (Data Doctrine, v5/CONTRACT.md; VISION V-40): "Every relation is visible from both ends;
-- the reverse is not a second Field." So the reverse column is VIRTUAL: there is no Field row on B,
-- applicable_fields(B) is unchanged, and the edges are the same platform.associations rows read
-- by target instead of source (as platform.relations_to already does). What this file adds:
--   (a) custom.field_declare gives a NEW table-to-table relation an inverse_key when the caller
--       named none — the linking table's name as a key ("patient_visits"), unique among the
--       reverse columns of the linked-to table and its own column keys — while the organization's
--       knob custom.back_links is on (default on). Existing Fields are not rewritten: REL-9 needs
--       no stored key for a relation to be visible from both ends.
--   (b) custom.reverse_columns(org, B): every relation Field that links to B whose table the
--       caller may know — key, label (the linking table's name), source field and table,
--       cardinality, read-only. With the knob off it lists only the relations whose author named
--       an inverse_key. A table the caller may not know is never named.
--   (c) custom.reverse_links_many(org, B, field, record ids, limit, offset): one call for a page
--       of B's records — for each, how many linking records the caller may see and a page of them
--       (id + title). At most 200 records and 50 links a record per call, so a record with 10,000
--       links costs one indexed count and one page.
--
-- PROOF: scripts/campaign-tests/viewsfields_bl_a_link_shows_on_both_tables.sql (RED before this
-- file, GREEN after).

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('custom', 'back_links',
   'true'::jsonb, 'true'::jsonb, 'boolean',
   'Show links on both tables',
   'When a column links to another table, that table shows the linked records too.',
   'agent',
   'Lane VIEWS-AND-FIELDS sublane BL, 2026-10-02: REL-9 (every relation is visible from both ends; '
   || 'the reverse is not a second Field) and Airtable''s linked-record field, which shows the reverse '
   || 'column on the other table the moment a link is made. Defaults lean open.',
   array['organization']::text[],
   'any', 'next_load',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (select 1 from platform.feature_knob
                  where feature = 'custom' and key = 'back_links'
                    and default_value = 'true'::jsonb and 'organization' = any (overridable_by)) then
    raise exception 'viewsfields_bl: custom.back_links did not land as an organization knob defaulting to true';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 1. MAY THIS CALLER KNOW THAT TABLE — as a yes or no. custom.assert_may_know_table is the one
--    answer (the Table itself, or anything in it, shared with her); this only turns its refusal
--    into false so a list can leave a table out instead of failing the whole read.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom._may_know_table(p_organization_id uuid, p_table_id uuid)
 returns boolean
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.reverse_columns');
  return true;
exception when insufficient_privilege then
  return false;
end
$function$;

comment on function custom._may_know_table(uuid, uuid) is
  'VIEWS-AND-FIELDS BL: custom.assert_may_know_table as a boolean — true when the caller may know the Table, false where it would refuse (42501). Used to leave a Table out of a list rather than fail it.';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE REVERSE KEY A NEW RELATION IS GIVEN. Only a relation at ONE Table of this organization
--    (never a Person or File kernel, never several or any), only when the caller named none, only
--    while custom.back_links is on. The key is the linking table's name, made a key, and made
--    unique against the other reverse keys pointing at that Table and that Table's own columns.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom._inverse_key_default(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_target uuid;
  v_name   text;
  v_base   text;
  v_key    text;
  v_n      integer := 1;
begin
  if coalesce(p_doc ->> 'type', '') <> 'relation'
     or nullif(p_doc ->> 'inverse_key', '') is not null
     or coalesce(nullif(p_doc -> 'config' ->> 'target_mode', ''), 'one') <> 'one'
     or nullif(p_doc ->> 'relation_target', '') is null then
    return p_doc;
  end if;
  if coalesce(nullif(platform.knob_resolve('custom', 'back_links', p_organization_id) #>> '{}', ''), 'true') <> 'true' then
    return p_doc;
  end if;
  v_target := (p_doc ->> 'relation_target')::uuid;
  if not exists (select 1 from custom.record t
                  where t.id = v_target and t.organization_id = p_organization_id
                    and t.table_id = custom.table_kernel_id() and t.data_class = 'table'
                    and t.deleted_at is null) then
    return p_doc;   -- a kernel (Person, File) or anything that is not one of this organization's tables
  end if;
  select coalesce(nullif(btrim(t.data ->> 'name'), ''), 'linked') into v_name
    from custom.record t
   where t.id = p_table_id and t.organization_id = p_organization_id;
  v_base := regexp_replace(regexp_replace(lower(coalesce(v_name, 'linked')), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g');
  if v_base !~ '^[a-z]' then v_base := 'f_' || v_base; end if;
  v_base := left(v_base, 44);
  v_key := v_base;
  while exists (select 1 from custom.record f
                 where f.organization_id = p_organization_id
                   and f.table_id = custom.field_kernel_id()
                   and f.data_class = 'field'
                   and f.deleted_at is null
                   and f.data ->> 'relation_target' = v_target::text
                   and f.data ->> 'inverse_key' = v_key)
     or exists (select 1 from custom.record f
                 where f.organization_id = p_organization_id
                   and f.table_id = custom.field_kernel_id()
                   and f.data_class = 'field'
                   and f.data ->> 'entity_definition_id' = v_target::text
                   and f.data ->> 'key' = v_key)
  loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;
  return p_doc || jsonb_build_object('inverse_key', v_key);
end
$function$;

comment on function custom._inverse_key_default(uuid, uuid, jsonb) is
  'VIEWS-AND-FIELDS BL: a new relation Field document with inverse_key filled in from the linking table''s name when the caller named none, the relation points at one Table of this organization and custom.back_links is on; otherwise the document unchanged.';

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 3. custom.field_declare: (a) above, one call before the choice list. Everything else is the body
--    named in the based-on line, unchanged.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.field_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_listed  boolean;
  v_key     text;
  v_fields  jsonb;
  v_opts    uuid;
  v_id      uuid;
  v_existing uuid;
  v_same     uuid;
  v_holder   text;          -- DATA-V2-BASICS: the label of the column already holding the key
  v_base     text;
  v_n        integer;
begin
  -- THE DECISION FIRST, BEFORE ANYTHING IS READ OR WRITTEN: the organization's
  -- own off switch, then the organization wall, then the right to change the
  -- SHAPE of this table, which is an admin's right and not an editor's.
  perform custom.assert_store_door(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.field_declare');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.field_declare',
                                          'admin'::public.permission_level, 'table');
  -- VISION-REACH W4 (a): the organization's "Agent changes" setting, enforced here (custom._agent_change_gate).
  perform custom._agent_change_gate(p_organization_id, p_table_id, 'custom.field_declare');

  select r.data -> 'fields' into v_fields
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.table_id = custom.table_kernel_id()
     and r.deleted_at is null;
  if v_fields is null then
    raise exception 'That table is not in this organization, so a field cannot be added to it.'
      using errcode = '23514',
            hint = 'REC-29: organizations are hard walls. Open the table you meant and add the field there.';
  end if;

  v_doc := custom._field_document_for(p_organization_id, p_table_id, p_spec);
  v_key := v_doc ->> 'key';

  -- ── DATA-V2-BASICS, 2026-09-27: A KEY THE STORE DERIVED NEVER LANDS ON ANOTHER COLUMN. ────
  -- Arman's Coding Accounts: the column "Resets" (key `resets`) was renamed "Account Type".
  -- Adding a new column called "Resets" derived the key `resets` again, and this door answered
  -- 23505 *"This table already has a field called "Resets""* — false: no column on the screen
  -- is called that. Had the new column been a choice list like the old one, the same-type rule
  -- below would have returned the OLD column's id and the person's new column would never have
  -- appeared at all. And a key a RETIRED column held still sits under every record's history,
  -- so a new column given it would show the old column's values.
  -- THE RULE: when the caller did not ask for a key, the key is the store's to choose, and it
  -- chooses one no column of this table has ever held (`resets_2`, `resets_3` …) unless the
  -- column holding it is the SAME column said again — the same name (and then the same-type
  -- rule below answers, or the name is refused as taken). A key a caller asked for by name is
  -- still exactly that key, and a clash on it is refused naming the column that holds it.
  -- ── DATA-V2-BASICS (BREAKER-1 F8): A NEW COLUMN NEVER TAKES ANOTHER COLUMN'S NAME. ─────────
  -- The same name AND the same key AND the same kind is the same column said again (a caller's
  -- repeated declaration, answered below by the same-type rule). Any other column already called
  -- that is refused by name: two headers reading "Patient Name" over different data is how a paste
  -- matched the wrong column and blanked a real one (BREAKER-1 F10).
  if exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
                and lower(btrim(coalesce(r.data ->> 'label', ''))) = lower(btrim(coalesce(v_doc ->> 'label', '')))
                and not (nullif(p_spec ->> 'key', '') is not null
                         and r.data ->> 'key' = v_key
                         and coalesce(r.data ->> 'type', r.data ->> 'plain', 'text')
                             is not distinct from coalesce(v_doc ->> 'type', v_doc ->> 'plain', 'text'))) then
    raise exception 'You already have a column called "%".', btrim(v_doc ->> 'label')
      using errcode = '23505',
            hint = 'Open that column from its header to change it, or give the new one another name. Nothing was added.';
  end if;

  if nullif(p_spec ->> 'key', '') is null then
    select coalesce(r.data ->> 'label', r.data ->> 'name', '') into v_holder
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.data_class = 'field'
       and r.deleted_at is null
       and r.data ->> 'entity_definition_id' = p_table_id::text
       and r.data ->> 'key' = v_key
       and not coalesce((r.data ->> 'declared_with_table')::boolean, false)
     limit 1;
    if (v_holder is not null
          and lower(btrim(v_holder)) is distinct from lower(btrim(coalesce(v_doc ->> 'label', ''))))
       or (v_holder is null and exists (
             select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is not null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key)
           and not exists (
             select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key)) then
      v_base := left(v_key, 44);
      v_n := 2;
      loop
        v_key := v_base || '_' || v_n;
        exit when not exists (
                    select 1 from custom.record r
                     where r.organization_id = p_organization_id
                       and r.table_id = custom.field_kernel_id()
                       and r.data_class = 'field'
                       and r.data ->> 'entity_definition_id' = p_table_id::text
                       and r.data ->> 'key' = v_key)
                  and not exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
        v_n := v_n + 1;
      end loop;
      v_doc := jsonb_set(v_doc, '{key}', to_jsonb(v_key));
    end if;
  end if;

  -- ── RELATION-DECLARE, 2026-09-20: "MAY I POINT AT IT" IS "MAY I SEE IT". ───────────────
  -- Pointing a column at a Table is how that Table's titles get onto your screen: the picker
  -- lists its records and platform.relation_label hydrates a chip from each one. So the
  -- question this door was not asking is the question every OTHER door onto a Table asks
  -- (T10) - and this is the one that makes a LASTING link. A caller who names the target
  -- themselves is asked it here; the Person and File columns, whose target is a kernel Table
  -- this door fills in, are untouched.
  -- LIMITS-FIX 2026-09-21: `target_table` is the same question as `relation_target`
  -- (custom._field_document_for reads both), so the may-I-see-it check has to recognise
  -- both too. Reading only one word here would let a caller reach a Table it may not see
  -- simply by spelling the argument the other way.
  if coalesce(nullif(p_spec ->> 'relation_target', ''), nullif(p_spec ->> 'target_table', '')) is not null
     and nullif(v_doc ->> 'relation_target', '') is not null then
    perform custom.assert_may_know_table(p_organization_id,
              (v_doc ->> 'relation_target')::uuid, 'custom.field_declare');
  end if;

  -- ── SEAT-SUITES, 2026-09-19: A COLUMN A TABLE DECLARED COULD NEVER BE DEFINED. ──────
  -- `custom._table_shape_guard` refuses a table that declares no fields, so EVERY table made
  -- through `custom.table_declare` names at least one column. `table_declare` writes only the
  -- NAME into the table's `fields` list — it makes no Field row — so `custom.applicable_fields`
  -- answers ZERO columns for a brand-new table, and this door then refused every one of those
  -- names as "already there". Through the doors alone, a signed-in person's first column had no
  -- type, no rules, no validation and no way to ever get one. The old suites never saw it
  -- because they INSERTed the Field rows straight into `custom.record` as the role that owns
  -- the table — a privilege no person has. Measured from the seat `authenticated` on the main
  -- database on 2026-09-19: applicable_fields = 0, then 23505 "This table already has a field
  -- called Pname", then applicable_fields = 0 again.
  --
  -- THE RULE: a NAME the table declared and never defined is FILLED IN by this door. Only a
  -- name that already has a Field ROW is a duplicate, and that is still refused by name.
  v_listed := exists (select 1 from jsonb_array_elements(v_fields) f where f ->> 'name' = v_key);
  -- ── LIMITS-FIX 2026-09-21: A COLUMN BORN WITH ITS TABLE IS FILLED IN HERE, NOT REFUSED.
  -- `custom.table_declare` now materialises the columns a table's spec names, and stamps
  -- each one `declared_with_table`. The documented build is two steps — declare the table
  -- naming its columns, then define each column here — so meeting one of those rows means
  -- step two has arrived for a column step one only sketched, and the right answer is to
  -- DEFINE it: the type, the rules, the choices and the label the caller is now giving.
  -- The marker comes off in the same write, so a THIRD attempt at the same key is an
  -- ordinary duplicate and is refused exactly as it always was. A field somebody has
  -- already defined is never silently overwritten by this door.
  select r.id into v_existing
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'entity_definition_id' = p_table_id::text
     and r.data ->> 'key' = v_key
     and coalesce((r.data ->> 'declared_with_table')::boolean, false)
   limit 1;

  -- ── LIMITS-FIX 2026-09-21: DECLARING THE SAME COLUMN TWICE IS THE SAME COLUMN. ───────
  -- Real-data crew A: "Create and import a file" on a brand-new table answered 409 on the
  -- table's OWN default Title column — the create path declares Title, the import path
  -- declares Title, and the second one was a conflict. Real-data crew E2 hit the same wall
  -- from another direction with a table whose own column is called `name`. Neither caller
  -- was asking for a second column; both were saying the same true thing twice, and the
  -- store treated the repetition as a contradiction.
  -- THE RULE: the same key with the same TYPE already defined is that column, returned
  -- unchanged and not written again — declaring is idempotent, as a declaration should be.
  -- The same key with a DIFFERENT type is a real conflict and is still refused by name,
  -- because silently retyping a live column would take its values with it.
  select r.id into v_same
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.field_kernel_id()
     and r.data_class = 'field'
     and r.deleted_at is null
     and r.data ->> 'entity_definition_id' = p_table_id::text
     and r.data ->> 'key' = v_key
     and coalesce(r.data ->> 'type', r.data ->> 'plain', 'text')
         is not distinct from coalesce(v_doc ->> 'type', v_doc ->> 'plain', 'text')
   limit 1;
  if v_existing is null and v_same is not null then
    return v_same;
  end if;

  if v_existing is null and exists (select 1 from custom.record r
              where r.organization_id = p_organization_id
                and r.table_id = custom.field_kernel_id()
                and r.data_class = 'field'
                and r.deleted_at is null
                and r.data ->> 'entity_definition_id' = p_table_id::text
                and r.data ->> 'key' = v_key) then
    -- DATA-V2-BASICS: the sentence names the column that is really there. A clash on the
    -- NAME says the name; a clash on a key the caller asked for names the column holding it.
    select coalesce(r.data ->> 'label', r.data ->> 'name', r.data ->> 'key') into v_holder
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.data_class = 'field'
       and r.deleted_at is null
       and r.data ->> 'entity_definition_id' = p_table_id::text
       and r.data ->> 'key' = v_key
     limit 1;
    if lower(btrim(coalesce(v_holder, ''))) = lower(btrim(coalesce(v_doc ->> 'label', ''))) then
      raise exception 'This table already has a field called "%".', v_doc ->> 'label'
        using errcode = '23505',
              hint = 'Two columns of one table cannot share a name and a kind. Give this one a different name, or edit the one that is already there.';
    end if;
    raise exception 'The column "%" already uses the key %, so "%" cannot have it too.', v_holder, v_key, v_doc ->> 'label'
      using errcode = '23505',
            hint = 'Leave the key out and the store picks a free one, or rename the column that holds it.';
  end if;

  -- ── VIEWS-AND-FIELDS BL, 2026-10-02 (REL-9): A NEW LINK IS NAMED ON THE TABLE IT LINKS TO. ──
  -- A relation at one Table of this organization, with no inverse_key from the caller, is given
  -- one from this table's name while custom.back_links is on. Only here, on the way to a NEW
  -- column (the same-type return above has already answered a repeated declaration), so no
  -- existing Field is ever rewritten. The reverse column itself stays virtual: no second Field.
  v_doc := custom._inverse_key_default(p_organization_id, p_table_id, v_doc);

  -- THE CHOICE LIST. The person typed words; the store keeps them the only way
  -- FLD-5/FLD-6 allows — as the records of a Table — and points the Field at it.
  if (v_doc ->> 'type') = 'list'
     and nullif(v_doc -> 'config' ->> 'options_table_id', '') is null then
    -- CHOICE-COLUMN-EDIT, 2026-09-27: none typed yet is an empty list, not a refusal — the column
    -- is a choice column from the start and its first choice is added later (settings or a cell).
    v_opts := custom._options_table_for(p_organization_id, v_doc ->> 'label',
                                        case when jsonb_typeof(p_spec -> 'options') = 'array'
                                             then p_spec -> 'options' else '[]'::jsonb end);
    v_doc := jsonb_set(v_doc, '{config,options_table_id}', to_jsonb(v_opts::text));
  end if;

  -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-01): the default fits the column, or nothing is written.
  v_doc := custom._field_default_fitted(p_organization_id, v_doc);

  -- DATA-V2-BASICS-2 (2026-09-29, BREAKER-2 B2-16): A NEW COLUMN GOES AFTER THE OTHERS. Every column was
  -- born at sort 100, so a table of ten columns added one at a time listed them alphabetically, not in
  -- the order they were added. A column that does not ask for a place goes after the last one.
  if not (p_spec ? 'sort') then
    v_doc := jsonb_set(v_doc, '{sort}', to_jsonb(coalesce(
      (select max((f.data ->> 'sort')::numeric)
         from custom.record f
        where f.organization_id = p_organization_id
          and f.table_id = custom.field_kernel_id()
          and f.deleted_at is null
          and coalesce(f.data_class, '') <> 'kernel'
          and f.data ->> 'entity_definition_id' = p_table_id::text
          and f.data ->> 'sort' ~ '^-?[0-9]+(\.[0-9]+)?$'), 90) + 10));
  end if;

  -- ONE SOURCE OF TRUTH, both ways: the TABLE declares which fields it has and
  -- `custom.field` defines what one of them is, so the table is told first —
  -- the field guard refuses a definition for a field the table never declared,
  -- which is the exact sentence every "Add field" ended on.
  -- A name the table already declared is not added to the list a second time; a table that
  -- listed the same column twice would show it twice on every screen.
  if not v_listed then
    update custom.record
       set data = jsonb_set(data, '{fields}',
                            coalesce(data -> 'fields', '[]'::jsonb)
                            || jsonb_build_array(jsonb_build_object('name', v_key))),
           updated_at = now(), version = version + 1
     where organization_id = p_organization_id
       and id = p_table_id
       and table_id = custom.table_kernel_id();
  end if;

  -- `data_class = 'field'` is the other half of what no client could write. A
  -- field stored as a plain record is invisible to the delete rules and to the
  -- formula-dependency check (the 19 September verdict's defect 1).
  -- The sketch this table was born with becomes the column the caller just described.
  if v_existing is not null then
    update custom.record
       set data = v_doc, updated_at = now(), version = version + 1
     where organization_id = p_organization_id and id = v_existing;
    return v_existing;
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', v_doc)
  returning id into v_id;

  return v_id;
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 4. (b) THE REVERSE COLUMNS OF A TABLE. Every live relation Field of this organization that
--    links to p_table_id (relation_target, or one of config.target_tables) and sits on a Table
--    the caller may know. Virtual: computed here from the linking Fields, never stored on B.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom.reverse_columns(p_organization_id uuid, p_table_id uuid)
 returns table(key text, label text, source_field_id uuid, source_field_key text, source_field_label text,
               source_table_id uuid, source_table_name text, cardinality text, read_only boolean)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_on boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.reverse_columns');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.reverse_columns');
  v_on := coalesce(nullif(platform.knob_resolve('custom', 'back_links', p_organization_id) #>> '{}', ''), 'true') = 'true';

  return query
  with links as (
    select f.id as fid,
           coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') as fkey,
           coalesce(nullif(btrim(f.data ->> 'label'), ''), f.data ->> 'key') as flabel,
           nullif(f.data ->> 'inverse_key', '') as ikey,
           coalesce((f.data ->> 'sort')::numeric, 100) as fsort,
           t.id as tid,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Linked records') as tname
      from custom.record f
      join custom.record t
        on t.organization_id = p_organization_id
       and t.id = (f.data ->> 'entity_definition_id')::uuid
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class = 'field'
       and f.deleted_at is null
       and f.data ->> 'type' = 'relation'
       and (case coalesce(nullif(f.data -> 'config' ->> 'target_mode', ''), 'one')
              when 'one' then f.data ->> 'relation_target' = p_table_id::text
              when 'several' then coalesce(f.data -> 'config' -> 'target_tables', '[]'::jsonb) ? p_table_id::text
              else false end)
       and (v_on or nullif(f.data ->> 'inverse_key', '') is not null)
  ), seen as (
    select l.* from links l where custom._may_know_table(p_organization_id, l.tid)
  )
  select coalesce(s.ikey, 'linked_' || replace(s.fid::text, '-', '')),
         case when s.tid = p_table_id
                or (select count(*) from seen s2 where s2.tid = s.tid) > 1
              then s.tname || ' (' || s.flabel || ')'
              else s.tname end,
         s.fid, s.fkey, s.flabel, s.tid, s.tname,
         'many'::text,
         true
    from seen s
   order by s.tname, s.fsort, s.flabel, s.fid;
end
$function$;

comment on function custom.reverse_columns(uuid, uuid) is
  'VIEWS-AND-FIELDS BL (REL-9): the reverse columns of a Table — one per relation Field that links to it, on a Table the caller may know: key (the Field''s inverse_key, else linked_<field id>), label (the linking table''s name, with the column''s name when two columns of one table link here or a table links to itself), the source Field and Table, cardinality many, read-only. With custom.back_links off, only relations whose author named an inverse_key. Writes nothing.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
values
  ('custom', 'reverse_columns', 'p_organization_id uuid, p_table_id uuid',
   'migrations/campaign/viewsfields_bl_a_link_shows_on_both_tables.sql (lane VIEWS-AND-FIELDS)',
   'custom.assert_client_may_reach decides the organization wall and custom.assert_may_know_table decides the caller may know the Table before anything is read. Each linking Table is then asked the same question (custom._may_know_table) and left out when the answer is no, so a Table the caller may not know is never named. It reads Field and Table definitions only — no record — and writes nothing.',
   true, false, null, '{2950,2950}',
   jsonb_build_object(
     'version', 1,
     'declared_by', 'viewsfields_bl_a_link_shows_on_both_tables.sql',
     'declared_at', '2026-10-02 lane VIEWS-AND-FIELDS, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'custom.assert_client_may_reach decides it first; every Field and Table is read in this organization only.'),
         'verified', '2026-10-02 lane VIEWS-AND-FIELDS — read from this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder — and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'Read only as a Table of p_organization_id; custom.assert_may_know_table decides the caller may know it.'),
         'verified', '2026-10-02 lane VIEWS-AND-FIELDS — read from this body'))))
on conflict do nothing;

grant execute on function custom.reverse_columns(uuid, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- 5. (c) THE LINKS OF A PAGE OF RECORDS, IN ONE CALL. For each of p_record_ids (records of
--    p_table_id), the linking records of p_field_id the caller may see: how many, and one page of
--    them (id + title) in the link's own order. p_field_id must be one of the reverse columns
--    custom.reverse_columns would list for this caller; anything else is refused in the same words
--    as an invented id. At most 200 records and 50 links a record per call.
-- ──────────────────────────────────────────────────────────────────────────────────────────
create function custom.reverse_links_many(p_organization_id uuid, p_table_id uuid, p_field_id uuid,
                                          p_record_ids uuid[], p_limit integer default 10, p_offset integer default 0)
 returns table(record_id uuid, total integer, links jsonb)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_source uuid;
  v_title  text;
  v_noun   text;
  v_me     uuid;
  v_pred   text;
  v_limit  integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_n      integer := coalesce(cardinality(p_record_ids), 0);
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.reverse_links_many');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.reverse_links_many');
  if v_n > 200 then
    raise exception 'That is % records at once, and one call reads the links of up to 200.', v_n
      using errcode = '54000', hint = 'Send the records in groups of 200 or fewer.';
  end if;

  select c.source_table_id into v_source
    from custom.reverse_columns(p_organization_id, p_table_id) c
   where c.source_field_id = p_field_id;
  if v_source is null then
    raise exception 'That linked column is not one you can open on this table.'
      using errcode = '42501',
            hint = 'Open the table again to see the linked columns you have.';
  end if;

  select nullif(t.data ->> 'title_field', ''), lower(coalesce(nullif(btrim(t.data ->> 'label_singular'), ''), 'record'))
    into v_title, v_noun
    from custom.record t
   where t.organization_id = p_organization_id and t.id = v_source;

  v_me := custom.query_principal();
  v_pred := case when v_me is null then 'true'
                 else custom.visible_predicate_sql(v_me, p_organization_id, v_source, 'viewer'::public.permission_level, 'r') end;

  -- THE PLAN IS FORCED BY SHAPE, NOT LEFT TO ESTIMATES. Measured on the clone: joining the edges to
  -- custom.record directly let the planner scan the whole organization once per edge (2,000 links
  -- to one record: 6.4 s). So the edges are read first (one index range per record id), then the
  -- linking records by primary key (organization_id, id = any), then ranked per record.
  return query execute format($q$
    with ids as materialized (
      select distinct b.id as rid
        from unnest($4) u
        join custom.record b
          on b.organization_id = $1 and b.id = u and b.table_id = $9 and b.data_class = 'record'
    ), edges as materialized (
      select a.target_id as rid, a.source_id as sid, a.position, a.created_at
        from ids
        join platform.associations a
          on a.target_type = 'record'
         and a.target_id = ids.rid
         and a.deleted_at is null
         and a.organization_id = $1
         and a.relation_field_id = $3
    ), src as materialized (
      select r.id, r.data ->> $8 as words
        from custom.record r
       where r.organization_id = $1
         and r.id = any (array(select distinct e.sid from edges e))
         and r.table_id = $2
         and r.data_class = 'record'
         and r.deleted_at is null
         and (%s)
    ), ranked as (
      select e.rid, e.sid, s.words,
             row_number() over (partition by e.rid order by e.position nulls last, e.created_at, e.sid) as rn
        from edges e
        join src s on s.id = e.sid
    )
    select ids.rid,
           count(k.sid)::integer,
           coalesce(jsonb_agg(jsonb_build_object('id', k.sid, 'words', custom._card_words($1, k.words, $7))
                              order by k.rn)
                      filter (where k.rn > $5 and k.rn <= $5 + $6), '[]'::jsonb)
      from ids
      left join ranked k on k.rid = ids.rid
     group by ids.rid
  $q$, v_pred)
  using p_organization_id, v_source, p_field_id, p_record_ids, v_offset, v_limit, v_noun, coalesce(v_title, ''), p_table_id;
end
$function$;

comment on function custom.reverse_links_many(uuid, uuid, uuid, uuid[], integer, integer) is
  'VIEWS-AND-FIELDS BL (REL-9): for each record id of a Table, the records that link to it through one reverse column (custom.reverse_columns) and that the caller may see — total, and links [{id, words}] from p_offset, p_limit of them (1..50) in the link''s order. Up to 200 records a call. Reads platform.associations by target; writes nothing.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   signed_in_callers, anonymous_callers, non_client_lane, identity_argtypes, argument_rules)
values
  ('custom', 'reverse_links_many',
   'p_organization_id uuid, p_table_id uuid, p_field_id uuid, p_record_ids uuid[], p_limit integer, p_offset integer',
   'migrations/campaign/viewsfields_bl_a_link_shows_on_both_tables.sql (lane VIEWS-AND-FIELDS)',
   'custom.assert_client_may_reach decides the organization wall and custom.assert_may_know_table decides the caller may know the Table before anything is read. The linking Field must be one custom.reverse_columns lists for this caller (its Table known to her), else it is refused in the same words as an invented id. Each linking record is kept only when the read doors'' own predicate (custom.visible_predicate_sql) admits it at viewer, and only its id and title are returned. Capped at 200 records and 50 links a record per call.',
   true, false, null, '{2950,2950,2950,2951,23,23}',
   jsonb_build_object(
     'version', 1,
     'declared_by', 'viewsfields_bl_a_link_shows_on_both_tables.sql',
     'declared_at', '2026-10-02 lane VIEWS-AND-FIELDS, read from this body',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'custom.assert_client_may_reach decides it first; every row is read in this organization only.'),
         'verified', '2026-10-02 lane VIEWS-AND-FIELDS — read from this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder — and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'Read only as a Table of p_organization_id; custom.assert_may_know_table decides the caller may know it.'),
         'verified', '2026-10-02 lane VIEWS-AND-FIELDS — read from this body'),
       'p_field_id', jsonb_build_object('type', 'uuid', 'position', 3, 'entity', 'custom_record',
         'check', 'must be a relation Field custom.reverse_columns(arg1, arg2) lists for this caller — a live Field of this organization linking to arg2 on a Table the caller may know (custom.assert_may_know_table) — before it is used; otherwise refused 42501.',
         'foreign', jsonb_build_object('bounded', true, 'sqlstate', '42501', 'same_as_invented', true,
           'note', 'A Field of another organization, of a Table she may not know, or linking elsewhere is refused in the same words as an invented id.'),
         'verified', '2026-10-02 lane VIEWS-AND-FIELDS — read from this body'),
       'p_record_ids', jsonb_build_object('type', 'uuid[]', 'position', 4,
         'check', 'A FILTER, AND NOT A LEAK. The ids only choose which records'' inbound links are counted; every linking record is kept only when custom.visible_predicate_sql admits it for the caller at viewer, and an id that is not a record of arg2 simply has no links.',
         'foreign', jsonb_build_object('not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-10-02 lane VIEWS-AND-FIELDS — read from this body'))))
on conflict do nothing;

grant execute on function custom.reverse_links_many(uuid, uuid, uuid, uuid[], integer, integer) to authenticated;
