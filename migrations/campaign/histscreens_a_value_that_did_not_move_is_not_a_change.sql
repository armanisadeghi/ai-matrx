-- target: branch,production
-- additive: yes
--   It REPLACES one function body in place, `custom.io_changed_keys`, pinned by the
--   `-- based-on:` line below. The signature, the return type and the volatility are
--   unchanged. It creates nothing, drops nothing, revokes nothing, touches no table,
--   column, trigger, policy or enum, and rewrites no row.
--   The inverse is `migrations/inverse/histscreens_a_value_that_did_not_move_is_not_a_change_down.sql`.
-- guard: custom/system_enabled
-- based-on: custom.io_changed_keys(jsonb, jsonb) 9dd6c9abdc26a0dd80369471fc14df702827bebc68df701cd3628da5c9f4a87d
--
-- LANE HISTORY-SCREENS — a defect found by running `record_history` over a real record
-- and READING the timeline it produced.
--
-- ════════════════════════════════════════════════════════════════════════════════
-- EVERY VERSION SAID EVERY FIELD CHANGED.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- MEASURED on the main database, 2026-09-20. A job with a title, a price and a stage; one
-- write that changed ONLY the price. The version's stored envelope:
--
--   "price": {"at": "…:37.817567+00", "ver": 3, "actor": "agent", "on_behalf_of": "…"}
--   "stage": {"at": "…:37.817567+00", "ver": 1, "actor": "agent", "on_behalf_of": "…"}
--   "title": {"at": "…:37.817567+00", "ver": 1, "actor": "agent", "on_behalf_of": "…"}
--
-- `ver` is right: the price is on its third value and the other two are on their first.
-- But `custom.stamp_value_envelopes` re-stamps `at`, `actor` and `on_behalf_of` onto
-- EVERY value on EVERY write — they describe THE WRITE, not the value — so
-- `p_old -> '_values' -> k  is distinct from  p_new -> '_values' -> k` is true for every
-- key of every version, always. Lane MERGE-HISTORY widened this comparison to the
-- envelope for a good reason (a merge files the losing phone number as a ranked alternate
-- and the document's top level does not move), and the widening swept these three in.
--
-- SO THE TIMELINE SAID "Job: Roof repair → Roof repair" under every version, and
-- `custom.io_revisions`' own `changed_fields` has been over-counting the same way since
-- MERGE-HISTORY landed — "2 field(s) changed" on a write that changed one.
--
-- THE FIX IS THE CLASS, not the reader: the three write-bookkeeping keys are dropped from
-- BOTH sides before the envelopes are compared. What is left is what the value IS — its
-- version, its source pointer, its absence reason, its alternates and its periods — so a
-- value whose envelope says only "somebody wrote to this record" is not a value that
-- moved. `_retired` and the document's top level are compared exactly as before.
--
-- Nothing else changes: every caller (`custom.io_revisions`, `custom.history_changes`,
-- `custom.record_history`, `custom.field_history`) inherits the correction, and a merge,
-- a retype and a dated correction are still reported, because those change `ver`, `src`,
-- `alternates` or `_retired` — none of which is touched here.

-- ─────────────────────────────────────────────────────────────────────────────
-- custom.io_value_shape — what a value IS, with what the WRITE was stripped off.
--
-- `at`, `actor` and `on_behalf_of` are stamped onto every value on every write by
-- `custom.stamp_value_envelopes`: they say who touched the RECORD and when, which is the
-- version row's own job and is answered there. What is left — `ver`, `src`, `absent`,
-- `alternates`, `periods`, `dated` — is what the value is, and two of those being equal
-- is what "this value did not move" means.
--
-- It is IMMUTABLE because its caller is, and it reaches nothing.
-- ─────────────────────────────────────────────────────────────────────────────

create function custom.io_value_shape(p_envelope jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case
           when p_envelope is null then null
           when jsonb_typeof(p_envelope) <> 'object' then p_envelope
           else p_envelope - 'at' - 'actor' - 'on_behalf_of'
         end;
$$;

create or replace function custom.io_changed_keys(p_old jsonb, p_new jsonb)
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $$
  -- Envelope bookkeeping is not a value: `_values`, `_sources`, `_computed`, `_derived`,
  -- `_retired`, `_actor` and anything else the store keeps under a leading underscore is
  -- never itself a changed key.
  --
  -- MERGE-HISTORY: BUT WHAT THEY HOLD IS. A merge keeps the losing record's phone number
  -- as a ranked alternate under `_values.phone.alternates`, a retype files a value it
  -- could not carry under `_retired`, and a dated correction rewrites
  -- `_values.address.periods`. In every one of those the field changed and the document's
  -- top level did not, so asking only the top level answered "nothing moved" about the
  -- operations people most want to see. The keys are therefore gathered from three places
  -- and judged in all three.
  --
  -- HISTORY-SCREENS: AND THREE OF THE ENVELOPE'S KEYS DESCRIBE THE WRITE, NOT THE VALUE.
  -- `custom.stamp_value_envelopes` puts `at`, `actor` and `on_behalf_of` on EVERY value
  -- on EVERY write, so comparing whole envelopes made every field of every version read
  -- as changed. They are dropped from both sides before the comparison; everything that
  -- says what the value IS stays.
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
          or custom.io_value_shape(p_old -> '_values' -> k)
             is distinct from custom.io_value_shape(p_new -> '_values' -> k)
          or (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_old -> '_retired') = 'array'
                      then p_old -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k)
             is distinct from
             (select jsonb_agg(e order by e::text) from jsonb_array_elements(
                 case when jsonb_typeof(p_new -> '_retired') = 'array'
                      then p_new -> '_retired' else '[]'::jsonb end) e where e ->> 'key' = k));
$$;
