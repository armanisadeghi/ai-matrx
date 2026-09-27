-- LANE REGISTRY-KERNEL-CHECK — A REGISTRY LEVEL MOVE BUMPS THE KERNEL FIXTURE IN ITS OWN TRANSACTION.
--
-- THE REAL CASE (2026-09-26/27): access ladder T-8c08 moved interview_session confidential ->
-- organization; the access-kernel fingerprint covers function bodies only, so the recorded
-- equivalence answers went stale silently and table creation was refused ~14 hours later when an
-- unrelated kernel edit made the provisioner ask. Here that very move is replayed backwards —
-- interview sessions organization -> confidential — inside a rolled-back transaction on the dev
-- clone, through platform.strict_class_probe (the sanctioned rolled-back-test door past the
-- access ladder's Arman-approval gate; its row can never commit). A move toward Public
-- (code_repository organization -> public) was tried first: it moves no fixture answer (the
-- fixture asks signed-in people only), so it is R4's no-bump case.
--   R1  before: platform.kernel_equivalence_check() is ok; provision_selfcheck(false) is ok.
--   R2  the move: exactly ONE new platform.kernel_fingerprint_record row whose via starts
--       'registry change' and whose ruling is
--       'registry change: platform.entity_types.interview_session organization → confidential',
--       evidence.moved names at least one answer, and exactly ONE ops.system_error row of kind
--       kernel_answers_moved_by_registry linked to it.
--   R3  after the move the check is ok again (the recording was patched for exactly the moved
--       answers) and provision_selfcheck(false) is still ok.
--   R4  a registry edit that moves no kernel-read column (a label), a level move that moves no
--       fixture answer (code_repository -> public) and a token the fixture never reaches write
--       nothing.
--
-- RUN IT (dev clone; one rolled-back transaction):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/registrykernel_green.sql
-- ITS RED: before registrykernel_a_level_move_bumps_the_kernel_fixture_in_its_own_transaction.sql
-- (and after its inverse) R2 fails: no row is written and the check answers ok=false after the move.

\set ON_ERROR_STOP on
\timing off

\set suite 'registrykernel_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '600s';
set local lock_timeout = '280s';

do $r1$
declare v_chk jsonb := platform.kernel_equivalence_check(); v_sc jsonb := platform.provision_selfcheck(false);
begin
  if not (v_chk->>'ok')::boolean then raise exception 'R1 FAIL: the check is not ok before the move: %', v_chk - 'read_lane'; end if;
  if not coalesce((v_sc->>'ok')::boolean, false) then raise exception 'R1 FAIL: provision_selfcheck(false) is not ok before: %', v_sc; end if;
  perform set_config('rk.n_rec', (select count(*) from platform.kernel_fingerprint_record)::text, true);
  perform set_config('rk.n_err', (select count(*) from ops.system_error where kind = 'kernel_answers_moved_by_registry')::text, true);
  raise notice 'R1 PASS: check ok (% answers), provision_selfcheck ok', v_chk->>'answers';
end $r1$;

insert into platform.strict_class_probe (token, level) values ('interview_session', 'confidential');
update platform.entity_types set data_class = 'confidential' where token = 'interview_session';

do $r2$
declare v_rec record; v_n_rec int; v_n_err int; v_err record; v_chk jsonb; v_sc jsonb;
begin
  v_n_rec := (select count(*) from platform.kernel_fingerprint_record) - current_setting('rk.n_rec')::int;
  v_n_err := (select count(*) from ops.system_error where kind = 'kernel_answers_moved_by_registry') - current_setting('rk.n_err')::int;
  if v_n_rec <> 1 or v_n_err <> 1 then
    raise exception 'R2 FAIL: the level move wrote % record row(s) and % kernel_answers_moved_by_registry row(s); expected 1 and 1. Check now: %',
      v_n_rec, v_n_err, platform.kernel_equivalence_check() - 'read_lane' - 'answers';
  end if;
  select * into v_rec from platform.kernel_fingerprint_record order by recorded_at desc, id desc limit 1;
  if v_rec.via not like 'registry change%' or v_rec.ruling <> 'registry change: platform.entity_types.interview_session organization → confidential'
     or coalesce((v_rec.evidence->>'moved_count')::int, 0) < 1 or v_rec.system_error_id is null then
    raise exception 'R2 FAIL: the record row is wrong: via %, ruling %, moved %, system_error %', v_rec.via, v_rec.ruling, v_rec.evidence->'moved_count', v_rec.system_error_id;
  end if;
  select * into v_err from ops.system_error where id = v_rec.system_error_id;
  if v_err.kind is distinct from 'kernel_answers_moved_by_registry' or (v_err.context->>'record_id')::uuid is distinct from v_rec.id then
    raise exception 'R2 FAIL: the system_error row is not the linked kernel_answers_moved_by_registry row: %', to_jsonb(v_err) - 'error_text';
  end if;
  raise notice 'R2 PASS: record % (%; % answer(s) moved: %), system_error %', v_rec.id, v_rec.ruling, v_rec.evidence->>'moved_count',
    (select string_agg(k, ', ') from (select jsonb_object_keys(v_rec.evidence->'moved') k limit 6) s), v_err.id;

  v_chk := platform.kernel_equivalence_check();
  v_sc := platform.provision_selfcheck(false);
  if not (v_chk->>'ok')::boolean then raise exception 'R3 FAIL: the check is not ok after the bump: %', v_chk - 'read_lane' - 'answers'; end if;
  if not coalesce((v_sc->>'ok')::boolean, false) then raise exception 'R3 FAIL: provision_selfcheck(false) is not ok after the bump: %', v_sc; end if;
  raise notice 'R3 PASS: check ok after the bump (% answers, 0/0/0), provision_selfcheck ok', v_chk->>'answers';
  perform set_config('rk.n_rec', (select count(*) from platform.kernel_fingerprint_record)::text, true);
end $r2$;

update platform.entity_types set label = label || ' ' where token = 'interview_session';
update platform.entity_types set data_class = 'public' where token = 'code_repository';
update platform.entity_types set data_class = data_class
 where token = (select et.token from platform.entity_types et
                 where et.is_active and et.data_class = 'organization' and et.rls_variant = 'entity'
                   and et.token <> all (platform.kernel_fixture_tokens()) order by et.token limit 1);

do $r4$
begin
  if (select count(*) from platform.kernel_fingerprint_record) <> current_setting('rk.n_rec')::int then
    raise exception 'R4 FAIL: a label edit, an answer-neutral level move or an out-of-reach token wrote a bump row.';
  end if;
  raise notice 'R4 PASS: no row for a label edit, code_repository -> public (no answer moved), or a token the fixture never reaches';
end $r4$;

rollback;
\echo 'registrykernel_green.sql: all clauses passed (rolled back)'
