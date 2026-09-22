-- LANE TAILS-2 — THE RED TWIN, FROM THE SEAT `authenticated`. It runs the REAL BYTES of
-- both inverses and then asks the green suite's own questions, which must all fail.
-- A guard nobody has watched fail is not a guard; this is the half that can go red.
--
-- 🚨 WHY THIS FILE WAS RESTRUCTURED (lane MANIFEST-SEAT, 2026-09-21). It was the last
-- suite in this directory running every clause as the role that OWNS `custom.record`, and
-- `check:suites-take-the-seat` was red on it alone (162 of 163). Two lanes left it alone
-- for the right reason: SEAT-RECIPE.md says a cosmetic conversion — adding the role line
-- without moving the clauses onto the doors — "is a FAKE and worse than leaving the file
-- alone". So the clauses MOVED. Measured on the main database the same day, against
-- `platform.client_callable_door` and the EXECUTE grants:
--
--   * the fixture read was `select … from custom.record`, which a client seat cannot do at
--     all. It is now `custom.read_records`, the door a screen uses, exactly as the green
--     twin reads it.
--   * RED 2 (`platform.relation_label`) is a DECLARED SIGNED-IN DOOR — `authenticated` holds
--     EXECUTE on it — so it is asked from the seat, where every grid, card and peek asks it.
--   * RED 5 and RED 6 go through `custom.table_declare`, `custom.field_declare`,
--     `custom.field_update` and `custom.read_record`, all four granted to `authenticated`,
--     so the whole `compute_on` half is now product truth rather than owner truth.
--   * RED 4 asks the CATALOG whether the resolver survived its own inverse. `pg_proc` is
--     readable from any seat, so this clause needed no privilege it did not have — and it is
--     a stronger question than the old one, which could not tell "dropped" from "not granted".
--   * RED 1 and RED 3 CANNOT be asked from a seat, and that is the store working, not a gap:
--     `custom.portal_record_title` and `custom.share_subject_name` are declared server-only in
--     `platform.client_callable_door` (`signed_in_callers = false`) and neither `authenticated`
--     nor `anon` holds EXECUTE on them. They are reached only from inside `custom.portal_card`
--     and `custom.share_access`. So those two clauses step OUT of the seat deliberately and say
--     so in as many words — the same shape, for the same two functions, as the green twin's
--     part 4 — and nothing else is asserted while out.
--
-- The inverses themselves are applied by the connected superuser, above the block, because
-- `create or replace function` in schema `custom` is not something a seat may do and never
-- should be. That is the ONE step out of the seat this file makes on purpose.
--
-- RUN IT:  ./binlocal/p.sh -f scripts/campaign-tests/tails2_red.sql
--
-- IT ROLLS BACK, and the rollback is VERIFIED outside the transaction at the end — a file
-- that put the defect back and left it there would be the worst thing in this directory.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails2_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ═══ THE REAL ROLLBACK, EXECUTED — not a description of one ══════════════════════════
-- SUPERUSER ONLY, AND ONLY HERE: applying an inverse is DDL in schema `custom`. Every
-- asserted clause below runs from the `authenticated` seat.
\i migrations/inverse/tails2_a_name_belongs_where_a_name_belongs_down.sql
\i migrations/inverse/tails2_a_formula_says_when_it_works_itself_out_down.sql

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_card   uuid;
  v_raw    text;
  v_words  text;
  v_table  uuid;
  v_labour uuid;
  v_parts  uuid;
  v_fid    uuid;
  v_doc    jsonb;
  v_red    integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/tails2_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ══════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0 — the seat is authenticated and custom.record is closed to it. The clauses below are the product''s.';

  -- One of her quotes, and what its title column actually holds — through the read door,
  -- by key, exactly as a screen sees it. A seat has no `custom.record` to select from.
  select x.id, x.document ->> 'room' into v_card, v_raw
    from custom.read_records(v_org, v_quotes, false, 200, 0) x
   where nullif(x.document ->> 'room', '') is not null
   limit 1;
  if v_card is null then
    raise exception '0: the Birchwood quotes board has no quote with a room on it';
  end if;
  if v_raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '0: this twin needs a table titled by a RELATION; "%" is already words', v_raw;
  end if;

  -- ══ RED 2 — THE RELATION CHIP THE STORE ANSWERS, FROM THE SEAT ═══════════════════════
  -- `platform.relation_label` is the one of these three a client actually calls, and it is
  -- the one every grid, card and peek falls back on. Asked from the seat that calls it.
  v_words := platform.relation_label(v_org, 'record', v_card);
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    v_red := v_red + 1;
    raise notice 'RED 2 — from the seat, platform.relation_label answers "%". As expected.', v_words;
  else
    raise exception 'RED 2 DID NOT GO RED: the old bytes answered "%"', v_words;
  end if;

  -- ══ RED 4 — THE RESOLVER ITSELF IS GONE ══════════════════════════════════════════════
  -- Asked of the catalog, from the seat: `pg_proc` needs no grant, and "does it exist" is a
  -- sharper question than "can I call it" — a seat cannot call `custom.record_words` even
  -- when it IS there, so the old `undefined_function` probe could not tell the two apart.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'custom' and p.proname = 'record_words') then
    raise exception 'RED 4 DID NOT GO RED: custom.record_words still exists after its own inverse ran';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 4 — custom.record_words does not exist on the old bytes. As expected.';

  -- ══ RED 1 and RED 3 — THE TWO SERVER-ONLY RESOLVERS ══════════════════════════════════
  -- DELIBERATELY OUT OF THE SEAT, and it is said out loud: `custom.portal_record_title` and
  -- `custom.share_subject_name` are declared server-only in platform.client_callable_door
  -- and hold NO grant for `authenticated` or `anon` — PART 0's refusal of custom.record is
  -- the same fact from the other side. They are reached only from inside `custom.portal_card`
  -- and `custom.share_access`. Nothing else is asserted while out of the seat.
  reset role;

  -- ══ RED 1 — THE PUBLIC PAGE PRINTS THE ROOM'S ID ═════════════════════════════════════
  v_words := custom.portal_record_title(v_org, v_card);
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_red := v_red + 1;
    raise notice 'RED 1 — on the pre-TAILS-2 bytes custom.portal_record_title answers "%", on a PUBLIC page. As expected.', v_words;
  else
    raise exception 'RED 1 DID NOT GO RED: the old bytes answered "%" — this twin proves nothing', v_words;
  end if;

  -- ══ RED 3 — THE SHARE DIALOG ═════════════════════════════════════════════════════════
  v_words := custom.share_subject_name(v_org, 'record', v_card);
  if v_words ~ '^[0-9a-f]{8}' then
    v_red := v_red + 1;
    raise notice 'RED 3 — custom.share_subject_name answers "%". As expected.', v_words;
  else
    raise exception 'RED 3 DID NOT GO RED: the old bytes answered "%"', v_words;
  end if;

  -- …and back into the seat for everything that follows.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'the suite did not get back into the seat — current_user is %', current_user;
  end if;

  -- ══ RED 5 — THE DOOR TOLD `compute_on` ANSWERS SUCCESS AND CHANGES NOTHING ═══════════
  -- Every call below is a door `authenticated` holds EXECUTE on, so this is what a person
  -- building a budget on her own board actually got.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name',           'budget lines (red twin)',
    'slug',           'home_renovation_budget_lines_red',
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
  v_fid := custom.field_declare(v_org, v_table,
    jsonb_build_object('key','line_total','label','Line total','type','formula',
      'expr', jsonb_build_object('op','add','args',
        jsonb_build_array(jsonb_build_object('field', v_labour),
                          jsonb_build_object('field', v_parts)))));

  perform custom.field_update(v_org, v_fid, '{"compute_on":"write"}'::jsonb);
  v_doc := custom.read_record(v_org, v_fid, false);
  if coalesce(v_doc ->> 'compute_on', '') = 'write' then
    raise exception 'RED 5 DID NOT GO RED: the old bytes applied compute_on';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 5 — from the seat, the old custom.field_update returned the field id, reported success, and the column still reads compute_on "%". As expected.',
    coalesce(v_doc ->> 'compute_on', '(absent)');

  -- ══ RED 6 — AND IT DOES NOT EVEN REFUSE THE IMPOSSIBLE ═══════════════════════════════
  begin
    perform custom.field_update(v_org, v_labour, '{"compute_on":"write"}'::jsonb);
    v_red := v_red + 1;
    raise notice 'RED 6 — from the seat, the old bytes accepted compute_on on a plain number column without a word. As expected.';
  exception when check_violation then
    raise exception 'RED 6 DID NOT GO RED: the old bytes already refused it';
  end;

  if current_user <> 'authenticated' then
    raise exception 'this suite finished outside the seat — current_user is %', current_user;
  end if;
  raise notice '% BLOCKS RED on the real bytes of both inverses, four of them from the seat.', v_red;
end;
$t$;

rollback;

-- ═══ AND THE ROLLBACK IS VERIFIED, OUTSIDE THE TRANSACTION ═══════════════════════════
do $v$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  constant uuid := '1a7fefc6-77e1-4c48-826f-003b1a2e17fd';
  v_quotes constant uuid := '0e108f31-5078-48ec-9a15-b492baa414ba';
  v_card uuid;
  v_words text;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'the verification did not take the seat — current_user is %', current_user;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'custom' and p.proname = 'record_words') then
    raise exception 'ROLLBACK FAILED: custom.record_words is still missing — the defect was left on the main database';
  end if;

  select x.id into v_card
    from custom.read_records(v_org, v_quotes, false, 200, 0) x
   where nullif(x.document ->> 'room', '') is not null
   limit 1;

  -- The client-facing half of the check, from the seat: the chip reads a name again.
  v_words := platform.relation_label(v_org, 'record', v_card);
  if v_words is null or v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception 'ROLLBACK FAILED: the relation chip is answering "%" again', v_words;
  end if;

  -- And the PUBLIC page's own resolver, which no seat may call — out of the seat, saying so,
  -- with nothing else asserted while out.
  reset role;
  v_words := custom.portal_record_title(v_org, v_card);
  if v_words ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception 'ROLLBACK FAILED: the public portal title is answering "%" again', v_words;
  end if;
  raise notice 'ROLLBACK VERIFIED — the resolver is back, the chip reads a name from the seat, and the public title reads "%".', v_words;
end;
$v$;
