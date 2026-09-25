-- W1-RULE-APPLY — THE RED TWIN of `w1_rule_apply.sql` (rule 2: a guard that cannot be
-- demonstrated failing is not a guard).
--
-- It removes this lane's ONE enforcement point — the trigger `custom_record_rule_topology_guard`
-- — inside a transaction that ROLLS BACK, and shows every write the GREEN suite watches being
-- REFUSED landing instead. The evidence is written into a disposable `harbor_dental_red_ledger`
-- schema (rule 2's own words), read back from there, and rolled away with everything else.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/w1_rule_apply_red.sql
--
-- 🚨 RE-POINTED TO THE MAIN DATABASE (lane SEAT-SUITES, 2026-09-19), for the same reason as
-- its green twin: the rehearsal branch carries 226 functions in schema `custom` against
-- main's 332, grants `authenticated` 29 of them against main's 103 and has no
-- `custom.field_declare` at all, so the store these clauses are about is not there. The
-- owner's 2026-09-18 ruling is that there is no production.
--
-- 🚨 THE SEAT. A red twin's job is to prove its green twin's clauses FLIP, so it flips the
-- SAME clauses in the SAME seat. The REMOVAL is operator DDL and is done as the connected
-- role, out loud; every WRITE THAT THEN LANDS is made by a signed-in person through the door
-- they save with — `custom.record_write(org, custom.rule_kernel_id(), …)` and
-- `custom.record_update` — because the green twin's whole point is the sentence a person is
-- handed when they press Save. The evidence schema is granted to `authenticated` for the life
-- of this transaction so the seat never has to be dropped to write a ledger row.
--
-- 🚨 THE LOCK. The seeded fixtures live in ONE organization several campaign lanes touch, and
-- `custom.record` has sixteen live hash partitions other lanes are indexing. MEASURED on main
-- 2026-09-19: `lock_timeout` is 5s and `statement_timeout` is 30s by default, and under that
-- traffic even the membership insert loses on both. Both are raised once, at the top.
--
-- WHAT IT DOES NOT PLANT, and why that is not a gap. REC-16's EVALUATION half lives in
-- `custom.rule_eval`, and its RED was measured by the real mechanism rather than by a copy:
-- `migrations/inverse/w1_rule_apply_the_other_two_uses_down.sql` restores `W1-RULE`'s body
-- byte for byte (hash `d2e11d617e0b…`), and with it in place a `parent_field` leaf raises
-- `0A000 "this rule reads the parent's answer, and that is not switched on yet"` instead of
-- reading the parent — which is rule 27's inverse doing double duty as this clause's RED.
-- Weakening `custom.rule_eval` here as well would prove the same thing with a hand-made copy.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_rule_apply_red.sql'
\set requires 'grant:authenticated:custom.record_write'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

create schema harbor_dental_red_ledger;
create table harbor_dental_red_ledger.landed (
  red       text primary key,
  what      text not null,
  row_id    uuid,
  detail    jsonb
);
-- THE LEDGER IS NOT A PRODUCT SURFACE, but the seat must not be dropped to write to it — a
-- suite that steps out for bookkeeping ends up stepping out for clauses. Granted for the life
-- of this transaction, and gone with the rollback.
grant usage on schema harbor_dental_red_ledger to authenticated;
grant select, insert on harbor_dental_red_ledger.landed to authenticated;

-- THE ENFORCEMENT POINT, REMOVED, as the connected role: dropping a trigger is operator DDL
-- and no client could ever do it. Everything below is what the store does without it.
drop trigger custom_record_rule_topology_guard on custom.record;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_tbl     constant uuid := '11111111-0004-4000-8000-000000000001';
  v_f_kind  constant uuid := '11111111-0004-4000-8000-000000000011';
  v_f_w     constant uuid := '11111111-0004-4000-8000-000000000012';
  v_f_h     constant uuid := '11111111-0004-4000-8000-000000000013';
  v_r_all   constant uuid := '11111111-0004-4000-8000-000000000101';
  v_mf      constant uuid := '11111111-0004-4000-8000-000000000120';
  v_home    constant uuid := '11111111-0000-4000-8000-000000000001';
  v_t2  uuid;
  v_f1  uuid;
  v_f2  uuid;
  v_id  uuid;
  v_n   integer;
  v_msg text;
begin
  -- ── THE FIXTURES, as the connected role: a membership for both identities and the store
  --    switched on for this organization. Both roll back.
  perform set_config('app.actor_system', 'campaign-test/w1_rule_apply_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active')
  on conflict do nothing;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_rule_apply_red')
  on conflict (feature, key, scope_kind, scope_id, organization_id) do update set value = 'true'::jsonb;

  -- ── PART 0 — TAKE THE SEAT AND PROVE IT. ─────────────────────────────────────────
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

  -- One ordinary record, written by the owner from the seat BEFORE anything is removed, so
  -- RED 6's control has something to be about: this file otherwise writes only Rules. It has
  -- to be written here — once RED 1 has stored the circle, every write into this Table runs
  -- that Rule and raises on the merge field it now reads.
  perform custom.record_write(v_org, v_tbl,
    '{"title":"Red control","kind":"square","width":2,"height":2}'::jsonb);

  -- ── RED 1: a Rule and a merge field waiting on each other, saved BY A PERSON. ─────
  perform custom.record_update(v_org, v_r_all, jsonb_build_object('expr', jsonb_build_object(
    'op','and','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('field', v_f_w), jsonb_build_object('field', v_f_h))),
      jsonb_build_object('merge_field', v_mf)))), null);
  insert into harbor_dental_red_ledger.landed values
    ('RED 1', 'a Rule now reads the merge field that resolves through it - the circle is stored, saved from the seat through custom.record_update',
     v_r_all, jsonb_build_object(
       'rule', custom.read_record(v_org, v_r_all, false) ->> 'name',
       'reads_merge_field', custom.read_record(v_org, v_r_all, false) #> '{expr,args,1,merge_field}',
       'merge_field_resolves_through', custom.read_record(v_org, v_mf, false) ->> 'rule_id'));

  -- ── RED 2: two Rules working each other's answers out, both saved BY A PERSON. ────
  v_t2 := custom.table_declare(v_org, jsonb_build_object(
    'name','Account Balances','slug','account_balances','type','entity',
    'label_singular','Account Balance','label_plural','Account Balances','title_field','a','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','a'), jsonb_build_object('name','b')),
    'parent_id', v_home::text));
  -- A formula column declared through the door must say HOW it is worked out
  -- (`custom._field_type_parity_guard`), so each gets a trivial expression; the CIRCLE is
  -- between the two RULES that target them.
  v_f1 := custom.field_declare(v_org, v_t2, jsonb_build_object(
    'key','a','label','A','parity_type','formula','compute_on','write','sort',10,
    'expr', jsonb_build_object('const','')));
  v_f2 := custom.field_declare(v_org, v_t2, jsonb_build_object(
    'key','b','label','B','parity_type','formula','compute_on','write','sort',20,
    'expr', jsonb_build_object('const','')));
  perform custom.record_write(v_org, custom.rule_kernel_id(),
    jsonb_build_object('name','A from B','kind','expression','scope_table_id', v_t2,
      'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb, 'target_field_id', v_f1,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f2)))));
  v_id := custom.record_write(v_org, custom.rule_kernel_id(),
    jsonb_build_object('name','B from A','kind','expression','scope_table_id', v_t2,
      'uses', jsonb_build_array('compute'), 'applies_to_types','[]'::jsonb, 'target_field_id', v_f2,
      'expr', jsonb_build_object('op','concat','args', jsonb_build_array(jsonb_build_object('field', v_f1)))));
  insert into harbor_dental_red_ledger.landed values
    ('RED 2', 'both halves of a Rule <-> Rule circle are stored, and neither save was refused',
     v_id, jsonb_build_object('rules', jsonb_build_array('A from B', 'B from A'), 'table', v_t2));

  -- ── RED 3-5: REC-16's ceiling, in all three shapes a person writes. ───────────────
  v_id := custom.record_write(v_org, custom.rule_kernel_id(),
    jsonb_build_object('name','Two up','kind','predicate','scope_table_id', v_tbl,
      'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('parent_field', jsonb_build_object('parent_field', v_f_kind)),
        jsonb_build_object('const','square')))));
  insert into harbor_dental_red_ledger.landed values
    ('RED 3', 'a Rule reading TWO ancestor levels is stored, saved from the seat', v_id, null);

  v_id := custom.record_write(v_org, custom.rule_kernel_id(),
    jsonb_build_object('name','Two up by number','kind','predicate','scope_table_id', v_tbl,
      'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('parent_field', v_f_kind, 'levels', 2),
        jsonb_build_object('const','square')))));
  insert into harbor_dental_red_ledger.landed values
    ('RED 4', 'a Rule asking for two levels by number is stored, saved from the seat', v_id, null);

  v_id := custom.record_write(v_org, custom.rule_kernel_id(),
    jsonb_build_object('name','Grandparent','kind','predicate','scope_table_id', v_tbl,
      'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
      'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
        jsonb_build_object('grandparent_field', v_f_kind),
        jsonb_build_object('const','square')))));
  insert into harbor_dental_red_ledger.landed values
    ('RED 5', 'a grandparent_field Rule is stored, saved from the seat', v_id, null);

  -- ── RED 6: WHAT THE REMOVAL DOES NOT TAKE DOWN — THE ACCESS WALL. ────────────────
  -- The topology guard is gone and five refused writes have landed, and `test@test.com` — a
  -- member of this organization who was shared nothing — still may not save one of them. A
  -- red twin that could not tell a store rule from an access wall would show her walking
  -- through both.
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_msg := null;
  begin
    perform custom.record_write(v_org, custom.rule_kernel_id(),
      jsonb_build_object('name','Dana''s grandparent','kind','predicate','scope_table_id', v_tbl,
        'uses', jsonb_build_array('applicability'), 'applies_to_types','[]'::jsonb,
        'expr', jsonb_build_object('op','eq','args', jsonb_build_array(
          jsonb_build_object('grandparent_field', v_f_kind), jsonb_build_object('const','square')))));
  exception when others then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null then
    raise exception 'RED 6: with the topology guard off, test@test.com also walked through the ACCESS wall — that is a defect, not a red clause';
  end if;
  -- THE CONTROL, so RED 6 is not a door that refuses her everything.
  select count(*) into v_n from custom.read_records(v_org, v_tbl, true, 5, 0);
  if v_n < 1 then
    raise exception 'RED 6: the member who was refused the Rule cannot read a single record either';
  end if;
  insert into harbor_dental_red_ledger.landed values
    ('RED 6', 'the ACCESS wall is untouched: test@test.com is still refused the same write, and still reads what she may',
     null, jsonb_build_object('refusal', v_msg, 'records_she_reads', v_n));
  perform set_config('request.jwt.claims', c_admin_j, true);
end;
$t$;

do $r$
declare
  l record;
  v_n integer;
begin
  select count(*) into v_n from harbor_dental_red_ledger.landed;
  if v_n <> 6 then
    raise exception 'THE RED TWIN PROVED NOTHING: % of the 6 clauses were recorded.', v_n;
  end if;
  for l in select * from harbor_dental_red_ledger.landed order by red loop
    raise notice '% — % (%)%', l.red, l.what, l.row_id,
      case when l.detail is null then '' else ' ' || l.detail::text end;
  end loop;
  raise notice '=== W1-RULE-APPLY RED — all five writes the GREEN suite watches being REFUSED LAND, from the seat `authenticated`, once custom_record_rule_topology_guard is removed; the access wall stays up. Rolling back. ===';
end;
$r$;

rollback;
