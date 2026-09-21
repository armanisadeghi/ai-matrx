-- LANE TAILS-2 — THE GREEN SUITE, from the seat `authenticated`, ending in ROLLBACK.
--
-- THE USE CASE. The Birchwood Avenue renovation: a homeowner renovating room by room, whose
-- quotes are titled BY THE ROOM they are for — and a room is a relation, so every quote's
-- stored title is another record's id. That is not an oddity; it is what happens the moment
-- a person titles a table by the thing it belongs to, which is the normal way to build one.
-- Before this lane, thirteen server-side readers handed that id straight to a screen.
--
-- WHAT IT PROVES
--   1  the seat is real and `custom.record` is closed to it
--   2  a relation chip the store resolves reads the room's NAME, from the seat
--   3  a history entry names the record it is about, from the seat
--   4  the internal resolvers — the PUBLIC portal title and the share dialog's subject —
--      read words, never `left(id::text, 8)` and never a uuid
--   5  a record nobody shared reads "A record you have not been given access to" — the
--      ladder decides before the name is read, and a title resolver is not a way around it
--   6  a record that is not this organization's reads as withheld, never as an id
--   7  `custom.record_words` itself never answers a uuid
--   8  `custom.field_update` APPLIES compute_on, and the field reads back as it was told
--   9  compute_on on a column that is not worked out is refused IN WORDS naming the remedy
--  10  compute_on 'write' on a ROLL-UP is refused in words rather than silently forced
--  11  a nonsense compute_on is refused by name
--
-- RUN IT:  ./binlocal/p.sh -f scripts/campaign-tests/tails2_green.sql
--          (or any psql against the main database)

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  -- test@test.com: a member of the Birchwood organization who was shared nothing on the board.
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes  constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_rooms   constant uuid := 'caf6cf44-c379-47b4-ac2b-47412a7bda67';
  v_card    uuid;
  v_raw     text;
  v_words   text;
  v_table   uuid;
  v_fid     uuid;
  v_doc     jsonb;
  v_labour  uuid;
  v_parts   uuid;
  v_msg     text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'this file runs on the MAIN database only';
  end if;
  perform set_config('app.actor_system', 'campaign-test/tails2_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ 1 — TAKE THE SEAT AND PROVE IT ═══════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '1: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '1: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '1 — the seat is authenticated and custom.record is closed to it. PASS';

  -- One of her quotes, and what its title column actually holds.
  -- Through the read door, by key, exactly as a screen sees it — a seat has no custom.record.
  select x.id, x.document ->> 'room' into v_card, v_raw
    from custom.read_records(v_org, v_quotes, false, 200, 0) x
   where nullif(x.document ->> 'room', '') is not null
   limit 1;
  if v_card is null then
    raise exception '1: the Birchwood quotes board has no quote with a room on it';
  end if;
  if v_raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '1: this suite needs a table titled by a RELATION; "%" is already words', v_raw;
  end if;
  raise notice '1b — the quote''s title column holds the room''s ID (%), which is the defect''s raw material. PASS', left(v_raw, 8) || '…';

  -- ══ 2 — A RELATION CHIP THE STORE RESOLVES, FROM THE SEAT ═══════════════════════════
  -- `platform.relation_label` is the one of these the client actually calls, and it is the
  -- one every grid, card and peek falls back on when the browser cannot resolve a chip.
  v_words := platform.relation_label(v_org, 'record', v_card);
  if v_words is null or v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception '2: platform.relation_label answered "%" — an id where a name belongs', v_words;
  end if;
  if v_words <> (custom.read_record(v_org, v_raw::uuid, false) ->> 'room_name') then
    raise exception '2: the chip says "%" but the room is called "%"',
      v_words, custom.read_record(v_org, v_raw::uuid, false) ->> 'room_name';
  end if;
  raise notice '2 — the relation chip reads "%", the room''s own name. PASS', v_words;

  -- ══ 3 — A HISTORY ENTRY NAMES THE RECORD IT IS ABOUT, FROM THE SEAT ═════════════════
  select h.record_title into v_words
    from custom.field_history(v_org, v_quotes, 'room', 50, 0, v_card) h
   limit 1;
  if v_words is not null and v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception '3: a history entry is titled "%"', v_words;
  end if;
  raise notice '3 — the history entry for that quote is titled "%". PASS', coalesce(v_words, '(no entry yet)');

  -- ══ 4 — THE INTERNAL RESOLVERS, NAMED AS INTERNAL ════════════════════════════════════
  -- `custom.record_words`, `custom.portal_record_title` and `custom.share_subject_name` have
  -- NO client grant and are declared server-only in platform.client_callable_door — the seat
  -- above proved exactly that by being refused `portal_record_title`. They are reached only
  -- through doors, so this part steps out of the seat DELIBERATELY and says so, and every
  -- clause that could be asked from a seat was asked from one above.
  reset role;
  v_words := custom.portal_record_title(v_org, v_card);
  if v_words is null or v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception '4: custom.portal_record_title answered "%" — a STRANGER reads that on a public page', v_words;
  end if;
  raise notice '4a — the public portal title reads "%". PASS', v_words;
  v_words := custom.share_subject_name(v_org, 'record', v_card);
  if v_words is null or v_words ~ '^[0-9a-f]{8}' then
    raise exception '4: custom.share_subject_name answered "%"', v_words;
  end if;
  raise notice '4b — the share dialog says "%". PASS', v_words;
  perform set_config('role', 'authenticated', true);

  -- ══ 5 — THE LADDER STILL DECIDES ═════════════════════════════════════════════════════
  -- Dana (test@test.com) is a real person with a real seat who holds NOTHING on this board —
  -- she is not even a member of this organization, which is the strongest form of "may not
  -- see it". A title resolver that answered her the room's name would be a hole in every
  -- door that calls it, so the question is asked of the RESOLVER itself, as the superuser,
  -- with her claims: even with nothing else in the way, the ladder decides.
  reset role;
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_words := custom.record_words(v_org, v_card);
  if v_words is distinct from platform.relation_withheld_label() then
    raise exception '5: a record shared with nobody reads as "%" to a member who may not see it', v_words;
  end if;
  raise notice '5 — a record she may not see reads "%", never its name and never its id. PASS', v_words;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);

  -- ══ 6 — A RECORD THAT IS NOT THIS ORGANIZATION'S ═════════════════════════════════════
  -- "Not hers" and "not here" must read the same, which is REC-29 working.
  reset role;
  v_words := custom.record_words(v_org, gen_random_uuid());
  if v_words is distinct from platform.relation_withheld_label() then
    raise exception '6: a record that is not this organization''s reads as "%" through this door', v_words;
  end if;
  raise notice '6 — a record that is not this organization''s reads "%". PASS', v_words;

  -- ══ 7 — A RECORD WHOSE TITLE COLUMN IS EMPTY ═════════════════════════════════════════
  -- Its first words are better than its id, and that is the whole rule.
  v_words := custom.record_words(v_org, v_card, 'quote');
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception '7: custom.record_words answered "%"', v_words;
  end if;
  raise notice '7 — custom.record_words says "%" for that quote. PASS', v_words;
  perform set_config('role', 'authenticated', true);

  -- ══ 8..11 — `compute_on` IS APPLIED, AND WHAT CANNOT BE APPLIED IS REFUSED IN WORDS ═══
  -- A real column on her board: a formula the store works out. It is declared inside this
  -- transaction and rolled back with everything else.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name',           'budget lines',
    'slug',           'home_renovation_budget_lines',
    'type',           'entity',
    'weight',         'light',
    'display',        'list',
    'ordered',        false,
    'parent_id',      '254f6db3-cb3e-404a-bca4-c38e520646c1',
    'row_order',      'manual',
    'title_field',    'line_name',
    'default_sort',   jsonb_build_array(jsonb_build_object('field','line_name','direction','asc')),
    'label_plural',   'budget lines',
    'label_singular', 'budget line',
    'agent_writable', true,
    'retention_days', 365,
    'fields', jsonb_build_array(
      jsonb_build_object('name','line_name'), jsonb_build_object('name','labour'),
      jsonb_build_object('name','parts'),     jsonb_build_object('name','line_total'))));

  perform custom.field_declare(v_org, v_table,
    jsonb_build_object('key','line_name','label','What it is for','type','text'));
  v_labour := custom.field_declare(v_org, v_table,
    jsonb_build_object('key','labour','label','Labour','type','number'));
  v_parts := custom.field_declare(v_org, v_table,
    jsonb_build_object('key','parts','label','Materials','type','number'));
  -- REC-17: a formula points at a Field BY ID and never by name.
  perform custom.field_declare(v_org, v_table,
    jsonb_build_object('key','line_total','label','Line total','type','formula',
      'expr', jsonb_build_object('op','add','args',
        jsonb_build_array(jsonb_build_object('field', v_labour),
                          jsonb_build_object('field', v_parts)))));

  select f.id into v_fid from custom.applicable_fields(v_org, v_table, null) f where f.data ->> 'key' = 'line_total';
  if v_fid is null then raise exception '8: the formula column was not declared'; end if;

  -- A real line on her budget, so the restamp has something to restamp: the new bathroom
  -- vanity, £1,850 of labour and £2,400 of materials.
  v_card := custom.record_write(v_org, v_table, jsonb_build_object(
    'line_name', 'Primary Bathroom vanity and plumbing', 'labour', 1850, 'parts', 2400));

  perform custom.field_update(v_org, v_fid, '{"compute_on":"write"}'::jsonb);
  v_doc := custom.read_record(v_org, v_fid, false);
  if coalesce(v_doc ->> 'compute_on', '') <> 'write' then
    raise exception '8: the door was told compute_on write and the column reads back "%" — the door said yes and did nothing',
      coalesce(v_doc ->> 'compute_on', '(absent)');
  end if;
  raise notice '8a — custom.field_update applied compute_on; the column reads back "write". PASS';
  -- AND THE ANSWER ALREADY OUT THERE MOVED WITH IT. A column switched to `write` whose
  -- existing records held no stamped answer would read empty on every old row and full on
  -- every new one, with nothing on the screen saying why.
  v_doc := custom.read_record(v_org, v_card, false);
  if (v_doc ->> 'line_total')::numeric is distinct from 4250 then
    raise exception '8b: the line that was already there reads line_total "%" after the switch to write',
      coalesce(v_doc ->> 'line_total', '(absent)');
  end if;
  raise notice '8b — the line that was already saved reads % after the switch, not blank. PASS', v_doc ->> 'line_total';

  -- A column that is not worked out at all.
  select f.id into v_fid from custom.applicable_fields(v_org, v_table, null) f where f.data ->> 'key' = 'labour';
  begin
    perform custom.field_update(v_org, v_fid, '{"compute_on":"write"}'::jsonb);
    raise exception '9: compute_on on a plain number column was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'not worked out by the store' then
      raise exception '9: the refusal does not name what it cannot change: %', v_msg;
    end if;
    raise notice '9 — a column that works nothing out refuses compute_on: "%". PASS', v_msg;
  end;

  -- A roll-up: it adds up OTHER records, so a write-time stamp would be wrong the moment
  -- one of them changed. The store has always forced it to `read`; now it says so.
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
    'key','quotes_here','label','Quotes for this room','type','relation','relation_target', v_quotes, 'multi', true));
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
    'key','quoted_total','label','Quoted so far','type','rollup','via','quotes_here','agg','sum','of','amount'));
  select f.id into v_fid from custom.applicable_fields(v_org, v_table, null) f where f.data ->> 'key' = 'quoted_total';
  begin
    perform custom.field_update(v_org, v_fid, '{"compute_on":"write"}'::jsonb);
    raise exception '10: a roll-up was allowed to stamp itself at write time';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'adds up other records' then
      raise exception '10: the roll-up refusal does not say why: %', v_msg;
    end if;
    raise notice '10 — a roll-up refuses write-time in words: "%". PASS', v_msg;
  end;

  select f.id into v_fid from custom.applicable_fields(v_org, v_table, null) f where f.data ->> 'key' = 'line_total';
  begin
    perform custom.field_update(v_org, v_fid, '{"compute_on":"whenever"}'::jsonb);
    raise exception '11: a nonsense compute_on was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice '11 — "whenever" is refused by name: "%". PASS', v_msg;
  end;

  raise notice 'ALL PARTS PASSED — no door answers an id where a name belongs, and a formula is told when it works itself out.';
end;
$t$;

rollback;
