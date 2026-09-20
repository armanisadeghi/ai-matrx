-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.my_level(uuid, uuid, text) eb6668581f67fe415dd1750a04e51ead51bf7ab53cc6d5082ab909fa27de8985
--
-- LANE BOOKING — DEFECT 5, AND IT IS NOT THIS LANE'S ALONE: ASKING `custom.my_level` ABOUT
-- A TABLE, USING THE WORD "table", ANSWERED NULL FOR EVERYBODY, INCLUDING ITS OWNER.
--
-- Measured on the main database 2026-09-20, as `admin@admin.com`, on a Table she created
-- minutes earlier:
--
--     custom.my_level(org, table_id, 'record')  →  admin
--     custom.my_level(org, table_id, 'table')   →  (null)
--
-- NULL is how every caller spells "no access", so the answer was not "I do not know that
-- word" — it was "you may not". A silent wrong no.
--
-- THE CAUSE. A Table IS a record (REC-25, and `custom.has_visibility` says so in its own
-- comment). The visibility arms take an entity-type token and ask `iam.has_access_for` and
-- `iam.effective_level` with it; `record` is the token a row of `custom.record` carries,
-- and `table` is a NOUN a door uses when it tells a person what it is talking about
-- ("you do not have access to this table"). `custom.assert_client_may_open` takes that
-- noun and uses it exactly that way, which is right. `custom.my_level` passed the same
-- noun on to the LEVEL lookup, where it is not a token, and got nothing back.
--
-- THE CENSUS — FIVE LIVE DOORS, FOUR OF THEM NOT THIS LANE'S. Every caller in schemas
-- `custom` and `platform` that passes a third argument to `custom.my_level`:
--
--     custom.enrich_due(…, v_table,  'table')    ← product 10, per-record AI enrichment
--     custom.enrich_cells(…, p_table_id, 'table')←        "
--     custom.io_import_begin(…, p_table_id, 'table')  ← product 9, imports
--     custom.io_import_finish(…, v_run.table_id, 'table') ←   "
--     custom.bookings(…, f.table_id, 'table')    ← product 14, this lane
--     custom.enrich_land(…, v_rid, 'record')     ← correct today, unaffected
--     custom.record_scope_context(…, p_record_id, 'record') ← correct today, unaffected
--
-- So enrichment and imports have been asking "may this person work on this Table" and
-- being told no, by name, for as long as those doors have existed.
--
-- THE FIX, AND WHY IT IS IN `my_level` AND NOT IN FIVE CALLERS. The word a door uses to
-- NAME what it is talking about should not decide what it is allowed to find out, and a
-- door that wants to say "table" in its refusal should not have to know that the access
-- system spells it "record". `custom.my_level` now resolves the noun: if the id is a row
-- of `custom.record` — which every Table, Field, Rule and Home is — the level question is
-- asked as `record`, whatever the caller called it. The noun still travels unchanged to
-- `custom.assert_client_may_open`, so refusals still say "table".
--
-- AND IT STOPS ANSWERING NULL TO A QUESTION IT DID NOT UNDERSTAND. A noun that names
-- nothing this store holds is now refused BY NAME instead of being reported as an absence
-- of access — because a wrong no that looks exactly like a right no is the failure this
-- whole defect is made of.
--
-- IT ONLY EVER WIDENS. Before this file the five callers got NULL; a person who genuinely
-- has no access still gets NULL, because the answer now comes from the same
-- `custom.effective_level` the `record` word already reached. Nobody gains access; five
-- doors stop losing it.

create or replace function custom.my_level(p_organization_id uuid, p_id uuid,
                                           p_type text default 'record')
returns public.permission_level
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me   uuid;
  v_word text := coalesce(nullif(btrim(p_type), ''), 'record');
  v_ask  text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_level');
  -- The caller's NOUN travels here unchanged, so a refusal still says "table".
  perform custom.assert_client_may_open(p_organization_id, p_id, 'custom.my_level',
                                        'viewer'::public.permission_level, v_word);
  v_me := custom.query_principal();
  if v_me is null then
    return null;
  end if;

  -- THE NOUN IS RESOLVED TO THE TOKEN. A Table, a Field, a Rule and a Home are all rows of
  -- custom.record (REC-25), and `record` is the only token the visibility arms know for
  -- one. See this file's header for the five doors this was silently refusing.
  if v_word = 'record' then
    v_ask := 'record';
  elsif exists (select 1 from custom.record r
                 where r.organization_id = p_organization_id and r.id = p_id) then
    v_ask := 'record';
  else
    v_ask := v_word;
  end if;

  return custom.effective_level(v_me, p_organization_id, p_id, v_ask);
end;
$fn$;

comment on function custom.my_level(uuid, uuid, text) is
  'The rung this person stands on for one thing. The third argument is the NOUN the caller wants in a refusal ("table", "hold", "record"); it is resolved to the token the visibility arms know before the level is looked up, because a Table is a record (REC-25) and asking about one by the word "table" used to answer NULL — which every caller reads as "no access" — for everybody, including its owner.';
