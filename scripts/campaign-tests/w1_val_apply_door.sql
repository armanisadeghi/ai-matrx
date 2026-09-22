-- W1-VAL FOLLOW-UP — THE ORGANIZATION'S OFF SWITCH, AT THE DOOR A PERSON USES, on the MAIN
-- database.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_val_apply_door.sql
--
-- 🚨 WHAT THIS FILE USED TO CLAIM, AND WHY IT WAS RESTATED (SEAT-SUITES, 2026-09-19).
-- It created a disposable ROLE, made it write into `custom.record`, and called the refusal
-- "the door". Its positive control was "the OWNER writes and it lands" — the owner of
-- `custom.record`, the very seat this lane exists to remove. Both halves were about database
-- roles, and a person is not a database role: every signed-in person on this platform is the
-- ONE role `authenticated`, and what separates them is the organization they are in and the
-- switch that organization's store is on. So the same three claims are now made about a
-- PERSON, through the door a person actually reaches:
--
--   A. THE POSITIVE CONTROL — admin@admin.com, seated as `authenticated`, writes a record
--      through `custom.record_write` into an organization whose `custom/system_enabled` is
--      ON, and it LANDS, validated. A refusal that fired for everybody would fail here
--      (rule 14: a refusal proved without a positive control proves nothing).
--   B. THE DOOR — the SAME person, the SAME table, the SAME document, with the organization's
--      switch turned OFF through the switch screen's own door
--      (`platform.unified_data_store_set`), is REFUSED BY NAME: the message says the store is
--      switched off and carries the remedy naming `custom/system_enabled`.
--   C. NOTHING IS SKIPPED WHILE THE SWITCH IS OFF — with the switch still off, an INVALID
--      document is refused too, and it is refused AT THE DOOR naming the switch, not waved
--      through. A body that returned NEW while the switch is off (the shape
--      `custom._entity_custom_fields_guard` uses on `crm.party`, and the wrong answer here)
--      would let one of these through. And with the switch back ON, the same invalid document
--      is still refused — by the VALIDATOR this time — so the switch removes no check.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3): the same write is made four times
-- by the same person against three documents and two switch positions, and the four expected
-- answers are LANDS, REFUSED-naming-the-switch, REFUSED-naming-the-switch, and
-- REFUSED-by-the-validator. A door that returned a constant survives none of them.
--
-- 🚨 THE MAIN DATABASE. This file used to run on the rehearsal branch only. That branch holds
-- 226 of schema `custom`'s 332 functions and no `custom.field_declare`, so the store it is
-- about is not there; the owner's 2026-09-18 ruling is that everything is the main database.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK — the disposable organization, its Home, its Table, its Fields
-- and its knob override all disappear with it. It creates no role and grants nothing.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_val_apply_door.sql'
\set requires 'grant:authenticated:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org    uuid := gen_random_uuid();
  v_home   uuid;
  v_table  uuid;
  v_rec    uuid;
  v_res    jsonb;
  v_msg    text;
  v_state  text;
  v_hint   text;
  v_caught text;
  v_boss   text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/w1_val_apply_door', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ridgeline Physical Therapy', 'ridgeline-physical-therapy-' || substr(v_org::text, 1, 8), 'RPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- The switch, ON to begin with: a signed-in person cannot write one record into a store
  -- that is off, so A has to start from on and B turns it off deliberately, through the
  -- switch screen's own door.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_val_apply_door');
  -- A Home has no client door of its own.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ridgeline Physical Therapy — Clinic'))
  returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- A declared Table with one declared Field, so the validator below the door has something
  -- to check and C is a real refusal rather than an empty pass.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Patients', 'slug', 'patients', 'type', 'entity',
    'label_singular', 'Patient', 'label_plural', 'Patients',
    'title_field', 'full_name', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','full_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_table, jsonb_build_object(
    'key','full_name','label','Full name','plain','text'));

  -- ── A. THE POSITIVE CONTROL: a person writes, with the switch ON, and it lands. ────
  if not coalesce((platform.unified_data_store_state(v_org) ->> 'switched_on')::boolean, false) then
    raise exception 'A: this organization''s store reads OFF before anything was turned off';
  end if;
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('full_name', 'Nora Castellan'));
  if v_rec is null or (custom.read_record(v_org, v_rec, true) ->> 'full_name') <> 'Nora Castellan' then
    raise exception 'A FAILED: the person''s valid write did not land through custom.record_write.';
  end if;
  raise notice 'A. a signed-in person writes with the switch ON and it LANDS, validated, and reads back through the read door (record %).', v_rec;

  -- ── B. THE DOOR: the switch goes OFF and the SAME write is refused BY NAME. ────────
  v_res := platform.unified_data_store_set(v_org, false, c_admin, 'w1_val_apply_door B');
  if coalesce((v_res ->> 'switched_on')::boolean, true) is not false then
    raise exception 'B: the switch door said it turned the store off and it reads on: %', v_res;
  end if;

  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('full_name', 'Devon Ashworth'));
    raise exception 'B FAILED: a record was written into a store whose switch is off. The door is not there.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate, v_hint = pg_exception_hint;
    if v_msg like 'B FAILED%' then raise; end if;
    -- 🚨 RE-PINNED (lane RED-SUITES-2, 2026-09-21) — the same move RED-SUITES made on
    -- `v1_fixes_green` 1b, for the same reason and the same landing. The words were changed on
    -- purpose by `limitsfix_a_new_organization_has_the_store_on.sql`: `custom.assert_store_door`
    -- — the ONE body every write door reaches — used to refuse with "switched off", which named
    -- a knob and a role and nothing a person could act on. It now says whose organization it is
    -- about and its hint says where the switch is. The door is exactly as closed. This clause
    -- asserts the PROMISE, not the old phrasing, and it still asserts the remedy below.
    if v_msg not ilike '%has turned the record store off%' then
      raise exception 'B FAILED: refused with "%" (%), which does not say this organization has turned the record store off.', v_msg, v_state;
    end if;
    -- 🚨 STORE-ON 2026-09-23 — THE REMEDY IS ASSERTED, NOT THE KNOB KEY. This used to demand
    -- the literal string `custom/system_enabled` in the message or the hint. A knob key is a
    -- database identifier, not a remedy: the campaign's own rule for these sentences is "one
    -- sentence, no knob key" (matrx_records/switch.py), and the hint stopped carrying it when
    -- the platform default moved to ON and the sentence was rewritten to name the ACT — an
    -- owner or an administrator here switched the store off — instead of the setting. What
    -- this clause is for is that a refused person is told WHAT TO DO, so that is what it asks
    -- for: where the switch lives, and the verb.
    if coalesce(v_hint, '') not ilike '%database settings%'
       or coalesce(v_hint, '') not ilike '%turn it back on%' then
      raise exception 'B FAILED: the refusal carries no remedy — it never says where the switch lives or what to do there. Message "%", hint "%".', v_msg, v_hint;
    end if;
    raise notice 'B. the same person, the same table, the switch OFF — REFUSED % — "%"', v_state, v_msg;
    raise notice 'B. remedy — "%"', coalesce(v_hint, v_msg);
  end;

  -- ── C. NOTHING IS SKIPPED WHILE THE SWITCH IS OFF. ─────────────────────────────────
  -- An INVALID document, while the switch is off, is not waved through either: it is stopped
  -- at the same door, naming the same switch. A body that returned NEW while the switch is
  -- off would let this one land, unvalidated, in a store that is supposed to be closed.
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('full_name', 12));
    raise exception 'C FAILED: an invalid document landed while the switch is off — the switch is removing a check.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like 'C FAILED%' then raise; end if;
    -- RE-PINNED with B above, same landing, same reason.
    if v_msg not ilike '%has turned the record store off%' then
      raise exception 'C FAILED: while the switch is off an invalid write was refused with "%" (%), which does not name the switch — the writer is being told about an internal instead of the thing that is actually shut.', v_msg, v_state;
    end if;
    raise notice 'C. an INVALID write with the switch off is refused at the same door — % "%"', v_state, v_msg;
  end;

  -- AND THE SWITCH REMOVES NO CHECK: with it back ON, the same invalid document is still
  -- refused — by the VALIDATOR this time, not the door — while the VALID one lands.
  v_res := platform.unified_data_store_set(v_org, true, c_admin, 'w1_val_apply_door C control');
  if not coalesce((v_res ->> 'switched_on')::boolean, false) then
    raise exception 'C: the switch door said it turned the store on and it reads off: %', v_res;
  end if;
  v_caught := null;
  begin
    perform custom.record_write(v_org, v_table, jsonb_build_object('full_name', 12));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'C FAILED: with the store ON, an invalid document landed — the validation below the door is gone.';
  end if;
  if v_caught ilike '%switched off%' or v_caught ilike '%has turned the record store off%' then
    raise exception 'C FAILED: with the store ON the refusal still blames the switch: %', v_caught;
  end if;
  if custom.record_write(v_org, v_table, jsonb_build_object('full_name', 'Priya Vantana')) is null then
    raise exception 'C FAILED: with the store ON a valid write was refused, so the door refuses everything';
  end if;
  raise notice 'C. switch back ON — the same invalid document is refused by the VALIDATOR ("%"), and the valid one lands. The switch closes the store; it removes no check.', left(v_caught, 110);

  -- ── D. THE SECOND PERSON. The switch is the ORGANIZATION'S, not a role's: with it ON,
  --      test@test.com is still refused what she has no right to, and still gets what she
  --      was given — so B and C measured the switch and not the access ladder.
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_table, jsonb_build_object('key','she_added','label','She added','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception 'D FAILED: test@test.com changed the shape of a table she is not an admin of';
  end if;
  if (custom.read_record(v_org, v_rec, true) ->> 'full_name') <> 'Nora Castellan' then
    raise exception 'D FAILED: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'D. test@test.com is refused the table''s shape ("%") and reads the record shared with her.', left(v_caught, 80);

  raise notice '=== W1-VAL door — the organization''s switch is READ at the door a person uses, it closes the store to that person by name with the remedy, it waves nothing through while it is off, and it removes no check when it is on. This transaction rolls back. ===';
end;
$t$;

rollback;
