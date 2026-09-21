-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_record_name(uuid, uuid, jsonb) 4e3bd630c3e7122dc614b7a6946c80d0e830936b86ce227543ebf27689d40d14
--
-- A WEEKLY DONOR SUMMARY MADE OF RAW JSON.
--
-- WHAT THE FOURTH BROWSER WALK FOUND (lane BUILDERS, 2026-09-21). Hands & Hope
-- Alliance scheduled a Monday-morning donor summary over its 50 real pledges and
-- pressed "Send me one now". The summary came back:
--
--     08:00: 50 new
--     {"status": {"at": "2026-09-21T01:03:08.220429+00:00", "ver": 1, "actor":
--     "user", "on_behalf_of": null}, "amount_usd": {, {"status": {"at": …
--
-- — fifty times, 120 characters each. `custom.agg_record_name` falls back to
-- "the first non-empty value this record holds, in key order" when a Table has
-- no naming column, and every record in this store carries `_values`, the
-- per-field envelope of who wrote what and when. In key order `_` sorts before
-- every letter, so `_values` was the first key on every row; it has no `value`
-- member, so the whole envelope came back as the record's NAME.
--
-- The store's own bookkeeping keys are never what a thing is called, and a name
-- has to be a scalar. Both are now true, and three more real naming columns
-- (`donor_name`, `customer_name`, `member_name`) are preferred before the
-- fallback ever runs — they are what the tables in front of us actually use.
--
-- THE INVERSE: `migrations/inverse/builders_a_summary_is_not_raw_json_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.agg_record_name(p_organization_id uuid, p_record_id uuid,
                                                  p_state jsonb default null)
returns text
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_state jsonb := p_state;
  v_key   text;
  v_val   text;
begin
  -- A SUMMARY NAMES THINGS. "3 records changed" is a number; "Dana Whitfield,
  -- Marcus Reyes and one more arrived" is a notification somebody acts on, which
  -- is the whole difference between this and a dashboard tile.
  if v_state is null then
    select r.data into v_state from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  end if;
  if v_state is null then return left(p_record_id::text, 8); end if;

  foreach v_key in array array['name', 'title', 'label', 'full_name', 'company', 'email',
                               'donor_name', 'customer_name', 'member_name'] loop
    v_val := case when jsonb_typeof(v_state -> v_key) = 'object' and (v_state -> v_key) ? 'value'
                  then v_state -> v_key ->> 'value' else v_state ->> v_key end;
    if coalesce(btrim(v_val), '') <> '' then return left(v_val, 120); end if;
  end loop;

  -- Nothing recognisable: the first non-empty text value the record holds, in key
  -- order, so a Table whose first column is called something else still reads as a
  -- thing rather than as a uuid.
  -- 🚨 THE STORE'S OWN KEYS ARE NOT THE RECORD'S WORDS (walk 4, 2026-09-21).
  -- Every record carries `_values` — the per-field envelope of who wrote what and
  -- when — and in key order `_` sorts before every letter, so this fallback picked
  -- `_values` on the very first row, found no `value` key inside it, and returned
  -- THE WHOLE ENVELOPE AS THE RECORD'S NAME. Hands & Hope Alliance's Monday donor
  -- summary came out as fifty names, each 120 characters of
  -- `{"status": {"at": "2026-09-21T01:03:08…", "ver": 1, "actor": "user"…` — the
  -- one thing a summary exists not to be. Anything the store prefixes with `_`
  -- is its own bookkeeping and is never what a thing is called.
  --
  -- It also has to be a SCALAR. An object or an array that happens to sort first
  -- would read just as badly as `_values` did.
  select case when jsonb_typeof(value) = 'object' and value ? 'value' then value ->> 'value'
              else v_state ->> key end
    into v_val
    from jsonb_each(v_state)
   where key not in ('id', 'table_id', 'organization_id')
     and left(key, 1) <> '_'
     and (jsonb_typeof(value) in ('string', 'number', 'boolean')
          or (jsonb_typeof(value) = 'object' and value ? 'value'
              and jsonb_typeof(value -> 'value') in ('string', 'number', 'boolean')))
     and coalesce(case when jsonb_typeof(value) = 'object' and value ? 'value' then value ->> 'value'
                       else v_state ->> key end, '') <> ''
   order by key
   limit 1;
  return coalesce(left(v_val, 120), left(p_record_id::text, 8));
end;
$fn$;
