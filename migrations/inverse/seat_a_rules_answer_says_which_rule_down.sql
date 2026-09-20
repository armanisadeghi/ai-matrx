-- INVERSE of migrations/campaign/seat_a_rules_answer_says_which_rule.sql
-- Restores custom.record_values_versioned as it stood after the _derived fix and before
-- the _computed one, i.e. a Rule's answer again reaches a person with no rule and no moment.

CREATE OR REPLACE FUNCTION custom.record_values_versioned(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb, absent_reason text, actor text, on_behalf_of text, written_at timestamp with time zone, alternates jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$

;
