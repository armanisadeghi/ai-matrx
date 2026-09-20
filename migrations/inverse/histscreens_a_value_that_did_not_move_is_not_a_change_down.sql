-- chair-step: the inverse of histscreens_a_value_that_did_not_move_is_not_a_change.sql. It
-- puts custom.io_changed_keys back to the body that compared WHOLE value envelopes — so
-- every field of every version reads as changed again, because `at`, `actor` and
-- `on_behalf_of` are re-stamped on every write — and then drops the helper that body no
-- longer calls. It is the definition that file's `-- based-on:` line pins. Nothing else is
-- created, dropped or revoked; no declaration row and no data is touched.
-- lane: HISTORY-SCREENS

create or replace function custom.io_changed_keys(p_old jsonb, p_new jsonb)
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $$
  with keys as (
    select k from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
    union select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
    union select k from jsonb_object_keys(case when jsonb_typeof(p_old -> '_values') = 'object'
                                               then p_old -> '_values' else '{}'::jsonb end) k
    union select k from jsonb_object_keys(case when jsonb_typeof(p_new -> '_values') = 'object'
                                               then p_new -> '_values' else '{}'::jsonb end) k
    union select e ->> 'key' from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e
    union select e ->> 'key' from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e
  )
  select coalesce(array_agg(k order by k), array[]::text[])
    from keys
   where k is not null
     and left(k, 1) <> '_'
     and ((coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k)
          or (p_old -> '_values' -> k) is distinct from (p_new -> '_values' -> k)
          or (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k)
             is distinct from
             (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k));
$$;

drop function if exists custom.io_value_shape(jsonb);
