-- LANE PROVISIONER-SELF-HEAL — A STALE FINGERPRINT HEALS ITSELF WHEN THE KERNEL STILL ANSWERS THE SAME.
--
-- THE REAL CASE: a dental practice's office manager asks for her tables while some campaign file,
-- minutes earlier, replaced an access-kernel body and forgot to re-record the fingerprint. On
-- 2026-09-25 that refused ALL table creation on production for 83 minutes (SHARE-LANE-2 20:38Z,
-- rca2b 21:51Z). The chair's ruling: on a mismatch the provisioner runs the kernel's own
-- equivalence self-check in the same call; identical -> re-record, audit, one system_error row,
-- provision; not identical -> refuse with the logged row, as before.
--   C1  (c) a MATCHED fingerprint: "Sterilization log" provisions; its answer carries no
--       kernel_fingerprint key; 0 record rows, 0 auto-rerecorded rows, 0 stale rows.
--   A1  (a) plant a BEHAVIOUR-PRESERVING change (a comment line in public.library_is_open): the
--       preflight refuses with preflight.read_kernel.
--   A2  "Chairside supply orders" PROVISIONS anyway: the answer carries kernel_fingerprint
--       (auto_rerecorded, the moved member, lost 0, gained 0), the relation exists, the fingerprint
--       is re-recorded to the live value, the member snapshot equals the live bodies, and exactly TWO
--       rows were written: one platform.kernel_fingerprint_record (ruling "auto re-recorded after
--       equivalence passed", naming public.library_is_open) and one ops.system_error of kind
--       kernel_fingerprint_auto_rerecorded naming it too. No provisioner_fingerprint_stale row.
--       The self-check took under 3 s.
--   A3  the next table ("Lab case tracker") finds a matched kernel: no further rows.
--   A4  a batch of two ("Referral letters", "Referral letter replies") after a second harmless
--       plant heals once and builds both; each member carries base_contract pending_attach
--       (strict since PROVISION-BATCH-FIX; before it every batch refused certification).
--   B1  (b) plant a BEHAVIOUR-CHANGING arm in iam.has_access_for_base that opens every
--       `internal` row at viewer to anyone signed in — a stranger reads the practice's records.
--   B2  "Hygiene recall calls" is REFUSED: {ok false, refused true}, exactly one
--       provisioner_fingerprint_stale row whose context carries the failed equivalence (gained > 0,
--       naming the stranger) and whose text says it was NOT re-recorded; no record row, no
--       auto-rerecorded row, no relation, the fingerprint still stale.
--
-- RUN IT (dev clone; one rolled-back transaction; the psql -f needs the sandbox disabled):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/selfheal_green.sql
-- ITS RED: before selfheal_an_equivalent_kernel_is_re_recorded_by_the_provisioner.sql (and after its
-- inverse) A2 fails: the call is refused with provisioner_fingerprint_stale and nothing is built.

\set ON_ERROR_STOP on
\timing off

\set suite 'selfheal_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';

-- Declarations travel in custom GUCs (CREATE TEMP TABLE fires the provision shape guard).
select set_config('sh.' || k, jsonb_build_object(
         'schema', 'workbench', 'table', 'sh_' || k, 'token', 'sh_' || k, 'origin', 'standard',
         'label', lbl, 'description', dsc, 'category_label', 'Dental practice', 'sharing', false,
         'taxonomy_node_id', (select id::text from platform.taxonomy_node order by slug limit 1),
         'type', 'entity',
         'access', jsonb_build_object('data_class', 'organization', 'data_class_reason', 'rows belong to the practice',
                                      'default_list_scope', 'organization', 'visibility', 'internal',
                                      'key_column', 'created_by'),
         'fields', flds)::text, true)
  from (values
    ('sterilization_log', 'Sterilization log', 'Autoclave cycles run each day, with the load and the indicator result.',
       '[{"name":"cycle_no","type":"text","not_null":true},{"name":"indicator_passed","type":"boolean"}]'::jsonb),
    ('chairside_supply_orders', 'Chairside supply orders', 'Gloves, bibs and composite the operatories ask the front desk to reorder.',
       '[{"name":"item","type":"text","not_null":true},{"name":"quantity","type":"integer"}]'::jsonb),
    ('lab_case_tracker', 'Lab case tracker', 'Crowns and bridges out at the dental lab, with the due date.',
       '[{"name":"patient_ref","type":"text","not_null":true},{"name":"due_on","type":"date"}]'::jsonb),
    ('referral_letters', 'Referral letters', 'Letters sent to specialists for a patient.',
       '[{"name":"specialist","type":"text","not_null":true}]'::jsonb),
    ('referral_letter_replies', 'Referral letter replies', 'What the specialist wrote back.',
       '[{"name":"summary","type":"text","not_null":true}]'::jsonb),
    ('hygiene_recall_calls', 'Hygiene recall calls', 'Patients due for a cleaning who have been called.',
       '[{"name":"patient_ref","type":"text","not_null":true},{"name":"reached","type":"boolean"}]'::jsonb)
  ) v(k, lbl, dsc, flds) \g /dev/null

create or replace function pg_temp.sh_counts() returns jsonb language plpgsql as $$
declare n bigint := 0;
begin
  -- The record table does not exist before the file (the RED run), so it is read dynamically.
  if to_regclass('platform.kernel_fingerprint_record') is not null then
    execute 'select count(*) from platform.kernel_fingerprint_record where recorded_at = now()' into n;
  end if;
  return jsonb_build_object(
    'record', n,
    'healed', (select count(*) from ops.system_error where kind = 'kernel_fingerprint_auto_rerecorded' and occurred_at = now()),
    'stale',  (select count(*) from ops.system_error where kind = 'provisioner_fingerprint_stale' and occurred_at = now()));
end $$;
create or replace function pg_temp.sh_plant(p_schema text, p_name text, p_from text, p_to text) returns void language plpgsql as $$
declare v_def text; v_src text; n int;
begin
  select pg_get_functiondef(p.oid), p.prosrc into v_def, v_src
    from pg_proc p where p.pronamespace = p_schema::regnamespace and p.proname = p_name
   order by pronargs desc limit 1;
  if p_from is null then  -- append: a change to the body that cannot change an answer
    execute replace(v_def, v_src, v_src || p_to);
    return;
  end if;
  n := (length(v_src) - length(replace(v_src, p_from, ''))) / greatest(length(p_from), 1);
  if n <> 1 then raise exception 'plant: % occurrence(s) of the anchor in %.%', n, p_schema, p_name; end if;
  execute replace(v_def, v_src, replace(v_src, p_from, p_to));
end $$;

-- C1 (c): a matched fingerprint changes nothing.
do $c1$
declare r jsonb; c0 jsonb := pg_temp.sh_counts(); c1 jsonb;
begin
  if not ((platform.provision_preflight())->>'ok')::boolean then
    raise exception 'C1 PRECONDITION — the preflight already refuses on this database: %', platform.provision_preflight();
  end if;
  r := platform.provision(current_setting('sh.sterilization_log')::jsonb, 'runner');
  c1 := pg_temp.sh_counts();
  if (r->>'ok')::boolean is not true or r ? 'kernel_fingerprint' or c1 <> c0
     or to_regclass('workbench.sh_sterilization_log') is null then
    raise exception 'C1 FAILED — matched: ok=% kernel_fingerprint=% rows before % after % relation=%',
      r->>'ok', r->'kernel_fingerprint', c0, c1, to_regclass('workbench.sh_sterilization_log');
  end if;
  raise notice 'C1 PASSED — matched fingerprint: "Sterilization log" provisioned, no kernel_fingerprint in the answer, no rows (%)', c1;
end $c1$;

-- A1 (a): a behaviour-preserving plant.
do $a1$
begin
  perform pg_temp.sh_plant('public', 'library_is_open', null, E'\n  -- planted by selfheal_green: a comment changes the body, not the answer');
  if not exists (select 1 from jsonb_array_elements((platform.provision_preflight())->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'A1 FAILED — the plant did not make the preflight refuse with preflight.read_kernel';
  end if;
  raise notice 'A1 PASSED — public.library_is_open moved (%), the recorded fingerprint is %, the preflight refuses',
    iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
end $a1$;

do $a2$
declare r jsonb; c jsonb; fp_before text := iam.entity_read_kernel_expected(); rec record; se record; t0 timestamptz := clock_timestamp();
begin
  r := platform.provision(current_setting('sh.chairside_supply_orders')::jsonb, 'runner');
  c := pg_temp.sh_counts();
  if (r->>'ok')::boolean is not true or to_regclass('workbench.sh_chairside_supply_orders') is null then
    raise exception 'A2 FAILED — a harmless kernel change still stopped table creation: %', left(r::text, 400);
  end if;
  if (r->'kernel_fingerprint'->>'auto_rerecorded')::boolean is not true
     or not (r->'kernel_fingerprint'->'moved') ? 'public.library_is_open(p_entity_type text, p_entity_id uuid)'
     or (r->'kernel_fingerprint'->'equivalence'->>'lost')::int <> 0 or (r->'kernel_fingerprint'->'equivalence'->>'gained')::int <> 0 then
    raise exception 'A2 FAILED — the answer does not carry the re-record: %', r->'kernel_fingerprint';
  end if;
  if iam.entity_read_kernel_expected() is distinct from iam.entity_read_kernel_fingerprint()
     or iam.entity_read_kernel_expected() is not distinct from fp_before
     or (iam.entity_read_kernel_members_expected()->'members') is distinct from iam.entity_read_kernel_members_live()
     or (iam.entity_read_kernel_members_expected()->>'fingerprint') is distinct from iam.entity_read_kernel_expected() then
    raise exception 'A2 FAILED — not re-recorded: expected % live % before % snapshot %',
      iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint(), fp_before, iam.entity_read_kernel_members_expected()->>'fingerprint';
  end if;
  if c <> '{"record": 1, "healed": 1, "stale": 0}'::jsonb then
    raise exception 'A2 FAILED — expected exactly two rows (one record, one auto-rerecorded) and no stale row: %', c;
  end if;
  execute 'select * from platform.kernel_fingerprint_record where recorded_at = now()' into rec;
  select * into se from ops.system_error where kind = 'kernel_fingerprint_auto_rerecorded' and occurred_at = now();
  if rec.ruling <> 'auto re-recorded after equivalence passed'
     or not rec.members_changed @> array['public.library_is_open(p_entity_type text, p_entity_id uuid)']
     or rec.fingerprint_from <> fp_before or rec.fingerprint_to <> iam.entity_read_kernel_expected()
     or rec.system_error_id is distinct from se.id
     or se.error_text not like '%public.library_is_open%' or se.error_text not like '%auto re-recorded after equivalence passed%'
     or se.error_text not like '%workbench.sh_chairside_supply_orders%' then
    raise exception 'A2 FAILED — the audit row or the system_error row does not name the member and the ruling: % / %',
      row_to_json(rec), left(se.error_text, 400);
  end if;
  if (rec.evidence->>'ms')::numeric >= 3000 then
    raise exception 'A2 FAILED — the equivalence self-check took % ms (budget 3000)', rec.evidence->>'ms';
  end if;
  raise notice 'A2 PASSED — provisioned through a stale fingerprint: re-recorded % -> %, % answers, % of % tables identical, 0 lost, 0 gained, self-check % ms (call % ms); rows: %',
    rec.fingerprint_from, rec.fingerprint_to, rec.evidence->>'answers', rec.evidence->'read_lane'->>'identical',
    rec.evidence->'read_lane'->>'tables', rec.evidence->>'ms',
    round((extract(epoch from clock_timestamp() - t0) * 1000)::numeric), c;
end $a2$;

do $a3$
declare r jsonb; c0 jsonb := pg_temp.sh_counts();
begin
  perform set_config('matrx.kernel_rerecorded', '', true);  -- a fresh call in the same transaction
  r := platform.provision(current_setting('sh.lab_case_tracker')::jsonb, 'runner');
  if (r->>'ok')::boolean is not true or r ? 'kernel_fingerprint' or pg_temp.sh_counts() <> c0 then
    raise exception 'A3 FAILED — after the re-record: ok=% kernel_fingerprint=% rows % -> %', r->>'ok', r ? 'kernel_fingerprint', c0, pg_temp.sh_counts();
  end if;
  raise notice 'A3 PASSED — "Lab case tracker" found a matched kernel: no further rows';
end $a3$;

do $a4$
declare r jsonb; e text; c0 jsonb := pg_temp.sh_counts();
begin
  -- A healed BATCH completes (lane PROVISION-BATCH-FIX, 2026-09-26). Until
  -- provbatch_a_batch_owes_its_base_contract_like_one_table.sql every batch refused certification
  -- after its deferred constraints (base_org_fk / base_created_by_fk / base_updated_by_fk owed, not
  -- failed), so this clause could only prove the batch got past the preflight. Now it must build
  -- both members, heal once, and hand each member's base-contract debt back as pending_attach.
  perform pg_temp.sh_plant('public', 'library_is_open', null, E'\n  -- planted again by selfheal_green (the batch)');
  perform set_config('matrx.kernel_rerecorded', '', true);
  begin
    r := platform.provision(jsonb_build_object('tables', jsonb_build_array(
           current_setting('sh.referral_letters')::jsonb, current_setting('sh.referral_letter_replies')::jsonb)), 'runner');
  exception when others then e := sqlerrm;
  end;
  if e is null and (r->>'ok')::boolean is true and (r->'kernel_fingerprint'->>'auto_rerecorded')::boolean is true
     and jsonb_array_length(r->'tables') = 2
     and not exists (select 1 from jsonb_array_elements(r->'tables') m
                      where m->'base_contract'->>'status' is distinct from 'pending_attach')
     and to_regclass('workbench.sh_referral_letters') is not null
     and to_regclass('workbench.sh_referral_letter_replies') is not null then
    raise notice 'A4 PASSED — a two-table batch healed once and built both; each member owes its base contract (pending_attach)';
  else
    raise exception 'A4 FAILED — batch: error=% answer=% rows %', e, left(coalesce(r::text, 'null'), 300), pg_temp.sh_counts();
  end if;
end $a4$;

-- B1 (b): a behaviour-changing plant — an arm that opens every internal row to anyone signed in.
do $b1$
begin
  perform pg_temp.sh_plant('iam', 'has_access_for_base',
    '    if v_owner = v_uid then return true; end if;',
    E'    if v_owner = v_uid then return true; end if;\n'
    '    if p_required = ''viewer''::public.permission_level and v_vis >= ''internal''::platform.visibility then return true; end if; -- planted by selfheal_green: opens a stranger');
  if not exists (select 1 from jsonb_array_elements((platform.provision_preflight())->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'B1 FAILED — the planted arm did not make the preflight refuse';
  end if;
  raise notice 'B1 PASSED — iam.has_access_for_base now opens internal rows to strangers; the preflight refuses';
end $b1$;

do $b2$
declare r jsonb; e text; c jsonb; c0 jsonb := pg_temp.sh_counts(); fp text; se record;
begin
  perform set_config('matrx.kernel_rerecorded', '', true);
  fp := iam.entity_read_kernel_expected();
  begin
    r := platform.provision(current_setting('sh.hygiene_recall_calls')::jsonb, 'runner');
  exception when others then e := sqlstate || ': ' || left(sqlerrm, 200);
  end;
  c := pg_temp.sh_counts();
  if e is not null or (r->>'refused')::boolean is not true or (r->>'ok')::boolean is distinct from false
     or c <> jsonb_set(c0, '{stale}', to_jsonb((c0->>'stale')::int + 1))
     or to_regclass('workbench.sh_hygiene_recall_calls') is not null
     or iam.entity_read_kernel_expected() is distinct from fp
     or iam.entity_read_kernel_expected() is not distinct from iam.entity_read_kernel_fingerprint() then
    raise exception 'B2 FAILED — a behaviour change: raised=% answer=% rows=% relation=% expected %->%',
      e, left(coalesce(r::text, 'null'), 300), c, to_regclass('workbench.sh_hygiene_recall_calls'), fp, iam.entity_read_kernel_expected();
  end if;
  select * into se from ops.system_error where id = (r->>'system_error_id')::uuid;
  if se.kind <> 'provisioner_fingerprint_stale' or (se.context->'equivalence'->>'gained')::int < 1
     or (se.context->'equivalence'->>'ok')::boolean is not false
     or se.error_text not like '%did NOT answer identically%' or se.error_text not like '%stranger%'
     or se.error_text not like '%NOT re-recorded automatically%' or se.error_text not like '%iam.has_access_for_base%' then
    raise exception 'B2 FAILED — the refusal row does not carry the failed equivalence: %', left(se.error_text, 600);
  end if;
  raise notice 'B2 PASSED — refused with the logged row: gained %, lost %; % ', se.context->'equivalence'->>'gained',
    se.context->'equivalence'->>'lost', left(substring(se.error_text from 'The kernel equivalence self-check ran first[^.]*'), 200);
end $b2$;

\echo 'ALL PASSED — selfheal_green'
rollback;
