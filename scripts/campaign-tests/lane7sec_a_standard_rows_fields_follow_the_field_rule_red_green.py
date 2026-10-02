"""LANE7-SEC guard: the field rule on a standard row, as the two real seats, on the nightly clone.

Usage: python3 lane7sec_a_standard_rows_fields_follow_the_field_rule_red_green.py red|green|applied|sweep-only
  red        today's doors (nothing applied) — every DEFECT row must say LEAK/ACCEPTED.
             Meaningful only on a database the fix has not reached (production before the
             chair applies it, or the clone after its nightly refresh, before the apply).
  green      the migration applied inside the transaction — every DEFECT row must be refused/masked
             and every LEGIT row must pass
  applied    the migration already applied to the clone (a protected Field fixture is stood up
             with session_replication_role inside the rolled-back txn, since the fix refuses new ones)
  sweep-only only the sweep part applied — the sweep must name the entity doors
Everything runs in ONE transaction that is rolled back. Seats: role authenticated + the person's
JWT claims (what PostgREST does), never a privileged role.
"""
import json, sys
from pathlib import Path
import psycopg


def conn():
    """The nightly clone only, through the SESSION pooler (5432), asserted by its ref."""
    url = [l.split('=', 1)[1].strip().strip('"') for l in
           Path('/Users/armanisadeghi/code/aidream/.env').read_text().splitlines() if l.startswith('CLONE_DATABASE_URL=')][0]
    assert 'ajrnyxwasqbmxdmzvfdy' in url, 'not the current clone (see common-docs operations/clone/CURRENT.md)'
    return psycopg.connect(url.replace(':6543/', ':5432/'), autocommit=False)

MODE = sys.argv[1]
REPO = Path(__file__).resolve().parents[2]
MIG = (REPO / 'migrations/campaign/lane7sec_a_standard_rows_fields_follow_the_field_rule.sql').read_text()
SWEEP = MIG[MIG.index('CREATE OR REPLACE FUNCTION custom.doors_not_masking_fields()'):MIG.index('-- 8. THE TWO NEW')].rsplit('\n-- ─', 1)[0]
ORG = '0a54df90-eab8-4d07-ab29-81a45fb41e04'
ADMIN = '87a6e699-3622-4869-8843-d0867456c0dd'
TEST = '4060701e-706a-4c76-b3ca-0bbc69fa5a14'
PID = 'aeb8d0c2-c614-4d80-94a4-b709fa7d48ba'
results = []


def seat(cur, uid):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', %s, true), set_config('role','authenticated',true)",
                (json.dumps({'sub': uid, 'role': 'authenticated'}),))


def step(cur, label, sql, args=()):
    cur.execute("savepoint s")
    try:
        cur.execute(sql, args)
        r = cur.fetchall() if cur.description else None
        cur.execute("release savepoint s")
        return ('OK', r)
    except Exception as e:
        cur.execute("rollback to savepoint s")
        return ('REFUSED', f"{getattr(e, 'sqlstate', '')} {str(e).splitlines()[0]}")


def record(kind, label, outcome, want):
    ok = want(outcome)
    results.append((kind, label, ok))
    print(f"[{kind}] {'PASS' if ok else 'FAIL'} {label}\n      -> {outcome}")


with conn() as c:
    cur = c.cursor()
    cur.execute("select (select count(*) from cron.job where active),(select count(*) from pg_extension where extname='pg_net'), current_user")
    q = cur.fetchone(); assert q[0] == 0 and q[1] == 0, q
    print('clone quarantine ok', q)

    # ── fixtures, as admin@admin.com through the real doors ────────────────────────────────
    seat(cur, ADMIN)
    print('restore party', step(cur, '', "update crm.party set deleted_at=null where id=%s returning id", (PID,)))
    for key, label in (('referral_source', 'Referral source'), ('intake_notes', 'Intake notes')):
        print('declare', key, step(cur, '', "select custom.entity_field_declare(%s,'party',%s::jsonb)",
                                   (ORG, json.dumps({'label': label, 'type': 'text', 'key': key}))))
    print('admin seeds values', step(cur, '', "select custom.entity_value_write(%s,'party',%s,%s::jsonb)->'custom'",
          (ORG, PID, json.dumps({'preferred_clinic_location': 'Westside', 'referral_source': 'Dr. Patel, Harbor Orthopedics', 'intake_notes': 'Left knee, post-ACL'}))))
    cur.execute("reset role")
    # sensitivities set as the data owner. On an already-fixed database the shape guard refuses a
    # new protected Field (that is ruling 2), so this fixture stands for a protected Field that
    # existed before the fix: only that one trigger is stepped around, inside this rolled-back txn.
    cur.execute("set local session_replication_role = replica")
    cur.execute("""update custom.record set data = data || jsonb_build_object('sensitivity',
                     case data->>'key' when 'preferred_clinic_location' then 'confidential' else 'restricted' end)
                   where table_id=custom.field_kernel_id() and organization_id=%s and data->>'table_token'='party'
                     and data->>'key' in ('preferred_clinic_location','referral_source') returning data->>'key', data->>'sensitivity'""", (ORG,))
    print('sensitivities', cur.fetchall())
    cur.execute("set local session_replication_role = origin")
    cur.execute("select count(*) from custom.doors_not_masking_fields()"); sweep_before = cur.fetchone()[0]

    if MODE == 'green':
        cur.execute(MIG)
        print('migration applied in-transaction')
    elif MODE == 'sweep-only':
        cur.execute(SWEEP)
        cur.execute("select function_name from custom.doors_not_masking_fields()")
        names = [r[0] for r in cur.fetchall()]
        print('sweep before', sweep_before, 'after', len(names), names)
        print('entity doors named:', sorted(n for n in names if n.startswith('entity')))
        c.rollback(); sys.exit(0)

    fixed = MODE in ('green', 'applied')
    refused = lambda o: o[0] == 'REFUSED'
    accepted = lambda o: o[0] == 'OK'

    # ── DEFECTS, as test@test.com (member) ─────────────────────────────────────────────────
    seat(cur, TEST)
    o = step(cur, '', "select custom.entity_record_read(%s,'party',%s)->'custom'", (ORG, PID))
    record('DEFECT', 'member reads a restricted field through entity_record_read', o,
           (lambda o: o[0] == 'OK' and o[1][0][0].get('referral_source') is None and 'referral_source' in o[1][0][0].get('_hidden', {})) if fixed
           else (lambda o: o[0] == 'OK' and o[1][0][0].get('referral_source') is not None))
    o = step(cur, '', "select custom.entity_records_find(%s,'party','referral_source',null)->'rows'", (ORG,))
    record('DEFECT', 'member lists a restricted field through entity_records_find', o,
           (lambda o: o[0] == 'OK' and all(r.get('value') is None and r.get('hidden') for r in o[1][0][0])) if fixed
           else (lambda o: o[0] == 'OK' and any(r.get('value') for r in o[1][0][0])))
    o = step(cur, '', "select jsonb_array_length(custom.entity_records_find(%s,'party','referral_source','\"Dr. Patel, Harbor Orthopedics\"'::jsonb)->'rows')", (ORG,))
    record('DEFECT', 'member filters BY a restricted value (an oracle)', o,
           (lambda o: o[0] == 'OK' and o[1][0][0] == 0) if fixed else (lambda o: o[0] == 'OK' and o[1][0][0] > 0))
    o = step(cur, '', "select custom.entity_value_write(%s,'party',%s,'{\"preferred_clinic_location\":\"Harbor\"}'::jsonb)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('DEFECT', 'member overwrites a confidential field through entity_value_write', o, refused if fixed else accepted)
    o = step(cur, '', "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"x\",\"made_up_key\":\"x\"}'::jsonb)->'custom'", (ORG, PID))
    record('DEFECT', 'member writes an undeclared key through entity_value_write (with a legit key beside it)', o, refused if fixed else accepted)
    o = step(cur, '', "update crm.party set custom_fields = custom_fields || '{\"zz_undeclared\":\"x\"}'::jsonb where id=%s returning custom_fields->>'zz_undeclared'", (PID,))
    record('DEFECT', 'member direct UPDATE adds an undeclared key (supabase-js shape)', o,
           refused if fixed else (lambda o: o[0] == 'OK' and o[1] and o[1][0][0] == 'x'))
    o = step(cur, '', "update crm.party set custom_fields = custom_fields || '{\"preferred_clinic_location\":\"Harbor\"}'::jsonb where id=%s returning custom_fields->>'preferred_clinic_location'", (PID,))
    record('DEFECT', 'member direct UPDATE overwrites a confidential field', o,
           refused if fixed else (lambda o: o[0] == 'OK' and o[1] and o[1][0][0] == 'Harbor'))
    o = step(cur, '', "update crm.party set custom_fields = custom_fields || '{\"intake_notes\":\"Right knee\",\"_actor\":\"system\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('DEFECT', 'member forges the author as "system"', o,
           refused if fixed else (lambda o: o[0] == 'OK' and o[1] and o[1][0][0] == 'system'))
    o = step(cur, '', "update crm.party set custom_fields = custom_fields || jsonb_build_object('intake_notes','Right knee','_actor','agent','_on_behalf_of',%s::text) where id=%s returning custom_fields->'_values'->'intake_notes'->>'on_behalf_of'", (ADMIN, PID))
    record('DEFECT', 'member forges an agent acting for admin@admin.com', o,
           refused if fixed else (lambda o: o[0] == 'OK' and o[1] and o[1][0][0] == ADMIN))
    seat(cur, ADMIN)
    o = step(cur, '', "select custom.entity_field_declare(%s,'party','{\"label\":\"Insurance member number\",\"type\":\"text\",\"key\":\"insurance_member_number\",\"sensitivity\":\"restricted\"}'::jsonb)", (ORG,))
    record('DEFECT', 'admin declares a RESTRICTED field on a standard table (promise the row cannot keep)', o, refused if fixed else accepted)
    cur.execute("reset role")
    fid = None
    cur.execute("select id from custom.record where table_id=custom.field_kernel_id() and organization_id=%s and data->>'table_token'='party' and data->>'key'='intake_notes'", (ORG,))
    fid = cur.fetchone()[0]
    seat(cur, ADMIN)
    o = step(cur, '', "select custom.entity_field_update(%s,%s,'{\"sensitivity\":\"confidential\"}'::jsonb)", (ORG, fid))
    record('DEFECT', 'admin changes a standard-table field to CONFIDENTIAL', o, refused if fixed else accepted)

    # ── LEGIT: nothing that should work broke ──────────────────────────────────────────────
    seat(cur, ADMIN)
    o = step(cur, '', "select custom.entity_record_read(%s,'party',%s)->'custom'", (ORG, PID))
    record('LEGIT', 'admin reads every field, the restricted one included', o,
           lambda o: o[0] == 'OK' and o[1][0][0].get('referral_source') == 'Dr. Patel, Harbor Orthopedics' and not o[1][0][0].get('_hidden'))
    o = step(cur, '', "select custom.entity_value_write(%s,'party',%s,'{\"preferred_clinic_location\":\"Northgate\"}'::jsonb)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('LEGIT', 'admin writes the confidential field', o, lambda o: o[0] == 'OK' and o[1][0][0] == 'Northgate')
    o = step(cur, '', "select custom.entity_records_find(%s,'party','referral_source',null)->'rows'->0->>'value'", (ORG,))
    record('LEGIT', 'admin finds by the restricted field and sees the value', o, lambda o: o[0] == 'OK' and o[1][0][0] == 'Dr. Patel, Harbor Orthopedics')
    seat(cur, TEST)
    o = step(cur, '', "select custom.entity_record_read(%s,'party',%s)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('LEGIT', 'member (editor on this row) reads the CONFIDENTIAL field — the rule lets editor read it', o, lambda o: o[0] == 'OK' and o[1][0][0] is not None)
    o = step(cur, '', "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"Left knee, week 3\"}'::jsonb)->'custom'->>'intake_notes'", (ORG, PID))
    record('LEGIT', 'member writes an internal field through the door', o, lambda o: o[0] == 'OK' and o[1][0][0] == 'Left knee, week 3')
    o = step(cur, '', "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":null}'::jsonb)->'custom' ? 'intake_notes'", (ORG, PID))
    record('LEGIT', 'member clears an internal field through the door', o, lambda o: o[0] == 'OK' and o[1][0][0] is False)
    o = step(cur, '', "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Left knee, week 4\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'member direct UPDATE of an internal field (the app path), stamped as the user', o, lambda o: o[0] == 'OK' and o[1] and o[1][0][0] == 'user')
    o = step(cur, '', "update crm.party set display_name = display_name where id=%s returning id", (PID,))
    record('LEGIT', 'member UPDATE of a real column only (custom_fields untouched)', o, accepted)
    o = step(cur, '', "select custom.entity_value_write(%s,'party',%s,jsonb_build_object('intake_notes','Agent summary: improving','_actor','agent','_on_behalf_of',%s::text))->'custom_written'->'intake_notes'", (ORG, PID, TEST))
    record('LEGIT', 'agent writing for the signed-in member (records tool shape) is stamped agent on her behalf', o,
           lambda o: o[0] == 'OK' and o[1][0][0].get('actor') == 'agent' and o[1][0][0].get('on_behalf_of') == TEST)
    o = step(cur, '', "select jsonb_array_length(custom.entity_records_find(%s,'party','intake_notes',null)->'rows')", (ORG,))
    record('LEGIT', 'member finds by an internal field', o, lambda o: o[0] == 'OK' and o[1][0][0] >= 1)
    o = step(cur, '', "select custom.entity_field_rights(%s,'party')->>'may_fill_in'", (ORG,))
    record('LEGIT', 'member entity_field_rights still answers', o, accepted)
    seat(cur, ADMIN)
    o = step(cur, '', "select custom.entity_field_declare(%s,'party','{\"label\":\"Preferred therapist\",\"type\":\"text\",\"key\":\"preferred_therapist\"}'::jsonb)", (ORG,))
    record('LEGIT', 'admin declares an internal field on a standard table', o, accepted)
    cur.execute("reset role")
    cur.execute("select count(*) from custom.doors_not_masking_fields()"); sweep_after = cur.fetchone()[0]
    record('LEGIT', f'masking sweep count unchanged by the fix ({sweep_before} -> {sweep_after})', ('OK', sweep_after), lambda o: (o[1] == sweep_before) if fixed else True)
    c.rollback(); print('rolled back')

bad = [r for r in results if not r[2]]
print(f"\n{MODE}: {len(results) - len(bad)}/{len(results)} expectations met")
sys.exit(1 if bad else 0)
