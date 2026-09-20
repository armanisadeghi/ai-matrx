-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_values_versioned(uuid, uuid) 3d2d575d4d44cad979401d6b6d413b9079a9ab1c22eb07589d4c0aac99f4eacd
--
-- SEAT-SUITES, 2026-09-19 — THE SAME DEFECT, FOR A RULE'S ANSWER. FIXING THE CLASS.
--
-- `seat_a_worked_out_answer_says_when_and_from_what.sql` closed it for `_derived`, the stamp
-- the parity floor's write-time lookups, rollups and formulas leave. A RULE's answer is
-- stamped in exactly the same way and was thrown away in exactly the same place:
-- `custom._record_rule_uses` writes `_computed -> <key> = {value, field_id, rule_id,
-- rule_version, at}`, `custom.read_record` strips `_computed` (rightly — it is internal),
-- and `custom.record_values_versioned` built its envelope only out of `_values`. So a
-- signed-in person was handed `sides_equal = true` with no rule, no version and no moment,
-- while `custom.computed_provenance` — which holds all three — carries no client grant.
--
-- THE FIX, in the one reader: a key with a `_computed` stamp and no `_values` envelope
-- answers with THAT stamp. `source` names the Rule and the version that produced it, and
-- `written_at` is the moment it was worked out. `_values` still wins wherever it exists and
-- `_derived` is unchanged, so nothing a person typed and nothing already fixed changes shape.
--
-- WHY IT IS ADDITIVE: a CREATE OR REPLACE of a STABLE reader that only FILLS IN two columns
-- that were NULL. No table, column, row, grant or signature changes.
--
-- ITS INVERSE: migrations/inverse/seat_a_rules_answer_says_which_rule_down.sql

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
                       -- SEAT-SUITES 2026-09-19, the same law for a RULE's answer: what
                       -- `custom._record_rule_uses` worked out says which Rule worked it out
                       -- and at which version, and that never reached a person either.
                       when r.data -> '_computed' ? keys.k
                       then jsonb_build_object(
                              'kind',         'computed',
                              'rule_id',      r.data -> '_computed' -> keys.k -> 'rule_id',
                              'rule_version', r.data -> '_computed' -> keys.k -> 'rule_version',
                              'field_id',     r.data -> '_computed' -> keys.k -> 'field_id')
                  end),
         r.data -> '_values' -> keys.k ->> 'absent',
         r.data -> '_values' -> keys.k ->> 'actor',
         r.data -> '_values' -> keys.k ->> 'on_behalf_of',
         coalesce((r.data -> '_values' -> keys.k ->> 'at')::timestamptz,
                  (r.data -> '_derived' -> keys.k ->> 'at')::timestamptz,
                  (r.data -> '_computed' -> keys.k ->> 'at')::timestamptz),
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
