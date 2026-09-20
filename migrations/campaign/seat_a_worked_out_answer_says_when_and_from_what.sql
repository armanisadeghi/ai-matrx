-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_values_versioned(uuid, uuid) f83a597ed63ac68adfc6660445e38a5ab1da4018e7bd23d5392f60adb9e2e10d
--
-- SEAT-SUITES, 2026-09-19 — A WORKED-OUT ANSWER REACHED A PERSON WITH NO MOMENT AND NOTHING
-- SAYING WHAT PRODUCED IT.
--
-- MEASURED FROM THE SEAT `authenticated` ON THE MAIN DATABASE. `custom._derived_fields`
-- stamps every write-time lookup, rollup and formula into the record's `_derived`, with the
-- value, the Field it came from, its parity type and the moment:
--
--   "_derived": {"amount_with_tax": {"at": "2026-09-18T19:45:20.97+00", "value": 440.0,
--                                    "parity": "formula",
--                                    "field_id": "11111111-0008-…-0008"}}
--
-- but `custom.read_record` strips `_derived` (it is an internal key, and rightly so), and
-- `custom.record_values_versioned` — the ONE versioned read door a client has — built its
-- envelope only out of `_values`, which a derived answer never has. So from the seat:
--
--   custom.value_read(org, 11111111-0009-…-0011, 'amount_with_tax')
--     → value 1100, value_version 1, source NULL, actor NULL, written_at NULL
--
-- The number arrives and NOTHING says when it was worked out or what worked it out. That is
-- the same class as the 19 September `_retired` defect: the store kept the fact and the door
-- threw it away, so nobody downstream could ever have it.
--
-- THE FIX: for a key the record carries a `_derived` stamp for and no `_values` envelope,
-- the read door answers with THAT stamp — `written_at` is the moment it was worked out and
-- `source` names the Field and the parity type that produced it. A typed Value is untouched:
-- `_values` still wins wherever it exists, so nothing a person typed changes shape.
--
-- WHY IT IS ADDITIVE: a CREATE OR REPLACE of a STABLE reader that only FILLS IN two columns
-- that were NULL. No table, column, row, grant or signature changes.
--
-- ITS INVERSE: migrations/inverse/seat_a_worked_out_answer_says_when_and_from_what_down.sql

create or replace function custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
 returns table(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb,
               absent_reason text, actor text, on_behalf_of text,
               written_at timestamp with time zone, alternates jsonb)
 language plpgsql stable security definer set search_path to 'pg_catalog'
as $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_values_versioned');
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'custom.record_values_versioned', 'viewer'::public.permission_level, 'record');
  return query
with r as (
    select rec.* from custom.record rec
     where rec.organization_id = p_organization_id and rec.id = p_record_id
  ),
  vals as (
    select custom.record_values(p_organization_id, p_record_id) v
  ),
  keys as (
    select k from vals, jsonb_object_keys(vals.v) k
    union
    select k from r, jsonb_object_keys(coalesce(r.data -> '_values', '{}'::jsonb)) k
  )
  select keys.k,
         f.id,
         vals.v -> keys.k,
         coalesce((r.data -> '_values' -> keys.k ->> 'ver')::integer, 1),
         -- SEAT-SUITES 2026-09-19: a WORKED-OUT answer has no `_values` envelope, and the
         -- stamp `custom._derived_fields` left is the only thing that says what produced it.
         -- Without this the number reached a person naked.
         coalesce(r.data -> '_sources' -> (r.data -> '_values' -> keys.k ->> 'src'),
                  case when r.data -> '_derived' ? keys.k
                       then jsonb_build_object(
                              'kind',     'derived',
                              'parity',   r.data -> '_derived' -> keys.k -> 'parity',
                              'field_id', r.data -> '_derived' -> keys.k -> 'field_id')
                  end),
         r.data -> '_values' -> keys.k ->> 'absent',
         r.data -> '_values' -> keys.k ->> 'actor',
         r.data -> '_values' -> keys.k ->> 'on_behalf_of',
         coalesce((r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
                  (r.data -> '_derived' -> keys.k ->> 'at')::timestamptz),
         coalesce((select jsonb_agg(jsonb_build_object('value', a -> 'value',
                                                       'rank',  a -> 'rank',
                                                       'source', r.data -> '_sources' -> (a ->> 'src'))
                                    order by (a ->> 'rank')::int)
                     from jsonb_array_elements(coalesce(r.data -> '_values' -> keys.k -> 'alternates',
                                                        '[]'::jsonb)) a),
                  '[]'::jsonb)
    from r
    cross join vals
    cross join keys
    left join lateral (
      select af.id
        from custom.applicable_fields(p_organization_id, r.table_id,
                                      r.data ->> custom.table_type_field(p_organization_id, r.table_id)) af
       where af.data ->> 'key' = keys.k
       limit 1
    ) f on true
   order by keys.k;
end;
$function$;
