"""LANE7-SEC guard: the field rule on a standard row, as the real seats and the real server writers, on the clone.

    python3 lane7sec_a_standard_rows_fields_follow_the_field_rule_red_green.py <mode> [--plant <case>]

Every case below states what must be true once the rule is right. Modes choose the database
state, and the SAME expectations are read in every mode, so red and green are one list:

  pre      the store as it was before lane 7 SEC (both SEC files' inverses applied in the txn):
           the 11 original defects show as FAIL.
  r0       the store after the first SEC file only (round 1's inverse applied in the txn):
           the round-1 regressions (form profile, `_` keys, the client's agent/system header)
           show as FAIL.
  current  the database as it is (after the round-1 file is applied): all PASS.
  r1       the round-1 file applied inside the txn on top of whatever is there: all PASS.

  --plant <case>  (with r1/current) breaks exactly what one legitimate case depends on, and that
           case — and only that case — must go red:
             nonparty   the note Field is retired before the member writes it
             service    the party Field the server job writes is retired first
             mover      the mover skips its declare step and writes the value anyway
             freeform   the registry's free-form fact is taken off the autofill profile

Everything runs in ONE transaction that is rolled back. People are seated as PostgREST seats
them (role authenticated + request.jwt.claims [+ request.headers]); the server job and the
mover are seated as the service role with no person. Clone only (asserted by its ref).
"""
import json, sys
from pathlib import Path
import psycopg

ARGS = sys.argv[1:]
MODE = ARGS[0]
PLANT = ARGS[ARGS.index('--plant') + 1] if '--plant' in ARGS else None
REPO = Path(__file__).resolve().parents[2]
CAMPAIGN = REPO / 'migrations/campaign'
INVERSE = REPO / 'migrations/inverse'
SEC = CAMPAIGN / 'lane7sec_a_standard_rows_fields_follow_the_field_rule.sql'
R1 = CAMPAIGN / 'lane7sec_r1_every_writer_follows_the_field_rule.sql'
SEC_DOWN = INVERSE / 'lane7sec_a_standard_rows_fields_follow_the_field_rule_down.sql'
R1_DOWN = INVERSE / 'lane7sec_r1_every_writer_follows_the_field_rule_down.sql'

ORG = '0a54df90-eab8-4d07-ab29-81a45fb41e04'      # Cedar Ridge Physical Therapy
ADMIN = '87a6e699-3622-4869-8843-d0867456c0dd'    # admin@admin.com (owner)
TEST = '4060701e-706a-4c76-b3ca-0bbc69fa5a14'     # test@test.com (member)
PID = 'aeb8d0c2-c614-4d80-94a4-b709fa7d48ba'      # Rosa Delgado, a CRM person in Cedar Ridge
results = []


def conn():
    url = [l.split('=', 1)[1].strip().strip('"') for l in
           Path('/Users/armanisadeghi/code/aidream/.env').read_text().splitlines() if l.startswith('CLONE_DATABASE_URL=')][0]
    assert 'ajrnyxwasqbmxdmzvfdy' in url, 'not the current clone (see common-docs operations/clone/CURRENT.md)'
    return psycopg.connect(url.replace(':6543/', ':5432/'), autocommit=False)


def seat(cur, uid, headers=None):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', %s, true), set_config('request.headers', %s, true), "
                "set_config('app.actor_tier', '', true), set_config('role','authenticated',true)",
                (json.dumps({'sub': uid, 'role': 'authenticated'}), json.dumps(headers or {})))


def server(cur, tier='system', system='matrx-records-mover'):
    """A server job: the service role, no person, its tier declared on the connection."""
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', '', true), set_config('request.headers', '', true), "
                "set_config('app.actor_tier', %s, true), set_config('app.actor_system', %s, true), "
                "set_config('role','service_role',true)", (tier, system))


def owner(cur):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', '', true), set_config('request.headers', '', true)")


def step(cur, sql, args=()):
    cur.execute("savepoint s")
    try:
        cur.execute(sql, args)
        r = cur.fetchall() if cur.description else None
        cur.execute("release savepoint s")
        return ('OK', r)
    except Exception as e:
        cur.execute("rollback to savepoint s")
        return ('REFUSED', f"{getattr(e, 'sqlstate', '')} {str(e).splitlines()[0]}")


def record(kind, case, label, outcome, want):
    ok = bool(want(outcome))
    results.append((kind, case, label, ok))
    print(f"[{kind}] {'PASS' if ok else 'FAIL'} {label}\n      -> {str(outcome)[:400]}")


refused = lambda o: o[0] == 'REFUSED'
accepted = lambda o: o[0] == 'OK'
first = lambda o: o[1][0][0] if o[0] == 'OK' and o[1] else None

with conn() as c:
    cur = c.cursor()
    cur.execute("select (select count(*) from cron.job where active),(select count(*) from pg_extension where extname='pg_net')")
    q = cur.fetchone(); assert q == (0, 0), q
    print('clone quarantine ok', q, 'mode', MODE, 'plant', PLANT)

    if MODE == 'pre':
        cur.execute(R1_DOWN.read_text()); cur.execute(SEC_DOWN.read_text())
    elif MODE == 'r0':
        cur.execute(R1_DOWN.read_text())
    elif MODE == 'r1':
        cur.execute(R1.read_text())
    elif MODE != 'current':
        sys.exit(f'unknown mode {MODE}')

    # ── fixtures, through the real doors ───────────────────────────────────────────────────
    seat(cur, ADMIN)
    step(cur, "update crm.party set deleted_at=null where id=%s returning id", (PID,))
    for key, label in (('referral_source', 'Referral source'), ('intake_notes', 'Intake notes')):
        step(cur, "select custom.entity_field_declare(%s,'party',%s::jsonb)", (ORG, json.dumps({'label': label, 'type': 'text', 'key': key})))
    step(cur, "select custom.entity_field_declare(%s,'note','{\"label\":\"Study topic\",\"type\":\"text\",\"key\":\"study_topic\"}'::jsonb)", (ORG,))
    print('seed', step(cur, "select custom.entity_value_write(%s,'party',%s,%s::jsonb)->'custom'",
          (ORG, PID, json.dumps({'preferred_clinic_location': 'Westside', 'referral_source': 'Dr. Patel, Harbor Orthopedics', 'intake_notes': 'Left knee, post-ACL'}))))
    owner(cur)
    # A protected Field that existed before the fix (the fix refuses new ones), stood up with
    # the shape guard stepped around inside this rolled-back transaction.
    cur.execute("set local session_replication_role = replica")
    cur.execute("""update custom.record set data = data || jsonb_build_object('sensitivity',
                     case data->>'key' when 'preferred_clinic_location' then 'confidential' else 'restricted' end)
                   where table_id=custom.field_kernel_id() and organization_id=%s and data->>'table_token'='party'
                     and data->>'key' in ('preferred_clinic_location','referral_source')""", (ORG,))
    cur.execute("set local session_replication_role = origin")
    cur.execute("select count(*) from custom.doors_not_masking_fields()"); sweep_count = cur.fetchone()[0]
    # A note in Cedar Ridge that test@test.com wrote (a non-party standard table).
    seat(cur, TEST)
    note = first(step(cur, "insert into workbench.notes (organization_id, created_by, label, content) values (%s,%s,'Home exercise plan','Quad sets, 3x10') returning id", (ORG, TEST)))
    print('note', note)

    # ── the plants: each removes the one thing a legitimate case stands on ──────────────────
    if PLANT in ('nonparty', 'service'):
        seat(cur, ADMIN)
        key = 'study_topic' if PLANT == 'nonparty' else 'intake_notes'
        token = 'note' if PLANT == 'nonparty' else 'party'
        owner(cur)
        cur.execute("select id from custom.record where table_id=custom.field_kernel_id() and organization_id=%s and data->>'table_token'=%s and data->>'key'=%s and deleted_at is null", (ORG, token, key))
        fid = cur.fetchone()[0]
        seat(cur, ADMIN)
        print('plant: retire', key, step(cur, "select custom.entity_field_retire(%s,%s)", (ORG, fid)))
    if PLANT == 'freeform':
        owner(cur)
        cur.execute("set local session_replication_role = replica")
        cur.execute("update platform.entity_types set custom_fields_free_form = false where token='user_form_profile'")
        cur.execute("set local session_replication_role = origin")
        print('plant: user_form_profile is no longer free-form')

    # ── DEFECTS: what a person or a payload must never do ──────────────────────────────────
    seat(cur, TEST)
    o = step(cur, "select custom.entity_record_read(%s,'party',%s)->'custom'", (ORG, PID))
    record('DEFECT', 'read', 'member reads a restricted field through entity_record_read', o,
           lambda o: o[0] == 'OK' and first(o).get('referral_source') is None and 'referral_source' in first(o).get('_hidden', {}))
    o = step(cur, "select custom.entity_records_find(%s,'party','referral_source',null)->'rows'", (ORG,))
    record('DEFECT', 'find', 'member lists a restricted field through entity_records_find', o,
           lambda o: o[0] == 'OK' and all(r.get('value') is None and r.get('hidden') for r in first(o)))
    o = step(cur, "select jsonb_array_length(custom.entity_records_find(%s,'party','referral_source','\"Dr. Patel, Harbor Orthopedics\"'::jsonb)->'rows')", (ORG,))
    record('DEFECT', 'oracle', 'member filters BY a restricted value', o, lambda o: o[0] == 'OK' and first(o) == 0)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"preferred_clinic_location\":\"Harbor\"}'::jsonb)", (ORG, PID))
    record('DEFECT', 'overwrite', 'member overwrites a confidential field through entity_value_write', o, refused)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"x\",\"made_up_key\":\"x\"}'::jsonb)", (ORG, PID))
    record('DEFECT', 'undeclared', 'member writes an undeclared key through entity_value_write', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"zz_undeclared\":\"x\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'undeclared', 'member direct UPDATE adds an undeclared key (supabase-js shape)', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"preferred_clinic_location\":\"Harbor\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'overwrite', 'member direct UPDATE overwrites a confidential field', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"intake_notes\":\"Right knee\",\"_actor\":\"system\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'actor', 'member forges the author as "system"', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || jsonb_build_object('intake_notes','Right knee','_actor','agent','_on_behalf_of',%s::text) where id=%s returning id", (ADMIN, PID))
    record('DEFECT', 'actor', 'member forges an agent acting for admin@admin.com', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"_smuggle\":\"a value no field describes\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'prefix', 'member hides an undeclared value behind a "_" key', o, refused)
    o = step(cur, "update crm.party set custom_fields = custom_fields || '{\"_values\":{\"ghost_key\":{\"ver\":1}}}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'prefix', 'member writes an envelope for a key no field declares', o, refused)
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Insurance member number\",\"type\":\"text\",\"key\":\"insurance_member_number\",\"sensitivity\":\"restricted\"}'::jsonb)", (ORG,))
    record('DEFECT', 'shape', 'admin declares a RESTRICTED field on a standard table', o, refused)
    server(cur)
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"legacy_bag_key\":\"x\"}'::jsonb where id=%s returning id", (PID,))
    record('DEFECT', 'undeclared', 'a server job writes a key it never declared', o, refused)

    # ── LEGIT: what must keep working ──────────────────────────────────────────────────────
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_record_read(%s,'party',%s)->'custom'", (ORG, PID))
    record('LEGIT', 'admin', 'admin reads every field, the restricted one included', o,
           lambda o: o[0] == 'OK' and first(o).get('referral_source') == 'Dr. Patel, Harbor Orthopedics' and not first(o).get('_hidden'))
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"preferred_clinic_location\":\"Northgate\"}'::jsonb)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('LEGIT', 'admin', 'admin writes the confidential field', o, lambda o: first(o) == 'Northgate')
    seat(cur, TEST)
    o = step(cur, "select custom.entity_record_read(%s,'party',%s)->'custom'->>'preferred_clinic_location'", (ORG, PID))
    record('LEGIT', 'member', 'member (editor on this row) reads the confidential field — editor may read it', o, lambda o: first(o) is not None)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,'{\"intake_notes\":\"Left knee, week 3\"}'::jsonb)->'custom'->>'intake_notes'", (ORG, PID))
    record('LEGIT', 'member', 'member writes an internal field through the door', o, lambda o: first(o) == 'Left knee, week 3')
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Left knee, week 4\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'member', 'member direct UPDATE of an internal field, stamped "user"', o, lambda o: first(o) == 'user')
    o = step(cur, "update crm.party set display_name = display_name where id=%s returning id", (PID,))
    record('LEGIT', 'member', 'member UPDATE of a real column only', o, accepted)
    o = step(cur, "select custom.entity_value_write(%s,'party',%s,jsonb_build_object('intake_notes','Agent summary: improving','_actor','agent','_on_behalf_of',%s::text))->'custom_written'->'intake_notes'", (ORG, PID, TEST))
    record('LEGIT', 'member', 'records-tool agent write for the signed-in member', o,
           lambda o: o[0] == 'OK' and first(o).get('actor') == 'agent' and first(o).get('on_behalf_of') == TEST)
    seat(cur, TEST, {'x-matrx-actor-tier': 'agent', 'x-matrx-actor-system': 'matrx-extend'})
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Extension agent note\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'", (PID,))
    record('LEGIT', 'header', 'the extension\'s agent header is recorded as "agent" for the member', o,
           lambda o: o[0] == 'OK' and first(o).get('actor') == 'agent' and first(o).get('on_behalf_of') == TEST)
    seat(cur, TEST, {'x-matrx-actor-tier': 'system', 'x-matrx-actor-system': 'matrx-extend-sync'})
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Synced note\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'header', 'the extension\'s machinery header is recorded as "system"', o, lambda o: first(o) == 'system')
    seat(cur, TEST)
    o = step(cur, "update workbench.notes set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"study_topic\":\"ACL rehab\"}'::jsonb where id=%s returning custom_fields->>'study_topic'", (note,))
    record('LEGIT', 'nonparty', 'member writes a declared field on a NOTE (a non-party table)', o, lambda o: first(o) == 'ACL rehab')
    server(cur)
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"intake_notes\":\"Imported from intake form\"}'::jsonb where id=%s returning custom_fields->'_values'->'intake_notes'->>'actor'", (PID,))
    record('LEGIT', 'service', 'a server job (service role) writes a declared key, stamped "system"', o, lambda o: first(o) == 'system')
    # The mover: declares through the store's declare door, then writes the value.
    owner(cur)
    if PLANT != 'mover':
        print('mover declares', step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Insurance plan\",\"type\":\"text\",\"key\":\"insurance_plan\"}'::jsonb)", (ORG,)))
    server(cur)
    o = step(cur, "update crm.party set custom_fields = coalesce(custom_fields,'{}'::jsonb) || '{\"insurance_plan\":\"Blue Shield PPO\"}'::jsonb where id=%s returning custom_fields->>'insurance_plan'", (PID,))
    record('LEGIT', 'mover', 'a mover declares the field, then writes its value', o, lambda o: first(o) == 'Blue Shield PPO')
    # The autofill profile: one person's own free keys (registry: custom_fields_free_form).
    seat(cur, TEST)
    o = step(cur, "insert into users.user_form_profile (user_id, organization_id, custom_fields) values (%s, (select organization_id from users.profiles where id=%s), '{\"gate_code\":\"4471\"}'::jsonb) on conflict (user_id) do update set custom_fields = excluded.custom_fields returning custom_fields->>'gate_code'", (TEST, TEST))
    record('LEGIT', 'freeform', 'member upserts her autofill profile with her own keys (the extension upsert shape)', o, lambda o: first(o) == '4471')
    o = step(cur, "update users.user_form_profile set custom_fields = custom_fields || '{\"tshirt_size\":\"M\"}'::jsonb where user_id=%s returning custom_fields->>'tshirt_size'", (TEST,))
    record('LEGIT', 'freeform', 'member updates her own autofill keys (the /api/user/form-profile PATCH shape)', o, lambda o: first(o) == 'M')
    server(cur, 'system', 'form-profile')
    o = step(cur, "select public.user_form_profile_set_custom_field(%s,'parking_spot','\"B12\"'::jsonb)->>'parking_spot'", (TEST,))
    record('LEGIT', 'freeform', 'service role sets an autofill key for a person', o, lambda o: first(o) == 'B12')
    seat(cur, ADMIN)
    o = step(cur, "select custom.entity_field_declare(%s,'party','{\"label\":\"Preferred therapist\",\"type\":\"text\",\"key\":\"preferred_therapist\"}'::jsonb)", (ORG,))
    record('LEGIT', 'admin', 'admin declares an internal field on a standard table', o, accepted)
    owner(cur)
    cur.execute("select count(*) from custom.doors_not_masking_fields()"); after = cur.fetchone()[0]
    record('LEGIT', 'sweep', f'masking sweep stays at its count ({sweep_count} -> {after})', ('OK', after), lambda o: o[1] == sweep_count)
    c.rollback(); print('rolled back')

bad = [r for r in results if not r[3]]
print(f"\n{MODE}{' plant=' + PLANT if PLANT else ''}: {len(results) - len(bad)}/{len(results)} expectations met")
for r in bad:
    print('  FAIL', r[0], r[1], '-', r[2])
if PLANT:
    planted = {r[1] for r in bad}
    ok = planted == {PLANT}
    print(f"plant {PLANT}: {'RED ONLY WHERE PLANTED' if ok else 'UNEXPECTED: ' + str(sorted(planted))}")
    sys.exit(0 if ok else 1)
sys.exit(1 if bad else 0)
