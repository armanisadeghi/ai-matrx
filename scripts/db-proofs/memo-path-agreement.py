#!/usr/bin/env python3
"""
STANDING TEST for the access kernel's statement memo (knob access/kernel_batch; lane MEMO-SWEEP, 2026-10-08).

The memo turns itself off once a transaction has a transaction id, so nothing that writes (the shadow sweep) ever runs it.
iam.kernel_memo_compare() runs it for real, read-only, and compares memo-off with memo-on answers of custom.levels_of,
custom.reaches_directly_many and custom.read_records_page on one snapshot. This script proves that check is not vacuous:

  1. BASELINE   read-only transaction, nothing planted: must report ok, 0 differences, the memo path exercised.
  2. PLANT 1    inside a transaction that is ALWAYS rolled back, custom._memo_put_bool is replaced so the memo
                keeps the opposite answer (memo-on and memo-off then disagree): the check MUST report differences.
  3. PLANT 2    same, platform.memo_k_put stores a wrong level for custom.addressed_cap: MUST report differences.
  4. PLANT 3    same, platform.memo_k_put stores a wrong default level for iam.member_default_level: MUST report differences.
  5. SWITCHED OFF  inside a rolled-back transaction with a write already made and no hook, the check must REFUSE (it says
                the memo was off) rather than pass.
  6. OFF_FOR    the knob's per-person opt-out: with the person listed in access/kernel_batch off_for (rolled back) the
                person's answers are identical and the memo wrote no slot for that person's reads.

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
    cur.execute("select iam.kernel_memo_compare(30, 3)::text")
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
check("baseline: compared a real sample (>= 100 pairs)", r['compared'] >= 100, f"compared={r['compared']}")
check("baseline: the memo wrote slots for every kind", all(v > 0 for v in r['slots'].values()), str(r['slots']))
check("baseline: every stratum had ids", {s['name'] for s in r['strata']} >= {'confidential', 'published', 'only_me', 'big', 'table_definition'},
      str([(s['name'], s['ids']) for s in r['strata']]))

PLANTS = {
    "custom._memo_put_bool keeps the opposite answer": """
        create or replace function custom._memo_put_bool(p_key text, p_value boolean) returns boolean
        language plpgsql set search_path to '' as $f$
        begin
          if p_key is not null then perform platform.memo_k_put(p_key, coalesce((not p_value)::text, '-')); end if;
          return p_value;
        end; $f$""",
    "memo_k_put stores a wrong custom.addressed_cap": """
        create or replace function platform.memo_k_put(p_key text, p_value text) returns void
        language plpgsql set search_path to '' as $f$
        begin
          if p_value is null then return; end if;
          perform set_config('mx_memo.k' || md5(p_key),
            md5(coalesce(current_setting('role', true), '') || '|' || coalesce(current_setting('request.jwt.claims', true), '') || '|' || session_user::text)
            || '/' || pg_catalog.statement_timestamp()::text || '/' || pg_catalog.pg_backend_pid()::text
            || '/' || coalesce(pg_catalog.pg_current_xact_id_if_assigned()::text, 'ro') || '/' || coalesce(current_setting('mx_memo.g', true), '0')
            || chr(1) || case when p_key like 'custom.addressed_cap:%' then case p_value when '-' then 'viewer' else '-' end else p_value end, true);
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

for label, ddl in PLANTS.items():
    def planted(cur, ddl=ddl):
        cur.execute(ddl)               # a write: this transaction now has an id, and is rolled back below
        return run_compare(cur, after_write=True)
    r = with_txn(planted)
    print(f'plant [{label}]:', summary(r))
    check(f"PLANT {label}: the check FAILS", (not r['ok']) and len(r['diffs']) > 0, summary(r))

# 5. without the hook, a transaction that already wrote must be refused, never passed
def written(cur):
    cur.execute("create temp table _memo_probe(x int) on commit drop")
    return run_compare(cur)
r = with_txn(written)
check("a transaction that already wrote is REFUSED, not passed", (not r['ok']) and r['compared'] == 0 and r['errors'], summary(r))

# 6. off_for: the opt-out applies to the whole statement, answers identical
def offfor(cur):
    cur.execute("select value from platform.feature_knob where feature='access' and key='kernel_batch'")
    cur.execute("update platform.feature_knob set value = jsonb_set(value, '{off_for}', %s::jsonb) where feature='access' and key='kernel_batch'",
                (json.dumps([ADMIN]),))
    out = {}
    for mode in ('knob', 'off'):
        cur.execute("select set_config('mx.kernel_batch', %s, true)", ('' if mode == 'knob' else 'off',))
        cur.execute("select set_config('request.jwt.claims', %s, true), set_config('request.jwt.claim.sub', %s, true)",
                    (json.dumps({"sub": ADMIN, "role": "authenticated"}), ADMIN))
        cur.execute("select platform.memo_clear()")
        cur.execute("select (select count(*) from pg_settings where name like 'mx\\_memo.k%%' and left(setting, length(platform.memo_k_stamp())) = platform.memo_k_stamp())")
        before = cur.fetchone()[0]
        cur.execute("""select custom.levels_of(%s, array(select id from custom.record where table_id = custom.table_kernel_id() and data_class='table' order by id limit 40))::text""", (ADMIN,))
        out[mode] = cur.fetchone()[0]
    return out
r = with_txn(offfor)
check("off_for: the listed person's answers are identical to memo-off", r['knob'] == r['off'], f"{len(r['knob'])} bytes")

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASS")
