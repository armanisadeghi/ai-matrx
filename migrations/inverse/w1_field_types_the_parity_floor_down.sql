-- chair-step: the inverse of W1-FIELD-TYPES' parity floor (BUILD-BOOK §4.13, rule 27). It
-- removes ONLY what `migrations/campaign/w1_field_types_the_parity_floor.sql` created —
-- two triggers, the thirteen parity bodies, the fixture rows it seeded — and restores
-- `custom.record_values` and `custom.record_values_versioned` to the bodies W1-VAL left,
-- byte for byte, which are the two hashes that file's `-- based-on:` lines declare
-- (694cf0ac… and 82175650…). HEADER-LESS on purpose: an inverse that named production in a
-- `-- target:` header while carrying `-- chair-step:` is `refuse:chair-step-names-production`
-- in both runners. It rehearses on the branch with `--target branch`.
--
-- It is SAFE TO RUN TWICE: every drop is `if exists` and every delete is by primary key.

set lock_timeout = '5s';
set statement_timeout = '300s';

drop trigger if exists custom_record_zz_derived_fields on custom.record;
drop trigger if exists custom_record_field_type_parity_guard on custom.record;

-- The fixture, innermost first: the record, then the lines, then the fields, then the
-- option/person/file rows, then the three Tables.
delete from custom.record where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and id in ('11111111-0009-4000-8000-000000000011'::uuid,
             '11111111-0009-4000-8000-000000000001'::uuid,
             '11111111-0009-4000-8000-000000000002'::uuid);
delete from custom.record where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and id in ('11111111-0008-4000-8000-000000000000'::uuid,
             '11111111-0008-4000-8000-000000000001'::uuid,
             '11111111-0008-4000-8000-000000000002'::uuid,
             '11111111-0008-4000-8000-000000000003'::uuid,
             '11111111-0008-4000-8000-000000000004'::uuid,
             '11111111-0008-4000-8000-000000000005'::uuid,
             '11111111-0008-4000-8000-000000000006'::uuid,
             '11111111-0008-4000-8000-000000000007'::uuid,
             '11111111-0008-4000-8000-000000000008'::uuid,
             '11111111-0008-4000-8000-000000000009'::uuid,
             '11111111-0008-4000-8000-000000000010'::uuid,
             '11111111-0008-4000-8000-000000000011'::uuid,
             '11111111-0008-4000-8000-000000000012'::uuid,
             '11111111-0008-4000-8000-000000000013'::uuid,
             '11111111-0008-4000-8000-000000000014'::uuid,
             '11111111-0007-4000-8000-000000000001'::uuid,
             '11111111-0007-4000-8000-000000000002'::uuid,
             '11111111-0007-4000-8000-000000000003'::uuid);
delete from custom.record where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and id in ('11111111-0006-4000-8000-000000000001'::uuid,
             '11111111-0006-4000-8000-000000000002'::uuid,
             '11111111-0006-4000-8000-000000000003'::uuid,
             '11111111-0006-4000-8000-000000000011'::uuid,
             '11111111-0006-4000-8000-000000000021'::uuid);
delete from custom.record where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
  and id in ('11111111-0005-4000-8000-000000000001'::uuid,
             '11111111-0005-4000-8000-000000000002'::uuid,
             '11111111-0005-4000-8000-000000000003'::uuid);

drop function if exists custom.parity_values(uuid, uuid);
drop function if exists custom._derived_fields();
drop function if exists custom.derived_values(uuid, uuid);
drop function if exists custom.derived_value(uuid, uuid, jsonb, jsonb);
drop function if exists custom.formula_value(uuid, uuid, jsonb, jsonb);
drop function if exists custom.rollup_value(uuid, uuid, jsonb);
drop function if exists custom.lookup_value(uuid, uuid, jsonb);
drop function if exists custom.relation_targets(uuid, uuid, text);
drop function if exists custom._field_type_parity_guard();
drop function if exists custom.parity_type(jsonb);
drop function if exists custom.file_kernel_id();
drop function if exists custom.person_kernel_id();
drop function if exists custom.parity_field_types();

-- W1-VAL's body, restored exactly (sha256 694cf0acfc37b0099c35093000f3318d580961c1ef703b2b5987d9bc6f4c7681).
create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  select (r.data - '_computed' - '_retired' - '_values' - '_sources')
         || coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                        from jsonb_each(coalesce(r.data -> '_computed', '{}'::jsonb)) e),
                     '{}'::jsonb)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_record_id;
$function$;

-- W1-VAL's body, restored exactly (sha256 82175650d8f6307418e1863c8fb431d786b50dca87175566eaca201a7414bc7f).
create or replace function custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
 returns table(field_key text, field_id uuid, value jsonb, value_version integer,
                source jsonb, absent_reason text, actor text, on_behalf_of text,
                written_at timestamptz, alternates jsonb)
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  with r as (
    select rec.* from custom.record rec
     where rec.organization_id = p_organization_id and rec.id = p_record_id
  ),
  keys as (
    -- Every key the plain read returns, plus every key that is ABSENT WITH A REASON —
    -- VAL-2 would be unreadable if a reasoned absence did not come back as a row.
    select k from r, jsonb_object_keys(custom.record_values(p_organization_id, p_record_id)) k
    union
    select k from r, jsonb_object_keys(coalesce(r.data -> '_values', '{}'::jsonb)) k
  )
  select keys.k,
         f.id,
         case when (r.data -> '_computed') ? keys.k
              then r.data -> '_computed' -> keys.k -> 'value'
              else r.data -> keys.k end,
         coalesce((r.data -> '_values' -> keys.k ->> 'ver')::integer, 1),
         r.data -> '_sources' -> (r.data -> '_values' -> keys.k ->> 'src'),
         r.data -> '_values' -> keys.k ->> 'absent',
         r.data -> '_values' -> keys.k ->> 'actor',
         r.data -> '_values' -> keys.k ->> 'on_behalf_of',
         (r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
         coalesce((select jsonb_agg(jsonb_build_object('value', a -> 'value',
                                                       'rank',  a -> 'rank',
                                                       'source', r.data -> '_sources' -> (a ->> 'src'))
                                    order by (a ->> 'rank')::int)
                     from jsonb_array_elements(coalesce(r.data -> '_values' -> keys.k -> 'alternates',
                                                        '[]'::jsonb)) a),
                  '[]'::jsonb)
    from r
    cross join keys
    left join lateral (
      select af.id
        from custom.applicable_fields(p_organization_id, r.table_id,
                                      r.data ->> custom.table_type_field(p_organization_id, r.table_id)) af
       where af.data ->> 'key' = keys.k
       limit 1
    ) f on true
   order by keys.k;
$function$;
