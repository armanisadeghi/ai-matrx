-- LANE FIX-10B-F6 — THE GREEN SUITE. On the MAIN database, from the seat `authenticated`,
-- in one transaction that ends in ROLLBACK. Everything it makes — one disposable
-- organization, its home, a Crews table, its columns, its records, a document template, a
-- rendered version and the signature sealing it — disappears with it.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/fix10b_f6_green.sql
--
-- ITS RED TWIN is `scripts/campaign-tests/fix10b_f6_red.sql`, which runs the REAL BYTES of
-- `migrations/inverse/fix10b_f6_the_store_names_every_kind_a_column_can_be_down.sql` inside
-- its own rolled-back transaction and asserts the defect exactly as VERIFIER-10 measured it.
--
-- WHAT IT IS ABOUT (VERIFIER-10, F6, HIGH). Under a rendered document on Rincon Plumbing's
-- Crews table the screen said: "To ask somebody to sign one of these, Crews needs a signature
-- column — a text column whose format is signature. Declare one in section 1 and the button
-- appears here." Section 1 has no format control and no signature choice, because no list the
-- panel could read named one: the store published `custom.parity_field_types()`, the fourteen
-- parity types, and `signature` is not one of them — it lived as an inline literal inside
-- `custom._field_document_for`, reachable only by a caller that already knew to send
-- `format: signature` by hand. So the e-sign half of Documents was unreachable from every
-- screen, although `custom.doc_sign` is granted to `authenticated`.
--
-- THE REAL USE CASE, and nothing invented: Rincon Plumbing's truck-assignment sheet. Each
-- Crews row is one truck, its lead technician and the coverage zone it runs; the lead
-- technician signs off the week's assignment on the rendered sheet, which is exactly the
-- signature the store could not hold.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED, one per part:
--   1  drop `custom.field_kinds()`, or take `signature` out of its extra rows      → 1a, 1b, 1c
--   2  take the `signature` arm back out of `custom._field_document_for`'s alias
--      chain (that is literally what the inverse does)                             → 2a, 2b
--   3  widen `custom.doc_signature_field_ok` so any text column is signable        → 3c
--   3  break `custom.doc_sign` or `custom.doc_signature_intact`                    → 3a, 3b, 3d
--   4  point the "there is no kind of column called X" hint back at the parity
--      floor alone, so the refusal names a list that does not contain signature    → 4a
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, in every part, because a door that answers
-- "yes" to everything passes a test that only ever asks once: 1a's `signature` is paired with
-- 1b's fourteen parity rows that must all still be there; 2a's signature column is paired with
-- 2b's plain text column that must NOT come back signable; 3a's seal that holds is paired with
-- 3c's refusal to sign the plain column beside it; 4a's refusal is paired with the word it
-- must contain.

\set ON_ERROR_STOP on
\timing off

\set suite 'fix10b_f6_green.sql'
\set requires 'function:custom.field_kinds'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_crews   uuid;
  v_f_sign  uuid;
  v_f_note  uuid;
  v_f_truck uuid;
  v_f_lead  uuid;
  v_f_zone  uuid;
  v_truck   uuid;
  v_tpl     uuid;
  v_render  uuid;
  v_sig     uuid;
  v_doc     jsonb;
  v_intact  jsonb;
  v_caught  text;
  v_hint    text;
  v_kinds   integer;
  v_boss    text := current_user;   -- the connected role, for the two reads no client door covers
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- FIXTURES, as the connected role.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('app.actor_system', 'campaign-test/fix10b_f6_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co',
          'rincon-plumbing-f6-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'fix10b_f6_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE ONE REGISTRY. Read as the connected role, on purpose: the `custom`
  -- schema is declared CLOSED, so its DDL guard takes back any client EXECUTE grant that has
  -- no `platform.client_callable_door` row — and this registry wants none. It is consumed the
  -- way `custom.parity_field_types()` already is by every screen: generated into
  -- `@ai-matrx/records`'s store.generated.ts and read from that mirror at run time.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 1a. It names `signature`, which is the whole point: a list the panel can read now
  --     contains the kind `custom.doc_sign` is the only consumer of.
  if not exists (select 1 from custom.field_kinds() k where k.kind = 'signature') then
    raise exception '1a: custom.field_kinds() does not publish `signature`, so no screen can offer it';
  end if;
  if (select k.behavior from custom.field_kinds() k where k.kind = 'signature') <> 'text' then
    raise exception '1a: the registry says a signature is made of %, and custom.doc_signature_field_ok accepts text',
      (select k.behavior from custom.field_kinds() k where k.kind = 'signature');
  end if;
  if (select k.parity from custom.field_kinds() k where k.kind = 'signature') then
    raise exception '1a: the registry calls signature a parity type, and custom.parity_type answers nothing for it — the two would disagree on every field';
  end if;

  -- 1b. THE OTHER SIDE OF 1a. The registry SELECTS from the parity floor rather than
  --     restating it, so all fourteen are still there and each still says it is one.
  select count(*) into v_kinds from custom.parity_field_types() p
   where not exists (select 1 from custom.field_kinds() k where k.kind = p.parity_type and k.parity);
  if v_kinds <> 0 then
    raise exception '1b: % parity types are missing from custom.field_kinds(), so the registry is a SECOND list rather than the one', v_kinds;
  end if;

  -- 1c. And it names the five that are not on the floor, which is the class this lane closed:
  --     they used to be inline literals inside the door and nothing enumerated them.
  select count(*) into v_kinds from (values ('text'),('long_text'),('number'),('relation'),('signature')) w(kind)
   where not exists (select 1 from custom.field_kinds() k where k.kind = w.kind and not k.parity);
  if v_kinds <> 0 then
    raise exception '1c: % of the five non-parity kinds the door accepts are not published by the registry', v_kinds;
  end if;
  raise notice 'PART 1 PASSED — one registry: the fourteen parity types plus the five the door accepts, signature among them.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated` and custom.record is not readable from it.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE DECLARATION THE PANEL NOW SENDS. One word, no format.
  -- ════════════════════════════════════════════════════════════════════════════
  v_crews := custom.table_declare(v_org, jsonb_build_object(
    'name','Crews','slug','crews_f6_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Crew','label_plural','Crews','title_field','truck',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','truck')),
    'parent_id', v_home::text));
  v_f_truck := custom.field_declare(v_org, v_crews, jsonb_build_object('key','truck','label','Truck','plain','text','sort',10));
  v_f_lead  := custom.field_declare(v_org, v_crews, jsonb_build_object('key','lead','label','Lead technician','plain','text','sort',20));
  v_f_zone  := custom.field_declare(v_org, v_crews, jsonb_build_object('key','zone','label','Coverage zone','plain','text','sort',30));

  -- 2a. The panel collects an INTENTION and sends the word. It never writes a behaviour,
  --     a format or a unit — those are the store's answer to the kind a person picked.
  v_f_sign := custom.field_declare(v_org, v_crews, jsonb_build_object(
    'label','Lead technician sign-off', 'type','signature', 'sort', 40));
  v_doc := custom.read_record(v_org, v_f_sign, true);
  if (v_doc ->> 'type') <> 'text' then
    raise exception '2a: the signature column reads back as %, and custom.doc_sign accepts text', v_doc ->> 'type';
  end if;
  if (v_doc ->> 'format') <> 'signature' then
    raise exception '2a: the signature column reads back with format %, and custom.doc_sign accepts signature', coalesce(v_doc ->> 'format', 'nothing');
  end if;
  -- `custom.doc_signature_field_ok` is not a client door (the closed-schema guard takes its
  -- grant back), so the seat asserts the SHAPE that predicate is — text plus format signature
  -- — and PART 3 proves the predicate itself by signing through the door a person has.
  -- It carries NO parity type, exactly as plain text and a person-aimed relation do.
  if nullif(v_doc ->> 'parity_type','') is not null then
    raise exception '2a: the signature column came back carrying parity_type %, so custom.parity_type and the guard would disagree about it', v_doc ->> 'parity_type';
  end if;

  -- 2b. THE OTHER SIDE OF 2a. A plain text column beside it is NOT signable, so the word
  --     did something and the door did not simply start marking every text column.
  v_f_note := custom.field_declare(v_org, v_crews, jsonb_build_object(
    'label','Dispatch note', 'plain','text', 'sort', 50));
  if nullif(custom.read_record(v_org, v_f_note, true) ->> 'format', '') is not null then
    raise exception '2b: a plain text column came back wearing format %, so the word did nothing and every text box is a signature line',
      custom.read_record(v_org, v_f_note, true) ->> 'format';
  end if;
  raise notice 'PART 2 PASSED — `type: signature` makes the one shape custom.doc_sign accepts, and plain text is still plain text.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — AND SOMEBODY ACTUALLY SIGNS IT. The whole half that was unreachable.
  -- ════════════════════════════════════════════════════════════════════════════
  v_truck := custom.record_write(v_org, v_crews, jsonb_build_object(
    'truck','Truck 1 — Alvarado',
    'lead','Miguel Alvarado',
    'zone','Ventura Ave / Downtown Ventura'));

  -- REC-68: a template's tokens name Fields BY ID, which is what custom.doc_tokens reads.
  v_tpl := custom.doc_template_save(v_org, v_crews, 'Weekly truck assignment',
    'Truck: {{field:' || v_f_truck || '}}' || chr(10) ||
    'Lead technician: {{field:' || v_f_lead || '}}' || chr(10) ||
    'Coverage zone: {{field:' || v_f_zone || '}}' || chr(10) ||
    'The lead technician signs below to accept this week''s assignment.');
  v_render := custom.doc_render_document(v_org, v_tpl, v_truck);

  -- 3a. The seal itself — the thing F6 said could not be reached from any screen.
  v_sig := custom.doc_sign(v_org, v_render, 'lead_technician_sign_off', 'Miguel Alvarado', c_admin);
  if v_sig is null then
    raise exception '3a: custom.doc_sign returned nothing for the column the panel can now declare';
  end if;

  -- 3b. And it HOLDS: the signature is checked against the exact bytes it sealed.
  --     `custom.doc_signature_intact` is not a client door either (the closed-schema guard
  --     holds its grant), so this one question is asked as the connected role and the seat is
  --     taken straight back. Everything that MAKES the seal above was asked from the seat.
  perform set_config('role', v_boss, true);
  v_intact := custom.doc_signature_intact(v_org, v_sig);
  perform set_config('role', 'authenticated', true);
  if not coalesce((v_intact ->> 'intact')::boolean, false) then
    raise exception '3b: custom.doc_signature_intact says the seal does not hold: %', v_intact::text;
  end if;

  -- 3c. THE OTHER SIDE OF 3a, and the reason the format is not decoration: the plain
  --     column next to it is refused BY NAME, naming the columns that can be signed.
  v_caught := null;
  begin
    perform custom.doc_sign(v_org, v_render, 'dispatch_note', 'Miguel Alvarado', c_admin);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '3c: the store signed a plain text column, so every text box on the table is a signature line';
  end if;

  -- 3d. And the value a person reads on the record is the name that was signed.
  if (custom.read_record(v_org, v_truck, true) ->> 'lead_technician_sign_off') <> 'Miguel Alvarado' then
    raise exception '3d: the record reads back sign-off %, and Miguel Alvarado signed it',
      coalesce(custom.read_record(v_org, v_truck, true) ->> 'lead_technician_sign_off', 'nothing');
  end if;
  raise notice 'PART 3 PASSED — the sheet renders, the lead technician signs it, the seal holds (%), and a plain column is refused: %',
    v_intact ->> 'intact', left(v_caught, 80);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE REFUSAL NAMES THE LIST IT IS ABOUT.
  -- ════════════════════════════════════════════════════════════════════════════

  -- 4a. A word nobody ships is still refused, and the sentence it comes with now names
  --     every kind — including the one a person was told to declare and could not find.
  v_caught := null;
  v_hint := null;
  begin
    perform custom.field_declare(v_org, v_crews, jsonb_build_object('label','Nonsense','type','banana'));
  exception when others then
    get stacked diagnostics v_caught = message_text, v_hint = pg_exception_hint;
  end;
  if v_caught is null then
    raise exception '4a: the store accepted a kind of column called "banana"';
  end if;
  -- THE PAIRING. The refusal used to read the parity floor's own sentence, so it named
  -- fourteen kinds and left out the five the door actually takes — including the one the
  -- Documents screen told a person to go and declare. It now reads the registry.
  if position('signature' in coalesce(v_hint, '')) = 0 then
    raise exception '4a: the refusal for an unknown kind does not mention signature, so it names a list the door has moved on from: %', coalesce(v_hint, 'no hint at all');
  end if;
  if position('relation' in coalesce(v_hint, '')) = 0 then
    raise exception '4a: the refusal does not mention relation either, so it is still the parity floor talking: %', v_hint;
  end if;
  raise notice 'PART 4 PASSED — an unknown kind is refused and the sentence names every kind: %', left(v_hint, 140);

  raise notice 'FIX-10B-F6 GREEN — all parts passed. Rolling back; nothing above survives.';
end $t$;

rollback;
