-- chair-step: it WRITES ROWS — one `key` Field definition per existing choice list, the same
--   name appended to each of those Tables' own `fields` arrays, and a stable key onto every
--   option record that has none. A data backfill is in no enumerated additive shape, so the
--   allow-list refuses it by name, and correctly so: this rewrites 64 live rows.
--   WHAT IT IS FOR: `choiceval_a_choice_is_its_own_word.sql` made a choice value the option's
--   own stable key. Until every option carries one, `custom.choice_options` derives it from the
--   title on the fly — which works, and which quietly breaks the moment somebody RENAMES an
--   option. This file makes the key real and stored, which is the whole point of a stable key.
--   NOTHING IS DROPPED OR REVOKED. Every write is an INSERT of a Field definition the store's
--   own guards accept, an append to a `fields` array, or the addition of ONE key to a document
--   that did not have it. No existing value is changed or removed, and the two statements are
--   idempotent: re-running adds nothing.
--   THE INVERSE: migrations/inverse/choiceval_every_option_gets_its_key_down.sql.

set lock_timeout = '45s';
set statement_timeout = '600s';

-- ── 4. THE OPTIONS TABLE DECLARES ITS KEY ───────────────────────────────────────────────
-- The Table record is told FIRST, because `custom._field_shape_guard` refuses a Field
-- definition the Table does not declare ("ONE SOURCE OF TRUTH, both ways").

do $do$
declare
  t record;
  v_exists boolean;
begin
  for t in
    select distinct f.organization_id as org, (f.data -> 'config' ->> 'options_table_id')::uuid as tbl
      from custom.record f
     where f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and f.data ->> 'type' = 'list'
       and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
  loop
    if t.tbl is null then continue; end if;

    update custom.record r
       set data = jsonb_set(r.data, '{fields}',
                    coalesce(r.data -> 'fields', '[]'::jsonb)
                      || jsonb_build_array(jsonb_build_object('name', 'key')))
     where r.organization_id = t.org
       and r.id = t.tbl
       and r.table_id = custom.table_kernel_id()
       and not exists (select 1 from jsonb_array_elements(coalesce(r.data -> 'fields', '[]'::jsonb)) e
                        where e ->> 'name' = 'key');

    select exists (select 1 from custom.record f
                    where f.organization_id = t.org
                      and f.table_id = custom.field_kernel_id()
                      and f.deleted_at is null
                      and (f.data ->> 'entity_definition_id')::uuid = t.tbl
                      and f.data ->> 'key' = 'key')
      into v_exists;

    if not v_exists then
      insert into custom.record (organization_id, table_id, data_class, data)
      values (t.org, custom.field_kernel_id(), 'field', jsonb_build_object(
        'key', 'key', 'label', 'Key', 'type', 'text',
        'multi', false, 'dated', false, 'required', false, 'sort', 20,
        'rules', '[]'::jsonb, 'config', '{}'::jsonb, 'source', 'manual',
        'source_config', '{}'::jsonb, 'sensitivity', 'internal',
        'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
        'depends_on', '[]'::jsonb,
        -- KEPT BY THE APP, exactly as the options Table itself is: nobody's column list grows
        -- because the store gave its own choices stable names.
        'kept_by_the_app', true,
        'entity_definition_id', t.tbl));
    end if;
  end loop;
end
$do$;

-- ── 5. EVERY OPTION THAT EXISTS GETS ITS KEY ────────────────────────────────────────────
-- Retired options included: a value pointing at one has to keep meaning what it meant.

with opts as (
  select distinct f.organization_id as org, (f.data -> 'config' ->> 'options_table_id')::uuid as tbl
    from custom.record f
   where f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'type' = 'list'
     and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
), ranked as (
  select o.organization_id, o.id,
         custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name')) as base,
         row_number() over (partition by o.organization_id, o.table_id,
                                         custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name'))
                            order by (o.deleted_at is not null), o.created_at, o.id) as n
    from custom.record o
    join opts on opts.org = o.organization_id and opts.tbl = o.table_id
   where coalesce(o.data ->> 'key', '') = ''
)
update custom.record r
   set data = r.data || jsonb_build_object('key',
                case when ranked.n = 1 then ranked.base
                     else left(ranked.base, 50) || '_' || ranked.n end)
  from ranked
 where r.organization_id = ranked.organization_id
   and r.id = ranked.id;

