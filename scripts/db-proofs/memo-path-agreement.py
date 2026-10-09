#!/usr/bin/env python3
"""
STANDING TEST for the access kernel's statement memo (knob access/kernel_batch; lane MEMO-SWEEP, 2026-10-08).

The memo turns itself off once a transaction has a transaction id, so nothing that writes (the shadow sweep) ever runs it.
iam.kernel_memo_compare() runs it for real, read-only, and compares memo-off with memo-on answers of custom.levels_of,
custom.reaches_directly_many and custom.read_records_page on one snapshot. This script proves that check is not vacuous:

  1. BASELINE   read-only transaction, nothing planted: must report ok, 0 differences, the memo path exercised.
  2. PLANT 1    inside a transaction that is ALWAYS rolled back, custom._memo_put_bool is replaced so the memo
                keeps the opposite answer (memo-on and memo-off then disagree): the check MUST report differences.
  3. PLANT 2    same, platform.memo_k_put stores a wrong default level for iam.member_default_level: MUST report differences.
  4. SWITCHED OFF  inside a rolled-back transaction with a write already made and no hook, the check must REFUSE (it says
                the memo was off) rather than pass.
  5. OFF_FOR    the knob's per-person opt-out (access/kernel_batch off_for, set inside a rolled-back transaction): the
                person-aware ask and the person-independent ask in one message both say off, an unlisted person is
                untouched, and the listed person's answers are identical to memo-off.

HOT-DOORS-5 paths are covered too (iam.my_team_reach, custom._record_shown_to_ctx, custom.data_home_items): plants 4-5 break the memo-on
arm of the first and the last in a rolled-back transaction and the check must name them.
Known limit, measured 2026-10-08: a fault planted in the carrying-edges memo or the addressed-cap memo is NOT seen by the live
sample (those memos' answers do not change any answer asked of this data inside a transaction that has written, where the
batch path is off); the two plants above are the ones the sample proves it catches.
Exit 1 on any deviation. Nothing persists. Run from aidream so its .env is found:
  cd aidream && uv run python ../matrx-frontend/scripts/db-proofs/memo-path-agreement.py
"""
import json, sys, psycopg
from dotenv import dotenv_values

env = dotenv_values('/Users/armanisadeghi/code/aidream/.env')
ADMIN = '87a6e699-3622-4869-8843-d0867456c0dd'
failures = []


def connect():
    return psycopg.connect(host=env['SUPABASE_MATRIX_HOST'], port=5432, dbname=env['SUPABASE_MATRIX_DATABASE_NAME'],
                           user=env['SUPABASE_MATRIX_USER'], password=env['SUPABASE_MATRIX_PASSWORD'], autocommit=False)


def check(label, ok, detail=''):
    print(f"{'PASS' if ok else 'FAIL'}  {label:70s} {detail}"[:240])
    if not ok:
        failures.append(label)


def run_compare(cur, after_write=False):
    cur.execute("set local statement_timeout = '280s'")
    if after_write:
        cur.execute("select set_config('mx.memo_compare_written', '1', true)")
    cur.execute("select iam.kernel_memo_compare()::text")
    return json.loads(cur.fetchone()[0])


def summary(r):
    return f"ok={r['ok']} compared={r['compared']} diffs={len(r['diffs'])} errors={len(r['errors'])} slots={r.get('slots')}"


def with_txn(fn, read_only=False):
    conn = connect()
    try:
        cur = conn.cursor()
        if read_only:
            cur.execute("set transaction read only")
        return fn(cur)
    finally:
        conn.rollback()
        conn.close()


# 1. baseline, READ ONLY from the first statement: no transaction id can exist
def baseline(cur):
    r = run_compare(cur)
    cur.execute("select pg_current_xact_id_if_assigned()::text")
    xid = cur.fetchone()[0]
    return r, xid

r, xid = with_txn(baseline, read_only=True)
print('baseline:', summary(r))
check("baseline: read-only, no transaction id taken", xid is None, f"xid={xid}")
check("baseline: ok, nothing differs", r['ok'] and not r['diffs'] and not r['errors'], summary(r))
check("baseline: compared a real sample (>= 50 pairs)", r['compared'] >= 50, f"compared={r['compared']}")
check("baseline: the memo wrote slots for every kind", all(v > 0 for v in r['slots'].values()), str(r['slots']))
check("baseline: every stratum had ids", {s['name'] for s in r['strata']} >= {'confidential', 'only_me', 'big', 'relations', 'table_definition'},
      str([(s['name'], s['ids']) for s in r['strata']]))

PLANTS = {
    "custom._memo_put_bool keeps the opposite answer": """
        create or replace function custom._memo_put_bool(p_key text, p_value boolean) returns boolean
        language plpgsql set search_path to '' as $f$
        begin
          if p_key is not null then perform platform.memo_k_put(p_key, coalesce((not p_value)::text, '-')); end if;
          return p_value;
        end; $f$""",
    "memo_k_put stores a wrong iam.member_default_level": """
        create or replace function platform.memo_k_put(p_key text, p_value text) returns void
        language plpgsql set search_path to '' as $f$
        begin
          if p_value is null then return; end if;
          perform set_config('mx_memo.k' || md5(p_key),
            md5(coalesce(current_setting('role', true), '') || '|' || coalesce(current_setting('request.jwt.claims', true), '') || '|' || session_user::text)
            || '/' || pg_catalog.statement_timestamp()::text || '/' || pg_catalog.pg_backend_pid()::text
            || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro') || '/' || coalesce(current_setting('mx_memo.g', true), '0')
            || chr(1) || case when p_key like 'iam.member_default_level:%' then case p_value when '-' then 'admin' else '-' end else p_value end, true);
        end; $f$""",
}

# HOT-DOORS-5 paths (iam.my_team_reach, custom.data_home_items): the live body with its memo-on arm made to answer nothing.
def patched_def(cur, regproc, old, new):
    cur.execute("select pg_get_functiondef(%s::regprocedure)", (regproc,))
    d = cur.fetchone()[0]
    assert d.count(old) == 1, (regproc, d.count(old))
    return d.replace(old, new)

HD5 = {
    "iam.my_team_reach: the memo-on arm answers nothing": ("iam.my_team_reach(uuid)",
        "   where iam.kernel_batch_on(null)\n", "   where iam.kernel_batch_on(null) and false\n"),
    "custom.data_home_items: the memo-on arm lists no stage Table": ("custom.data_home_items(uuid)",
        "     where iam.kernel_batch_on(null)\n       and exists (select 1 from unnest(v_v_org, v_v_id)",
        "     where iam.kernel_batch_on(null) and false\n       and exists (select 1 from unnest(v_v_org, v_v_id)"),
}
# HOT-DOORS-6 paths (2026-10-09) CANNOT be planted here, measured: both plants were invisible (ok=True, 0 diffs).
#   iam.has_access_for_many_in's organization hint is asked only by custom.tables_seen_among's kernel-first step, which runs
#   only while the transaction has written nothing - and a plant is DDL, a write. custom.data_home_items' booking shortcut
#   skips the store owner, and iam._memo_pair asks as postgres, whom custom.query_is_store_owner() calls the owner.
# Their proof is read-only and old-vs-new on one snapshot (mx.hot_doors_6 = 'off' forces the old paths): see KERNEL.md
# HOT-DOORS-6. The read-only comparison above still runs both paths for the non-owner arms it reaches.
for label, (reg, old, new) in HD5.items():
    def planted5(cur, reg=reg, old=old, new=new):
        cur.execute(patched_def(cur, reg, old, new))
        return run_compare(cur, after_write=True)
    r = with_txn(planted5)
    print(f'plant [{label}]:', summary(r))
    check(f"PLANT {label}: the check FAILS", (not r['ok']) and any(d['fn'] == reg.split('(')[0] for d in r['diffs']), summary(r))

for label, ddl in PLANTS.items():
    def planted(cur, ddl=ddl):
        cur.execute(ddl)               # a write: this transaction now has an id, and is rolled back below
        return run_compare(cur, after_write=True)
    r = with_txn(planted)
    print(f'plant [{label}]:', summary(r))
    check(f"PLANT {label}: the check FAILS", (not r['ok']) and len(r['diffs']) > 0, summary(r))

# 4. without the hook, a transaction that already wrote must be refused, never passed
def written(cur):
    cur.execute("create temp table _memo_probe(x int) on commit drop")
    return run_compare(cur)
r = with_txn(written)
check("a transaction that already wrote is REFUSED, not passed", (not r['ok']) and r['compared'] == 0 and r['errors'], summary(r))

# 5. off_for: the opt-out applies to the whole message, answers identical. Setting the knob is a write, so the planted
# transactions use the hook value mx.kernel_batch = 'on_written' (the knob stays in charge, only the "has written" refusal is lifted).
OTHER = '4060701e-706a-4c76-b3ca-0bbc69fa5a14'

def offfor(cur):
    cur.execute("select set_config('mx.kernel_batch', 'on_written', true)")
    out = {}
    cur.execute("update platform.feature_knob set value = jsonb_set(value, '{off_for}', '[]'::jsonb) where feature='access' and key='kernel_batch'")
    cur.execute("select iam.kernel_batch_on(%s), iam.kernel_batch_on(null)", (ADMIN,))
    out['empty'] = cur.fetchone()
    cur.execute("update platform.feature_knob set value = jsonb_set(value, '{off_for}', %s::jsonb) where feature='access' and key='kernel_batch'",
                (json.dumps([ADMIN]),))
    # one statement: the person-aware ask first (as every entry point now does), then a person-independent helper's ask
    cur.execute("select iam.kernel_batch_on(%s), iam.kernel_batch_on(null)", (ADMIN,))
    out['listed'] = cur.fetchone()
    cur.execute("select iam.kernel_batch_on(%s), iam.kernel_batch_on(null)", (OTHER,))
    out['other'] = cur.fetchone()
    # and the answers do not change: the listed person, knob path vs forced off, one snapshot
    ids_sql = "array(select id from custom.record where table_id = custom.table_kernel_id() and data_class='table' order by id limit 40)"
    cur.execute("select set_config('request.jwt.claims', %s, true), set_config('request.jwt.claim.sub', %s, true)",
                (json.dumps({"sub": ADMIN, "role": "authenticated"}), ADMIN))
    cur.execute(f"select custom.levels_of(%s, {ids_sql})::text, (select jsonb_object_agg(target, reaches)::text from custom.reaches_directly_many(%s, {ids_sql}, 'record', 'editor'))", (ADMIN, ADMIN))
    out['knob'] = cur.fetchone()
    cur.execute("select set_config('mx.kernel_batch', 'off', true)")
    cur.execute(f"select custom.levels_of(%s, {ids_sql})::text, (select jsonb_object_agg(target, reaches)::text from custom.reaches_directly_many(%s, {ids_sql}, 'record', 'editor'))", (ADMIN, ADMIN))
    out['off'] = cur.fetchone()
    return out
r = with_txn(offfor)
check("off_for: nobody listed -> the person-aware and person-independent asks both say on", tuple(r['empty']) == (True, True), str(r['empty']))
check("off_for: a listed person -> BOTH asks in the message say off", tuple(r['listed']) == (False, False), str(r['listed']))
check("off_for: an unlisted person is untouched", tuple(r['other']) == (True, True), str(r['other']))
check("off_for: the listed person's answers are identical to memo-off", r['knob'] == r['off'] and r['knob'][0] is not None, f"{len(r['knob'][0])} bytes")

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASS")
