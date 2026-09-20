-- INVERSE of migrations/campaign/seat_a_worked_out_answer_says_when_and_from_what.sql
-- Restores custom.record_values_versioned exactly as it stood before SEAT-SUITES, i.e. a
-- worked-out answer again reaches a person with no moment and nothing naming what produced it.

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
