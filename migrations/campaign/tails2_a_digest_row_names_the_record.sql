-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_record_name(uuid, uuid, jsonb) 2fa70d976c67d8d37cf25b7990ad6275d81951e02c15089551ed78cfdc968a0a
--
-- A DIGEST ROW NAMES THE RECORD — the thirteenth door, landed under BUILDERS' lock.
--
-- WHOSE FILE THIS IS. Lane TAILS-2 found and designed this one and could not apply
-- it: `custom.agg_record_name` was under lane BUILDERS' `campaign_watch.build_lock`
-- from 05:02Z (§4.14 — two lanes never land on one object at once), so TAILS-2 wrote
-- the defect and the shape into `PROGRESS-TAILS-2.md`, named this file, and left it.
-- BUILDERS holds the lock, so BUILDERS applies it. The design is TAILS-2's.
--
-- THE DEFECT, IN TAILS-2'S WORDS. `custom.agg_record_name` "loops the hard-coded keys
-- name/title/label/full_name/company/email, never consults the Table's own
-- `title_field`, and falls back to `left(p_record_id::text, 8)` — so every digest row
-- for a Table named by anything else reads as eight hex characters, and as a full
-- uuid when that column is a relation."
--
-- A Table's `title_field` may point at a RELATION column, and a relation's stored
-- value IS the other record's id (FLD-6 / REL-1) — which happens the moment somebody
-- titles a table by the thing it belongs to, the normal way to build one. The screens
-- looked right only because `useRecordLabels` resolves a relation in the browser. A
-- digest has no browser.
--
-- WHAT IT DOES NOW, in TAILS-2's order, and it never answers an id:
--   1. the Table's own `title_field` first, then title/name/label/full_name/company/
--      subject, then `custom._first_words` — which already skips the store's own
--      `_`-prefixed bookkeeping keys and refuses a uuid-shaped value.
--   2. whatever that chose goes through `custom._card_words`, so a value that IS an id
--      takes ONE hop to the record it names, under the ladder — naming a record is
--      disclosing it — and a record the subscriber may not see reads
--      `platform.relation_withheld_label()` rather than its name or its id.
--   3. `p_state` IS KEPT, and that is deliberate: a digest names a record as it was at
--      the moment it changed, not as it is now. Only when that state holds no words at
--      all does it fall through to `custom.record_words` on the live row.
--   4. nothing readable anywhere → "an untitled record", in the Table's own noun.
--      Never `left(id::text, 8)`.
--
-- WHAT IS KEPT FROM THE 2026-09-21 BUILDERS FIX in `builders_a_summary_is_not_raw_json.sql`:
-- the store's own `_`-prefixed keys are never a record's name and a name has to be a
-- scalar. Both now live inside `custom._first_words`, which is where they belong —
-- one resolver, thirteen doors.
--
-- THE INVERSE: `migrations/inverse/tails2_a_digest_row_names_the_record_down.sql`.

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
  v_noun  text;
  v_raw   text;
  v_out   text;
begin
  -- A SUMMARY NAMES THINGS. "3 records changed" is a number; "Dana Whitfield,
  -- Marcus Reyes and one more arrived" is a notification somebody acts on, which
  -- is the whole difference between this and a dashboard tile.
  if p_record_id is null then return null; end if;

  -- The Table's own word for one of its records, and its own title column. Both
  -- are read from the record's Table rather than guessed, which is the whole of
  -- TAILS-2's finding.
  select lower(nullif(btrim(coalesce(t.data ->> 'label_singular', '')), '')),
         nullif(btrim(coalesce(t.data ->> 'title_field', '')), '')
    into v_noun, v_raw
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.organization_id = p_organization_id and r.id = p_record_id;

  if v_state is null then
    select r.data into v_state from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id;
  end if;

  if v_state is not null then
    -- THE TABLE'S OWN TITLE COLUMN FIRST. `v_raw` still holds its key here.
    select coalesce(
             case when v_raw is null then null
                  else case when jsonb_typeof(v_state -> v_raw) = 'object' and (v_state -> v_raw) ? 'value'
                            then nullif(v_state -> v_raw ->> 'value', '')
                            else nullif(v_state ->> v_raw, '') end end,
             case when jsonb_typeof(v_state -> 'title') = 'object' and (v_state -> 'title') ? 'value'
                  then nullif(v_state -> 'title' ->> 'value', '') else nullif(v_state ->> 'title', '') end,
             case when jsonb_typeof(v_state -> 'name') = 'object' and (v_state -> 'name') ? 'value'
                  then nullif(v_state -> 'name' ->> 'value', '') else nullif(v_state ->> 'name', '') end,
             case when jsonb_typeof(v_state -> 'label') = 'object' and (v_state -> 'label') ? 'value'
                  then nullif(v_state -> 'label' ->> 'value', '') else nullif(v_state ->> 'label', '') end,
             case when jsonb_typeof(v_state -> 'full_name') = 'object' and (v_state -> 'full_name') ? 'value'
                  then nullif(v_state -> 'full_name' ->> 'value', '') else nullif(v_state ->> 'full_name', '') end,
             case when jsonb_typeof(v_state -> 'donor_name') = 'object' and (v_state -> 'donor_name') ? 'value'
                  then nullif(v_state -> 'donor_name' ->> 'value', '') else nullif(v_state ->> 'donor_name', '') end,
             case when jsonb_typeof(v_state -> 'customer_name') = 'object' and (v_state -> 'customer_name') ? 'value'
                  then nullif(v_state -> 'customer_name' ->> 'value', '') else nullif(v_state ->> 'customer_name', '') end,
             case when jsonb_typeof(v_state -> 'member_name') = 'object' and (v_state -> 'member_name') ? 'value'
                  then nullif(v_state -> 'member_name' ->> 'value', '') else nullif(v_state ->> 'member_name', '') end,
             case when jsonb_typeof(v_state -> 'company') = 'object' and (v_state -> 'company') ? 'value'
                  then nullif(v_state -> 'company' ->> 'value', '') else nullif(v_state ->> 'company', '') end,
             case when jsonb_typeof(v_state -> 'subject') = 'object' and (v_state -> 'subject') ? 'value'
                  then nullif(v_state -> 'subject' ->> 'value', '') else nullif(v_state ->> 'subject', '') end,
             case when jsonb_typeof(v_state -> 'email') = 'object' and (v_state -> 'email') ? 'value'
                  then nullif(v_state -> 'email' ->> 'value', '') else nullif(v_state ->> 'email', '') end,
             custom._first_words(v_state))
      into v_out;

    if v_out is not null then
      -- ONE HOP, UNDER THE LADDER. A title column that is a relation holds the
      -- other record's id; `_card_words` resolves exactly one hop, refuses to
      -- name a record this subscriber may not see, and never prints a uuid.
      return left(custom._card_words(p_organization_id, v_out, coalesce(v_noun, 'record')), 120);
    end if;
  end if;

  -- The state held no words at all — ask the live row, through the one resolver.
  v_out := custom.record_words(p_organization_id, p_record_id, coalesce(v_noun, 'record'));
  return left(coalesce(v_out, 'an untitled ' || coalesce(v_noun, 'record')), 120);
end;
$fn$;

comment on function custom.agg_record_name(uuid, uuid, jsonb) is
  'DOOR-18: what to call one record inside a summary. Reads the TABLE''s own title column first, then the naming columns, then the first real words it holds; resolves a relation-valued title one hop through custom._card_words under the ladder; and NEVER answers an id — the eight-hex fallback is gone (TAILS-2''s thirteenth door, applied under BUILDERS'' lock 2026-09-21).';
