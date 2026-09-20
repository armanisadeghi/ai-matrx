-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_view_admits_state(jsonb, jsonb) 21b5eb01d37cfec6356300c695d8d60e0b7679d7bbfd1d40151eeb0445a5d17d
--
-- THE SECOND DEFECT THE FIRST LIVE RUN FOUND, AND IT WAS THE PRODUCT'S WHOLE POINT.
--
-- `custom.record_as_of` does not hand back the record's document. It hands back the
-- ROW — id, version, metadata, table_id, created_at, deleted_at, visibility — with
-- the document nested under `data`:
--
--   {"id": "915f489a…", "data": {"name": "Dana Whitfield", "stage": "new"},
--    "version": 1, "deleted_at": null, …}
--
-- `custom.agg_view_admits_state` was given that envelope and asked whether it
-- matched `{"stage": "new"}`. It looked for a top-level `stage`, found none, and
-- answered FALSE for every record at every past moment. The consequence was exact
-- and invisible: NOTHING had ever been in the view before, so every change looked
-- like an arrival. Editing a lead's phone number re-announced the lead — measured:
-- `agg_subscription_fire_entered` returned 1 for a phone edit — and a digest could
-- never report that anything had LEFT, because nothing had ever been in.
--
-- THE CLASS: two callers pass this predicate two different shapes — one the live
-- `custom.record.data`, one a replayed row — and a helper that silently accepts
-- either and is right about only one is a trap for the next caller too. So the
-- predicate now RECOGNISES the envelope rather than each caller unwrapping it:
-- a jsonb carrying `data` together with `id` and `data_class` is a row, and it is
-- read as one — including its `deleted_at`, so a record that was in the bin at the
-- watermark was not in the view then either.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.agg_view_admits_state(p_definition jsonb, p_state jsonb)
returns boolean
language plpgsql
immutable
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb;
  v_key text;
begin
  if p_state is null then return false; end if;

  -- ONE PREDICATE, EITHER SHAPE. custom.record_as_of replays the whole ROW and puts
  -- the document under `data`; custom.record.data IS the document. Recognising the
  -- envelope here means no caller can pass the wrong one, which is exactly what
  -- happened the first time this ran against real history.
  if jsonb_typeof(p_state -> 'data') = 'object' and p_state ? 'id' and p_state ? 'data_class' then
    if coalesce(p_state ->> 'deleted_at', '') <> '' then
      return false;                  -- in the bin at that moment is not in the view at that moment
    end if;
    v_doc := p_state -> 'data';
  else
    v_doc := p_state;
  end if;

  for v_key in select k from jsonb_object_keys(coalesce(p_definition -> 'filters', '{}'::jsonb)) k loop
    if coalesce(case when jsonb_typeof(v_doc -> v_key) = 'object' and (v_doc -> v_key) ? 'value'
                     then v_doc -> v_key ->> 'value' else v_doc ->> v_key end, '')
       is distinct from (p_definition -> 'filters' ->> v_key) then
      return false;
    end if;
  end loop;
  return true;
end;
$fn$;

comment on function custom.agg_view_admits_state(jsonb, jsonb) is
  'DOOR-18: the saved view''s filter predicate, over either a live custom.record document or a row replayed by custom.record_as_of — it recognises the replayed envelope and reads its deleted_at, so "was this in the view then" is answered about the record rather than about the shape history happened to hand back.';
