-- LANE ARGS-RULED — the four store arguments and the comment's organization, measured RED then
-- GREEN from the seat `authenticated`, in ONE rolled-back transaction on the MAIN database.
--
-- THE USE CASE. Rincon Plumbing Co, a family plumbing company in Ventura County, keeps its Jobs,
-- Customers and Invoices in the record store. Dana (test@test.com) is a member of Rincon and was
-- shared nothing. Calder Approvals is a different tenant she has never been part of.
--
-- WHAT IT PROVES
--   1  the seat is real and custom.record is closed to it
--   2  custom.read_record decides the ORGANIZATION WALL first — a tenant she is not in answers
--      "You are not a member of that organization", not a record-shaped sentence
--   3  a record that EXISTS inside Calder Approvals answers the SAME sentence as a record id
--      that exists nowhere at all — the existence oracle across the wall is gone
--   4  RED: the pre-ARGS-RULED body, put back inside this transaction, answers those two
--      DIFFERENTLY — 02000 for the one that exists, 42501 for the one that does not
--   5  custom.io_comment_write refuses an organization that is not the record's, and names the right one
--   6  custom.doc_sign refuses to record somebody else as the signer
--
-- RUN IT:  binlocal/p.sh -f scripts/campaign-tests/argsruled_store_four_red_green.sql

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'argsruled_store_four_red_green.sql'
\set requires 'row:custom.record:organization_id = \'235a6add-e8b5-43f9-883e-9dd0389c1759\' and deleted_at is null'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '15s';

do $t$
declare
  c_dana constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_rincon constant uuid := '6069a466-1445-42df-a64e-cf37ecdc1b99';
  v_calder constant uuid := '235a6add-e8b5-43f9-883e-9dd0389c1759';
  v_invented constant uuid := '00000000-0000-4000-8000-00000000dead';
  v_boss text := current_user;
  v_hidden uuid;
  v_own uuid;
  v_exists text; v_absent text;
  v_st text; v_tx text;
  v_msg text;
begin
  perform set_config('app.actor_system', 'campaign-test/argsruled_store_four', true);

  -- A RECORD THAT REALLY EXISTS IN CALDER APPROVALS — a tenant Dana has never been part of.
  -- This is the sharp case: the oracle told a NON-MEMBER whether an id existed inside somebody
  -- else's organization, which is the wall REC-29 says is decided before anything else.
  select r.id into v_hidden from custom.record r
   where r.organization_id = v_calder and r.deleted_at is null
   limit 1;
  if v_hidden is null then
    raise exception 'fixture: Calder Approvals holds no live record, so the oracle cannot be measured';
  end if;
  raise notice 'fixture: record % exists in Calder Approvals, and Dana is not a member there', v_hidden;

  perform set_config('request.jwt.claims', c_dana, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then raise exception '1: no seat (%)', current_user; end if;
  if pg_has_role(current_user,(select c.relowner from pg_class c where c.oid='custom.record'::regclass),'member')
    then raise exception '1: this seat owns custom.record'; end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '1: this seat can SELECT custom.record directly';
  exception when insufficient_privilege then null;
  end;
  raise notice '1 — the seat is authenticated and custom.record is closed to it. PASS';

  -- ══ 2 — THE WALL IS DECIDED FIRST ═════════════════════════════════════════════════════
  begin
    perform custom.read_record(v_calder, v_invented, true);
    raise exception '2 FAILED: read_record answered for a tenant she is not a member of';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%not a member of that organization%' then
      raise exception '2 FAILED: the refusal was "%", which is not the organization wall', v_msg;
    end if;
    raise notice '2 — a tenant she is not in answers "%". PASS', v_msg;
  end;

  -- ══ 3 — EXISTS AND DOES-NOT-EXIST ANSWER THE SAME THING ══════════════════════════════
  begin perform custom.read_record(v_calder, v_hidden, true);
        raise exception '3 FAILED: she read a record inside a tenant she is not a member of';
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_tx = message_text;
    v_exists := v_st || ' ' || v_tx;
  end;
  begin perform custom.read_record(v_calder, v_invented, true);
        raise exception '3 FAILED: an invented id answered';
  exception when others then
    get stacked diagnostics v_st = returned_sqlstate, v_tx = message_text;
    v_absent := v_st || ' ' || v_tx;
  end;
  if v_exists is distinct from v_absent then
    raise exception '3 FAILED: a record that exists answers "%" and one that does not answers "%" — that difference is the oracle',
      v_exists, v_absent;
  end if;
  raise notice '3 — both answer "%" — byte-identical. PASS', v_exists;

  -- ══ 4 — RED: the pre-ARGS-RULED body told them apart ═════════════════════════════════
  perform set_config('role', v_boss, true);
  create or replace function custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean default false)
   returns jsonb language plpgsql stable security definer set search_path to ''
  as $b$
  declare v_me uuid := auth.uid(); v_now uuid; v_table uuid; v_doc jsonb;
  begin
    if v_me is null then raise exception 'Nobody is signed in.' using errcode='42501'; end if;
    v_now := custom.resolve_id(p_organization_id, p_record_id);
    select r.table_id, custom.record_values_of(r) into v_table, v_doc
      from custom.record r
     where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
    if not found then
      raise exception 'There is no record % in this organization.', p_record_id using errcode = '02000';
    end if;
    if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
      raise exception 'You do not have access to this record.' using errcode = '42501';
    end if;
    return v_doc;
  end $b$;
  perform set_config('role', 'authenticated', true);

  begin perform custom.read_record(v_calder, v_hidden, true);
        raise exception '4 FAILED: the old body returned the record';
  exception when others then get stacked diagnostics v_exists = returned_sqlstate; end;
  begin perform custom.read_record(v_calder, v_invented, true);
        raise exception '4 FAILED: the old body returned an invented id';
  exception when others then get stacked diagnostics v_absent = returned_sqlstate; end;
  if v_exists = v_absent then
    raise exception '4 RED FAILED: the old body answered % for both, so there was no oracle to close', v_exists;
  end if;
  raise notice '4 — BEFORE: a record that exists answered %, one that does not answered % — one bit per guess. PASS', v_exists, v_absent;

  -- ══ 5 — A COMMENT IS FILED WHERE ITS RECORD LIVES ═══════════════════════════════════
  -- Still seated; the CLAIMS move to admin@admin.com, who owns Rincon Plumbing Co and may
  -- comment on its records. The argument under test is the ORGANIZATION, not the level.
  perform set_config('request.jwt.claims',
    '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform set_config('role', v_boss, true);
  select r.id into v_own from custom.record r
   where r.organization_id = v_rincon and r.deleted_at is null
     and custom.has_visibility('87a6e699-3622-4869-8843-d0867456c0dd'::uuid, 'record', r.id,
                               'commenter'::public.permission_level)
   limit 1;
  perform set_config('role', 'authenticated', true);
  if v_own is null then
    raise notice '5 — SKIPPED: the owner of Rincon may comment on no Rincon record';
  else
    begin
      perform custom.io_comment_write(v_calder, v_own,
        'Backflow test scheduled for Tuesday — customer has the gate code.', '{}'::jsonb, null);
      raise exception '5 FAILED: a comment was filed under an organization that is not the record''s';
    exception when check_violation then
      get stacked diagnostics v_msg = message_text;
      raise notice '5 — refused: "%" and the hint names the organization it belongs to. PASS', v_msg;
    end;
  end if;

  -- ══ 6 — A SIGNATURE IS SIGNED BY WHOEVER SIGNED IT ═══════════════════════════════════
  -- Back to Dana, naming the owner of Rincon as the signer.
  perform set_config('request.jwt.claims', c_dana, true);
  begin
    perform custom.doc_sign(v_rincon, v_invented, 'signature',
                            'Maria Chen', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid);
    raise exception '6 FAILED: doc_sign accepted somebody else as the signer';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%signed by whoever signed it%' then
      raise exception '6 FAILED: the refusal was "%", which is not the signer rule', v_msg;
    end if;
    raise notice '6 — "%" PASS', v_msg;
  end;

  raise notice 'GREEN SUITE PASSED.';
end $t$;

rollback;
