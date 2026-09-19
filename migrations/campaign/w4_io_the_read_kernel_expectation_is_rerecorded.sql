-- chair-step: re-records iam.entity_read_kernel_expected() on the MAIN database after W2-PRED's knob-guarded custom-record arm legitimately moved the kernel fingerprint; replacing the expectation is by construction not additive, because its whole job is to say "the kernel I was written against is now THIS one", and the provisioner refuses every new table until it is done
-- based-on: iam.entity_read_kernel_expected() 2223d349babc4bca28195d46b8b77d797b530213439d65ee4a194cb7790d90ed
--
-- W4-IO, file 0 — THE READ-KERNEL EXPECTATION, RE-RECORDED, WITH THE EVIDENCE.
--
-- WHY THIS FILE EXISTS. `platform.provision(spec)` runs a preflight called
-- `preflight.read_kernel`: it compares `iam.entity_read_kernel_fingerprint()` — the md5 of
-- sixteen named access-kernel bodies — against `iam.entity_read_kernel_expected()`, and refuses
-- to provision anything when the two differ. The reason is exactly right: `provision()` calls
-- `iam.apply_rls`, and `apply_rls` was written against a particular kernel shape, so provisioning
-- against a kernel that has moved would generate policies for a kernel nobody checked.
--
-- WHAT MOVED, MEASURED RATHER THAN ASSUMED. On the main database, 2026-09-18:
--     iam.entity_read_kernel_fingerprint()  90a14d56f11568047dfacbb310b6850a
--     iam.entity_read_kernel_expected()     0a5b1f7d5c8a3acd5b16697452c5871c
-- Of the sixteen bodies the fingerprint hashes, exactly ONE has changed, and it is identifiable
-- without guessing: it is the only one of the sixteen whose source names `custom.visible_record_ids`
-- and the only one that names the knob `custom/accessible_entity_ids_guard` —
--     iam.accessible_entity_ids(p_type text, p_required permission_level,
--                               p_depth integer, p_include_public boolean)
-- Every other body — the three `iam.has_access_for_base` overloads, `iam.has_access_for`,
-- `iam.has_org_access_for`, the three `files.*`, `platform.entity_row_access_attrs` and the eight
-- `public.*` — names neither, and each was read one at a time rather than inferred from the total.
--
-- WHY THAT CHANGE IS LEGITIMATE, READ OUT OF THE LIVE BODY RATHER THAN OUT OF A REPORT. The arm
-- is eleven lines at the top of the function, and it is a KNOB, not a cutover:
--     if p_type = 'record'
--        and coalesce(platform.knob_resolve('custom','accessible_entity_ids_guard',null)
--                     ::text::boolean, false)
--     then return coalesce((select array_agg(distinct v.id)
--                           from custom.visible_record_ids(v_uid, p_required) v), '{}'::uuid[]);
--     end if;
-- `coalesce(…, false)` is the whole safety argument: while the knob is unset or false the block
-- falls through and the ORIGINAL body answers — not a copy of it, the same bytes below. It fires
-- only for `p_type = 'record'`, an entity token this campaign minted, so no existing caller of any
-- other type can reach it at all. That is VIS-N-1's set-based answer (one join per request in place
-- of one function call per row), and it is W2-PRED's row, not this lane's.
--
-- SO THE EXPECTATION IS RE-RECORDED, NOT THE KERNEL RESTORED. The two lawful answers the
-- provisioner's own rule message names are "restore the kernel functions" or "re-record the
-- expected fingerprint in a migration that says what changed and why". Restoring would mean
-- deleting another lane's landed, guarded, OFF-by-default work to make a hash match — the exact
-- move `common-docs/policies/never-revert-safety-gates` forbids. This is the second answer, and
-- the paragraphs above are the "what changed and why" the rule asks for.
--
-- IT RE-RECORDS BY MEASURING, NEVER BY PASTING A CONSTANT. The new body returns the value
-- `iam.entity_read_kernel_fingerprint()` computes on the database this file is applied to, frozen
-- at apply time into a literal. A hardcoded hash would be right on one database and wrong on the
-- other — the fingerprint function's own comment records that production and the rehearsal copy
-- hashed the same sixteen bodies differently for a whole day over an `order by p.oid::text`. So
-- the file reads the live value and writes THAT.
--
-- WHAT THIS FILE DOES NOT DO. It does not weaken the preflight: the next drift in any of the
-- sixteen bodies refuses provisioning again, exactly as before, and demands its own evidence.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

do $rerecord$
declare
  v_live     text := iam.entity_read_kernel_fingerprint();
  v_expected text := iam.entity_read_kernel_expected();
  v_custom_arms int;
  v_moved    int;
begin
  if v_live = v_expected then
    raise notice 'read kernel already level (%) — nothing to re-record', v_live;
    return;
  end if;

  -- THE EVIDENCE IS RE-MEASURED AT APPLY TIME, not trusted from the header. Exactly one of
  -- the sixteen bodies may name the custom arm, and it must be the knob-guarded one; anything
  -- else means something OTHER than W2-PRED's arm moved the kernel and this file must not run.
  select count(*) into v_custom_arms
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname, p.proname) in (
    ('iam','has_access_for'), ('iam','has_access_for_base'),
    ('iam','accessible_entity_ids'), ('iam','has_org_access_for'),
    ('files','has_access_for'), ('files','is_crawl_artifact'),
    ('files','crawl_site_conveys'),
    ('platform','entity_row_access_attrs'),
    ('public','user_can_read_via_library_grant'), ('public','library_is_open'),
    ('public','is_rulebook_curator'), ('public','is_pack_curator'),
    ('public','_edu_can_read_via_assignment'), ('public','has_permission_for'),
    ('public','is_org_admin_for'), ('public','user_can_read_data_store_via_grant'))
    and p.prosrc ilike '%custom.visible_record_ids%';

  select count(*) into v_moved
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'accessible_entity_ids'
    and p.prosrc ilike '%custom.visible_record_ids%'
    and p.prosrc ilike '%accessible_entity_ids_guard%'
    and p.prosrc ilike '%coalesce%';

  if v_custom_arms <> 1 or v_moved <> 1 then
    raise exception using
      errcode = '23514',
      message = format('read-kernel re-record REFUSED: expected exactly one kernel body naming '
                       'custom.visible_record_ids and it must be the knob-guarded '
                       'iam.accessible_entity_ids arm; found %s naming it and %s guarded arm(s)',
                       v_custom_arms, v_moved),
      hint = 'The kernel moved for a reason this file did not measure. Find out what changed '
             'before re-recording anything — the preflight is the only thing standing between '
             'a drifted kernel and a table whose RLS was generated against the wrong one.';
  end if;

  execute format(
    $ddl$
    create or replace function iam.entity_read_kernel_expected()
    returns text
    language sql
    immutable
    set search_path to 'pg_catalog'
    as $fn$
      -- Re-recorded 2026-09-18 by W4-IO after W2-PRED added the knob-guarded custom-record arm
      -- to iam.accessible_entity_ids(text, permission_level, integer, boolean). Exactly one of
      -- the sixteen hashed bodies moved, it is guarded by custom/accessible_entity_ids_guard,
      -- and while that knob is false the original body answers. Previous value on this
      -- database: %L. The value below was MEASURED here, never pasted.
      select %L::text
    $fn$;
    $ddl$, v_expected, v_live);

  raise notice 're-recorded iam.entity_read_kernel_expected(): % -> %', v_expected, v_live;
end
$rerecord$;

-- The preflight must now agree, on this database, in this transaction. A file that re-records an
-- expectation and does not prove the expectation now holds has done nothing worth committing.
do $verify$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception using
      errcode = '23514',
      message = 'read-kernel re-record did not take: fingerprint and expected still differ';
  end if;
end
$verify$;

comment on function iam.entity_read_kernel_expected() is
  'The entity read kernel this database''s apply_rls was written against. platform.provision refuses every new table while iam.entity_read_kernel_fingerprint() differs from it. Re-recorded 2026-09-18 (W4-IO) with the evidence in migrations/campaign/w4_io_the_read_kernel_expectation_is_rerecorded.sql: exactly one body moved, W2-PRED''s knob-guarded custom-record arm.';
