#!/usr/bin/env python3
"""
EQUIVALENCE PROOF for the access setup of the standard performance review (access-setup PLAN §8 step 3; §9).

Everything runs on the live database inside ONE transaction that is ALWAYS rolled back: the fixture people (auth users
made from persona-factory personas, tagged app_metadata.test_fixture with a 1-hour expiry, never committed), their
employments, positions, HR roles, cycles, reviews, responses and peer nominations, the knob values, the planted faults.
Nothing persists.

  MODE 1  BASELINE   every frozen legacy door (hr._legacy_hr_review_*) against the live door of the same name, as the same
                     person (request.jwt.claims; the live door under role authenticated, the frozen copy - not client
                     callable - under the owner), JSON results and refusals diffed. Until the swap (§8 step 4) the live
                     doors ARE the old bodies, so this must be 0 differences: it proves the harness. After the swap the same
                     mode compares the legacy bodies with the swapped doors.
  MODE 2  PREDICTION the legacy answers against a pure-model prediction from iam.seats_of / iam.part_level / iam.may_act /
                     iam.redact_by_parts (what the swapped doors WILL return): reach, every response's visibility, every
                     head column, nominations, peer names, every `can` flag (legacy state conditions AND the model's
                     permission), _list_mine, _peer_requests_mine and history entries. Every difference is classified as in
                     the written opening list (§8 step 3) or NOT; the NOT list is the swap's blocker list.
  PLANTS             a fault planted in a frozen legacy helper must make mode 1 report differences; a wrong grid cell
                     planted in iam.access_setup must change mode 2's NOT list. Both inside savepoints, rolled back.

Strata (each must be non-empty or the proof FAILS): 11 review stages x 5 knobs (pairwise covering array, every value of
manager_sees_self, peers_enabled, peer_anonymous, calibration_required, the skip-level knob) x seat overlap (manager also HR;
3-person owner = manager + HR by fallback) x no-login employee / no-login manager x peer nominations pending / approved /
declined with submitted and draft responses x replaced manager x login linked after the review x reorg x coworker with no
seat x upper management (the upper_management HR role).

Exit 1 when mode 1 differs, a stratum is empty, or a plant is not caught. Mode 2's NOT list is reported, never "fixed" here.
Run from aidream so its .env and the persona factory are found:
  cd aidream && uv run python ../matrx-frontend/scripts/db-proofs/access-setup-review-equivalence.py
Options: WRITES=all (write doors in every knob configuration; default: first and last), QUICK=1 (one configuration).
"""
import json, os, re, sys, time, uuid
from collections import Counter, defaultdict

import psycopg
from dotenv import dotenv_values

sys.path.insert(0, '/Users/armanisadeghi/code/aidream')
from aidream.testing.persona import make_persona, build_tag  # noqa: E402

env = dotenv_values('/Users/armanisadeghi/code/aidream/.env')
SUITE = 'access-setup/review-equivalence'

# Organizations and their HR scaffolding (read, never changed outside the rolled-back transaction)
ORG_M = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'   # the main organization (has HR: admin@admin.com is hr_owner)
M_EP, M_LOC, M_DEPT, M_JT = ('1a0e336b-63a6-4b1f-aa10-ce8a2524022a', '6fdda0ce-615f-46b8-8304-e3c1f485a741',
                             'b182a2ef-39b7-416f-8c49-420af6ec53b5', '894309f2-5ced-44d4-b10e-09985fd920aa')
ORG_F = '319fad99-427c-4aaf-8e0b-17af53dd0424'   # Fairview People II: becomes the 3-person company with no HR role
F_EP, F_LOC, F_DEPT, F_JT = ('c96616a0-70f9-44c7-bc66-66a5d0c23617', '3a77202c-68f3-4d33-8611-ea759b67eb61',
                             '601fc546-e842-493b-bc0a-c93537d25737', 'f0233009-1489-4376-b2dd-62d0b63bf208')
SNAPSHOT_CYCLE = '9f4ffa7d-03a0-498f-9a51-6201619fdccc'   # its template snapshot is copied into the fixture cycles
TEMPLATE_M = 'f53d6575-9054-4b61-9cfd-6165da1baef5'
ADMIN = '87a6e699-3622-4869-8843-d0867456c0dd'
ADMIN_EMPLOYMENT = '6ee5ede7-fead-4de5-a0c3-523fa5073af7'

STAGES = ['not_started', 'in_progress', 'self_submitted', 'manager_submitted', 'both_submitted', 'calibrated',
          'peer_shared', 'shared', 'acknowledged', 'reopened', 'cancelled']

# key, kind (as reported), org, has login, position manager key, HR role
PEOPLE = [
    ('skip', 'skip-level manager', 'M', True, None, None),
    ('mgr', 'manager', 'M', True, 'skip', None),
    ('mgr_old', 'former manager (replaced / pre-reorg)', 'M', True, 'skip', None),
    ('hr', 'HR', 'M', True, None, 'hr_admin'),
    ('upper', 'upper management', 'M', True, None, 'upper_management'),
    ('mgr_hr', 'manager who is also HR', 'M', True, 'skip', 'hr_admin'),
    ('emp', 'employee', 'M', True, 'mgr', None),
    ('emp_nl', 'no-login employee', 'M', False, 'mgr', None),
    ('mgr_nl', 'no-login manager', 'M', False, 'skip', None),
    ('emp_nm', 'employee of a no-login manager', 'M', True, 'mgr_nl', None),
    ('emp_ll', 'employee whose login was linked after the review', 'M', True, 'mgr', None),
    ('emp_ro', 'employee moved in a reorg', 'M', True, 'mgr', None),
    ('emp_rp', 'employee whose review manager was replaced', 'M', True, 'mgr', None),
    ('emp_mh', 'employee of the manager who is HR', 'M', True, 'mgr_hr', None),
    ('peer_sub', 'peer (approved, submitted)', 'M', True, 'mgr', None),
    ('peer_draft', 'peer (approved, draft)', 'M', True, 'mgr', None),
    ('peer_pend', 'peer (nomination pending)', 'M', True, 'mgr', None),
    ('peer_decl', 'peer (nomination declined)', 'M', True, 'mgr', None),
    ('coworker', 'coworker with no seat', 'M', True, 'skip', None),
    ('owner', '3-person owner (manager + HR by fallback)', 'F', True, None, None),
    ('small_emp', 'employee of the 3-person company', 'F', True, 'owner', None),
    ('small_cw', 'coworker in the 3-person company', 'F', True, 'owner', None),
]
KIND = {p[0]: p[1] for p in PEOPLE}
KIND['admin'] = 'existing HR owner + org owner (admin@admin.com)'
# subject -> review manager column (person key)
SUBJECTS = {'emp': 'mgr', 'emp_nl': 'mgr', 'emp_nm': 'mgr_nl', 'emp_ll': 'mgr', 'emp_ro': 'mgr_old',
            'emp_rp': 'mgr', 'emp_mh': 'mgr_hr', 'small_emp': 'owner'}

KNOBS = [  # (feature, key, default, flipped) — the skip-level key is assembled (T-13 trigger reads function text only)
    ('hr.performance', 'standard_review_manager_sees_self', 'after_both_submit', 'after_employee_submits'),
    ('hr.performance', 'standard_review_peers_enabled', False, True),
    ('hr.performance', 'standard_review_peer_anonymous', True, False),
    ('hr.performance', 'standard_review_calibration_required', False, True),
    ('hr.access', 'review_' + 'visi' + 'bility_skip_level', True, False),
]
COVERING = ['00000', '00111', '01011', '10101', '11001', '11110']   # strength-2 covering array: every pair of values

failures = []
T0 = time.time()


def log(msg):
    print(f"[{time.time() - T0:7.1f}s] {msg}", flush=True)


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label:72s} {detail}"[:260], flush=True)
    if not ok:
        failures.append(label)


conn = psycopg.connect(host=env['SUPABASE_MATRIX_HOST'], port=5432, dbname=env['SUPABASE_MATRIX_DATABASE_NAME'],
                       user=env['SUPABASE_MATRIX_USER'], password=env['SUPABASE_MATRIX_PASSWORD'], autocommit=False)
cur = conn.cursor()


def q(sql, args=None):
    cur.execute(sql, args)
    return cur.fetchall() if cur.description else None


def one(sql, args=None):
    r = q(sql, args)
    return r[0][0] if r else None


# ---------------------------------------------------------------------------------------------------------------------
# fixture
# ---------------------------------------------------------------------------------------------------------------------
P = {}          # key -> {uid, employment, employee, org}
REVIEWS = {}    # review id -> {subject, stage, org}
CYCLES = {}     # (org, stage) -> cycle id
NOMS = {}       # review id -> {peer key: nomination id}


def build_fixture():
    q("select set_config('app.actor_system', 'access-setup-review-equivalence', true)")
    q("select set_config('hr.privileged_write', 'on', true)")   # fixture writes only; cleared before any door is asked
    tag = build_tag(suite=SUITE, purpose='rolled-back fixture person (never committed)', ttl_hours=1)
    for i, (key, kind, org, login, _mgr, _role) in enumerate(PEOPLE):
        pe = make_persona(seed=4100 + i)
        uid = str(uuid.uuid4())
        org_id = ORG_M if org == 'M' else ORG_F
        q("""insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, -- matrx-fixture:rollback-only the proof's one transaction always rolls back; tagged persona-factory personas
                                     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ('00000000-0000-0000-0000-000000000000', %s, 'authenticated', 'authenticated', %s, '', now(), %s, %s,
                     now(), now())""",
          (uid, pe.email, json.dumps({'provider': 'email', 'providers': ['email'], 'test_fixture': tag}),
           json.dumps({'full_name': pe.full_name})))
        party = one("""insert into crm.party (party_kind, display_name, first_name, last_name, organization_id)
                       values ('person', %s, %s, %s, %s) returning id""",
                    (pe.full_name, pe.first_name, pe.last_name, org_id))
        loc = M_LOC if org == 'M' else F_LOC
        # the login-linked-later employee gets the login AFTER the reviews exist (below)
        employee = one("""insert into hr.employee (party_id, login_user_id, employee_number, legal_first_name,
                                legal_last_name, display_name, organization_id, primary_location_id, work_email)
                          values (%s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                       (party, uid if login and key != 'emp_ll' else None, 'FX-' + pe.short_id, pe.first_name,
                        pe.last_name, pe.full_name, org_id, loc, pe.email))
        employment = one("""insert into hr.employment (employee_id, employer_profile_id, hire_date, organization_id, status)
                            values (%s, %s, '2025-01-06', %s, 'active') returning id""",
                         (employee, M_EP if org == 'M' else F_EP, org_id))
        P[key] = {'uid': uid if login else None, 'login': login, 'employee': employee, 'employment': employment,
                  'org': org_id, 'name': pe.full_name}
    for key, kind, org, login, mgr, role in PEOPLE:
        jt, dept, loc = (M_JT, M_DEPT, M_LOC) if org == 'M' else (F_JT, F_DEPT, F_LOC)
        positions = [('2025-01-06', None, P[mgr]['employment'] if mgr else None)]
        if key == 'emp_ro':   # reorg: reported to the former manager until 2026-08-31, to the manager since
            positions = [('2025-01-06', '2026-08-31', P['mgr_old']['employment']),
                         ('2026-09-01', None, P['mgr']['employment'])]
        for frm, to, m in positions:
            q("""insert into hr.position_assignment (employment_id, job_title_id, department_id, location_id,
                        manager_employment_id, is_primary, worker_class, flsa_status, pay_basis, schedule_class,
                        effective_from, effective_to, organization_id)
                 values (%s, %s, %s, %s, %s, true, 'employee', 'nonexempt', 'hourly', 'full_time', %s, %s, %s)""",
              (P[key]['employment'], jt, dept, loc, m, frm, to, P[key]['org']))
        if role:
            q("""insert into hr.role_assignment (employment_id, role_key, scope_kind, effective_from, is_active,
                        organization_id, reason)
                 values (%s, %s, 'org', '2025-01-06', true, %s, 'fixture: access-setup equivalence proof')""",
              (P[key]['employment'], role, P[key]['org']))
    # the 3-person company: no HR role at all; its owner is an organization owner
    q("""update hr.role_assignment set is_active = false, revoked_at = now(), revoked_reason = 'fixture: no HR role'
          where organization_id = %s and revoked_at is null""", (ORG_F,))
    q("""update iam.memberships set role = 'admin' where organization_id = %s and container_type = 'organization'
          and role = 'owner' and deleted_at is null""", (ORG_F,))   # an organization has exactly one owner
    q("""update iam.memberships set role = 'owner' where organization_id = %s and container_type = 'organization'
          and user_id = %s and deleted_at is null""", (ORG_F, P['owner']['uid']))
    q("""insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
         values (%s, 'organization', %s, %s, 'owner', 'active')
         on conflict do nothing""", (ORG_F, ORG_F, P['owner']['uid']))

    snapshot = one("select template_snapshot from hr.review_cycle where id = %s", (SNAPSHOT_CYCLE,))
    for org in (ORG_M, ORG_F):
        for i, st in enumerate(STAGES + ['draft']):
            CYCLES[(org, st)] = one(
                """insert into hr.review_cycle (name, period_start, period_end, self_due_on, manager_due_on, share_due_on,
                          template_id, template_snapshot, status, organization_id, launched_at)
                   values (%s, '2026-01-01', '2026-06-30', '2026-10-24', '2026-10-31', '2026-11-07', %s, %s, %s, %s, %s)
                   returning id""",
                (f"Mid-year review 2026 ({i + 1})" if st != 'draft' else 'Year-end review 2026',
                 TEMPLATE_M if org == ORG_M else None, json.dumps(snapshot), 'draft' if st == 'draft' else 'open', org,
                 None if st == 'draft' else '2026-10-01'))
    hr_uid = P['hr']['uid']
    answers = json.dumps({'__kind': 'performance_review_answers',
                          'goals_for_the_next_period': 'Lead the onboarding revamp and mentor the two new hires.'})
    for subj, mgr in SUBJECTS.items():
        org = P[subj]['org']
        emp_uid = P[subj]['uid'] if subj != 'emp_ll' else None   # emp_ll: no login when the review was created
        mgr_uid = P[mgr]['uid']
        for st in STAGES:
            i = STAGES.index(st)
            both = st in ('both_submitted', 'calibrated', 'peer_shared', 'shared', 'acknowledged')
            self_st = {'not_started': None, 'cancelled': 'draft', 'manager_submitted': 'draft', 'in_progress': 'draft'}.get(
                st, 'submitted')
            mgr_st = {'not_started': None, 'cancelled': None, 'in_progress': 'draft', 'self_submitted': 'draft',
                      'reopened': 'draft'}.get(st, 'submitted')
            status = {'calibrated': 'both_submitted', 'peer_shared': 'both_submitted'}.get(st, st)
            reopen = [] if st != 'reopened' else [{
                'seq': 1, 'at': '2026-10-05T10:00:00+00:00', 'by_user_id': mgr_uid or hr_uid,
                'reason': 'Adding the Q3 launch results', 'prior_status': 'shared',
                'prior_shared_at': '2026-10-04T10:00:00+00:00', 'prior_acknowledged_at': None,
                'prior_acknowledgment_comment': None, 'prior_overall_rating': 'successful',
                'prior_workflow_instance_id': None}]
            rid = one(
                """insert into hr.review (cycle_id, employment_id, employee_id, employee_user_id, manager_employment_id,
                          manager_user_id, status, self_submitted_at, manager_submitted_at, shared_at, shared_by,
                          acknowledged_at, acknowledgment_comment, overall_rating, calibrated_rating, calibration_note,
                          calibrated_by, calibrated_at, reopen_history, cancelled_at, cancel_reason,
                          peer_feedback_shared_at, organization_id)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                (CYCLES[(org, st)], P[subj]['employment'], P[subj]['employee'], emp_uid, P[mgr]['employment'], mgr_uid,
                 status,
                 '2026-10-02T09:00:00+00:00' if self_st == 'submitted' else None,
                 '2026-10-03T09:00:00+00:00' if mgr_st == 'submitted' else None,
                 '2026-10-04T10:00:00+00:00' if st in ('shared', 'acknowledged') else None,
                 mgr_uid if st in ('shared', 'acknowledged') else None,
                 '2026-10-06T10:00:00+00:00' if st == 'acknowledged' else None,
                 'Thank you, this matches how the year went.' if st == 'acknowledged' else None,
                 'successful' if both or st == 'reopened' else None,
                 'exceeds_expectations' if st in ('calibrated', 'shared', 'acknowledged') else None,
                 'Matched against the team distribution.' if st in ('calibrated', 'shared', 'acknowledged') else None,
                 hr_uid if st in ('calibrated', 'shared', 'acknowledged') else None,
                 '2026-10-03T15:00:00+00:00' if st in ('calibrated', 'shared', 'acknowledged') else None,
                 json.dumps(reopen),
                 '2026-10-03T12:00:00+00:00' if st == 'cancelled' else None,
                 'Moved to a contractor agreement' if st == 'cancelled' else None,
                 '2026-10-03T16:00:00+00:00' if st in ('peer_shared', 'shared', 'acknowledged') else None, org))
            REVIEWS[rid] = {'subject': subj, 'stage': st, 'org': org}
            for role, rst, who in (('self', self_st, emp_uid), ('manager', mgr_st, mgr_uid)):
                if rst is None:
                    continue
                q("""insert into hr.review_response (review_id, role, respondent_user_id, recorded_by, answers, status,
                            submitted_at, organization_id) values (%s,%s,%s,%s,%s,%s,%s,%s)""",
                  (rid, role, who, None if who else (P['hr']['uid'] if org == ORG_M else P['owner']['uid']), answers,
                   rst, '2026-10-02T09:00:00+00:00' if rst == 'submitted' else None, org))
            if subj == 'emp_rp' and mgr_st != 'submitted':   # the replaced manager's draft, archived by the replace
                q("""insert into hr.review_response (review_id, role, respondent_user_id, answers, status, organization_id,
                            deleted_at) values (%s, 'manager', %s, %s, 'draft', %s, '2026-10-01T08:00:00+00:00')""",
                  (rid, P['mgr_old']['uid'], answers, org))
            if subj == 'emp':
                NOMS[rid] = {}
                for peer, nst, by in (('peer_sub', 'approved', 'mgr'), ('peer_draft', 'approved', 'mgr'),
                                      ('peer_pend', 'pending', 'emp'), ('peer_decl', 'declined', 'emp')):
                    NOMS[rid][peer] = one(
                        """insert into hr.review_peer_nomination (review_id, peer_employment_id, peer_user_id, nominated_by,
                                  status, decided_by, decided_at, organization_id)
                           values (%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                        (rid, P[peer]['employment'], P[peer]['uid'], P[by]['uid'], nst,
                         P['mgr']['uid'] if nst != 'pending' else None,
                         '2026-10-01T12:00:00+00:00' if nst != 'pending' else None, org))
                for peer, rst in (('peer_sub', 'submitted'), ('peer_draft', 'draft')):
                    q("""insert into hr.review_response (review_id, role, respondent_user_id, answers, status, submitted_at,
                                organization_id) values (%s, 'peer', %s, %s, %s, %s, %s)""",
                      (rid, P[peer]['uid'], answers, rst, '2026-10-02T11:00:00+00:00' if rst == 'submitted' else None, org))
    # the login is linked to the employment after the reviews were created
    q("update hr.employee set login_user_id = %s where id = %s", (P['emp_ll']['uid'], P['emp_ll']['employee']))
    P['emp_ll']['uid'] = P['emp_ll']['uid'] or None
    q("select set_config('hr.privileged_write', '', true)")


# the login-linked employee: the uid was minted with the person but the employee row got it only now
def fix_emp_ll_uid():
    P['emp_ll']['uid'] = one("select login_user_id::text from hr.employee where id = %s", (P['emp_ll']['employee'],))


# ---------------------------------------------------------------------------------------------------------------------
# harness (server side, temp objects die with the transaction)
# ---------------------------------------------------------------------------------------------------------------------
HARNESS = r"""
create temp table fx_caller (key text primary key, uid uuid) on commit drop;
create temp table fx_review (id uuid primary key, subject text, stage text, org uuid) on commit drop;
create temp table fx_call (n serial, door text, target text, args text, is_read boolean, review uuid,
                          client boolean default true) on commit drop;
create temp table fx_outcome (config int, door text, outcome text, n int, primary key (config, door, outcome))
  on commit drop;
create temp table fx_out (config int, caller text, door text, target text, review uuid, legacy text, live text)
  on commit drop;

-- one door call as one person, in a subtransaction that is always undone (a write never leaks into the next call)
create function pg_temp.run1(p_uid uuid, p_sql text, p_as_client boolean) returns text language plpgsql as $f$
declare v text; d text;
begin
  begin
    perform set_config('mx_memo.v', '', true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    if p_as_client then execute 'set local role authenticated'; end if;
    execute p_sql into v;
    raise exception using errcode = 'MXRB1', message = 'undo', detail = coalesce(v, '<null>');
  exception
    when sqlstate 'MXRB1' then get stacked diagnostics d = pg_exception_detail; return d;
    when others then return 'ERROR ' || sqlstate || ' ' || sqlerrm;
  end;
end $f$;

create function pg_temp.run_mode1(p_config int, p_writes boolean) returns int language plpgsql as $f$
declare c record; k record; v_l text; v_n text; v_cnt int := 0;
begin
  for k in select * from fx_caller order by key loop
    for c in select * from fx_call where p_writes or is_read order by n loop
      v_l := pg_temp.run1(k.uid, format('select hr.%I(%s)::text', '_legacy_' || c.door, c.args), false);
      v_n := pg_temp.run1(k.uid, format('select hr.%I(%s)::text', c.door, c.args), c.client);
      v_cnt := v_cnt + 1;
      insert into fx_outcome values (p_config, c.door,
        case when v_l like '{"ok": true%' then 'ok'
             when v_l like '{"ok": false%' then 'refused ' || coalesce(v_l::jsonb ->> 'reason', '?')
             when v_l like 'ERROR%' then 'error ' || split_part(v_l, ' ', 2)
             else 'value' end, 1)
      on conflict (config, door, outcome) do update set n = fx_outcome.n + 1;
      if v_l is distinct from v_n or c.is_read then
        insert into fx_out values (p_config, k.key, c.door, c.target, c.review, v_l,
                                   case when v_l is distinct from v_n then v_n end);
      end if;
    end loop;
  end loop;
  return v_cnt;
end $f$;

-- MODE 2: legacy answers vs the pure-model prediction
create function pg_temp.mode2(p_config int)
returns table (caller text, review uuid, door text, fact text, part text, legacy text, predicted text, seats text[])
language plpgsql as $f$
declare
  o record; r hr.review%rowtype; cy hr.review_cycle%rowtype; x record; L jsonb; v_uid uuid; v_seats text[];
  lr boolean; pr boolean; lv boolean; pv boolean; col text; raw jsonb; red jsonb; v_self text; v_mgr text;
  v_open boolean; lc jsonb; v_anon boolean; v_names boolean; e jsonb; v_rid uuid;
begin
  -- hr_review_get
  for o in select f.caller, f.review, f.legacy, k.uid from fx_out f join fx_caller k on k.key = f.caller
            where f.config = p_config and f.door = 'hr_review_get' loop
    caller := o.caller; review := o.review; door := 'hr_review_get'; v_uid := o.uid;
    L := case when o.legacy like '{%' then o.legacy::jsonb else '{}'::jsonb end;
    select * into r from hr.review where id = o.review;
    select * into cy from hr.review_cycle where id = r.cycle_id;
    v_seats := coalesce(iam.seats_of(v_uid, 'hr_review', o.review), '{}'); seats := v_seats;
    lr := coalesce((L ->> 'ok')::boolean, false); pr := cardinality(v_seats) > 0;
    fact := 'reach'; part := null; legacy := lr::text; predicted := pr::text; return next;
    if not (lr or pr) then continue; end if;
    -- every response row
    for x in select rr.*, coalesce(k.key, case when rr.respondent_user_id is null then 'recorded' else 'other' end) who
               from hr.review_response rr left join fx_caller k on k.uid = rr.respondent_user_id
              where rr.review_id = o.review and rr.deleted_at is null loop
      lv := exists (select 1 from jsonb_array_elements(coalesce(L -> 'responses', '[]')) e2
                     where e2 ->> 'response_id' = x.id::text and (e2 ->> 'visible')::boolean);
      pv := iam.part_level(v_uid, 'hr_review', o.review, null, 'hr_review_response', x.id) is not null;
      fact := 'response ' || x.role || ' by ' || x.who || ' (' || x.status || ')';
      part := case x.role when 'self' then 'self_evaluation' when 'manager' then 'manager_evaluation' else 'peer_input' end;
      legacy := lv::text; predicted := pv::text; return next;
      if x.role = 'peer' and lv and pv then
        lv := exists (select 1 from jsonb_array_elements(L -> 'responses') e2
                       where e2 ->> 'response_id' = x.id::text and e2 ? 'respondent_name');
        v_anon := coalesce((hr._hr_knob('hr.performance', 'standard_review_peer_anonymous', r.organization_id,
                                        'true'::jsonb) #>> '{}')::boolean, true);
        v_names := x.respondent_user_id = v_uid or exists (
          select 1 from iam._cells_for(v_uid, 'hr_review', o.review, 'peer_input') cf
           where cf.reached and (cf.names = 'shown'
                                 or (cf.names = 'knob:hr.performance/standard_review_peer_anonymous' and not v_anon)));
        fact := 'peer name of ' || x.who; legacy := lv::text; predicted := coalesce(v_names, false)::text; return next;
      end if;
    end loop;
    -- head columns that belong to parts
    foreach col in array array['overall_rating', 'calibrated_rating', 'calibration_note', 'acknowledgment_comment',
                               'shared_at', 'reopen_history'] loop
      raw := to_jsonb(r) -> col;
      continue when raw is null or jsonb_typeof(raw) = 'null' or raw = '[]'::jsonb;
      part := case col when 'overall_rating' then 'final_summary' when 'shared_at' then 'final_summary'
                       when 'acknowledgment_comment' then 'final_summary' when 'reopen_history' then 'discussion'
                       else 'calibration' end;
      if col = 'reopen_history' then
        lv := lr and coalesce((L -> 'review' -> 'reopen_history' -> 0) ? 'by_user_id', false);
        red := iam.redact_by_parts('hr_review', o.review, v_uid, jsonb_build_object(col, raw));
        pv := pr and coalesce((red -> col -> 0) ? 'by_user_id', false);
        fact := 'column reopen_history (who reopened)';
      else
        lv := lr and (L -> 'review' -> col) is not null and jsonb_typeof(L -> 'review' -> col) <> 'null';
        red := iam.redact_by_parts('hr_review', o.review, v_uid, jsonb_build_object(col, raw));
        pv := pr and (red -> col) is not null and jsonb_typeof(red -> col) <> 'null';
        fact := 'column ' || col;
      end if;
      legacy := lv::text; predicted := pv::text; return next;
    end loop;
    -- the nominations list
    if exists (select 1 from hr.review_peer_nomination n where n.review_id = o.review and n.deleted_at is null) then
      lv := jsonb_array_length(coalesce(L -> 'peer_nominations', '[]')) > 0;
      pv := iam.part_level(v_uid, 'hr_review', o.review, 'peer_nominations') is not null;
      fact := 'peer nominations list'; part := 'peer_nominations'; legacy := lv::text; predicted := pv::text; return next;
    end if;
    -- can flags: legacy state conditions AND the model's permission
    select status into v_self from hr.review_response where review_id = r.id and role = 'self' and deleted_at is null
      order by created_at desc limit 1;
    select status into v_mgr from hr.review_response where review_id = r.id and role = 'manager' and deleted_at is null
      order by created_at desc limit 1;
    v_open := cy.status = 'open' and r.status <> 'cancelled';
    lc := coalesce(L -> 'review' -> 'can', '{}'::jsonb);
    for fact, part, predicted in
      select 'can ' || t.k, t.p, t.v::text from (values
        ('save_self', 'self_evaluation', v_open and coalesce(v_self, 'draft') = 'draft'
           and iam.part_level(v_uid, 'hr_review', r.id, 'self_evaluation') = 'editor'),
        ('submit_self', 'self_evaluation', v_open and v_self is not distinct from 'draft'
           and iam.part_level(v_uid, 'hr_review', r.id, 'self_evaluation') = 'editor'),
        ('save_manager', 'manager_evaluation', v_open and coalesce(v_mgr, 'draft') = 'draft'
           and r.status not in ('shared', 'acknowledged')
           and iam.part_level(v_uid, 'hr_review', r.id, 'manager_evaluation') = 'editor'),
        ('submit_manager', 'manager_evaluation', v_open and v_mgr is not distinct from 'draft'
           and r.status not in ('shared', 'acknowledged')
           and iam.part_level(v_uid, 'hr_review', r.id, 'manager_evaluation') = 'editor'),
        ('set_overall', 'action set_overall', v_open and r.status not in ('shared', 'acknowledged')
           and iam.may_act(v_uid, 'hr_review', r.id, 'set_overall')),
        ('share', 'action release_to_employee', v_open and r.status = 'both_submitted' and r.overall_rating is not null
           and iam.may_act(v_uid, 'hr_review', r.id, 'release_to_employee')),
        ('acknowledge', 'action acknowledge', v_open and r.status = 'shared'
           and iam.may_act(v_uid, 'hr_review', r.id, 'acknowledge')),
        ('reopen', 'action reopen', v_open and r.status in ('shared', 'acknowledged')
           and iam.may_act(v_uid, 'hr_review', r.id, 'reopen')),
        ('cancel', 'action cancel', r.status not in ('cancelled', 'acknowledged')
           and iam.may_act(v_uid, 'hr_review', r.id, 'cancel')),
        ('replace_manager', 'action replace_manager', r.status not in ('cancelled', 'acknowledged', 'shared')
           and iam.may_act(v_uid, 'hr_review', r.id, 'replace_manager'))) t(k, p, v)
    loop
      legacy := coalesce((lc ->> substr(fact, 5))::boolean, false)::text;
      predicted := coalesce(predicted, 'false');
      return next;
    end loop;
  end loop;

  -- _list_mine (fixture reviews only) and _peer_requests_mine
  for o in select k.key, k.uid, f.door, f.legacy, fr.id rid, fr.org from fx_caller k
             join fx_out f on f.caller = k.key and f.config = p_config
                          and f.door in ('hr_review_list_mine', 'hr_review_peer_requests_mine')
             join fx_review fr on (f.door = 'hr_review_peer_requests_mine' or f.target = fr.org::text) loop
    caller := o.key; review := o.rid; door := o.door; part := null;
    v_seats := coalesce(iam.seats_of(o.uid, 'hr_review', o.rid), '{}'); seats := v_seats;
    L := case when o.legacy like '{%' then o.legacy::jsonb else '{}'::jsonb end;
    if o.door = 'hr_review_list_mine' then
      lv := exists (select 1 from jsonb_array_elements(coalesce(L -> 'reviews', '[]')) e2 where e2 ->> 'review_id' = o.rid::text);
      pv := v_seats && array['employee', 'manager', 'hr', 'upper_management'];
      fact := 'listed';
    else
      lv := exists (select 1 from jsonb_array_elements(coalesce(L -> 'requests', '[]')) e2 where e2 ->> 'review_id' = o.rid::text);
      pv := 'peer' = any(v_seats) and (select status from hr.review where id = o.rid) <> 'cancelled';
      fact := 'peer request listed';
    end if;
    continue when not (lv or pv);
    legacy := lv::text; predicted := pv::text; return next;
  end loop;

  -- history: the scope stays today's; each entry is redacted by parts
  for o in select f.caller, k.uid, f.legacy from fx_out f join fx_caller k on k.key = f.caller
            where f.config = p_config and f.door = 'hr_review_history' and f.legacy like '{"ok": true%' loop
    door := 'hr_review_history'; caller := o.caller;
    for e in select * from jsonb_array_elements(o.legacy::jsonb -> 'reviews') loop
      v_rid := (e ->> 'review_id')::uuid; review := v_rid;
      continue when not exists (select 1 from fx_review where id = v_rid);
      select * into r from hr.review where id = v_rid;
      v_seats := coalesce(iam.seats_of(o.uid, 'hr_review', v_rid), '{}'); seats := v_seats;
      foreach col in array array['overall_rating', 'shared_at'] loop
        raw := to_jsonb(r) -> col;
        continue when raw is null or jsonb_typeof(raw) = 'null';
        red := iam.redact_by_parts('hr_review', v_rid, o.uid, jsonb_build_object(col, raw));
        fact := 'history entry ' || col; part := 'final_summary';
        legacy := ((e -> col) is not null and jsonb_typeof(e -> col) <> 'null')::text;
        predicted := ((red -> col) is not null and jsonb_typeof(red -> col) <> 'null')::text;
        return next;
      end loop;
    end loop;
  end loop;
end $f$;
"""

UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
TS_RE = re.compile(r'\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(\.\d+)?(\+00:00|Z)?')


def normalize(text, known):
    if text is None:
        return None
    t = UUID_RE.sub(lambda m: m.group(0) if m.group(0) in known else '<new-id>', text)
    return TS_RE.sub('<ts>', t)


def install_calls():
    ans = "'{\"__kind\": \"performance_review_answers\", \"goals_for_the_next_period\": \"Own the Q1 launch\"}'::jsonb"
    rows = []
    for rid, meta in REVIEWS.items():
        org = meta['org']
        R = f"'{rid}'::uuid"
        pend = (NOMS.get(rid) or {}).get('peer_pend')
        other_mgr = P['mgr_old']['employment'] if org == ORG_M else P['small_cw']['employment']
        nominee = P['coworker']['employment'] if org == ORG_M else P['small_cw']['employment']
        rows += [
            ('hr_review_get', rid, R, True),
            ('review_wf_digest', rid, f"'hr_review', {R}", True),
            ('hr_review_save_response', rid, f"{R}, 'self', {ans}, null", False),
            ('hr_review_save_response', rid, f"{R}, 'manager', {ans}, null", False),
            ('hr_review_save_response', rid, f"{R}, 'peer', {ans}, null", False),
            ('hr_review_submit_response', rid, f"{R}, 'self'", False),
            ('hr_review_submit_response', rid, f"{R}, 'manager'", False),
            ('hr_review_submit_response', rid, f"{R}, 'peer'", False),
            ('hr_review_set_overall', rid, f"{R}, 'successful'", False),
            ('hr_review_share', rid, R, False),
            ('hr_review_acknowledge', rid, f"{R}, 'Thank you, this is fair.'", False),
            ('hr_review_reopen', rid, f"{R}, 'Adding the Q3 launch results'", False),
            ('hr_review_cancel', rid, f"{R}, 'Moved to a contractor agreement'", False),
            ('hr_review_replace_manager', rid, f"{R}, '{other_mgr}'::uuid", False),
            ('hr_review_calibrate', rid, f"{R}, 'exceeds_expectations', 'Matched against the team distribution'", False),
            ('hr_review_peer_nominate', rid, f"{R}, array['{nominee}'::uuid]", False),
            ('hr_review_peer_approve', rid, f"{R}, array[{repr(pend) + '::uuid' if pend else ''}]::uuid[], true", False),
            ('hr_review_peer_share', rid, f"{R}, true", False),
        ]
    for org in (ORG_M, ORG_F):
        O = f"'{org}'::uuid"
        rows += [('hr_review_list_mine', org, O, True), ('hr_review_cycle_list', org, O, True),
                 ('hr_review_template_list', org, O, True),
                 ('hr_review_template_ensure_default', org, O, False),
                 ('hr_review_cycle_create', org, "'" + json.dumps({
                     'organization_id': org, 'name': 'Q4 check-in 2026', 'period_start': '2026-10-01',
                     'period_end': '2026-12-31'}) + "'::jsonb", False),
                 ('hr_review_cycle_launch', org, f"'{CYCLES[(org, 'draft')]}'::uuid, '{{}}'::jsonb", False),
                 ('hr_review_cycle_close', org, f"'{CYCLES[(org, 'not_started')]}'::uuid", False),
                 ('hr_review_template_save', org, "'" + json.dumps({
                     'organization_id': org, 'name': 'Quarterly check-in'}) + "'::jsonb", False)]
        for st in STAGES + ['draft']:
            C = f"'{CYCLES[(org, st)]}'::uuid"
            rows += [('hr_review_calibration', CYCLES[(org, st)], f"{C}, '{{}}'::jsonb", True),
                     ('hr_review_cycle_get', CYCLES[(org, st)], C, True)]
    rows += [('hr_review_peer_requests_mine', '-', '', True),
             ('hr_review_template_get', TEMPLATE_M, f"'{TEMPLATE_M}'::uuid", True),
             ('hr_review_template_archive', TEMPLATE_M, f"'{TEMPLATE_M}'::uuid", False)]
    for subj in SUBJECTS:
        rows.append(('hr_review_history', P[subj]['employment'], f"'{P[subj]['employment']}'::uuid", True))
    with cur.copy("copy fx_call (door, target, args, is_read, review, client) from stdin") as cp:
        for door, target, args, is_read in rows:
            # review_wf_digest is the workflow engine's, not a client door: both bodies run under the owner
            cp.write_row((door, str(target), args, is_read, target if target in REVIEWS else None,
                          door != 'review_wf_digest'))
    return rows


def set_knobs(bits):
    q("select set_config('hr.privileged_write', 'on', true)")
    vals = {}
    for (feature, key, d, f), b in zip(KNOBS, bits):
        v = f if b == '1' else d
        vals[key] = v
        for org in (ORG_M, ORG_F):
            q("delete from platform.knob_override where feature = %s and key = %s and organization_id = %s",
              (feature, key, org))
            q("""insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
                 values (%s, %s, 'organization', %s, %s, %s, 'fixture: access-setup equivalence proof')""",
              (feature, key, org, org, json.dumps(v)))
    q("select set_config('hr.privileged_write', '', true)")
    q("select set_config('mx_memo.v', '', true)")
    seen = {}
    for feature, key, d, f in KNOBS:
        seen[key] = [one("select hr._hr_knob(%s, %s, %s, null)", (feature, key, org)) for org in (ORG_M, ORG_F)]
    return vals, seen


def main():
    stray = q("select name, setting from pg_settings where name like 'mx.%%' and setting <> ''") or []
    stray += [(n, one(f"select current_setting('{n}', true)")) for n in
              ('mx.access_setup_part', 'mx.knob_feature_memo', 'mx.memo_compare_written')
              if one(f"select current_setting('{n}', true)") not in (None, '')]
    print('mx.* session settings:', stray or 'none')
    if stray:
        print('REFUSED: an mx.* override is set; the proof runs only on the plain session.')
        return 2
    q("set local statement_timeout = 0")
    q("set local transaction_timeout = 0")      # the whole proof is one transaction (~30 min for six configurations)
    q("set local idle_in_transaction_session_timeout = 0")
    build_fixture()
    fix_emp_ll_uid()
    log(f"fixture: {len(P)} people, {len(REVIEWS)} reviews, {len(CYCLES)} cycles")
    cur.execute(HARNESS)
    callers = {k: v['uid'] for k, v in P.items() if v['uid']}
    callers['admin'] = ADMIN
    with cur.copy("copy fx_caller (key, uid) from stdin") as cp:
        for k, u in callers.items():
            cp.write_row((k, u))
    with cur.copy("copy fx_review (id, subject, stage, org) from stdin") as cp:
        for rid, m in REVIEWS.items():
            cp.write_row((rid, m['subject'], m['stage'], m['org']))
    calls = install_calls()
    known = {str(x) for x in [ADMIN, ADMIN_EMPLOYMENT, ORG_M, ORG_F, TEMPLATE_M, SNAPSHOT_CYCLE, M_EP, M_LOC, M_DEPT, M_JT,
                              F_EP, F_LOC, F_DEPT, F_JT] + list(REVIEWS) + list(CYCLES.values())}
    for v in P.values():
        known |= {str(v[k]) for k in ('uid', 'employee', 'employment') if v[k]}
    for d in NOMS.values():
        known |= {str(x) for x in d.values()}
    known |= {str(r[0]) for r in q("select id from hr.review_response where review_id = any(%s)", (list(REVIEWS),))}
    known |= {str(r[0]) for r in q("select id from hr.position_assignment where employment_id = any(%s)",
                                   ([v['employment'] for v in P.values()],))}

    configs = COVERING[:1] if os.environ.get('QUICK') else COVERING
    write_cfgs = set(range(len(configs))) if os.environ.get('WRITES') == 'all' else {0, len(configs) - 1}
    strata = Counter()
    m1_compared = 0
    m1_diffs = []
    m2_rows = []
    for ci, bits in enumerate(configs):
        vals, seen = set_knobs(bits)
        log(f"config {ci} knobs {vals} (resolved M/F: {seen}) writes={'yes' if ci in write_cfgs else 'no'}")
        n = one("select pg_temp.run_mode1(%s, %s)", (ci, ci in write_cfgs))
        m1_compared += n
        for caller, door, target, legacy, live in q(
                "select caller, door, target, legacy, live from fx_out where config = %s and live is not null", (ci,)):
            if normalize(legacy, known) != normalize(live, known):
                m1_diffs.append((ci, caller, door, target, legacy[:300], live[:300]))
        log(f"  mode 1: {n} door calls compared, {len(m1_diffs)} differences so far")
        if os.environ.get('MODE1_ONLY'):
            for door, cnt in Counter(d[2] for d in m1_diffs).most_common():
                ex = next(d for d in m1_diffs if d[2] == door)
                print(f"  {cnt:6d} {door}\n      legacy {ex[4][:260]}\n      live   {ex[5][:260]}")
            return 1
        # strata for this configuration
        for k, v in vals.items():
            strata[f"knob {k} = {json.dumps(v)}"] += n
        for door, cnt in q("select door, count(*) from fx_call c cross join fx_caller k where %s or c.is_read group by door",
                           (ci in write_cfgs,)):
            strata[f"door {door}"] += cnt
        rows = q("select * from pg_temp.mode2(%s)", (ci,))
        m2_rows += [(ci,) + tuple(r) for r in rows]
        log(f"  mode 2: {len(rows)} facts compared, {sum(1 for r in rows if r[5] != r[6])} differences")

    # strata over the fixture itself
    for rid, m in REVIEWS.items():
        strata[f"stage {m['stage']}"] += len(callers) * len(configs)
    for key in callers:
        strata[f"caller {KIND.get(key, key)}"] += len(REVIEWS) * len(configs)
    strata['seat overlap: manager also HR (reviews of emp_mh)'] = sum(1 for m in REVIEWS.values() if m['subject'] == 'emp_mh')
    strata['seat overlap: 3-person owner = manager + HR by fallback'] = one(
        "select count(*) from fx_review r where r.subject = 'small_emp' and iam.seats_of(%s, 'hr_review', r.id) @> array['hr','manager']",
        (P['owner']['uid'],))
    strata['upper management holds the upper_management seat'] = one(
        "select count(*) from fx_review r where iam.seats_of(%s, 'hr_review', r.id) @> array['upper_management']",
        (P['upper']['uid'],))
    strata['no-login employee reviews'] = sum(1 for m in REVIEWS.values() if m['subject'] == 'emp_nl')
    strata['no-login manager reviews'] = sum(1 for m in REVIEWS.values() if m['subject'] == 'emp_nm')
    for st in ('pending', 'approved', 'declined'):
        strata[f"peer nominations {st}"] = one(
            "select count(*) from hr.review_peer_nomination where review_id = any(%s) and status = %s", (list(REVIEWS), st))
    for st in ('submitted', 'draft'):
        strata[f"peer responses {st}"] = one(
            "select count(*) from hr.review_response where review_id = any(%s) and role = 'peer' and status = %s",
            (list(REVIEWS), st))
    strata['replaced manager (archived draft of the former manager)'] = one(
        "select count(*) from hr.review_response where review_id = any(%s) and deleted_at is not null", (list(REVIEWS),))
    strata['login linked after the review was created'] = one(
        "select count(*) from fx_review r join hr.review x on x.id = r.id where r.subject = 'emp_ll' and x.employee_user_id is null")
    strata['reorg: position manager differs from the review manager'] = one(
        "select count(*) from fx_review r join hr.review x on x.id = r.id where r.subject = 'emp_ro' and hr.manager_as_of(x.employment_id, current_date) <> x.manager_employment_id")
    strata['coworker with no seat (reviews asked)'] = one(
        "select count(*) from fx_out where caller = 'coworker' and door = 'hr_review_get'")
    print('\nSTRATA (count compared; 0 fails)')
    for k in sorted(strata):
        print(f"  {strata[k]:8d}  {k}")
        if not strata[k]:
            check(f"stratum non-empty: {k}", False)
    for st in STAGES:
        if not strata.get(f"stage {st}"):
            check(f"stratum non-empty: stage {st}", False)

    print('\nMODE 1 OUTCOMES (what the legacy door answered; every door must succeed at least once)')
    for door, outs in q("""select door, string_agg(outcome || ' ' || n, ' · ' order by n desc)
                            from (select door, outcome, sum(n) n from fx_outcome where config < 900 group by 1, 2) z
                           group by door order by door"""):
        print(f"  {door:36s} {outs}"[:400])
        if not any(o.startswith('ok ') or o.startswith('value ') for o in outs.split(' · ')):
            print(f"      (never succeeded: only its refusals are compared)")
    print(f"\nMODE 1 (legacy door vs live door, same person): {m1_compared} calls compared, {len(m1_diffs)} differences")
    for d in m1_diffs[:40]:
        print('  DIFF', d)
    check('mode 1: legacy and live doors agree for every person, review and door', not m1_diffs, f"{len(m1_diffs)} diffs")

    classify_and_print(m2_rows)
    plants(known)
    return 1 if failures else 0


def opening_class(row):
    ci, caller, review, door, fact, part, legacy, predicted, seats = row
    seats = seats or []
    if predicted == 'true' and legacy == 'false':
        if door == 'hr_review_list_mine' and 'upper_management' in seats:
            return '_list_mine adds upper management'
        if 'upper_management' in seats:
            return 'upper management where listed'
        blind = part == 'self_evaluation' and 'manager' in seats
        if len(seats) > 1 and not blind:
            return 'union across seats outside blind_wins'
    return None


def classify_and_print(m2_rows):
    diffs = [r for r in m2_rows if r[6] != r[7]]
    in_list = [r for r in diffs if opening_class(r)]
    blockers = [r for r in diffs if not opening_class(r)]
    print(f"\nMODE 2 (legacy vs model prediction): {len(m2_rows)} facts compared, {len(diffs)} differences: "
          f"{len(in_list)} in the opening list, {len(blockers)} NOT in it")
    for k, n in Counter(opening_class(r) for r in in_list).most_common():
        print(f"  opening list  {n:6d}  {k}")
    # group the blockers so every distinct finding prints once, with where it shows
    callers = dict(q("select key, uid::text from fx_caller"))
    src = {}
    for caller, review in {(r[1], r[2]) for r in blockers}:
        src[(caller, review)] = sorted(f"{s}{'(' + o + ')' if o in ('fallback', 'added', 'grant') else ''}" for s, o in q(
            "select seat, source from iam._seat_table('hr_review', %s) where user_id = %s", (review, callers[caller])))
    groups = defaultdict(list)
    for ci, caller, review, door, fact, part, legacy, predicted, seats in blockers:
        seats = src.get((caller, review)) or seats
        st = REVIEWS[review]['stage'] if review in REVIEWS else '-'
        subj = REVIEWS[review]['subject'] if review in REVIEWS else '-'
        groups[(KIND.get(caller, caller), door, fact, legacy, predicted, ','.join(seats or []))].append((st, subj, ci))
    print(f"\nNOT IN THE OPENING LIST (the swap's blocker list): {len(blockers)} differences in {len(groups)} findings")
    for (kind, door, fact, legacy, predicted, seats), where in sorted(groups.items()):
        stages = sorted({w[0] for w in where}, key=lambda s: STAGES.index(s) if s in STAGES else 99)
        subjects = sorted({w[1] for w in where})
        cfgs = sorted({w[2] for w in where})
        print(f"  - {kind} [seats {seats or 'none'}] {door} · {fact}: legacy {legacy} vs predicted {predicted} "
              f"· stages {','.join(stages)} · reviews of {','.join(subjects)} · configs {cfgs} ({len(where)})")
    globals()['_m2_summary'] = (len(m2_rows), len(diffs), len(in_list), len(blockers), len(groups))


def plants(known):
    print('\nPLANTED FAULTS (each inside a savepoint, rolled back)')
    bits = COVERING[0]
    set_knobs(bits)
    # 1. a frozen legacy helper is broken: mode 1 must see it
    q("savepoint plant1")
    q("""create or replace function hr._legacy__rev_skip_level_on(p_org uuid) returns boolean language sql stable
         security definer set search_path to 'hr', 'public' as $$ select false $$""")
    q("delete from fx_out where config = 900")
    n = one("select pg_temp.run_mode1(900, false)")
    d = [r for r in q("select legacy, live from fx_out where config = 900 and live is not null")
         if normalize(r[0], known) != normalize(r[1], known)]
    check('plant 1 (legacy skip-level helper answers false): mode 1 reports differences', len(d) > 0,
          f"{len(d)} diffs over {n} calls")
    q("rollback to savepoint plant1")
    # 2. a wrong grid cell (manager reads self-evaluation drafts from the start): mode 2's NOT list must change
    base = [r for r in q("select * from pg_temp.mode2(0)") if r[5] != r[6]]
    base_not = sum(1 for r in base if not opening_class((0,) + tuple(r)))
    q("savepoint plant2")
    q("""update iam.access_setup set setup = jsonb_set(setup, '{grid,manager,self_evaluation}',
                                                  '{"level":"viewer","rows":"all"}'::jsonb)
          where entity_type = 'hr_review'""")
    planted = [r for r in q("select * from pg_temp.mode2(0)") if r[5] != r[6]]
    planted_not = sum(1 for r in planted if not opening_class((0,) + tuple(r)))
    check('plant 2 (grid: manager reads self drafts): mode 2 NOT list grows', planted_not > base_not,
          f"NOT list {base_not} -> {planted_not}")
    q("rollback to savepoint plant2")
    # 3. a resolver dropped (upper management resolves nobody): mode 2 loses the upper-management openings
    q("savepoint plant3")
    before = sum(1 for r in base if opening_class((0,) + tuple(r)) == 'upper management where listed')
    q("""create or replace function hr.review_seat_upper(p_review_id uuid) returns uuid[] language sql stable
         security definer set search_path to 'hr', 'public' as $$ select '{}'::uuid[] $$""")
    after_rows = [r for r in q("select * from pg_temp.mode2(0)") if r[5] != r[6]]
    after = sum(1 for r in after_rows if opening_class((0,) + tuple(r)) == 'upper management where listed')
    check('plant 3 (upper-management resolver dropped): mode 2 sees the change', after != before,
          f"upper-management openings {before} -> {after}")
    q("rollback to savepoint plant3")


if __name__ == '__main__':
    code = 1
    try:
        code = main()
    except Exception:
        import traceback
        traceback.print_exc()
        failures.append('the proof raised before it finished (traceback above)')
        code = 1
    finally:
        conn.rollback()     # ALWAYS: nothing in this proof is ever committed
        conn.close()
    print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'ALL CHECKS PASSED'} · rolled back · "
          f"{time.time() - T0:.0f}s")
    sys.exit(code or (1 if failures else 0))
